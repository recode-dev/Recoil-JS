import
{
    fn,
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

var getOwnCharacter = null;
var getX = null;
var getY = null;
var getOwnTeam = null;
var setPrediction = null;
var battlePtr = null;
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
    return battlePtr;
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
                battlePtr = args[0];
            }
        });
        logInfo("battle capture installed");
    });
}

export function installAimHooks()
{
    return setupSafe("aim hooks", () =>
    {
        Interceptor.attach(fn("BattleScreen_activateSkill"),
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
        Interceptor.attach(fn("BattleScreen_getClosestTargetForAutoshoot"),
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
        if (skill.isNull()) return config.range;
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

export function predict(x, y)
{
    if (!battlePtr) return false;
    setPrediction(battlePtr, x, y, true);
    return true;
}

export function pickTarget()
{
    const bm = battlePtr;
    if (!bm) return null;
    const self = getOwnCharacter(bm);
    if (self.isNull()) return null;
    const own = getOwnTeam(bm);
    const selfX = getX(self);
    const selfY = getY(self);
    ensure(bm);
    let best = null;
    let bestDist = rangeOf(self) * rangeOf(self);
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
    return {
        ptr: best,
        x: getX(best),
        y: getY(best),
        name: nameOf(best.readPointer().isNull() ? best : best),
        radius: collisionRadius(best)
    };
}

export function aimPoint()
{
    const bm = battlePtr;
    if (!bm) return null;
    const target = pickTarget();
    if (!target) return null;
    const self = getOwnCharacter(bm);
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
    const point = aimPoint();
    if (!point) return false;
    const ok = sendClientInput(battlePtr, config.attackType, point.x, point.y);
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
