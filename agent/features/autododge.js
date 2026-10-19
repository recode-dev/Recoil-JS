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
    learnProjectileVtable,
    vtableOf,
    blockedMove,
    grid
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
    fitOf
}
from "../helpers/dodge_kinds.js";
import
{
    nameOf,
    dataOf,
    moveSpeed,
    collisionRadius,
    areaRadius,
    areaTime,
    dataName
}
from "../core/dataTables.js";
import
{
    ensure
}
from "../utils/wallCache.js";
import
{
    battle,
    ownCharacter,
    predict
}
from "./aimbot.js";
import
{
    sendClientInput
}
from "../core/commands.js";

const MOVE_TYPE = 2;
const TILE = 64;
const AWARE = 3200;
const RANGE_FALLBACK = 2800;
const TICK_MS = 16;
const DIR_COUNT = 48;
const SKIN = 50;
const LOCK_MS = 130;
const REACH = 600;
const HORIZON_S = 1;
const KEEP_BAND = 120;
const MOMENTUM = 100;
const ENGAGE = 40;
const RELEASE_GRACE_MS = 120;
const WALL_HIT = 9000;
const PROBE_N = 3;
const PROBE_T = 0.35;

var getX = null;
var getY = null;
var getData = null;
var getSpeed = null;
var getRadius = null;
var isBeam = null;
var getTargetX = null;
var hooks = [];
var _ring = [];
var _scoreBuf = [];
var _heading = null;
var _headingIdx = -1;
var _holdUntil = 0;
var _lastDangerTs = 0;
var _lastTick = 0;
var config =
{
    range: 900,
    horizon: 0.45,
    step: 1.0,
    moveType: MOVE_TYPE,
    skin: SKIN,
    engage: ENGAGE
};

function buildRing()
{
    _ring.length = 0;
    for (let i = 0; i < DIR_COUNT; i++)
    {
        const angle = Math.PI * 2 * i / DIR_COUNT;
        _ring.push(
        {
            x: Math.cos(angle),
            y: Math.sin(angle)
        });
    }
    _scoreBuf = new Array(DIR_COUNT).fill(0);
    _headingIdx = -1;
}

buildRing();

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
    if (!data || data.isNull()) return null;
    let loose = false;
    if (isProjectileData(data))
    {
        learnProjectileVtable(vtableOf(data));
    }
    else
    {
        let speed = 0;
        let radius = 0;
        try
        {
            speed = getSpeed(data) | 0;
            radius = getRadius(data) | 0;
        }
        catch (e)
        {
            return null;
        }
        if (speed < 1200 || speed > 20000 || radius < 0 || radius > 4000) return null;
        loose = true;
        learnProjectileVtable(vtableOf(data));
    }
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
        name: dataName(item) || nameOf(data),
        loose
    };
}

export function scan()
{
    const bm = battle();
    if (!bm) return [];
    const self = ownCharacter();
    if (!self) return [];
    ensure(bm);
    const sx = getX(self);
    const sy = getY(self);
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

function segmentDistance(px, py, ax, ay, bx, by)
{
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq < 1e-6 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function selfBody()
{
    const self = ownCharacter();
    if (!self) return 60;
    try
    {
        const value = collisionRadius(dataOf(self)) | 0;
        return value > 0 ? value : 60;
    }
    catch (e)
    {
        return 60;
    }
}

function selfSpeed()
{
    const self = ownCharacter();
    if (!self) return 720;
    try
    {
        const value = moveSpeed(dataOf(self)) | 0;
        return value > 0 ? value : 720;
    }
    catch (e)
    {
        return 720;
    }
}

function hazards(bodyR)
{
    const out = [];
    const list = scan();
    for (const item of list)
    {
        const spec = kindOf(item.name);
        const fit = fitOf(item.name);
        const grow = spec && spec.growR > 0 ? spec.growR : 0;
        const shotR = (item.radius > 0 ? item.radius : 100) + grow;
        const rad = shotR + bodyR + fit.pad + shotR * fit.grow;
        let maxRange = spec && spec.maxRange > 0 ? spec.maxRange : RANGE_FALLBACK;
        if (spec && spec.chargedRange > 0 && item.speed > 3500) maxRange = spec.chargedRange;
        let left = Math.hypot(item.tx - item.x, item.ty - item.y);
        if (spec && spec.reachAdj) maxRange += spec.reachAdj;
        if (left > maxRange) left = maxRange;
        if (left <= 10) continue;
        const vx = item.ux * item.speed;
        const vy = item.uy * item.speed;
        if (!isFinite(vx) || !isFinite(vy)) continue;
        out.push(
        {
            x: item.x,
            y: item.y,
            vx,
            vy,
            rad,
            left,
            pathLen: left,
            until: 0,
            name: item.name || "",
            speed: item.speed
        });
    }
    return out;
}

function clearance(list, myX, myY, mvx, mvy)
{
    let minClear = Infinity;
    for (const item of list)
    {
        const speed = Math.hypot(item.vx, item.vy);
        let maxT = HORIZON_S;
        if (speed > 1) maxT = Math.min(maxT, item.left / speed);
        if (item.until > 0) maxT = Math.min(maxT, item.until);
        const relx = item.x - myX;
        const rely = item.y - myY;
        const vrx = item.vx - mvx;
        const vry = item.vy - mvy;
        const vv = vrx * vrx + vry * vry;
        let cx;
        let cy;
        if (vv < 1e-6)
        {
            cx = relx;
            cy = rely;
        }
        else
        {
            let ts = -(relx * vrx + rely * vry) / vv;
            if (ts < 0) ts = 0;
            else if (ts > maxT) ts = maxT;
            cx = relx + vrx * ts;
            cy = rely + vry * ts;
        }
        const value = Math.sqrt(cx * cx + cy * cy) - item.rad;
        if (value < minClear) minClear = value;
    }
    return minClear;
}

function wallAhead(myX, myY, dir, speed, bodyR)
{
    const step = speed * PROBE_T;
    let raw = 0;
    for (let s = 1; s <= PROBE_N; s++)
    {
        const px = myX + dir.x * step * s;
        const py = myY + dir.y * step * s;
        if (blockedMove(px / TILE | 0, py / TILE | 0)) raw += WALL_HIT * (PROBE_N - s + 1);
    }
    return raw;
}

function clampTarget(x, y)
{
    const map = grid();
    if (!map) return {
        x,
        y
    };
    const maxX = map.width * TILE - 1;
    const maxY = map.height * TILE - 1;
    let nx = x;
    let ny = y;
    if (nx < 0) nx = 0;
    if (nx > maxX) nx = maxX;
    if (ny < 0) ny = 0;
    if (ny > maxY) ny = maxY;
    return {
        x: nx,
        y: ny
    };
}

function clearHeading()
{
    _heading = null;
    _headingIdx = -1;
    _holdUntil = 0;
}

export function getDodgeDir()
{
    return _heading;
}

export function dodgeVector()
{
    if (!_heading) return null;
    return {
        dx: Math.round(_heading.x * REACH),
        dy: Math.round(_heading.y * REACH)
    };
}

export function step()
{
    if (!state.autododge) return false;
    const bm = battle();
    if (!bm) return false;
    const self = ownCharacter();
    if (!self) return false;
    const now = Date.now();
    if (now - _lastTick < TICK_MS) return false;
    _lastTick = now;
    const myX = getX(self);
    const myY = getY(self);
    const speed = selfSpeed();
    const bodyR = selfBody();
    const list = hazards(bodyR);
    if (!list.length)
    {
        if (_heading && now - _lastDangerTs > RELEASE_GRACE_MS) clearHeading();
        return false;
    }
    const stayClear = clearance(list, myX, myY, 0, 0);
    const inDanger = stayClear < config.engage;
    if (inDanger) _lastDangerTs = now;
    if (!inDanger && (!_heading || now - _lastDangerTs > RELEASE_GRACE_MS))
    {
        if (_heading) clearHeading();
        return false;
    }
    const prevIdx = _headingIdx >= 0 && _headingIdx < _ring.length ? _headingIdx : -1;
    const prevDir = prevIdx >= 0 ? _ring[prevIdx] : null;
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < _ring.length; i++)
    {
        const dir = _ring[i];
        let score = clearance(list, myX, myY, speed * dir.x, speed * dir.y);
        score -= wallAhead(myX, myY, dir, speed, bodyR);
        if (prevDir) score += MOMENTUM * (dir.x * prevDir.x + dir.y * prevDir.y);
        _scoreBuf[i] = score;
        if (score > bestScore)
        {
            bestScore = score;
            bestIdx = i;
        }
    }
    let chosenIdx = bestIdx;
    if (prevIdx >= 0 && now < _holdUntil && chosenIdx !== prevIdx)
    {
        if (_scoreBuf[prevIdx] + KEEP_BAND >= _scoreBuf[chosenIdx]) chosenIdx = prevIdx;
        else _holdUntil = now + LOCK_MS;
    }
    else if (now >= _holdUntil)
    {
        _holdUntil = now + LOCK_MS;
    }
    if (_scoreBuf[chosenIdx] <= stayClear)
    {
        if (_heading) clearHeading();
        return false;
    }
    const chosen = _ring[chosenIdx];
    const previous = _headingIdx;
    _headingIdx = chosenIdx;
    _heading = chosen;
    const target = clampTarget(Math.round(myX + chosen.x * REACH), Math.round(myY + chosen.y * REACH));
    predict(target.x, target.y);
    const ok = sendClientInput(bm, config.moveType, target.x, target.y);
    if (chosenIdx !== previous)
    {
        logInfo("autododge dodge",
        {
            name: list[0].name,
            x: target.x,
            y: target.y,
            threats: list.length,
            sent: ok
        });
    }
    return ok;
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
