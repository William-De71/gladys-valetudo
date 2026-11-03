# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for robot vacuums running
**Valetudo** (valetudo.cloud): a Node.js service (Node 22+, ESM, no build
step, no dependency but the SDK) in its own sandboxed Docker container,
talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to the robots **on the local network** (`transports: ["local"]`).
`type: "device"`, Gladys 5.3.0+, `categories: ["appliances"]`,
`network_discovery: mdns _valetudo._tcp`. Not affiliated with Valetudo.

The API is the official REST API of Valetudo (`http://<robot>/api/v2/...`,
Swagger UI on the robot at `/swagger/`), read from its source
(github.com/Hypfer/Valetudo, `backend/lib/webserver/**`, release 2026.10.0,
checked on 2026-11-03). Commands are `PUT` with `{ "action": ... }` and answer
`OK`; live changes come from `GET /api/v2/robot/state/attributes/sse` (event
`StateAttributesUpdated`). **Never tested on a real robot.**

## Commands

```bash
npm install
npm test                                  # node --test, fake robots, never the network
node --test test/app.test.js              # one file
UPDATE_BASELINE=1 npm test                # rewrite test/fixtures/*.baseline.json (on purpose only)
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                    SDK wiring only (new GladysIntegration + createApp)
src/app.js                  every handler: search, SSE streams, minute check, commands,
                            scene actions and triggers, widgets, map image, test button
src/devices.js              entry -> Gladys device (features by capability), values
src/config.js               config_schema -> { mdns, hosts, username, password, language }
src/scenes.js               scene action and trigger keys, command and reason lists
src/states.js               state publication: created devices only, coalesced, 240/min, 429 pause
src/widgets.js              robot, map and maintenance widgets (pure, reused by docs/illustrations)
src/i18n.js                 runtime texts in en / fr / de / es
src/storage.js              JSON files in /data (robots.json: id -> address, system id, name, model)
src/png.js                  minimal indexed PNG encoder (node:zlib)
src/valetudo/client.js      REST client, Basic auth, SSE stream and parser
src/valetudo/attributes.js  state attributes -> snapshot -> Gladys vacuum state / run mode
src/valetudo/discovery.js   mDNS answers, typed addresses, robot ids
src/valetudo/map.js         ValetudoMap -> PNG (rooms, walls, path, robot, dock)
test/helpers/fake-valetudo.js   fake robots behind a fake fetch
test/fixtures/map.json          a real map of the Valetudo test suite (Apache-2.0, see NOTICE)
.github/scripts/release.mjs     version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**: `ext:{selector}:device:{id}` where `id` is the
  Valetudo system id in lowercase (`smoothweakpigeon`), and `…:<feature key>`
  (`state`, `run_mode`, `dock`, `battery`, `fan_speed`, `water_usage`,
  `operation_mode`, `consumable_<type>[_<subType>]`). Config, action, field,
  option, widget, setting, trigger and variable keys too:
  `test/structure.test.js` compares them to `test/fixtures/manifest.baseline.json`.
- **Feature fields** compared by the Discover "Update" (category, type, unit,
  min, max, step, features added or removed) are pinned in
  `test/fixtures/discovery.baseline.json`. `min`, `max`, `read_only` and
  `has_feedback` on EVERY feature. `should_poll: false`: the robot pushes its
  changes (SSE) and the integration checks every minute on its own timer.
- **Features follow the capabilities** Valetudo lists for the robot; a preset
  feature only exists with its presets, a consumable only when a percentage is
  known (percent unit, or minutes with a `maxValue`).
- **Gladys vacuum values** (core `VACUUM_CLEANER_STATE` / `_MODE`, 5.3.1) are
  copied in `src/valetudo/attributes.js`: keep them in step with the core.
- **One SSE stream per created robot** (Valetudo serves 5 at most per stream).
  A broken stream is retried with a growing delay; the robot is unreachable
  only when a plain request fails twice in a row.
- **Scene events** once per transition: `cleaning_started` (not after a
  pause), `cleaning_finished` (working -> returning / docked / idle, not
  error), `error`, `attention_needed` (Valetudo events raised after the first
  check only), `unreachable`, `reachable_again`. Never in reaction to a scene
  action.
- **States**: only for the devices the user created, through `src/states.js`.
  Republish everything known in `onDeviceCreated`.
- **The map image** is drawn on demand (map widget), kept 30 s, under 300 KB
  and 4096 px; its key changes with its bytes.
- **The container rootfs is read-only**: the only writable folder is /data.
- **Widget content**: after any change, run `docs/illustrations/render.sh` and
  look at the four images.
- **User-facing text** exists in en, fr, de and es: manifest, `src/i18n.js`,
  `docs/*.md`, `README*.md`; `test/i18n.test.js` checks it. German says "du",
  Spanish "usted". Use the words of the Gladys UI (Discover / Découverte /
  Entdecken / Descubrir).
- **Logo**: the Valetudo logo (Apache-2.0) only in the cover; keep the "not
  affiliated" notices.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  Below 1.0.0 until the maintainer runs Release with `release-as: 1.0.0`.
- **Changelog**: Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Commits and PR titles** follow Conventional Commits, in English.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style**: Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

## Pitfalls

- The container is behind the Docker bridge: mDNS never reaches it, Gladys
  runs the query (`gladys.scanNetwork('mdns')`); unicast HTTP to the robot
  crosses the bridge.
- Commands answer `200` with the body `OK` (not JSON): that is a success.
- A 401 means the robot answers but refuses the credentials: it is not
  "unreachable".
- Gladys does not send the user's language with a scan, a command or a scene
  action: feature names, trigger messages and scene errors use the `language`
  setting.
- The CI smoke test builds a device with BasicControlCapability and counts its
  features (4): update it when a feature is added.
- The validator of the Gladys core creates `gladys-development.duckdb` in the
  current folder: run it from elsewhere.
