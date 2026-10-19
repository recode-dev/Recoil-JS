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
var liveData = new Map();
var frames = 0;
var stamp = 0;
var dirty = true;
var skill = null;
var attached = [];
var failed = [];
var fired =
{
    LogicBattleModeClient_update: 0,
    LogicProjectileClient_updateTarget: 0,
    LogicProjectileClient_ctor: 0,
    LogicProjectileClient_destruct: 0,
    LogicTile__setData: 0,
    BattleScreen_activateSkill: 0,
    BattleScreen_getClosestTargetForAutoshoot: 0,
    LogicProjectileClient_updateMotion: 0
};

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

export function noteFired(label)
{
    if (fired[label] === undefined) fired[label] = 0;
    fired[label]++;
}

export function hooksFired()
{
    return Object.assign({}, fired);
}

export function install()
{
    attach("LogicBattleModeClient_update",
    {
        onEnter(args)
        {
            battle = args[0];
            frames++;
            noteFired("LogicBattleModeClient_update");
        }
    });
    attachRva("LogicProjectileClient_updateTarget",
    {
        onEnter()
        {
            stamp = frames;
            noteFired("LogicProjectileClient_updateTarget");
        }
    });
    attach("LogicProjectileClient_ctor",
    {
        onEnter(args)
        {
            this.self = args[0];
            this.data = args[1] || null;
        },
        onLeave()
        {
            if (!this.self || this.self.isNull()) return;
            const key = this.self.toString();
            live.add(key);
            liveData.set(key, this.data || null);
            noteFired("LogicProjectileClient_ctor");
        }
    });
    attach("LogicProjectileClient_destruct",
    {
        onEnter(args)
        {
            if (!args[0] || args[0].isNull()) return;
            const key = args[0].toString();
            live.delete(key);
            liveData.delete(key);
            noteFired("LogicProjectileClient_destruct");
        }
    });
    attach("LogicTile__setData",
    {
        onEnter()
        {
            dirty = true;
            noteFired("LogicTile__setData");
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

export function projectileData(addr)
{
    return liveData.get(addr) || null;
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
    liveData.clear();
    return true;
}
