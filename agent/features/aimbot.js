import
{
    fn,
    ic,
    off,
    i32,
    ptr32,
    i32At
}
from "../core/functions.js";
import
{
    objects
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
    moveSpeed,
    castingRange,
    isImmune,
    dead,
    weaponSkill,
    skillData,
    projectileOfSkill
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
    battlePtr as liveBattle,
    noteFired
}
from "../core/libs.js";

const WATCH_MS = 80;
const STRIDE = 40;
const FLIGHT_CAP = 1.15;
const SPEED_PAD = 1.35;
const FALLBACK_SPEED = 4000;
const FALLBACK_RADIUS = 300;
const SHOT_CACHE_MS = 250;
const LOS_TTL_MS = 100;
const LOS_PURGE_MS = 500;
const ATTACK_TYPE = 0xa;

const SKIP_SKILLS = new Set([
    "ShamanUlti", "MechanicUlti", "ClusterBombDudeUlti", "ArcadeUlti", "ArtilleryDudeUlti",
    "SoulCollectorUlti", "MinigunDudeUlti", "KnightUlti", "DuplicatorUlti", "TwinsUlti",
    "SpawnerDudeUlti", "ConductorUlti", "MeepleUlti", "FleaUlti", "ReviverUlti", "VoodooUlti",
    "ShadowdemonUlti", "RollerUlti", "SniperUlti", "EnragerUlti", "PowerLevelerUlti",
    "DoorManUlti", "ConductorUltiSpawn"
]);

var getOwnCharacter = null;
var getX = null;
var getY = null;
var getOwnTeam = null;
var getGid = null;
var projectileSpeed = null;
var projectileRadius = null;
var setPrediction = null;
var captured = null;
var bestPtr = null;
var _live = new Map();
var _losMemo = new Map();
var _scrubTs = 0;
var _shotTs = 0;
var _shot = null;
var config =
{
    range: 1200,
    lead: true,
    wallCheck: true,
    attackType: ATTACK_TYPE
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

function attachHook(label, callbacks)
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
        attachHook("BattleScreen_activateSkill",
        {
            onEnter(args)
            {
                noteFired("BattleScreen_activateSkill");
                if (!state.aimbot) return;
                const point = aimPoint();
                if (!point) return;
                args[1] = ptr(point.x);
                args[2] = ptr(point.y);
                bestPtr = point.ptr;
            }
        });
        attachHook("BattleScreen_getClosestTargetForAutoshoot",
        {
            onLeave(retval)
            {
                noteFired("BattleScreen_getClosestTargetForAutoshoot");
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
        getGid = i32("LogicGameObjectClient_getGlobalID");
        projectileSpeed = i32("LogicProjectileData_getSpeed");
        projectileRadius = i32("LogicProjectileData_getRadius");
        if (options) Object.assign(config, options);
        logInfo("aimbot ready");
    });
}

function gidOf(object)
{
    try
    {
        return getGid(object);
    }
    catch (e)
    {
        return 0;
    }
}

function bearing(ax, ay, bx, by)
{
    return (Math.atan2(by - ay, bx - ax) * 180 / Math.PI + 360) % 360;
}

function sight(x0, y0, x1, y1)
{
    const key = ((x0 / 64 | 0) & 127) << 21 | ((y0 / 64 | 0) & 127) << 14 | ((x1 / 64 | 0) & 127) << 7 | (y1 / 64 | 0) & 127;
    const now = Date.now();
    const hit = _losMemo.get(key);
    if (hit !== undefined && now - hit.ts < LOS_TTL_MS) return hit.v;
    const value = clearShot(x0, y0, x1, y1);
    _losMemo.set(key,
    {
        v: value,
        ts: now
    });
    return value;
}

function shotOf(character)
{
    const empty = {
        skip: false,
        reach: 0,
        vel: FALLBACK_SPEED,
        rad: FALLBACK_RADIUS,
        live: false,
        name: ""
    };
    try
    {
        const skill = weaponSkill(character);
        if (!skill || skill.isNull()) return empty;
        const data = skillData(skill);
        if (!data) return empty;
        const name = nameOf(data) || "";
        if (SKIP_SKILLS.has(name)) return {
            skip: true,
            reach: 0,
            vel: 0,
            rad: FALLBACK_RADIUS,
            live: false,
            name
        };
        let reach = 0;
        const tiles = castingRange(data) | 0;
        if (tiles > 0) reach = tiles * 100;
        let vel = 0;
        let rad = FALLBACK_RADIUS;
        const projectile = projectileOfSkill(data);
        if (projectile)
        {
            vel = projectileSpeed(projectile) | 0;
            const value = projectileRadius(projectile) | 0;
            if (value > 0) rad = value;
        }
        return {
            skip: false,
            reach,
            vel: vel > 0 ? vel : FALLBACK_SPEED,
            rad,
            live: vel > 0,
            name
        };
    }
    catch (e)
    {
        return empty;
    }
}

function shotNow()
{
    const now = Date.now();
    if (_shot && now - _shotTs < SHOT_CACHE_MS) return _shot;
    const self = ownCharacter();
    if (!self) return _shot || {
        skip: false,
        reach: 0,
        vel: FALLBACK_SPEED,
        rad: FALLBACK_RADIUS,
        live: false,
        name: ""
    };
    _shot = shotOf(self);
    _shotTs = now;
    return _shot;
}

function selfName()
{
    try
    {
        const self = ownCharacter();
        if (!self) return "";
        return nameOf(dataOf(self)) || "";
    }
    catch (e)
    {
        return "";
    }
}

function motion(row, x, y, now)
{
    if (!row.markTs)
    {
        row.markTs = now;
        row.markX = x;
        row.markY = y;
        row.spd = 0;
        return;
    }
    const dt = now - row.markTs;
    if (dt < WATCH_MS) return;
    const dx = x - row.markX;
    const dy = y - row.markY;
    const gone = Math.hypot(dx, dy);
    if (gone >= STRIDE)
    {
        let spd = gone / (dt / 1000);
        if (!(row.gait > 0)) spd = 0;
        else
        {
            const cap = row.gait * SPEED_PAD;
            if (spd > cap) spd = cap;
        }
        row.spd = spd;
        if (spd > 0) row.yaw = bearing(row.markX, row.markY, x, y);
    }
    else
    {
        row.spd = 0;
    }
    row.markTs = now;
    row.markX = x;
    row.markY = y;
}

function point(ox, oy, row, shot, lead)
{
    if (!row) return null;
    let x = row.x;
    let y = row.y;
    if (shot && shot.live && shot.vel > 0 && lead > 0 && row.spd > 0 && row.gait > 0)
    {
        const vel = shot.vel;
        const scale = lead / 100;
        let flight = Math.hypot(row.x - ox, row.y - oy) / vel;
        const pocket = (row.rad || 0) + (shot.rad || 0);
        if (row.spd * flight > pocket)
        {
            const radians = row.yaw * Math.PI / 180;
            const ux = Math.cos(radians);
            const uy = Math.sin(radians);
            for (let i = 0; i < 3; i++)
            {
                flight = Math.hypot(x - ox, y - oy) / vel;
                if (flight > FLIGHT_CAP) flight = FLIGHT_CAP;
                x = row.x + ux * row.spd * flight * scale;
                y = row.y + uy * row.spd * flight * scale;
            }
            if (!isFinite(x) || !isFinite(y))
            {
                x = row.x;
                y = row.y;
            }
        }
    }
    if (shot && shot.reach > 0)
    {
        const dx = x - ox;
        const dy = y - oy;
        const dist = Math.hypot(dx, dy);
        const max = shot.reach + (row.rad || 0);
        if (dist > max && dist > 1)
        {
            x = ox + dx * max / dist;
            y = oy + dy * max / dist;
        }
    }
    return {
        x: Math.round(x),
        y: Math.round(y)
    };
}

function nearest(ox, oy, shot)
{
    let best = null;
    let bestCost = Infinity;
    const reach = shot && shot.reach > 0 ? shot.reach : config.range;
    for (const row of _live.values())
    {
        const dist = Math.hypot(row.x - ox, row.y - oy);
        if (reach > 0 && dist > reach + (row.rad || 0)) continue;
        if (config.wallCheck && !sight(ox, oy, row.x, row.y)) continue;
        if (dist < bestCost)
        {
            bestCost = dist;
            best = row;
        }
    }
    return best;
}

export function update(now)
{
    const bm = battle();
    if (!bm) return false;
    const self = ownCharacter();
    if (!self) return false;
    if (now === undefined) now = Date.now();
    ensure(bm);
    const own = getOwnTeam(bm);
    const seen = new Set();
    for (const item of objects(bm))
    {
        if (item.equals(self)) continue;
        if (dead(item)) continue;
        if (isImmune(item)) continue;
        if (i32At(item, off("GameObj_team")) === own) continue;
        const gid = gidOf(item);
        if (!gid) continue;
        let data = null;
        try
        {
            data = dataOf(item);
        }
        catch (e)
        {
            data = null;
        }
        const x = getX(item);
        const y = getY(item);
        seen.add(gid);
        let row = _live.get(gid);
        if (!row)
        {
            row = {
                gid,
                ptr: item,
                x,
                y,
                rad: 0,
                gait: 0,
                yaw: 0,
                spd: 0,
                markTs: 0,
                markX: x,
                markY: y
            };
            _live.set(gid, row);
        }
        row.ptr = item;
        row.x = x;
        row.y = y;
        if (data)
        {
            const radius = collisionRadius(data) | 0;
            if (radius > 0) row.rad = radius;
            const gait = moveSpeed(data) | 0;
            if (gait > 0) row.gait = gait;
        }
        motion(row, x, y, now);
    }
    for (const gid of _live.keys())
    {
        if (!seen.has(gid)) _live.delete(gid);
    }
    if (bestPtr && _live.size)
    {
        let alive = false;
        for (const row of _live.values())
        {
            if (row.ptr && row.ptr.equals(bestPtr))
            {
                alive = true;
                break;
            }
        }
        if (!alive) bestPtr = null;
    }
    if (!bestPtr && _live.size)
    {
        const pick = nearest(getX(self), getY(self), shotNow());
        if (pick) bestPtr = pick.ptr;
    }
    if (now - _scrubTs > 1000)
    {
        for (const [key, value] of _losMemo)
        {
            if (now - value.ts > LOS_PURGE_MS) _losMemo.delete(key);
        }
        _scrubTs = now;
    }
    return true;
}

export function pickTarget()
{
    const bm = battle();
    if (!bm) return null;
    const self = ownCharacter();
    if (!self) return null;
    const row = nearest(getX(self), getY(self), shotNow());
    if (!row) return null;
    return {
        ptr: row.ptr,
        x: row.x,
        y: row.y,
        name: "",
        radius: row.rad,
        gid: row.gid
    };
}

export function aimPoint()
{
    const bm = battle();
    if (!bm) return null;
    const self = ownCharacter();
    if (!self) return null;
    const ox = getX(self);
    const oy = getY(self);
    const shot = shotNow();
    const row = nearest(ox, oy, shot);
    if (!row) return null;
    const lead = config.lead ? leadOf(selfName()) : 0;
    const at = point(ox, oy, row, shot, lead);
    if (!at) return null;
    return {
        ptr: row.ptr,
        x: at.x,
        y: at.y,
        lead,
        selfX: ox,
        selfY: oy
    };
}

export function predict(x, y)
{
    const bm = battle();
    if (!bm || !setPrediction) return false;
    try
    {
        setPrediction(bm, x, y, true);
        return true;
    }
    catch (e)
    {
        return false;
    }
}

export function fire()
{
    if (!state.aimbot) return false;
    const bm = battle();
    if (!bm) return false;
    const pointNow = aimPoint();
    if (!pointNow) return false;
    const ok = sendClientInput(bm, config.attackType, pointNow.x, pointNow.y);
    if (!ok) logWarn("aimbot fire failed");
    else predict(pointNow.x, pointNow.y);
    return ok;
}

export function toggle(value)
{
    setState("aimbot", value);
    return state.aimbot;
}

export function tick()
{
    update();
    return fire();
}
