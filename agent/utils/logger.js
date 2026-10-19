const LEVEL_DEBUG = "debug";
const LEVEL_INFO = "info";
const LEVEL_WARN = "warn";
const LEVEL_ERROR = "error";
const BATCH_SIZE = 32;
const FLUSH_DELAY_MS = 100;
const MAX_PENDING = 512;
const EVERY_COOLDOWN_MS = 100;
const MAX_FILE_BYTES = 2097152;
const FILE_NAME = "recoil.log";

var _enabled = true;
var _pending = [];
var _timer = null;
var _repeatCounts = Object.create(null);
var _repeatAt = Object.create(null);
var _path = null;
var _handle = null;
var _bytes = 0;
var _broken = false;
var _resolved = false;

function _resolveExport(moduleName, symbol)
{
    if (moduleName === null)
    {
        try
        {
            if (Module.findGlobalExportByName)
            {
                const found = Module.findGlobalExportByName(symbol);
                if (found) return found;
            }
        }
        catch (e)
        {}
        try
        {
            const found = Module.findExportByName(null, symbol);
            if (found) return found;
        }
        catch (e)
        {}
        return null;
    }
    try
    {
        if (Module.getExportByName) return Module.getExportByName(moduleName, symbol);
    }
    catch (e)
    {}
    try
    {
        const found = Module.findExportByName(moduleName, symbol);
        if (found) return found;
    }
    catch (e)
    {}
    try
    {
        const mod = Process.getModuleByName(moduleName);
        return mod.getExportByName(symbol);
    }
    catch (e)
    {}
    return null;
}

function _objcString(pointer)
{
    try
    {
        const msgSend = _resolveExport(null, "objc_msgSend");
        const selRegister = _resolveExport(null, "sel_registerName");
        if (!msgSend || !selRegister) return null;
        const send = new NativeFunction(msgSend, "pointer", ["pointer", "pointer"]);
        const register = new NativeFunction(selRegister, "pointer", ["pointer"]);
        const selector = register(Memory.allocUtf8String("UTF8String"));
        const cstring = send(pointer, selector);
        if (!cstring || cstring.isNull()) return null;
        return cstring.readUtf8String();
    }
    catch (e)
    {
        return null;
    }
}

function _homePath()
{
    try
    {
        const symbol = _resolveExport("Foundation", "NSHomeDirectory");
        if (!symbol) return null;
        const call = new NativeFunction(symbol, "pointer", []);
        const value = call();
        if (!value || value.isNull()) return null;
        return _objcString(value);
    }
    catch (e)
    {
        return null;
    }
}

function _candidates()
{
    const home = _homePath();
    if (!home) return [];
    const base = home.replace(/\/+$/, "");
    return [
        base + "/Documents/" + FILE_NAME,
        base + "/tmp/" + FILE_NAME,
        base + "/Library/Caches/" + FILE_NAME
    ];
}

var _libcApi = null;

function _libc()
{
    if (_libcApi) return _libcApi;
    try
    {
        const fopen = _resolveExport(null, "fopen");
        const fputs = _resolveExport(null, "fputs");
        const fflush = _resolveExport(null, "fflush");
        const fclose = _resolveExport(null, "fclose");
        if (!fopen || !fputs || !fflush || !fclose) return null;
        _libcApi =
        {
            fopen: new NativeFunction(fopen, "pointer", ["pointer", "pointer"]),
            fputs: new NativeFunction(fputs, "int", ["pointer", "pointer"]),
            fflush: new NativeFunction(fflush, "int", ["pointer"]),
            fclose: new NativeFunction(fclose, "int", ["pointer"])
        };
    }
    catch (e)
    {
        _libcApi = null;
    }
    return _libcApi;
}

function _openPath(path, mode)
{
    try
    {
        if (typeof File !== "undefined") return {
            kind: "file",
            io: new File(path, mode)
        };
    }
    catch (e)
    {}
    try
    {
        const libc = _libc();
        if (!libc) return null;
        const fp = libc.fopen(Memory.allocUtf8String(path), Memory.allocUtf8String(mode));
        if (!fp || fp.isNull()) return null;
        return {
            kind: "libc",
            fp,
            libc
        };
    }
    catch (e)
    {
        return null;
    }
}

function _close(handle)
{
    if (!handle) return;
    try
    {
        if (handle.kind === "file") handle.io.close();
        else handle.libc.fclose(handle.fp);
    }
    catch (e)
    {}
}

function _open()
{
    if (_handle) return _handle;
    if (_broken) return null;
    if (_resolved) return null;
    _resolved = true;
    for (const path of _candidates())
    {
        const handle = _openPath(path, "a");
        if (handle)
        {
            _handle = handle;
            _path = path;
            return _handle;
        }
    }
    _broken = true;
    return null;
}

function _rotate()
{
    const path = _path;
    _close(_handle);
    _handle = null;
    _bytes = 0;
    if (!path) return;
    const handle = _openPath(path, "w");
    if (handle) _handle = handle;
    else _broken = true;
}

function _write(text)
{
    const handle = _open();
    if (!handle) return false;
    try
    {
        if (handle.kind === "file")
        {
            handle.io.write(text);
            handle.io.flush();
        }
        else
        {
            handle.libc.fputs(Memory.allocUtf8String(text), handle.fp);
            handle.libc.fflush(handle.fp);
        }
        _bytes += text.length;
    }
    catch (e)
    {
        _broken = true;
        return false;
    }
    if (_bytes > MAX_FILE_BYTES) _rotate();
    return true;
}

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

function _line(level, message, data)
{
    return new Date().toISOString() + " " + level + " " + String(message || "") + _text(data) + "\n";
}

function _flush()
{
    _timer = null;
    if (!_pending.length) return;
    const text = _pending.join("");
    _pending = [];
    _write(text);
}

function _push(level, message, data)
{
    if (!_enabled) return;
    _open();
    _pending.push(_line(level, message, data));
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

export function raw(message, data)
{
    if (!_enabled) return false;
    return _write(_line(LEVEL_INFO, message, data));
}

export function logPath()
{
    _open();
    return _path;
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
