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
agent/core/hooks.js        interceptor table: update, skills, projectiles, tiles
agent/core/input.js        ClientInput construction and addInput
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

Offsets in `agent/core/offsets.js` are RVAs for that exact build. Other versions won't work.

## License

`MIT`, See `LICENSE`
