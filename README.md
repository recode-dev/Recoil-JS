# Recoil-JS

Frida agent for **Nulls Brawl 69.252** (iOS, arm64)

Two features only: `aimbot` and `autododge`.

## Build

```
npm install frida-compile
npx frida-compile agent/index.js -o dist/agent.js -B iife
```

## Layout

```
agent/core/offsets.js      RVAs, struct offsets, constant tables
agent/core/functions.js    offset resolution and native wrappers
agent/core/scanner.js      module base, object manager, tile grid, line of sight
agent/core/dataTables.js   name, radius, speed, skills, projectile and area data
agent/core/libs.js         interceptor table: update, projectiles, tiles
agent/core/commands.js     ClientInput construction and addInput
agent/features/aimbot.js   target selection, lead, wall check, fire
agent/features/autododge.js projectile scan, threat math, dodge vector
agent/helpers/             lead table, dodge kinds and fits
agent/utils/               logger, flags, names, crypto, wall cache
```

## Signing

Every `ClientInput` goes out signed. `BattleMode_hashEnabled` is checked first: when it is 0 the input is sent as-is. Otherwise the agent reads the 16-byte `BattleMode_hashKey`, builds the 20-byte message from the command bytes and the type constant from `ClientInput_typeConstantTable`, folds it through the two mask tables (`ClientInput_hashInnerMask`, `ClientInput_hashOuterMask`) with `sha256`, and writes the 16-bit token to `ClientInput_token` (0x34) before `addInput`.

## Log

No RPC and no host required. Everything goes to one file inside the app sandbox:

```
<app home>/Documents/recoil.log
```

The path is resolved at boot through `NSHomeDirectory` + `objc_msgSend`, so it follows the install without any hardcoded container UUID. If the file cannot be created there, the agent falls back to `<app home>/tmp/recoil.log` and then `Library/Caches/recoil.log`. Writing uses Frida's `File` API, with `fopen`/`fputs` as a fallback when `File` is unavailable.

The file is truncated on its own once it passes 2 MB, so an error loop cannot fill the container.

To reach `Documents` from the Files app on a non-jailbroken device, the app's `Info.plist` needs:

```
UIFileSharingEnabled = true
LSSupportsOpeningDocumentsInPlace = true
```

Without those keys the file is still written, but it is only reachable through the app itself.

## Diagnostics

Logging is on by default and every boot stage lands in the log:

```
boot start
offsets resolved { count: 32 }
stage core ok
battle capture installed
stage battle ok
hooks installed { count: 5, failed: 0 }
stage aimbot ok
aim hooks installed
stage aim ok
autododge ready
stage autododge ok
loop started { interval: 8 }
boot done { base: "0x..." }
```

The first missing line is where it stopped. A stage that reports `failed` carries the underlying reason. `hooks installed` reports how many interceptors attached and which ones refused.

Probes run at 3 s, 15 s, then every 30 s until ten snapshots are written:

```
probe { n, base, frames, projectiles, stamp, failed, battle, objects, own, target, threats, state }
```

Reading it:

- `base: null` - the module base was not resolved, nothing else will work.
- `frames` stays at 0 in a battle - `LogicBattleModeClient_update` is not being hit, the RVAs do not belong to this build.
- `battle: false` while `frames` grows - the battle pointer was not captured.
- `objects: 0` while `battle: true` - the object manager offsets are wrong.
- `target: false` with `objects` above 0 - every candidate is filtered out by team, dead, immune, range or wall check.
- `threats: 0` - no projectile passed the vtable check, the projectile data table offset is wrong.

Offsets in `agent/core/offsets.js` are RVAs for that exact build. Other versions won't work.

## License

`MIT`, See `LICENSE`
