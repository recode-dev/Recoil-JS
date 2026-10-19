import
{
    setBase,
    resolveAll,
    fn,
    off,
    constant,
    ptr32,
    ptrAt,
    i32At
}
from "./functions.js";
import
{
    logInfo
}
from "../utils/logger.js";

var cache = new Map();
var tiles = null;
var generation = 0;

export function moduleBase()
{
    try
    {
        if (Process.mainModule) return Process.mainModule.base;
    }
    catch (e)
    {}
    try
    {
        const modules = Process.enumerateModules();
        if (modules.length) return modules[0].base;
    }
    catch (e)
    {}
    return null;
}

export function boot()
{
    const base = moduleBase();
    if (!base) throw new Error("module base not found");
    setBase(base);
    resolveAll();
    return true;
}

export function bump()
{
    generation++;
    cache.clear();
}

export function gen()
{
    return generation;
}

export function cached(key, builder)
{
    if (cache.has(key)) return cache.get(key);
    const value = builder();
    cache.set(key, value);
    return value;
}

export function vtableOf(pointer)
{
    return pointer.readPointer();
}

var _projVtable = null;

export function projectileVtable()
{
    return _projVtable;
}

export function learnProjectileVtable(vtable)
{
    if (vtable && !vtable.isNull()) _projVtable = vtable;
    return _projVtable;
}

export function isProjectileData(data)
{
    if (!data || data.isNull()) return false;
    const vtable = vtableOf(data);
    if (vtable.equals(constant("VTABLE_PROJECTILE_DATA")))
    {
        _projVtable = vtable;
        return true;
    }
    return _projVtable !== null && vtable.equals(_projVtable);
}

export function objectManager(battle)
{
    if (!battle || battle.isNull()) return null;
    const manager = ptrAt(battle, off("BattleMode_objectManagerPtr"));
    if (manager.isNull()) return null;
    return manager;
}

export function objects(battle)
{
    const manager = objectManager(battle);
    if (!manager) return [];
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

export function tileMap(battle)
{
    if (!battle || battle.isNull()) return null;
    const getter = new NativeFunction(fn("LogicBattleModeClient__getTileMap"), "pointer", ["pointer"]);
    const map = getter(battle);
    if (map.isNull()) return null;
    return map;
}

export function isProjectile(pointer)
{
    if (!pointer || pointer.isNull()) return false;
    let data = null;
    try
    {
        data = ptr32("LogicGameObjectClient_getData")(pointer);
    }
    catch (e)
    {
        return false;
    }
    if (!data || data.isNull()) return false;
    return vtableOf(data).equals(constant("VTABLE_PROJECTILE_DATA"));
}

export function tileGrid(battle)
{
    const map = tileMap(battle);
    if (!map) return null;
    const width = i32At(map, off("TileMap_Width"));
    const height = i32At(map, off("TileMap_Height"));
    const array = ptrAt(map, off("TileMap_TilesArray"));
    if (array.isNull()) return null;
    if (width <= 0 || height <= 0 || width > 512 || height > 512) return null;
    const bytes = width * height;
    const blockMove = new Uint8Array(bytes);
    const blockShot = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++)
    {
        const tile = array.add(i * 8).readPointer();
        if (tile.isNull()) continue;
        const type = ptrAt(tile, 0);
        if (type.isNull()) continue;
        blockMove[i] = type.add(off("TileTypeData_BlocksMovement")).readU8() ? 1 : 0;
        blockShot[i] = type.add(off("TileTypeData_BlocksProjectiles")).readU8() ? 1 : 0;
    }
    tiles =
    {
        width,
        height,
        blockMove,
        blockShot,
        stamp: Date.now()
    };
    logInfo("tile grid",
    {
        width,
        height
    });
    return tiles;
}

export function grid()
{
    return tiles;
}

export function inBounds(x, y)
{
    if (!tiles) return false;
    return x >= 0 && y >= 0 && x < tiles.width && y < tiles.height;
}

export function index(x, y)
{
    if (!tiles || !inBounds(x, y)) return -1;
    return y * tiles.width + x;
}

export function blockedMove(x, y)
{
    const i = index(x, y);
    return i < 0 ? true : tiles.blockMove[i] === 1;
}

export function blockedShot(x, y)
{
    const i = index(x, y);
    return i < 0 ? true : tiles.blockShot[i] === 1;
}

export function tileOf(worldX, worldY, tileSize)
{
    const size = tileSize || 64;
    return {
        x: Math.floor(worldX / size),
        y: Math.floor(worldY / size)
    };
}

export function lineClear(x0, y0, x1, y1, tileSize, projectiles)
{
    if (!tiles) return true;
    const size = tileSize || 64;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (size / 2)));
    for (let i = 0; i <= steps; i++)
    {
        const t = i / steps;
        const wx = x0 + (x1 - x0) * t;
        const wy = y0 + (y1 - y0) * t;
        const cell = tileOf(wx, wy, size);
        const hit = projectiles ? blockedShot(cell.x, cell.y) : blockedMove(cell.x, cell.y);
        if (hit) return false;
    }
    return true;
}
