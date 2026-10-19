import
{
    fn,
    off,
    i32,
    ptr32,
    i32At,
    ptrAt,
    boolAt,
    constant
}
from "./functions.js";
import
{
    logInfo
}
from "../utils/logger.js";
import
{
    canonBrawlerName
}
from "../utils/brawlerName.js";

var api = {};
var typeTableSize = 0x15;

export function init()
{
    api =
    {
        name: ptr32("LogicData_getName"),
        dataOf: ptr32("LogicGameObjectClient_getData"),
        collision: i32("LogicCharacterData_getCollisionRadius"),
        charSpeed: i32("LogicCharacterData_getSpeed"),
        weapon: ptr32("LogicCharacterClient__getWeaponSkill"),
        linked: ptr32("LogicCharacterClient__getLinkedCarryable"),
        skillAt: ptr32("LogicCharacterClient__getSkillAt"),
        immune: i32("LogicCharacterClient__isImmuneOrUntargetable"),
        skillData: ptr32("LogicSkillClient_GetData"),
        casting: i32("LogicSkillData__getCastingRange"),
        projectileAt: ptr32("LogicProjectileData_getByIndex"),
        projectileOfSkill: ptr32("LogicSkillData__getProjectileData"),
        spawnAe: ptr32("LogicProjectileData_getSpawnAreaEffect"),
        aeRadius: i32("AreaEffectData__getRadius"),
        aeTime: i32("AreaEffectData__getActiveTimeMs"),
        ownTeam: i32("LogicBattleModeClient_getOwnPlayerTeam"),
        ownIndex: i32("LogicBattleModeClient__getOwnPlayerIndex"),
        team: i32("LogicGameObjectClient_getGlobalID")
    };
    logInfo("data tables ready");
    return true;
}

export function nameOf(data)
{
    try
    {
        if (!data || data.isNull()) return "";
        const pointer = api.name(data);
        if (pointer.isNull()) return "";
        return canonBrawlerName(pointer.readCString());
    }
    catch (e)
    {
        return "";
    }
}

export function dataOf(object)
{
    return api.dataOf(object);
}

export function collisionRadius(data)
{
    const direct = i32At(data, off("CharData_collisionRadius"));
    return direct > 0 ? direct : api.collision(data);
}

export function moveSpeed(data)
{
    const direct = i32At(data, off("CharData_speed"));
    return direct > 0 ? direct : api.charSpeed(data);
}

export function isImmune(character)
{
    if (boolAt(character, off("GameObj_immuneFlag"))) return true;
    return api.immune(character) !== 0;
}

export function weaponSkill(character)
{
    const direct = ptrAt(character, off("LogicCharacterClient_weaponSkill"));
    if (!direct.isNull()) return direct;
    return api.weapon(character);
}

export function skillAt(character, index)
{
    try
    {
        const skill = api.skillAt(character, index);
        if (skill.isNull()) return null;
        return skill;
    }
    catch (e)
    {
        return null;
    }
}

export function linkedCarryable(battle, character)
{
    try
    {
        const carryable = api.linked(battle, character);
        if (carryable.isNull()) return null;
        return carryable;
    }
    catch (e)
    {
        return null;
    }
}

export function skillData(skill)
{
    if (!skill || skill.isNull()) return null;
    const data = api.skillData(skill);
    return data.isNull() ? null : data;
}

export function castingRange(data)
{
    return api.casting(data);
}

export function projectileOfSkill(data)
{
    try
    {
        const projectile = api.projectileOfSkill(data);
        if (projectile.isNull()) return null;
        return projectile;
    }
    catch (e)
    {
        return null;
    }
}

export function projectileAt(data, index)
{
    try
    {
        const projectile = api.projectileAt(data, index);
        if (projectile.isNull()) return null;
        return projectile;
    }
    catch (e)
    {
        return null;
    }
}

export function spawnAreaEffect(projectile)
{
    try
    {
        const effect = api.spawnAe(projectile);
        if (effect.isNull()) return null;
        return effect;
    }
    catch (e)
    {
        return null;
    }
}

export function areaRadius(data)
{
    return api.aeRadius(data);
}

export function areaTime(data)
{
    return api.aeTime(data);
}

export function ownTeam(battle)
{
    return api.ownTeam(battle);
}

export function ownIndex(battle)
{
    return api.ownIndex(battle);
}

export function ownerIndex(object)
{
    return i32At(object, off("LogicGameObjectClient_ownerIndex"));
}

export function dataName(projectile)
{
    try
    {
        const pointer = ptrAt(projectile, off("LogicProjectileClient_dataName"));
        if (pointer.isNull()) return "";
        const length = i32At(pointer, off("ScString_length"));
        const data = ptrAt(pointer, off("ScString_data"));
        if (data.isNull() || length <= 0 || length > 256) return "";
        return data.readUtf8String(length);
    }
    catch (e)
    {
        return "";
    }
}

export function dead(object)
{
    return boolAt(object, off("GameObj_deadFlag"));
}

export function speedBuff(character)
{
    return i32At(character, off("LogicCharacterClientOwn_speedBuff"));
}

export function aimPoint(screen)
{
    if (!screen || screen.isNull()) return null;
    return {
        x: i32At(screen, off("BattleScreen_aimX")),
        y: i32At(screen, off("BattleScreen_aimY"))
    };
}

export function clientType(code)
{
    const table = constant("ClientInput_typeConstantTable");
    if (code < 0 || code > typeTableSize) return -1;
    return table.add(code * 4).readS32();
}

export function commandScale(index)
{
    const table = constant("SkillCommandTypeTable");
    if (index < 0 || index > 64) return 0;
    return table.add(index * 4).readFloat();
}

export function signature(battle)
{
    if (!battle || battle.isNull()) return null;
    const inner = constant("ClientInput_hashInnerMask");
    const outer = constant("ClientInput_hashOuterMask");
    return {
        enabled: boolAt(battle, off("BattleMode_hashEnabled")),
        key: i32At(battle, off("BattleMode_hashKey")),
        inner: inner.readU32(),
        outer: outer.readU32()
    };
}
