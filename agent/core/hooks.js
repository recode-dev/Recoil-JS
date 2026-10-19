import
{
    ic,
    fn
}
from "./functions.js";
import
{
    logInfo
}
from "../utils/logger.js";

var battle = null;
var live = new Set();
var frames = 0;
var dirty = true;
var closest = null;
var skill = null;
var attached = [];

export function install()
{
    attached.push(Interceptor.attach(ic("LogicBattleModeClient_update"),
    {
        onEnter(args)
        {
            battle = args[0];
            frames++;
        }
    }));
    attached.push(Interceptor.attach(ic("LogicProjectileClient_ctor"),
    {
        onEnter(args)
        {
            this.self = args[0];
        },
        onLeave()
        {
            if (this.self && !this.self.isNull()) live.add(this.self.toString());
        }
    }));
    attached.push(Interceptor.attach(ic("LogicProjectileClient_destruct"),
    {
        onEnter(args)
        {
            if (args[0] && !args[0].isNull()) live.delete(args[0].toString());
        }
    }));
    attached.push(Interceptor.attach(ic("LogicTile__setData"),
    {
        onEnter()
        {
            dirty = true;
        }
    }));
    attached.push(Interceptor.attach(ic("BattleScreen_getClosestTargetForAutoshoot"),
    {
        onLeave(retval)
        {
            closest = retval && !retval.isNull() ? retval : null;
        }
    }));
    attached.push(Interceptor.attach(ic("BattleScreen_activateSkill"),
    {
        onEnter(args)
        {
            skill = args[1] && !args[1].isNull() ? args[1] : null;
        }
    }));
    logInfo("hooks installed",
    {
        count: attached.length
    });
    return attached.length;
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

export function closestTarget()
{
    return closest;
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
