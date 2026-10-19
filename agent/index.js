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
    objects
}
from "./core/scanner.js";
import
{
    initInput
}
from "./core/commands.js";
import
{
    init as initTables
}
from "./core/dataTables.js";
import
{
    logInfo,
    logError,
    raw,
    logPath
}
from "./utils/logger.js";
import
{
    state,
    setupSafe,
    getFlags
}
from "./utils/flags.js";
import
{
    install as installHooks,
    battlePtr,
    projectileCount,
    framesCount,
    stampValue,
    failedHooks
}
from "./core/libs.js";

var timer = null;
var interval = 8;
var baseWarned = false;
var probes = 0;
var probeTimer = null;
var maxProbes = 10;
var lastErrorAt = 0;
var lastErrorKey = "";

function reportError(label, error)
{
    const key = label + ":" + (error && error.message ? error.message : String(error));
    const now = Date.now();
    if (key === lastErrorKey && now - lastErrorAt < 2000) return;
    lastErrorKey = key;
    lastErrorAt = now;
    logError(label,
    {
        reason: error && error.message ? error.message : String(error)
    });
}

function loop()
{
    if (!getBase())
    {
        if (!baseWarned)
        {
            baseWarned = true;
            raw("base unresolved, loop idle");
        }
        return;
    }
    if (state.aimbot)
    {
        try
        {
            aimbot.tick();
        }
        catch (e)
        {
            reportError("aimbot tick", e);
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
            reportError("autododge tick", e);
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

function stage(label, callback)
{
    try
    {
        callback();
        raw("stage " + label + " ok");
        return true;
    }
    catch (e)
    {
        raw("stage " + label + " failed", e && e.message ? e.message : String(e));
        return false;
    }
}

function probe()
{
    if (probes >= maxProbes) return null;
    const report =
    {
        n: probes
    };
    probes++;
    try
    {
        const base = moduleBase();
        report.base = base ? base.toString() : null;
    }
    catch (e)
    {
        report.base = "error";
    }
    try
    {
        report.frames = framesCount();
        report.projectiles = projectileCount();
        report.stamp = stampValue();
        report.failed = failedHooks().length;
    }
    catch (e)
    {
        report.hooks = "error";
    }
    try
    {
        const bm = aimbot.battle() || battlePtr();
        report.battle = !!bm;
        if (bm)
        {
            report.objects = objects(bm).length;
            report.own = aimbot.ownCharacter() ? true : false;
        }
    }
    catch (e)
    {
        report.world = "error";
    }
    try
    {
        report.target = aimbot.aimPoint() ? true : false;
    }
    catch (e)
    {
        report.target = "error";
    }
    try
    {
        report.threats = autododge.scan().length;
    }
    catch (e)
    {
        report.threats = "error";
    }
    try
    {
        report.state = getFlags();
    }
    catch (e)
    {}
    raw("probe", report);
    return report;
}

function scheduleProbes()
{
    setTimeout(() => probe(), 3000);
    setTimeout(() => probe(), 15000);
    probeTimer = setInterval(() =>
    {
        if (probes >= maxProbes)
        {
            clearInterval(probeTimer);
            probeTimer = null;
            raw("probe cycle finished");
            return;
        }
        probe();
    }, 30000);
}

function boot()
{
    raw("boot start",
    {
        version: "1.1.0"
    });
    stage("log", () =>
    {
        const path = logPath();
        if (!path) throw new Error("log file unavailable");
    });
    stage("core", () =>
    {
        bootCore();
        initInput();
        initTables();
    });
    stage("battle", () => aimbot.installBattleCapture());
    stage("hooks", () => installHooks());
    stage("aimbot", () => aimbot.init());
    stage("aim", () => aimbot.installAimHooks());
    stage("autododge", () => autododge.init());
    stage("loop", () => start());
    if (!getBase()) raw("boot done without base");
    else raw("boot done",
    {
        base: getBase().toString(),
        path: logPath()
    });
    scheduleProbes();
    return true;
}

try
{
    boot();
}
catch (e)
{
    raw("boot fatal", e && e.stack ? e.stack : String(e));
}
