import
{
    fn,
    off,
    i32,
    ptr32,
    i32At,
    ptrAt,
    boolAt
}
from "../core/functions.js";
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
    canonBrawlerName
}
from "../utils/brawlerName.js";
import
{
    sendClientInput
}
from "../core/input.js";

var getOwnCharacter = null;
var getX = null;
var getY = null;
var getData = null;
var getGlobalID = null;
var getName = null;
var battlePtr = null;
var config =
{
    range: 1200,
    lead: true,
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

export function init(options)
{
    return setupSafe("aimbot", () =>
    {
        if (!getX)
        {
            getX = i32("LogicGameObjectClient_getX");
            getY = i32("LogicGameObjectClient_getY");
            getData = ptr32("LogicGameObjectClient_getData");
            getGlobalID = i32("LogicGameObjectClient_getGlobalID");
            getName = ptr32("LogicData_getName");
        }
        if (options) Object.assign(config, options);
        logInfo("aimbot ready");
    });
}

function objects()
{
    const bm = battlePtr;
    if (!bm) return [];
    const manager = ptrAt(bm, off("BattleMode_objectManagerPtr"));
    if (manager.isNull()) return [];
    const array = ptrAt(manager, off("ObjectManager_objectsArray"));
    const count = i32At(manager, off("ObjectManager_count"));
    const stride = off("ObjectManager_ptrStride");
    if (array.isNull() || count <= 0 || count > 512) return [];
    const list = [];
    for (let i = 0; i < count; i++)
    {
        const item = array.add(i * stride).readPointer();
        if (!item.isNull()) list.push(item);
    }
    return list;
}

function teamOf(pointer)
{
    return i32At(pointer, off("GameObj_team"));
}

function alive(pointer)
{
    if (boolAt(pointer, off("GameObj_deadFlag"))) return false;
    return getGlobalID(pointer) !== 0;
}

function nameOf(pointer)
{
    try
    {
        const data = getData(pointer);
        if (data.isNull()) return "";
        const pointerName = getName(data);
        if (pointerName.isNull()) return "";
        return canonBrawlerName(pointerName.readCString());
    }
    catch (e)
    {
        return "";
    }
}

function distSq(ax, ay, bx, by)
{
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
}

export function pickTarget()
{
    const bm = battlePtr;
    if (!bm) return null;
    const self = getOwnCharacter(bm);
    if (self.isNull()) return null;
    const ownTeam = teamOf(self);
    const selfX = getX(self);
    const selfY = getY(self);
    let best = null;
    let bestDist = config.range * config.range;
    for (const item of objects())
    {
        if (item.equals(self)) continue;
        if (!alive(item)) continue;
        if (teamOf(item) === ownTeam) continue;
        const x = getX(item);
        const y = getY(item);
        const d = distSq(selfX, selfY, x, y);
        if (d < bestDist)
        {
            bestDist = d;
            best = item;
        }
    }
    if (!best) return null;
    return {
        ptr: best,
        x: getX(best),
        y: getY(best),
        name: nameOf(best)
    };
}

export function aimPoint()
{
    const bm = battlePtr;
    if (!bm) return null;
    const target = pickTarget();
    if (!target) return null;
    if (!config.lead) return target;
    const self = getOwnCharacter(bm);
    const lead = leadOf(target.name);
    return {
        ptr: target.ptr,
        x: target.x,
        y: target.y,
        lead,
        selfX: getX(self),
        selfY: getY(self)
    };
}

export function fire()
{
    if (!state.aimbot) return false;
    const point = aimPoint();
    if (!point) return false;
    const ok = sendClientInput(battlePtr, config.attackType, point.x, point.y);
    if (!ok) logWarn("aimbot fire failed");
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
