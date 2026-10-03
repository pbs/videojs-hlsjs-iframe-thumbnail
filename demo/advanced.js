import '@videojs/html/video/player';
import '@videojs/html/video/skin';
import '@videojs/html/media/hlsjs-video';
import 'videojs-hlsjs-iframe-thumbnail';
import Hls from 'hls.js';

const PRESETS = [
  {
    id: 'pbs-test-pattern',
    label: 'PBS test pattern (HEVC + AVC, I-frame playlists)',
    src: 'https://pbs.github.io/test-streams/pbs/test-pattern/pbs-bars_hevc-avc.m3u8',
  },
  {
    id: 'bbb',
    label: 'Big Buck Bunny (Mux test stream, synthesized I-frames)',
    src: 'https://pbs.github.io/test-streams/test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
  {
    id: 'apple-hevc',
    label: 'Apple bipbop_adv_example_hevc',
    src: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8',
  },
  {
    id: 'apple-dv-atmos',
    label: 'Apple adv_dv_atmos (MJPG I-frames)',
    src: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/adv_dv_atmos/main.m3u8',
  },
  {
    id: 'angel-one-widevine',
    label: 'Angel One (Widevine)',
    src: 'https://pbs.github.io/test-streams/storage.googleapis.com/shaka-demo-assets/angel-one-widevine-hls/hls.m3u8',
    drm: { 'com.widevine.alpha': { licenseUrl: 'https://cwip-shaka-proxy.appspot.com/no_auth' } },
  },
  {
    id: 'ezdrm-fairplay',
    label: 'EZDRM (FairPlay)',
    src: 'https://pbs.github.io/test-streams/na-fps.ezdrm.com/demo/ezdrm/master.m3u8',
    drm: {
      'com.apple.fps': {
        licenseUrl: 'https://fps.ezdrm.com/api/licenses/b99ed9e5-c641-49d1-bfa8-43692b686ddb',
        serverCertificateUrl: 'https://fps.ezdrm.com/demo/video/eleisure.cer',
      },
    },
  },
];

const KEY_SYSTEMS = { 'com.widevine.alpha': 'Widevine', 'com.apple.fps': 'FairPlay' };

const LOG_LIMIT = 200;

const $ = (id) => document.getElementById(id);
const video = $('video');
const thumbnail = $('thumbnail');
const frameTime = $('frame-time');
const preset = $('preset');
const url = $('url');
const drmSummary = $('drm-summary');
const variants = $('variants');
const status = $('status');
const log = $('log');

// Each field is one entry of `source.drm`.
const DRM_FIELDS = [
  { input: $('widevine-license'), keySystem: 'com.widevine.alpha', key: 'licenseUrl' },
  { input: $('fairplay-license'), keySystem: 'com.apple.fps', key: 'licenseUrl' },
  { input: $('fairplay-certificate'), keySystem: 'com.apple.fps', key: 'serverCertificateUrl' },
];

$('hls-version').textContent = Hls.version;

for (const { id, label } of PRESETS) preset.append(new Option(label, id));
preset.append(new Option('Custom URL', 'custom'));

function append(name, data, kind = '') {
  const li = document.createElement('li');
  const time = document.createElement('span');
  const label = document.createElement('span');
  const body = document.createElement('span');

  time.className = 'time';
  time.textContent = new Date().toISOString().slice(11, 23);
  label.className = `name ${kind}`;
  label.textContent = name;
  body.className = 'data';
  body.textContent = data == null ? '' : typeof data === 'string' ? data : JSON.stringify(data);

  li.append(time, label, body);
  log.prepend(li);
  while (log.children.length > LOG_LIMIT) log.lastChild.remove();
}

function basename(u) {
  try {
    return new URL(u).pathname.split('/').pop() || u;
  } catch {
    return u;
  }
}

function formatTime(t) {
  const minutes = Math.floor(t / 60);
  const seconds = (t - minutes * 60).toFixed(3).padStart(6, '0');
  return `${minutes}:${seconds}`;
}

function renderVariants(list) {
  variants.replaceChildren();

  if (!list.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="empty" colspan="4">none</td>';
    variants.append(tr);
    return;
  }

  list.forEach((variant, i) => {
    const tr = document.createElement('tr');
    const codec = variant.imageCodec || variant.videoCodec || variant.codecs || '';
    const bitrate = variant.bitrate ? `${Math.round(variant.bitrate / 1000)} kbps` : '';
    const size = variant.width && variant.height ? `${variant.width}x${variant.height}` : '';

    // The I-frame player builds its levels from these entries and keeps their URLs, which makes the URL the
    // join key: codec-paired variants merge into one level, so indices do not line up.
    tr.dataset.url = variant.url;
    tr.dataset.index = String(i);
    tr.innerHTML = `<td>${i}</td><td>${size}</td><td>${bitrate}</td><td>${codec}</td>`;
    variants.append(tr);
  });
}

function updateStatus(engine) {
  const level = engine?.levels?.[engine.currentLevel];
  const urls = level?.url ?? [];
  let active = null;

  for (const tr of variants.querySelectorAll('tr[data-url]')) {
    const matches = urls.includes(tr.dataset.url);
    tr.toggleAttribute('data-active', matches);
    if (matches) active = tr;
  }

  if (!engine) status.textContent = '';
  else if (active) status.textContent = `variant ${active.dataset.index}, ${level.width}x${level.height}`;
  else status.textContent = 'no level yet';
}

let mainEngine = null;

function watchMainEngine() {
  const hls = video.engine;
  if (!hls || hls === mainEngine) return;

  mainEngine = hls;
  append('engine', 'new hls.js instance');

  hls.on(Hls.Events.MANIFEST_LOADING, (_, data) => append('MANIFEST_LOADING', basename(data.url)));
  hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
    renderVariants(hls.iframeVariants);
    append('MANIFEST_PARSED', { levels: data.levels.length, iframeVariants: hls.iframeVariants.length });
  });
  hls.on(Hls.Events.INIT_PTS_FOUND, (_, data) => {
    if (data.id === 'main') append('INIT_PTS_FOUND');
  });
  hls.on(Hls.Events.ERROR, (_, data) => {
    if (data.fatal) append('ERROR', { type: data.type, details: data.details }, 'error');
  });
}

function watchIFrameEngine(engine) {
  const image = typeof engine.attachImage === 'function';

  append(image ? 'createImageIFramePlayer' : 'createIFramePlayer', null, 'thumbnail');
  updateStatus(engine);

  engine.on(Hls.Events.LEVEL_LOADED, (_, data) =>
    append('LEVEL_LOADED', { level: data.level, fragments: data.details.fragments.length }, 'thumbnail')
  );
  engine.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
    append('LEVEL_SWITCHED', { level: data.level }, 'thumbnail');
    updateStatus(engine);
  });
  engine.on(Hls.Events.FRAG_BUFFERED, (_, data) =>
    append('FRAG_BUFFERED', { sn: data.frag.sn, start: +data.frag.start.toFixed(2) }, 'thumbnail')
  );
  engine.on(Hls.Events.ERROR, (_, data) =>
    append('ERROR', { type: data.type, details: data.details, fatal: data.fatal }, 'error')
  );
}

// A new engine appears with `loadstart`; a URL-only change keeps the engine and loads a new manifest.
video.addEventListener('loadstart', watchMainEngine);

thumbnail.addEventListener('engine-change', () => {
  frameTime.textContent = '';
  if (thumbnail.engine) watchIFrameEngine(thumbnail.engine);
  else {
    append('engine released', null, 'thumbnail');
    updateStatus(null);
  }
});

thumbnail.addEventListener('frame-change', () => {
  frameTime.textContent = formatTime(thumbnail.frameTime);
  append('frame-change', { frameTime: +thumbnail.frameTime.toFixed(3) }, 'thumbnail');
});

function readDrm() {
  const drm = {};

  for (const { input, keySystem, key } of DRM_FIELDS) {
    const value = input.value.trim();
    if (value) (drm[keySystem] ??= {})[key] = value;
  }

  return Object.keys(drm).length ? drm : undefined;
}

function writeDrm(drm = {}) {
  for (const { input, keySystem, key } of DRM_FIELDS) input.value = drm[keySystem]?.[key] ?? '';
  updateDrmSummary();
}

function updateDrmSummary() {
  const systems = Object.keys(readDrm() ?? {}).map((keySystem) => KEY_SYSTEMS[keySystem]);
  drmSummary.textContent = systems.length ? systems.join(', ') : 'none';
}

function load(src) {
  const drm = readDrm();

  renderVariants([]);
  updateStatus(null);
  append('load', { src, drm: drm ?? null });
  video.source = { src, ...(drm && { drm }) };
}

$('load').addEventListener('submit', (event) => {
  event.preventDefault();
  load(url.value.trim());
});

preset.addEventListener('change', () => {
  const chosen = PRESETS.find((p) => p.id === preset.value);
  if (!chosen) return url.focus();

  url.value = chosen.src;
  writeDrm(chosen.drm);
  load(chosen.src);
});

url.addEventListener('input', () => {
  preset.value = 'custom';
});

for (const { input } of DRM_FIELDS) input.addEventListener('input', updateDrmSummary);

$('clear').addEventListener('click', () => log.replaceChildren());

preset.value = PRESETS[0].id;
url.value = PRESETS[0].src;
writeDrm(PRESETS[0].drm);
load(PRESETS[0].src);
