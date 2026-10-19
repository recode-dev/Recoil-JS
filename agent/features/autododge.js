import
{
    off,
    i32,
    ptr32,
    i32At,
    ptrAt,
    constant
}
from "../core/functions.js";
import
{
    logInfo
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
    kindOf,
    fitOf,
    FITS
}
from "../helpers/dodge_kinds.js";
import
{
    canonBrawlerName
}
from "../utils/brawlerName.js";
import
{
    battle
}
from "./aimbot.js";
import
{
    sendClientInput
}
from "../core/input.js";

var getX = null;
var getY = null;
var getData = null;
var getSpeed = null;
var getRadius = null;
var isBeam = null;
var getTargetX = null;
var getName = null;
var projectileData = null;
var config =
{
    range: 900,
    horizon: 0.45,
    step: 1.0,
    moveType: 2
};

export function init(options)
{
    return setupSafe("autododge", () =>
    {
        getX = i32("LogicGameObjectClient_getX");
        getY = i32("LogicGameObjectClient_getY");
        getData = ptr32("LogicGameObjectClient_getData");
        getSpeed = i32("LogicProjectileData_getSpeed");
        getRadius = i32("LogicProjectileData_getRadius");
        isBeam = i32("LogicProjectileData__isBeam");
        getTargetX = i32("LogicProjectileClient_getTargetX");
        getName = ptr32("LogicData_getName");
        projectileData = constant("VTABLE_PROJECTILE_DATA");
        if (options) Object.assign(config, options);
        logInfo("autododge ready");
    });
}

function isProjectile(pointer)
{
    const data = getData(pointer);
    if (data.isNull()) return null;
    const vtable = data.readPointer();
    if (!vtable.equals(projectileData)) return null;
    return data;
}

function list()
{
    const bm = battle();
    if (!bm) return [];
    const manager = ptrAt(bm, off("BattleMode_objectManagerPtr"));
    if (manager.isNull()) return [];
    const array = ptrAt(manager, off("ObjectManager_objectsArray"));
    const count = i32At(manager, off("ObjectManager_count"));
    const stride = off("ObjectManager_ptrStride");
    if (array.isNull() || count <= 0 || count > 512) return [];
    const out = [];
    for (let i = 0; i < count; i++)
    {
        const item = array.add(i * stride).readPointer();
        if (item.isNull()) continue;
        const data = isProjectile(item);
        if (!data) continue;
        out.push(item);
    }
    return out;
}

function nameOf(data)
{
    try
    {
        const pointer = getName(data);
        if (pointer.isNull()) return "";
        return canonBrawlerName(pointer.readCString());
    }
    catch (e)
    {
        return "";
    }
}

function threat(item)
{
    const data = getData(item);
    const speed = getSpeed(data);
    if (speed <= 0) return null;
    const px = getX(item);
    const py = getY(item);
    const tx = getTargetX(item);
    const ty = i32At(item, off("LogicProjectileClient_targetY"));
    const dx = tx - px;
    const dy = ty - py;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!len) return null;
    return {
        ptr: item,
        speed,
        radius: getRadius(data),
        beam: isBeam(data) !== 0,
        x: px,
        y: py,
        tx,
        ty,
        ux: dx / len,
        uy: dy / len,
        eta: len / speed
    };
}

export function scan()
{
    const bm = battle();
    if (!bm) return [];
    const self = bm;
    const sx = getX(self);
    const sy = getY(self);
    const found = [];
    for (const item of list())
    {
        const info = threat(item);
        if (!info) continue;
        info.dist = Math.sqrt((info.tx - sx) * (info.tx - sx) + (info.ty - sy) * (info.ty - sy));
        info.name = nameOf(getData(item));
        info.eta = info.dist / info.speed;
        if (info.dist > config.range) continue;
        if (info.eta > config.horizon) continue;
        found.push(info);
    }
    found.sort((a, b) => a.eta - b.eta);
    return found;
}

export function dodgeVector()
{
    const threats = scan();
    if (!threats.length) return null;
    const first = threats[0];
    const kind = kindOf(first.name);
    const fit = FITS[fitOf(first.name)] || FITS.broad;
    const side = (first.ux * 0 - first.uy) >= 0 ? 1 : -1;
    const push = (first.radius + fit.pad) * fit.grow * config.step;
    return {
        threat: first,
        kind,
        dx: Math.round(-first.uy * side * push),
        dy: Math.round(first.ux * side * push)
    };
}

export function step()
{
    if (!state.autododge) return false;
    const bm = battle();
    if (!bm) return false;
    const vector = dodgeVector();
    if (!vector) return false;
    const x = getX(bm) + vector.dx;
    const y = getY(bm) + vector.dy;
    sendClientInput(bm, config.moveType, x, y);
    return true;
}

export function toggle(value)
{
    setState("autododge", value);
    return state.autododge;
}

export function tick()
{
    return step();
}
