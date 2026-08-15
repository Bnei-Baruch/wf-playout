// Keyframe index for packager-clipped HLS.
//
// The nginx-vod-module packager cuts audio sample-accurately at the requested clipFrom, but
// video only at an H.264 IDR — it advances the video cut to the next keyframe and then rebases
// both tracks to ~0 as though it had not. The discarded offset shows up on air as video running
// ahead of audio (measured 320-720ms on real lessons).
//
// The packager publishes its own keyframe index: master.m3u8 carries an
// #EXT-X-I-FRAME-STREAM-INF pointing at an #EXT-X-I-FRAMES-ONLY playlist whose cumulative
// #EXTINF sum is every keyframe timestamp. Snapping clipFrom onto one of those values makes the
// packager's advance a no-op, and the skew measures exactly 0.

// Packager base. Intentionally a literal rather than an env var: webpack's DefinePlugin only
// substitutes keys present in .env, so a missing key would compile into URLs as "undefined".
// The same host is still hardcoded at 9 sites in PlayBrowser.js — folding those into this
// constant is a mechanical follow-up, kept out of this change to keep the diff reviewable.
export const SRC_HLS_URL = 'https://src.bbdomain.org';

// Which side of the gap an in point lands on. 'prev' never clips the start of speech: the clip
// begins up to one keyframe interval (~1s) early rather than losing content.
export const SNAP_MODE_DEFAULT = 'prev';

// A correction larger than this means our idea of the timeline disagrees with the packager's.
// Better to export the authored value unchanged than to move a cut by seconds.
export const MAX_SNAP_MS = 3000;

const FETCH_TIMEOUT_MS = 15000;
const NEGATIVE_TTL_MS = 60000;   // let a transient packager failure be retried
const MAX_CACHE_ENTRIES = 32;    // ~46KB per 3h file as Int32Array

const cache = new Map();     // file_path -> entry
const inflight = new Map();  // file_path -> Promise<entry>

const fail = (file_path, reason) => ({ok: false, times: null, count: 0, totalMs: 0, reason, file_path});

const remember = (file_path, entry) => {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(file_path, {...entry, cachedAt: Date.now()});
  return entry;
};

const fetchText = (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, {signal: controller.signal})
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .finally(() => clearTimeout(timer));
};

const parseMasterForIframeUri = (text, masterUrl) => {
  const match = /#EXT-X-I-FRAME-STREAM-INF:[^\r\n]*URI="([^"]+)"/.exec(text);
  if (!match) return null;
  try {
    return new URL(match[1], masterUrl).href;
  } catch (e) {
    return null;
  }
};

// times[k] is the START of keyframe k, so times[0] is always 0.
const parseIframePlaylist = (text) => {
  if (text.indexOf('#EXT-X-I-FRAMES-ONLY') === -1) return null;
  const lines = text.split('\n');
  const times = [];
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = /^#EXTINF:\s*([0-9]*\.?[0-9]+)/.exec(lines[i]);
    if (!match) continue;
    const ms = Math.round(parseFloat(match[1]) * 1000);
    if (!(ms > 0 && ms <= 60000)) return null;
    times.push(acc);
    acc += ms;
  }
  if (times.length < 2 || times[0] !== 0 || acc > 2147483647) return null;
  return {times: Int32Array.from(times), totalMs: acc};
};

// The I-frame total matches the media playlist total to the millisecond on real assets, so a
// mismatch against the catalog duration means we parsed the wrong thing.
const durationLooksSane = (totalMs, durationSec) => {
  const durationMs = Number(durationSec) * 1000;
  if (!isFinite(durationMs) || durationMs <= 0) return true;
  return totalMs >= durationMs * 0.95 && totalMs <= durationMs * 1.05 + 5000;
};

export const getCachedKeyframes = (file_path) => {
  if (!file_path) return null;
  const entry = cache.get(file_path);
  if (!entry) return null;
  if (!entry.ok && Date.now() - entry.cachedAt > NEGATIVE_TTL_MS) {
    cache.delete(file_path);
    return null;
  }
  return entry;
};

// Never rejects — callers treat an unavailable index as "leave the value as authored".
export const getKeyframes = (file_path, durationSec) => {
  if (!file_path) return Promise.resolve(fail(file_path, 'no file path'));

  const cached = getCachedKeyframes(file_path);
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(file_path);
  if (pending) return pending;

  const masterUrl = `${SRC_HLS_URL}/${file_path}/master.m3u8`;
  const promise = fetchText(masterUrl)
    .then(masterText => {
      const iframeUrl = parseMasterForIframeUri(masterText, masterUrl);
      if (!iframeUrl) return fail(file_path, 'no I-frame stream in master playlist');
      return fetchText(iframeUrl).then(iframeText => {
        const parsed = parseIframePlaylist(iframeText);
        if (!parsed) return fail(file_path, 'could not parse I-frame playlist');
        if (!durationLooksSane(parsed.totalMs, durationSec)) {
          return fail(file_path, `I-frame total ${parsed.totalMs}ms disagrees with duration ${durationSec}s`);
        }
        return {ok: true, times: parsed.times, count: parsed.times.length, totalMs: parsed.totalMs, reason: '', file_path};
      });
    })
    .catch(ex => fail(file_path, ex.name === 'AbortError' ? 'timeout' : ex.message))
    .then(entry => {
      inflight.delete(file_path);
      if (entry.ok) console.log(":: Keyframes: ", file_path, entry.count, "keyframes,", entry.totalMs, "ms");
      else console.log(":: Keyframes unavailable: ", file_path, "-", entry.reason);
      return remember(file_path, entry);
    });

  inflight.set(file_path, promise);
  return promise;
};

export const prefetchKeyframes = (file_path, durationSec) => {
  getKeyframes(file_path, durationSec);
};

// Bounded-concurrency warm-up used by the export path. Resolves once every source has been
// attempted or the budget runs out; individual failures are already absorbed by getKeyframes.
export const preloadKeyframes = (sources, concurrency = 4, budgetMs = 30000) => {
  const deadline = Date.now() + budgetMs;
  let cursor = 0;
  const worker = () => {
    if (cursor >= sources.length) return Promise.resolve();
    const source = sources[cursor++];
    if (Date.now() > deadline) {
      console.log(":: Keyframes: budget exhausted, skipping", sources.length - cursor + 1, "file(s)");
      cursor = sources.length;
      return Promise.resolve();
    }
    return getKeyframes(source.file_path, source.duration).then(worker);
  };
  const workers = Math.min(concurrency, sources.length);
  return Promise.all(Array.from({length: workers}, worker));
};

// Index of the last keyframe at or before ms; -1 when ms precedes the first.
const floorIndex = (times, ms) => {
  let lo = 0;
  let hi = times.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= ms) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
};

export const isOnKeyframe = (times, ms) => {
  if (!times || !times.length || ms === null || ms === undefined) return false;
  const i = floorIndex(times, ms);
  return i >= 0 && times[i] === ms;
};

export const snapMs = (times, ms, mode = SNAP_MODE_DEFAULT) => {
  if (!times || !times.length || ms === null || ms === undefined || !isFinite(ms)) return ms;

  const last = times[times.length - 1];
  if (ms <= times[0]) return times[0];
  if (ms >= last) return last;

  const i = floorIndex(times, ms);
  const prev = times[i];
  if (prev === ms) return ms;
  const next = times[i + 1];

  let snapped;
  if (mode === 'next') snapped = next;
  else if (mode === 'nearest') snapped = (ms - prev <= next - ms) ? prev : next;
  else snapped = prev;

  if (Math.abs(snapped - ms) > MAX_SNAP_MS) {
    console.log(":: Keyframes: snap rejected,", ms, "->", snapped, "exceeds", MAX_SNAP_MS, "ms");
    return ms;
  }
  return snapped;
};

// Move to the adjacent keyframe. From a position between keyframes, -1 goes back to the one
// below and +1 forward to the one above, so stepping never skips the gap the operator is in.
export const stepKeyframe = (times, ms, dir) => {
  if (!times || !times.length || ms === null || ms === undefined) return ms;
  const last = times[times.length - 1];
  const i = floorIndex(times, ms);

  if (dir < 0) {
    if (i <= 0) return times[0];
    return times[i] === ms ? times[i - 1] : times[i];
  }
  if (i < 0) return times[0];
  if (times[i] >= last) return last;
  return times[i + 1];
};

export const clearKeyframeCache = () => {
  cache.clear();
  inflight.clear();
};
