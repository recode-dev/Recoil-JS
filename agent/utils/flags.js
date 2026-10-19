import
{
    logInfo,
    logError
}
from "./logger.js";

var FEATURE_NAMES = [
    "aimbot",
    "autododge"
];

var FLAG_OF = {};
var _flags = 0;

export var state = {};

FEATURE_NAMES.forEach((name, index) =>
{
    FLAG_OF[name] = 1 << index;
    state[name] = true;
    _flags |= FLAG_OF[name];
});

export function registerFeature(name)
{
    if (name in state) return;
    FLAG_OF[name] = 1 << FEATURE_NAMES.length;
    FEATURE_NAMES.push(name);
    state[name] = true;
    _flags |= FLAG_OF[name];
}

export var FLAG_AIMBOT = FLAG_OF.aimbot;
export var FLAG_AUTODODGE = FLAG_OF.autododge;

export function setState(feature, value)
{
    if (!(feature in state)) return;
    const enabled = !!value;
    state[feature] = enabled;
    if (enabled) _flags |= FLAG_OF[feature];
    else _flags &= ~FLAG_OF[feature];
}

export function getFlags()
{
    return _flags;
}

export function setupSafe(label, fn)
{
    try
    {
        fn();
        logInfo(label + " ready");
        return true;
    }
    catch (e)
    {
        const reason = e && e.message ? e.message : String(e);
        logError(label + " setup failed",
        {
            module: label,
            reason
        });
        try
        {
            send(
            {
                type: "ERROR",
                code: 2,
                text: `setup ${label}: ${reason}`
            });
        }
        catch (_)
        {}
        return false;
    }
}
