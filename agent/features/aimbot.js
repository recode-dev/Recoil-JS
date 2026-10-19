import
{
    fn,
    ic,
    off,
    i32,
    ptr32,
    i32At,
    ptrAt
}
from "../core/functions.js";
import
{
    objects,
    lineClear
}
from "../core/scanner.js";
import
{
    logInfo,
    logWarn
}
from "../utils/logger.js";
import
{
    state,
    setState,
    setupSafe
}
from "../utils/flags.js";
import
{
    leadOf
}
from "../helpers/aim_lead.js";
import
{
    nameOf,
    dataOf,
    collisionRadius,
    castingRange,
    isImmune,
    dead,
    weaponSkill,
    skillData
}
from "../core/dataTables.js";
import
{
    clearShot,
    ensure
}
from "../utils/wallCache.js";
import
{
    sendClientInput
}
from "../core/commands.js";
import
{
    battlePtr as liveBattle
}
from "../core/libs.js";

var getOwnCharacter = null;
var getX = null;
var getY = null;
var getOwnTeam = null;
var setPrediction = null;
var captured = null;
var bestPtr = null;
var config =
{
    range: 1200,
    lead: true,
    wallCheck: true,
    attackType: 0xa
};

export function battle()
{
    if (captured && !captured.isNull()) return captured;
    try
    {
        const live = liveBattle();
        if (live && !live.isNull()) return live;
    }
    catch (e)
    {}
    return null;
}

export function ownCharacter()
{
    try
    {
        const bm = battle();
        if (!bm || !getOwnCharacter) return null;
        const self = getOwnCharacter(bm);
        if (!self || self.isNull()) return null;
        return self;
    }
    catch (e)
    {
        return null;
    }
}

function attach(label, callbacks)
{
    try
    {
        Interceptor.attach(ic(label), callbacks);
        return true;
    }
    catch (e)
    {
        logWarn("attach failed",
        {
            hook: label,
            reason: e && e.message ? e.message : String(e)
        });
        return false;
    }
}

export function installBattleCapture()
{
    return setupSafe("battle", () =>
    {
        getOwnCharacter = ptr32("LogicBattleModeClient_getOwnCharacter");
        getOwnTeam = i32("LogicBattleModeClient_getOwnPlayerTeam");
        setPrediction = new NativeFunction(fn("LogicBattleModeClient_setClientPredictionMoveTo"), "void", ["pointer", "int", "int", "bool"]);
        Interceptor.attach(fn("LogicBattleModeClient_getOwnCharacter"),
        {
            onEnter(args)
            {
                captured = args[0];
            }
        });
        logInfo("battle capture installed");
    });
}

export function installAimHooks()
{
    return setupSafe("aim hooks", () =>
    {
        attach("BattleScreen_activateSkill",
        {
            onEnter(args)
            {
                if (!state.aimbot) return;
                const point = aimPoint();
                if (!point) return;
                args[1] = ptr(point.x);
                args[2] = ptr(point.y);
                bestPtr = point.ptr;
            }
        });
        attach("BattleScreen_getClosestTargetForAutoshoot",
        {
            onLeave(retval)
            {
                if (!state.aimbot) return;
                if (!bestPtr || bestPtr.isNull()) return;
                retval.replace(bestPtr);
            }
        });
        logInfo("aim hooks installed");
    });
}

export function init(options)
{
    return setupSafe("aimbot", () =>
    {
        getX = i32("LogicGameObjectClient_getX");
        getY = i32("LogicGameObjectClient_getY");
        if (options) Object.assign(config, options);
        logInfo("aimbot ready");
    });
}

function teamOf(pointer)
{
    return i32At(pointer, off("GameObj_team"));
}

function alive(pointer)
{
    if (dead(pointer)) return false;
    if (isImmune(pointer)) return false;
    return true;
}

function rangeOf(character)
{
    try
    {
        const skill = weaponSkill(character);
        if (!skill || skill.isNull()) return config.range;
        const data = skillData(skill);
        if (!data) return config.range;
        const value = castingRange(data);
        if (value <= 0) return config.range;
        return value;
    }
    catch (e)
    {
        return config.range;
    }
}

function dataOfSafe(object)
{
    try
    {
        const data = dataOf(object);
        if (!data || data.isNull()) return null;
        return data;
    }
    catch (e)
    {
        return null;
    }
}

export function predict(x, y)
{
    const bm = battle();
    if (!bm || !setPrediction) return false;
    setPrediction(bm, x, y, true);
    return true;
}

export function pickTarget()
{
    const bm = battle();
    if (!bm) return null;
    const self = ownCharacter();
    if (!self) return null;
    const own = getOwnTeam(bm);
    const selfX = getX(self);
    const selfY = getY(self);
    const reach = rangeOf(self);
    ensure(bm);
    let best = null;
    let bestDist = reach * reach;
    for (const item of objects(bm))
    {
        if (item.equals(self)) continue;
        if (!alive(item)) continue;
        if (teamOf(item) === own) continue;
        const x = getX(item);
        const y = getY(item);
        const d = (selfX - x) * (selfX - x) + (selfY - y) * (selfY - y);
        if (d >= bestDist) continue;
        if (config.wallCheck && !clearShot(selfX, selfY, x, y)) continue;
        bestDist = d;
        best = item;
    }
    if (!best) return null;
    const data = dataOfSafe(best);
    return {
        ptr: best,
        x: getX(best),
        y: getY(best),
        name: data ? nameOf(data) : "",
        radius: data ? collisionRadius(data) : 0
    };
}

export function aimPoint()
{
    const bm = battle();
    if (!bm) return null;
    const target = pickTarget();
    if (!target) return null;
    const self = ownCharacter();
    if (!self) return null;
    const selfX = getX(self);
    const selfY = getY(self);
    const lead = config.lead ? leadOf(target.name) : 0;
    return {
        ptr: target.ptr,
        x: target.x,
        y: target.y,
        lead,
        selfX,
        selfY
    };
}

export function fire()
{
    if (!state.aimbot) return false;
    const bm = battle();
    if (!bm) return false;
    const point = aimPoint();
    if (!point) return false;
    const ok = sendClientInput(bm, config.attackType, point.x, point.y);
    if (!ok) logWarn("aimbot fire failed");
    else predict(point.x, point.y);
    return ok;
}

export function toggle(value)
{
    setState("aimbot", value);
    return state.aimbot;
}

export function tick()
{
    return fire();
}
