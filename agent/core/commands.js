import
{
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

var ctor = null;
var addInput = null;
var size = 0x48;

export function initInput()
{
    ctor = new NativeFunction(fn("ClientInput_constructor_int"), "void", ["pointer", "int"]);
    addInput = new NativeFunction(fn("ClientInputManager_addInput"), "void", ["pointer", "pointer"]);
    constant("ClientInput_typeConstantTable");
    return true;
}

export function makeInput(type, x, y, skill)
{
    if (!ctor) initInput();
    const input = Memory.alloc(size);
    ctor(input, type);
    input.add(off("ClientInput_x")).writeS32(x);
    input.add(off("ClientInput_y")).writeS32(y);
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
