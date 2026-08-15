# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo location

The git repo and `package.json` live in the **nested** `wf-playout/wf-playout/` directory, not in the outer `~/Projects/wf-playout/`. Run all commands from the nested directory.

## Commands

```bash
npm start          # webpack-dev-server on http://localhost:3001 (hot reload, no auto-open)
npm run build      # production build → build/
npm run deploy     # production build + scripts/deploy.sh — NOTE: scripts/ does not exist in the repo
```

There is no test runner, linter, or formatter configured. The only "test" is a manual shell script against the VOD server:

```bash
./test-vod.sh [file.json]        # POST/GET/DELETE round-trip against VOD_URL (default http://10.66.1.76)
VOD_URL=http://localhost:8080 ./test-vod.sh
```

Verbose logging in the browser: append `?loglevel=debug` to the URL (`loglevel` defaults to `warn`, set in [src/index.js](src/index.js)).

### `.env` is mandatory

[webpack.config.js](webpack.config.js) calls `dotenv.config().parsed` and immediately `Object.keys()` it — **without a `.env` file the webpack config throws before the build starts**. Every variable is inlined at build time via `DefinePlugin` as a literal `process.env.REACT_APP_*` substitution, so:

- a variable missing from `.env` compiles to the literal `undefined` and shows up inside request URLs (`GET /undefined/source/find...`);
- the dev server must be restarted after any `.env` edit.

See [ENV-VARIABLES.md](ENV-VARIABLES.md) for the full variable list and defaults.

## Architecture

React 18 SPA built with raw webpack + Babel (no CRA), using Semantic UI React / Fomantic UI CSS. All components are **class components** with property-initializer state and arrow-function methods; no TypeScript, no PropTypes, no hooks.

### What actually runs

[src/index.js](src/index.js) → [src/App.js](src/App.js) → **[src/components/PlayBrowser.js](src/components/PlayBrowser.js)** is the entire live app. Everything else is dormant:

- `Monitor.js` and `PlayOut.js` are not mounted (the `PlayOut` import in `App.js` is commented out). Both talk to MQTT/streamer APIs and still contain working code — treat as reference, not dead weight, but nothing imports them. `PlayOut.js` confusingly declares `class Monitor`.
- `src/lib/janus-mqtt.js`, `publisher-plugin.js`, `subscriber-plugin.js` and `src/shared/media.js` are a Janus WebRTC stack that nothing currently imports.
- [src/components/UserManager.js](src/components/UserManager.js) is a **mock stub** — `hasRealmRole()` always returns `true` and the token is `'mock-token'`. Keycloak auth is effectively disabled even though `keycloak-js` is a dependency and `LoginPage.js` calls `kc.login()`/`kc.logout()`.

### Backends

All HTTP helpers live in [src/shared/tools.js](src/shared/tools.js), which also re-exports every env var as a named constant.

| Helper | Base | Used for |
|---|---|---|
| `getWorkflowData` | `JSRP_BACKEND` | source catalog: `source/find?key=date&value=YYYY-MM-DD`, `source/js/line?uid=` |
| `getData` / `putData` / `removeData` | `JSDB_STATE` | playlist persistence under `shidur/playlist[/{name}]` |
| HLS playback | **hardcoded** `https://src.bbdomain.org` | not env-driven; hardcoded in PlayBrowser |

`webpack.resolve.modules` includes `src`, so bare imports like `import {randomString} from "shared/tools"` resolve (used in `shared/media.js`).

### HLS URL grammar

Every player source and stored `hls_path` is assembled as:

```
https://src.bbdomain.org/{file_path}[/clipFrom/{ms}/clipTo/{ms}][/shift[/a{ms}][/v{ms}]]/master.m3u8
```

The shift-segment builder is **duplicated inline in ~7 places** in `PlayBrowser.js` (`selectFile`, `addToPlaylist`, `savePlaylist` (both branches), `updateCurrentPlaylistItem`, `loadPlaylistItemToPlayer`, the `setIn(null)` clear branch, and the "Apply Shift" button). Any change to the grammar must be applied to all of them.

### Time units

In/out points, `end_hafaka`, sadna pairs and shifts are **milliseconds** everywhere in state and in saved JSON; the `<video>` element's `currentTime` is seconds. `setIn` floors to a whole second, `setOut`/`setEndHafaka` ceil, then `* 1000`. Companion variables are the one place values are converted back to seconds.

### Playlist item shape

```js
{source_id, sha1, file_name, uid, file_uid, duration, file_path, hls_path, isHls,
 inpoint: [ms, ...], outpoint: [ms, ...],   // parallel arrays, index = pair number
 end_hafaka, sadnaInOuts: [{in, out}], shiftAudio, shiftVideo}
```

`inpoint`/`outpoint` were scalars historically; `loadPlaylistItemToPlayer` normalizes legacy scalars into arrays, but `updateCurrentPlaylistItem` still writes scalars back (a stale path — `savePlaylist` is the one that actually persists edits).

### Editing model

While `editingPlaylistIndex` is set, the component-level `inpoint`/`outpoint`/`end_hafaka`/`sadnaInOuts`/`shift*` state is the source of truth for that row — the table renders those live values, and they are merged into the playlist array only inside `savePlaylist`. `hasUnsavedChanges` drives the orange Save button. Save is blocked unless **every** item has an `end_hafaka`; total duration is computed as `first inpoint → end_hafaka`, falling back to the file duration.

### "Generate Playlists" fan-out

`generatePlaylist()` operates on `playlist_db` — i.e. **all saved playlists**, not just the loaded one — sorted by name and 1-indexed as `Ply{N}`. It performs three independent steps, each tolerant of failure:

1. **Companion** — one `POST {COMPANION_URL}/api/custom-variable/Ply{N}SadnaIn_{i}/value?value=` per variable, for `i` in 1..50 (padded with `0`). Sadna times are converted to seconds and made **relative to the item's first inpoint**.
2. **VOD** — `DELETE {VOD_URL}/api/vod-maps` to clear the folder, then `POST {VOD_URL}/api/vod-maps/{playlistName}.json` per playlist. `generateVODJson` emits one clip per in/out pair: `{cache:false, durations:[out-in,...], sequences:[{clips:[{type:"source", path:"wfapi/backup/files/sources/{file_path}", clipFrom, shiftAudio, shiftVideo}]}]}`.
3. `POST /api/playlist/generate` — a **relative** URL that assumes an nginx proxy in front of the app; it fails harmlessly under `npm start`.

### vod-server.js

[vod-server.js](vod-server.js) is a standalone Express service that is **not part of the webpack build** and has no entry in `package.json` dependencies — it is copied to the VOD machine and run there (`npm install express`, then PM2/systemd). It, along with `test-vod.sh`, `test_1.json` and `VOD-SERVER-README.md`, is listed in `.gitignore`, so those files are untracked locally. See [VOD-SERVER-README.md](VOD-SERVER-README.md) for deployment.

## Conventions

- Debug output is `console.log` with a `":: "` prefix for lifecycle events; the whole `PlayBrowser.render()` is wrapped in try/catch with a "Something went wrong" fallback, so a render exception surfaces as that message rather than a stack trace.
- User-facing errors from the generate flow are raw `alert()` dialogs.
- Component-scoped CSS overrides are injected as inline `<style>` blocks inside `render()` (e.g. the upward-opening dropdown rules) alongside `App.css`/`index.css`.
- Hebrew-derived domain terms appear untranslated in code: `sadna` (workshop segments exported to Companion), `end_hafaka` (production end point, distinct from `outpoint`).
