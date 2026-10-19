export const rva_offsets = Object.freeze(
{
    LogicBattleModeClient_getOwnCharacter: 0xac3934,
    LogicBattleModeClient_getOwnPlayerTeam: 0xa7f47c,
    LogicBattleModeClient__getOwnPlayerIndex: 0x9cda04,
    LogicBattleModeClient_setClientPredictionMoveTo: 0xac3a58,
    LogicBattleModeClient__getTileMap: 0x991440,

    LogicGameObjectClient_getX: 0xa23afc,
    LogicGameObjectClient_getY: 0xa23b04,
    LogicGameObjectClient_getData: 0x117050,
    LogicGameObjectClient_getGlobalID: 0x46464c,

    LogicCharacterData_getCollisionRadius: 0x9913e8,
    LogicCharacterData_getSpeed: 0x9911ec,
    LogicCharacterClient__getWeaponSkill: 0x9fc440,
    LogicCharacterClient__getLinkedCarryable: 0x9fc704,
    LogicCharacterClient__getSkillAt: 0xa007fc,
    LogicCharacterClient__isImmuneOrUntargetable: 0x9fdbb8,

    LogicProjectileClient_getData: 0x117050,
    LogicProjectileClient_getTargetX: 0x9fbf40,
    LogicProjectileClient_updateTarget: 0xa81570,
    LogicProjectileClient_updateMotion: 0x94acb8,
    LogicProjectileData_getSpeed: 0x8cee94,
    LogicProjectileData_getRadius: 0x860d88,
    LogicProjectileData_getSpawnAreaEffect: 0x9cda1c,
    LogicProjectileData__isBeam: 0x9cda6c,
    LogicProjectileData_getByIndex: 0x9debb8,
    LogicSkillData__getProjectileData: 0x9debb8,
    LogicSkillData__getCastingRange: 0x9de9cc,
    LogicSkillClient_GetData: 0x1e5650,

    AreaEffectData__getRadius: 0x8cee8c,
    AreaEffectData__getActiveTimeMs: 0x9bf8f4,

    LogicData_getName: 0x9a4f1c,
    ClientInputManager_addInput: 0x74675c,
    ClientInput_constructor_int: 0xa95798
});

export const structs_offsets = Object.freeze(
{
    TileMap_Width: 0xc4,
    TileMap_Height: 0xc8,
    TileMap_TilesArray: 0x20,
    TileTypeData_BlocksMovement: 0x56,
    TileTypeData_BlocksProjectiles: 0x57,

    BattleMode_objectManagerPtr: 0x28,
    BattleMode_clientInputManager: 0x58,
    BattleMode_hashEnabled: 0x70,
    BattleMode_hashKey: 0x60,

    ObjectManager_objectsArray: 0x0,
    ObjectManager_count: 0xc,
    ObjectManager_ptrStride: 0x8,

    GameObj_team: 0x40,
    LogicGameObjectClient_ownerIndex: 0x3c,
    GameObj_deadFlag: 0xd0,
    GameObj_immuneFlag: 0x240,

    CharData_speed: 0x26c,
    CharData_collisionRadius: 0x2ac,

    LogicCharacterClient_weaponSkill: 0x328,
    LogicCharacterClientOwn_speedBuff: 0x1fc,

    LogicProjectileClient_ownerTeam: 0x40,
    LogicProjectileClient_dataName: 0xc0,
    LogicProjectileClient_targetX: 0xa8,
    LogicProjectileClient_targetY: 0xac,
    LogicProjectileData_speed: 0x6c,
    LogicProjectileData_radius: 0x74,
    LogicProjectileData_isBeam: 0x1d9,
    LogicProjectileData_spawnAreaEffect: 0x178,

    AreaEffectData_radius: 0x68,
    AreaEffectData_activeTimeMs: 0x64,

    ClientInput_type: 0x8,
    ClientInput_x: 0xc,
    ClientInput_y: 0x10,
    ClientInput_token: 0x34,
    ClientInput_skillData: 0x40,

    ScString_length: 0x4,
    ScString_data: 0x8,

    BattleScreen_aimX: 0xa80,
    BattleScreen_aimY: 0xa84
});

export const interceptor_offsets = Object.freeze(
{
    LogicBattleModeClient_update: 0xac1ee8,
    BattleScreen_activateSkill: 0x7a0084,
    BattleScreen_getClosestTargetForAutoshoot: 0x7b67ec,
    LogicProjectileClient_ctor: 0xa2d8cc,
    LogicProjectileClient_destruct: 0x9f4fe8,
    LogicTile__setData: 0x9401fc
});

export const constant_offsets = Object.freeze(
{
    VTABLE_PROJECTILE_DATA: 0xff3b18,
    ClientInput_typeConstantTable: 0xe1d9a8,
    ClientInput_hashInnerMask: 0xe1bbd0,
    ClientInput_hashOuterMask: 0xe1bbf0,
    SkillCommandTypeTable: 0xe1bf7c
});

export const client_input_type = Object.freeze(
{
    move: 2,
    attack: 0xa
});
