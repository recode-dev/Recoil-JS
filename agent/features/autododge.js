import
{
    fn,
    off,
    i32,
    i32At,
    ptr32,
    ptrAt,
    boolAt
}
from "../core/functions.js";
import
{
    objects,
    isProjectileData,
    isProjectile
}
from "../core/scanner.js";
import
{
    projectileAddrs
}
from "../core/libs.js";
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
    nameOf,
    spawnAreaEffect,
    areaRadius,
    areaTime,
    dataName
}
from "../core/dataTables.js";
import
{
    clearPath,
    ensure
}
from "../utils/wallCache.js";
import
{
    battle
}
from "./aimbot.js";
import
{
    sendClientInput
}
from "../core/commands.js";

var getX = null;
var getY = null;
var getData = null;
var getSpeed = null;
var getRadius = null;
var isBeam = null;
var getTargetX = null;
var hooks = [];
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
        getData = ptr32("LogicProjectileClient_getData");
        getSpeed = i32("LogicProjectileData_getSpeed");
        getRadius = i32("LogicProjectileData_getRadius");
        isBeam = i32("LogicProjectileData__isBeam");
        getTargetX = i32("LogicProjectileClient_getTargetX");
        if (options) Object.assign(config, options);
        hooks.push(Interceptor.attach(fn("LogicProjectileClient_updateMotion"),
        {
            onLeave()
            {
                config.stamp = Date.now();
            }
        }));
        logInfo("autododge ready");
    });
}

function threat(item)
{
    const data = getData(item);
    if (!isProjectileData(data)) return null;
    const speed = i32At(data, off("LogicProjectileData_speed")) || getSpeed(data);
    if (speed <= 0) return null;
    const px = getX(item);
    const py = getY(item);
    const tx = i32At(item, off("LogicProjectileClient_targetX")) || getTargetX(item);
    const ty = i32At(item, off("LogicProjectileClient_targetY"));
    const dx = tx - px;
    const dy = ty - py;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!len) return null;
    const area = ptrAt(data, off("LogicProjectileData_spawnAreaEffect"));
    const hasArea = !area.isNull();
    return {
        ptr: item,
        team: i32At(item, off("LogicProjectileClient_ownerTeam")),
        speed,
        radius: i32At(data, off("LogicProjectileData_radius")) || getRadius(data),
        beam: boolAt(data, off("LogicProjectileData_isBeam")) || isBeam(data) !== 0,
        x: px,
        y: py,
        tx,
        ty,
        ux: dx / len,
        uy: dy / len,
        area: hasArea ? i32At(area, off("AreaEffectData_radius")) || areaRadius(area) : 0,
        areaTime: hasArea ? i32At(area, off("AreaEffectData_activeTimeMs")) || areaTime(area) : 0,
        name: dataName(item) || nameOf(data)
    };
}

export function scan()
{
    const bm = battle();
    if (!bm) return [];
    ensure(bm);
    const sx = getX(bm);
    const sy = getY(bm);
    const found = [];
    const live = projectileAddrs();
    const source = live.length ? live.map((address) => ptr(address)) : objects(bm);
    for (const item of source)
    {
        const info = threat(item);
        if (!info) continue;
        const dist = Math.sqrt((info.tx - sx) * (info.tx - sx) + (info.ty - sy) * (info.ty - sy));
        info.dist = dist;
        info.eta = info.speed > 0 ? dist / info.speed : 99;
        if (dist > config.range || info.eta > config.horizon) continue;
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
    const fit = FITS[fitOf(first.name)] || FITS.broad;
    const push = (first.radius + fit.pad) * fit.grow * config.step;
    const sides = [
    {
        dx: -first.uy * push,
        dy: first.ux * push
    },
    {
        dx: first.uy * push,
        dy: -first.ux * push
    }];
    for (const side of sides)
    {
        const x = Math.round(first.tx + side.dx);
        const y = Math.round(first.ty + side.dy);
        if (clearPath(first.x, first.y, x, y)) return {
            threat: first,
            kind: kindOf(first.name),
            dx: Math.round(side.dx),
            dy: Math.round(side.dy)
        };
    }
    return {
        threat: first,
        kind: kindOf(first.name),
        dx: Math.round(sides[0].dx),
        dy: Math.round(sides[0].dy)
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
