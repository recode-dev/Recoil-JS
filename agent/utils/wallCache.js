import
{
    tileGrid,
    grid,
    blockedMove,
    blockedShot,
    lineClear,
    bump
}
from "../core/scanner.js";
import
{
    logInfo
}
from "./logger.js";

var refreshMs = 4000;
var last = 0;
var tileSize = 64;
var hooks = [];

export function configure(options)
{
    if (!options) return;
    if (options.refreshMs) refreshMs = options.refreshMs;
    if (options.tileSize) tileSize = options.tileSize;
}

export function build(battle)
{
    const result = tileGrid(battle);
    last = Date.now();
    if (result) bump();
    return result;
}

export function ensure(battle)
{
    if (!grid() || Date.now() - last > refreshMs)
    {
        build(battle);
    }
    return grid();
}

export function invalidate(battle)
{
    return build(battle);
}

export function moveBlocked(x, y)
{
    return blockedMove(x, y);
}

export function shotBlocked(x, y)
{
    return blockedShot(x, y);
}

export function clearShot(x0, y0, x1, y1)
{
    return lineClear(x0, y0, x1, y1, tileSize, true);
}

export function clearPath(x0, y0, x1, y1)
{
    return lineClear(x0, y0, x1, y1, tileSize, false);
}

export function stepFrom(x, y, dx, dy)
{
    const size = tileSize;
    const nx = x + Math.round(dx * size);
    const ny = y + Math.round(dy * size);
    const cx = Math.floor(nx / size);
    const cy = Math.floor(ny / size);
    if (shotBlocked(cx, cy)) return null;
    return {
        x: nx,
        y: ny
    };
}

export function attachHooks()
{
    hooks.push(
    {
        name: "wallCache",
        refreshMs
    });
    logInfo("wall cache ready",
    {
        refreshMs,
        tileSize
    });
}

export function status()
{
    const g = grid();
    if (!g) return null;
    return {
        width: g.width,
        height: g.height,
        age: Date.now() - g.stamp
    };
}
