import
{
    getBase,
    fn,
    off,
    ptrAt,
    constant
}
from "./functions.js";
import
{
    logWarn
}
from "../utils/logger.js";
import
{
    sha256
}
from "../utils/crypto.js";

const CMD_BUF_SIZE = 0x48;
const MAX_TABLE_TYPE = 0x16;
const TABLE_ENTRIES = MAX_TABLE_TYPE + 1;
const FALLBACK_TYPE_CONST = 0xdeadbeef;
const MASK_SIZE = 16;
const MSG_SIZE = 20;
const BLOCK_SIZE = 64;
const INNER_PAD = 0x36;
const OUTER_PAD = 0x5c;

var ctor = null;
var addInput = null;
var _typeTable = null;
var _innerMask = null;
var _outerMask = null;
var _lastToken = 0;
var _zero = new Uint8Array(CMD_BUF_SIZE).buffer;

function _bytesAt(address, size)
{
    const raw = address.readByteArray(size);
    if (!raw) throw new Error("read failed");
    return new Uint8Array(raw);
}

function _loadSigning()
{
    if (_typeTable) return true;
    if (!getBase()) return false;
    const table = _bytesAt(constant("ClientInput_typeConstantTable"), TABLE_ENTRIES * 4);
    const values = new Uint32Array(TABLE_ENTRIES);
    for (let i = 0; i < TABLE_ENTRIES; i++)
    {
        values[i] = (table[i * 4] | table[i * 4 + 1] << 8 | table[i * 4 + 2] << 16 | table[i * 4 + 3] << 24) >>> 0;
    }
    _innerMask = _bytesAt(constant("ClientInput_hashInnerMask"), MASK_SIZE);
    _outerMask = _bytesAt(constant("ClientInput_hashOuterMask"), MASK_SIZE);
    _typeTable = values;
    return true;
}

function _concat(a, b)
{
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
}

function _block(key16, mask, pad)
{
    const block = new Uint8Array(BLOCK_SIZE);
    for (let i = 0; i < MASK_SIZE; i++) block[i] = key16[i] ^ mask[i];
    block.fill(pad, MASK_SIZE);
    return block;
}

function _token(key16, data16)
{
    const raw = (data16[4] | data16[5] << 8 | data16[6] << 16 | data16[7] << 24) >>> 0;
    const mapped = raw <= MAX_TABLE_TYPE ? _typeTable[raw] : FALLBACK_TYPE_CONST;
    const msg = new Uint8Array(MSG_SIZE);
    for (let i = 0; i < 12; i++) msg[i] = data16[4 + i];
    for (let i = 0; i < 4; i++) msg[12 + i] = data16[i];
    msg[16] = mapped & 0xff;
    msg[17] = (mapped >>> 8) & 0xff;
    msg[18] = (mapped >>> 16) & 0xff;
    msg[19] = (mapped >>> 24) & 0xff;
    const inner = sha256(_concat(_block(key16, _innerMask, INNER_PAD), msg));
    const digest = sha256(_concat(_block(key16, _outerMask, OUTER_PAD), inner));
    let value = (digest[0] | (digest[1] & 0x7f) << 8) >>> 0;
    if (value <= 1) value = 1;
    return value;
}

export function initInput()
{
    ctor = new NativeFunction(fn("ClientInput_constructor_int"), "void", ["pointer", "int"]);
    addInput = new NativeFunction(fn("ClientInputManager_addInput"), "void", ["pointer", "pointer"]);
    try
    {
        _loadSigning();
    }
    catch (e)
    {
        logWarn("signing tables unavailable",
        {
            reason: e && e.message ? e.message : String(e)
        });
    }
    return true;
}

export function lastToken()
{
    return _lastToken;
}

export function signClientInput(input, battle)
{
    if (!input || input.isNull()) return 0;
    if (!battle || battle.isNull()) return 0;
    try
    {
        if (battle.add(off("BattleMode_hashEnabled")).readU8() === 0) return 0;
        if (!_loadSigning()) return 0;
        const key16 = new Uint8Array(battle.add(off("BattleMode_hashKey")).readByteArray(MASK_SIZE));
        if (!key16 || key16.length < MASK_SIZE) return 0;
        const data16 = new Uint8Array(input.add(4).readByteArray(16));
        if (!data16 || data16.length < 16) return 0;
        const value = _token(key16, data16);
        input.add(off("ClientInput_token")).writeU32(value);
        _lastToken = value;
        return value;
    }
    catch (e)
    {
        return 0;
    }
}

export function makeInput(type, x, y, skill)
{
    if (!ctor) initInput();
    const input = Memory.alloc(CMD_BUF_SIZE);
    input.writeByteArray(_zero);
    ctor(input, type | 0);
    input.add(off("ClientInput_type")).writeS32(type | 0);
    input.add(off("ClientInput_x")).writeS32(x | 0);
    input.add(off("ClientInput_y")).writeS32(y | 0);
    if (skill) input.add(off("ClientInput_skillData")).writePointer(skill);
    return input;
}

export function sendClientInput(battle, type, x, y, skill)
{
    try
    {
        if (!battle || battle.isNull()) return false;
        const manager = ptrAt(battle, off("BattleMode_clientInputManager"));
        if (manager.isNull()) return false;
        const input = makeInput(type, x, y, skill);
        signClientInput(input, battle);
        addInput(manager, input);
        return true;
    }
    catch (e)
    {
        logWarn("sendClientInput",
        {
            reason: e && e.message ? e.message : String(e)
        });
        return false;
    }
}
