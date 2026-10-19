import
{
    setBase,
    resolveAll,
    getBase
}
from "./core/functions.js";
import
{
    initInput
}
from "./core/input.js";
import
{
    logInfo,
    logError
}
from "./utils/logger.js";
import
{
    state,
    setState,
    setupSafe
}
from "./utils/flags.js";
import * as aimbot from "./features/aimbot.js";
import * as autododge from "./features/autododge.js";

var timer = null;
var interval = 8;

function base()
{
    const module = Process.mainModule || Process.enumerateModules()[0];
    return module.base;
}

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
    if (timer) return;
    timer = setInterval(loop, interval);
    logInfo("loop started",
    {
        interval
    });
}

function stop()
{
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    logInfo("loop stopped");
}

function boot()
{
    setupSafe("core", () =>
    {
        setBase(base());
        resolveAll();
        initInput();
    });
    aimbot.installBattleCapture();
    aimbot.init();
    autododge.init();
    start();
}

rpc.exports =
{
    boot,
    start,
    stop,
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
            name: item.name
        })));
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
