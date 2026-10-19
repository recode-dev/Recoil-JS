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

## RPC

```
boot()
start()
stop()
probe()
diag()
own()
logging(value)
echo(value)
toggle("aimbot" | "autododge", true | false)
flags()
target()
threats()
world()
hooks()
walls()
grid()
screen(pointer)
burst(count, ms)
```

## Diagnostics

Logging is on by default. Every boot stage reports to both the Frida message channel and `console.log`, so a gadget build injected into the IPA shows the trace without a host attached:

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

Two automatic probes run at 3 s and 15 s after boot and print a single snapshot:

```
probe { base, frames, projectiles, stamp, battle, objects, own, target, threats }
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
