import * as aimbot from "./features/aimbot.js";
import * as autododge from "./features/autododge.js";
import
{
    getBase
}
from "./core/functions.js";
import
{
    boot as bootCore,
    moduleBase,
    objects,
    tileGrid
}
from "./core/scanner.js";
import
{
    initInput
}
from "./core/commands.js";
import
{
    init as initTables,
    ownIndex,
    ownTeam,
    signature,
    clientType,
    commandScale,
    aimPoint
}
from "./core/dataTables.js";
import
{
    logInfo,
    logError
}
from "./utils/logger.js";
import
{
    state,
    setupSafe
}
from "./utils/flags.js";
import
{
    build,
    status
}
from "./utils/wallCache.js";
import
{
    install as installHooks,
    battlePtr,
    projectileCount,
    framesCount,
    lastSkill,
    stampValue
}
from "./core/libs.js";

var timer = null;
var interval = 8;

function loop()
{
    if (!getBase()) return;
    if (state.aimbot)
    {
        try
        {
            aimbot.tick();
        }
        catch (e)
        {
            logError("aimbot tick",
            {
                reason: e.message
            });
        }
    }
    if (state.autododge)
    {
        try
        {
            autododge.tick();
        }
        catch (e)
        {
            logError("autododge tick",
            {
                reason: e.message
            });
        }
    }
}

function start()
{
    if (timer) return false;
    timer = setInterval(loop, interval);
    logInfo("loop started",
    {
        interval
    });
    return true;
}

function stop()
{
    if (!timer) return false;
    clearInterval(timer);
    timer = null;
    logInfo("loop stopped");
    return true;
}

function boot()
{
    setupSafe("core", () =>
    {
        bootCore();
        initInput();
        initTables();
    });
    aimbot.installBattleCapture();
    installHooks();
    aimbot.init();
    aimbot.installAimHooks();
    autododge.init();
    start();
    return true;
}

rpc.exports =
{
    boot,
    start,
    stop,
    base()
    {
        return moduleBase().toString();
    },
    toggle(name, value)
    {
        if (name === "aimbot") return aimbot.toggle(value);
        if (name === "autododge") return autododge.toggle(value);
        return false;
    },
    flags()
    {
        return JSON.stringify(state);
    },
    target()
    {
        const point = aimbot.aimPoint();
        if (!point) return null;
        return JSON.stringify(
        {
            x: point.x,
            y: point.y,
            lead: point.lead
        });
    },
    threats()
    {
        const list = autododge.scan();
        if (!list.length) return "[]";
        return JSON.stringify(list.map((item) =>
        ({
            x: item.x,
            y: item.y,
            speed: item.speed,
            beam: item.beam,
            eta: item.eta,
            area: item.area,
            name: item.name
        })));
    },
    world()
    {
        const bm = aimbot.battle() || battlePtr();
        if (!bm) return null;
        return JSON.stringify(
        {
            ownIndex: ownIndex(bm),
            ownTeam: ownTeam(bm),
            objects: objects(bm).length,
            projectiles: projectileCount(),
            frames: framesCount(),
            walls: status(),
            signature: signature(bm),
            moveType: clientType(2),
            scale: commandScale(0)
        });
    },
    hooks()
    {
        return JSON.stringify(
        {
            frames: framesCount(),
            projectiles: projectileCount(),
            stamp: stampValue(),
            skill: lastSkill() ? lastSkill().toString() : null
        });
    },
    screen(pointer)
    {
        return JSON.stringify(aimPoint(ptr(pointer)));
    },
    walls()
    {
        const bm = aimbot.battle();
        if (!bm) return null;
        build(bm);
        return JSON.stringify(status());
    },
    grid()
    {
        const bm = aimbot.battle();
        if (!bm) return null;
        const map = tileGrid(bm);
        if (!map) return null;
        return JSON.stringify(
        {
            width: map.width,
            height: map.height
        });
    },
    burst(count, ms)
    {
        let left = count;
        const id = setInterval(() =>
        {
            aimbot.fire();
            if (--left <= 0) clearInterval(id);
        }, ms || 16);
        return true;
    }
};

boot();
