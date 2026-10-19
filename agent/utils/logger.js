const LEVEL_DEBUG = "debug";
const LEVEL_INFO = "info";
const LEVEL_WARN = "warn";
const LEVEL_ERROR = "error";
const BATCH_SIZE = 32;
const FLUSH_DELAY_MS = 100;
const MAX_PENDING = 512;
const EVERY_COOLDOWN_MS = 100;
const PREFIX = "[recoil] ";

var _enabled = true;
var _echo = true;
var _pending = [];
var _timer = null;
var _repeatCounts = Object.create(null);
var _repeatAt = Object.create(null);

function _text(data)
{
    if (data === void 0) return "";
    if (typeof data === "string") return " " + data;
    try
    {
        return " " + JSON.stringify(data);
    }
    catch (e)
    {
        try
        {
            return " " + String(data);
        }
        catch (e2)
        {
            return " <unprintable>";
        }
    }
}

function _ship(payload)
{
    try
    {
        if (typeof send === "function") send(payload);
    }
    catch (e)
    {}
}

function _emit(level, message, data)
{
    const text = String(message || "");
    const line = PREFIX + level + " " + text + _text(data);
    if (_echo)
    {
        try
        {
            if (typeof console !== "undefined" && console.log) console.log(line);
        }
        catch (e)
        {}
    }
    _ship(
    {
        type: "RECOIL_LOG",
        lvl: level,
        msg: text,
        data: data === void 0 ? null : data
    });
    return line;
}

export function raw(message, data)
{
    return _emit(LEVEL_INFO, message, data);
}

function _flush()
{
    _timer = null;
    if (!_pending.length) return;
    const entries = _pending;
    _pending = [];
    _ship(
    {
        type: "RECOIL_LOG_BATCH",
        entries
    });
}

function _push(level, message, data)
{
    if (!_enabled) return;
    const entry = {
        lvl: level,
        msg: String(message || "")
    };
    if (data !== void 0) entry.data = data;
    if (_echo)
    {
        try
        {
            if (typeof console !== "undefined" && console.log) console.log(PREFIX + level + " " + entry.msg + _text(data));
        }
        catch (e)
        {}
    }
    _pending.push(entry);
    if (_pending.length >= MAX_PENDING) _pending.splice(0, _pending.length - MAX_PENDING);
    if (_pending.length >= BATCH_SIZE)
    {
        if (_timer !== null)
        {
            clearTimeout(_timer);
            _timer = null;
        }
        _flush();
    }
    else if (_timer === null)
    {
        _timer = setTimeout(_flush, FLUSH_DELAY_MS);
    }
}

export function setLoggingEnabled(value)
{
    const next = !!value;
    if (next === _enabled) return;
    _enabled = next;
    if (_enabled)
    {
        _push(LEVEL_DEBUG, "agent logging enabled");
    }
    else
    {
        _flush();
        _repeatCounts = Object.create(null);
        _repeatAt = Object.create(null);
    }
}

export function isLoggingEnabled()
{
    return _enabled;
}

export function setEchoEnabled(value)
{
    _echo = !!value;
    return _echo;
}

export function isEchoEnabled()
{
    return _echo;
}

export function logInfo(message, data)
{
    _push(LEVEL_INFO, message, data);
}

export function logWarn(message, data)
{
    _push(LEVEL_WARN, message, data);
}

export function logError(message, data)
{
    _push(LEVEL_ERROR, message, data);
}

export function logEvery(interval, message, data)
{
    if (!_enabled) return;
    const key = String(message || "");
    const count = (_repeatCounts[key] || 0) + 1;
    _repeatCounts[key] = count;
    if (count % (interval | 0 || 1) !== 0) return;
    const now = Date.now();
    if (now - (_repeatAt[key] || 0) < EVERY_COOLDOWN_MS) return;
    _repeatAt[key] = now;
    _push(LEVEL_DEBUG, message, data);
}

export function resetLogCounters()
{
    _repeatCounts = Object.create(null);
    _repeatAt = Object.create(null);
}
