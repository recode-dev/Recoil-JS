import
{
    rva_offsets,
    structs_offsets,
    constant_offsets
}
from "./offsets.js";
import
{
    logInfo,
    logError
}
from "../utils/logger.js";

var base = null;
var native = {};
var struct = {};
var constants = {};

function fail(name)
{
    throw new Error("missing rva " + name);
}

export function setBase(address)
{
    base = address;
}

export function getBase()
{
    return base;
}

export function resolveAll()
{
    if (!base) throw new Error("base not set");
    for (const name in rva_offsets)
    {
        native[name] = base.add(rva_offsets[name]);
    }
    for (const name in structs_offsets)
    {
        struct[name] = structs_offsets[name];
    }
    for (const name in constant_offsets)
    {
        constants[name] = base.add(constant_offsets[name]);
    }
    logInfo("offsets resolved",
    {
        count: Object.keys(native).length
    });
    return native;
}

export function fn(name)
{
    const ptr = native[name];
    if (!ptr) fail(name);
    return ptr;
}

export function off(name)
{
    const value = struct[name];
    if (value === undefined) throw new Error("missing struct " + name);
    return value;
}

export function constant(name)
{
    const ptr = constants[name];
    if (!ptr) throw new Error("missing const " + name);
    return ptr;
}

export function i32(name)
{
    return new NativeFunction(fn(name), "int", ["pointer"]);
}

export function ptr32(name)
{
    return new NativeFunction(fn(name), "pointer", ["pointer"]);
}

export function boolAt(pointer, offset)
{
    return pointer.add(offset).readU8() !== 0;
}

export function i32At(pointer, offset)
{
    return pointer.add(offset).readS32();
}

export function ptrAt(pointer, offset)
{
    return pointer.add(offset).readPointer();
}

export function safe(label, callback)
{
    try
    {
        return callback();
    }
    catch (e)
    {
        logError(label,
        {
            module: label,
            reason: e && e.message ? e.message : String(e)
        });
        return null;
    }
}
