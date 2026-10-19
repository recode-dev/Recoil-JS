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
    logError,
    raw,
    setLoggingEnabled,
    isLoggingEnabled,
    setEchoEnabled,
    isEchoEnabled
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
var baseWarned = false;
var probed = 0;

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
    const report =
    {
        t: probed
    };
    probed++;
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
    raw("probe", report);
    return report;
}

function boot()
{
    raw("boot start");
    setLoggingEnabled(true);
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
        base: getBase().toString()
    });
    setTimeout(() => probe(), 3000);
    setTimeout(() => probe(), 15000);
    return true;
}

if (typeof rpc !== "undefined" && rpc)
{
    rpc.exports =
    {
        boot,
        start,
        stop,
        probe,
        logging(value)
        {
            setLoggingEnabled(value);
            return isLoggingEnabled();
        },
        echo(value)
        {
            setEchoEnabled(value);
            return isEchoEnabled();
        },
        diag()
        {
            return JSON.stringify(probe());
        },
        own()
        {
            const self = aimbot.ownCharacter();
            return self ? self.toString() : null;
        },
        base()
        {
            const base = moduleBase();
            return base ? base.toString() : "0x0";
        },
        toggle(name, value)
        {
            if (name === "aimbot") return aimbot.toggle(value);
            if (name === "autododge") return autododge.toggle(value);
            return false;
        },
        flags()
        {
            return JSON.stringify(
            {
                state,
                mask: getFlags()
            });
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
}

try
{
    boot();
}
catch (e)
{
    raw("boot fatal", e && e.stack ? e.stack : String(e));
}
