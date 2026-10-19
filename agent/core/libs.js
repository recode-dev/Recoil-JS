import
{
    ic,
    fn
}
from "./functions.js";
import
{
    logInfo,
    logWarn
}
from "../utils/logger.js";

var battle = null;
var live = new Set();
var frames = 0;
var stamp = 0;
var dirty = true;
var skill = null;
var attached = [];
var failed = [];

function attachWith(resolve, label, callbacks)
{
    try
    {
        attached.push(Interceptor.attach(resolve(label), callbacks));
        return true;
    }
    catch (e)
    {
        failed.push(label);
        logWarn("hook failed",
        {
            hook: label,
            reason: e && e.message ? e.message : String(e)
        });
        return false;
    }
}

function attach(label, callbacks)
{
    return attachWith(ic, label, callbacks);
}

function attachRva(label, callbacks)
{
    return attachWith(fn, label, callbacks);
}

export function install()
{
    attach("LogicBattleModeClient_update",
    {
        onEnter(args)
        {
            battle = args[0];
            frames++;
        }
    });
    attachRva("LogicProjectileClient_updateTarget",
    {
        onEnter()
        {
            stamp = frames;
        }
    });
    attach("LogicProjectileClient_ctor",
    {
        onEnter(args)
        {
            this.self = args[0];
        },
        onLeave()
        {
            if (this.self && !this.self.isNull()) live.add(this.self.toString());
        }
    });
    attach("LogicProjectileClient_destruct",
    {
        onEnter(args)
        {
            if (args[0] && !args[0].isNull()) live.delete(args[0].toString());
        }
    });
    attach("LogicTile__setData",
    {
        onEnter()
        {
            dirty = true;
        }
    });
    logInfo("hooks installed",
    {
        count: attached.length,
        failed: failed.length
    });
    return {
        attached: attached.length,
        failed: failed.slice()
    };
}

export function failedHooks()
{
    return failed.slice();
}

export function battlePtr()
{
    return battle;
}

export function projectileAddrs()
{
    return Array.from(live);
}

export function projectileCount()
{
    return live.size;
}

export function stampValue()
{
    return stamp;
}

export function framesCount()
{
    return frames;
}

export function wallsDirty()
{
    return dirty;
}

export function wallsClean()
{
    dirty = false;
}

export function lastSkill()
{
    return skill;
}

export function detach()
{
    for (const listener of attached)
    {
        try
        {
            listener.detach();
        }
        catch (e)
        {}
    }
    attached = [];
    live.clear();
    return true;
}
