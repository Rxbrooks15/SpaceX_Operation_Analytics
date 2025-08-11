import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
/* ========= Title, CSV loading, vertical flight slider, bottom-right metrics ========= */

// 1) Update the heading title without touching your HTML


// 2) Fetch CSVs in parallel (start ASAP)
const launchesCsvPromise = fetch('./spacex_launch_data.csv').then(r => r.text());
const starlinkCsvPromise = fetch('./starlink_launched.csv').then(r => r.text());

/* ----------------------------- Helpers ----------------------------------- */
// CSV
function splitCSVLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) { out.push(cur); cur=''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.replace(/^"(.*)"$/,'$1'));
}
function parseCSV(text) {
  const lines = (text || '').trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = splitCSVLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]?.trim()) continue;
    const cols = splitCSVLine(lines[i]);
    const row = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = (cols[j] ?? '').trim();
    rows.push(row);
  }
  return rows;
}
function findKey(keys, candidates) {
  const low = keys.map(k => k.toLowerCase());
  for (const cand of candidates) {
    const idx = low.indexOf(cand.toLowerCase());
    if (idx !== -1) return keys[idx];
  }
  for (const k of keys) {
    const lk = k.toLowerCase();
    if (candidates.some(c => lk.includes(c.toLowerCase()))) return k;
  }
  return null;
}
function toNumber(x) {
  const n = parseFloat(String(x).replace(/[^\d.+-eE]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function formatMassKg(v) {
  const n = toNumber(v);
  if (n == null) return '—';
  return Intl.NumberFormat('en-US').format(Math.round(n)) + ' kg';
}
function formatDateNice(v) {
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'2-digit' });
  }
  return (v && v.length >= 10) ? v.slice(0,10) : (v || '—');
}

// NEW: Starlink helpers
function yesNo(x) {
  if (x == null) return '—';
  const s = String(x).trim().toLowerCase();
  if (!s) return '—';
  if (['1','true','yes','y','working','operational'].includes(s)) return 'Yes';
  if (['0','false','no','n','failed','not working','inoperative'].includes(s)) return 'No';
  return String(x);
}
function parsePercent(x) {
  if (x == null || x === '') return null;
  const s = String(x).trim();
  const n = parseFloat(s.replace('%',''));
  if (!Number.isFinite(n)) return null;
  return s.includes('%') ? n : (n <= 1 ? n * 100 : n);
}
function colorForPercent(p) {
  if (p == null) return '#e8eefc';
  if (p >= 90) return '#4ade80'; // green
  if (p >= 80) return '#facc15'; // yellow
  if (p >= 50) return '#fb923c'; // orange
  return '#f87171';              // red
}
function colorForWorking(w) {
  const s = String(w || '').toLowerCase();
  if (s === 'yes') return '#4ade80';
  if (s === 'no')  return '#f87171';
  return '#e8eefc';
}

/* ----------------------- Build indices (Launch / Starlink) ---------------- */
// 5) Build indices separately for Launches and Starlink (so KPIs differ)
function buildLaunchIndex(rows) {
  const idx = new Map();
  if (!rows.length) return idx;

  const keys = Object.keys(rows[0] || {});
  const kFlight  = findKey(keys, ['flight_number','flight','flight no','no','#']);
  const kOrbit   = findKey(keys, ['orbit']);
  const kLanding = findKey(keys, ['landing outcome','landing_outcome','landing','landing success','landing type']);
  const kPayload = findKey(keys, ['payload','payload name','payload id','payload_id','payload_name']);
  const kMass    = findKey(keys, ['payload mass','payload_mass_kg','payload mass (kg)','mass (kg)','mass']);
  const kDate    = findKey(keys, ['date','launch date','launch_date_utc','launch date (utc)','utc date']);

  for (const r of rows) {
    const f = toNumber(r[kFlight]);
    if (f == null) continue;
    idx.set(f, {
      flight:  f,
      orbit:   kOrbit   ? r[kOrbit]   || '—' : '—',
      landing: kLanding ? r[kLanding] || '—' : '—',
      payload: kPayload ? r[kPayload] || '—' : '—',
      mass:    kMass    ? r[kMass]    || '—' : '—',
      date:    kDate    ? formatDateNice(r[kDate]) : '—',
    });
  }
  return idx;
}

function buildStarlinkIndex(rows) {
  const idx = new Map();
  if (!rows.length) return idx;

  const keys = Object.keys(rows[0] || {});
  const kId        = findKey(keys, ['Satellite Number','satellite number','satellite','flight','launch','launch number','seq','no','#','id']);
  const kAlt       = findKey(keys, ['altitude','altitude (km)','altitude_km','orbit height']);
  const kInc       = findKey(keys, ['inclination','inclination (deg)','inclination_deg']);
  const kMission   = findKey(keys, ['mission','mission name','payload','payload name']);
  const kVehicle   = findKey(keys, ['vehicle','rocket','launcher']);
  const kDate      = findKey(keys, ['date','launch date','launch_date_utc','utc date']);
  const kPercent   = findKey(keys, ['percent','%','success percent','health percent','uptime']);
  const kWorking   = findKey(keys, ['working','operational','status','alive','active']);

  for (const r of rows) {
    const f = toNumber(r[kId]);
    if (f == null) continue;
    idx.set(f, {
      flight:     f,
      altitude:   kAlt     ? r[kAlt]     || '—' : '—',
      inclination:kInc     ? r[kInc]     || '—' : '—',
      mission:    kMission ? r[kMission] || '—' : '—',
      vehicle:    kVehicle ? r[kVehicle] || '—' : '—',
      date:       kDate    ? formatDateNice(r[kDate]) : '—',
      percent:    kPercent ? r[kPercent] : null,
      working:    kWorking ? r[kWorking] : null,
    });
  }
  return idx;
}

/* ---------------- UI: sliders on top, 5 KPIs (die-5) bottom-right -------- */
// 6) UI: a bottom-right wrapper with sliders on top, 5 KPIs below (die-5)
function createMetricsUI() {
  const wrap = document.createElement('div');
  wrap.id = 'metrics-wrap';
  wrap.style.cssText = `
    position: fixed;
    right: 24px;
    bottom: 24px;
    display: grid;
    grid-auto-rows: auto 1fr;
    gap: 5px;
    z-index: 10005;
    width: min(60vw, 820px);
  `;

  // sliders row
  const slidersRow = document.createElement('div');
  slidersRow.id = 'sliders-row';
  slidersRow.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
    transform: translateY(25px);     /* move both sliders up */
  `;

  // one slider group factory (horizontal)
  const sliderCss = `
    display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 1px;
    border:1px solid rgba(255,255,255,.45);
    background: rgba(0,0,0,.35); backdrop-filter: blur(3px);
    padding: 6px 8px; border-radius: 10px;
    transition: box-shadow .15s ease, border-color .15s ease;
    transform: scale(.72);                 /* shrink group */
    transform-origin: top right;
  `;
  function makeSliderGroup({labelText, id}) {
    const g = document.createElement('div');
    g.className = 'slider-group';
    g.style.cssText = sliderCss;

    const label = document.createElement('div');
    label.textContent = labelText;
    label.style.cssText =
      'font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; white-space:nowrap;';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0'; input.max = '100'; input.step = '1'; input.value = '0';
    input.id = id;
    input.style.cssText = `
      width: 100%; height: 6px; margin: 0;
      background: transparent; accent-color: #9bb7ff;
    `;

    const val = document.createElement('div');
    val.textContent = '—';
    val.style.cssText =
      'font:700 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; padding:4px 8px; border-radius:8px; border:1px solid rgba(255,255,255,.35);';

    g.append(label, input, val);
    return {group: g, input, val};
  }

  const launchSlider = makeSliderGroup({labelText: 'Flight Number', id: 'launch-slider'});
  const starlinkSlider = makeSliderGroup({labelText: 'Starlink Launch', id: 'starlink-slider'});

  slidersRow.append(launchSlider.group, starlinkSlider.group);
  wrap.appendChild(slidersRow);

  // KPI deck (die-5)
  const deck = document.createElement('div');
  deck.id = 'metrics-deck';
  deck.style.cssText = `
    display: grid;
    grid-template-columns: repeat(3, minmax(140px,1fr));
    grid-template-areas:
      "tl c tr"
      "bl c br";
    gap: 12px;
    transform: scale(.85);
    transform-origin: top right;
  `;
  const cardCss = `
    border:1px solid rgba(255,255,255,.5);
    border-radius:12px;
    background: rgba(0,0,0,.35);
    backdrop-filter: blur(3px);
    padding: 12px 14px;
    min-height: 74px;
  `;
  function makeCard(area) {
    const c = document.createElement('div');
    c.style.cssText = cardCss;
    c.style.gridArea = area;
    c.innerHTML = `
      <div class="kpi-title" style="font:700 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; opacity:.9;">—</div>
      <div class="kpi-value" style="margin-top:8px; font:600 16px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">—</div>
    `;
    return c;
  }
  const cardTL = makeCard('tl');
  const cardTR = makeCard('tr');
  const cardBL = makeCard('bl');
  const cardBR = makeCard('br');
  const cardC  = makeCard('c');
  cardC.style.boxShadow = '0 0 0 2px rgba(255,255,255,.12) inset';

  deck.append(cardTL, cardC, cardTR, cardBL, cardBR);
  wrap.appendChild(deck);
  document.body.appendChild(wrap);

  function setLabels({tl, bl, tr, br, c}) {
    cardTL.querySelector('.kpi-title').textContent = tl;
    cardBL.querySelector('.kpi-title').textContent = bl;
    cardTR.querySelector('.kpi-title').textContent = tr;
    cardBR.querySelector('.kpi-title').textContent = br;
    cardC .querySelector('.kpi-title').textContent = c;
  }
  function setValues({tl, bl, tr, br, c}) {
    cardTL.querySelector('.kpi-value').textContent = tl ?? '—';
    cardBL.querySelector('.kpi-value').textContent = bl ?? '—';
    cardTR.querySelector('.kpi-value').textContent = tr ?? '—';
    cardBR.querySelector('.kpi-value').textContent = br ?? '—';
    cardC .querySelector('.kpi-value').textContent = c ?? '—';
  }
  function highlight(which) {
    launchSlider.group.style.borderColor   = which === 'launch'   ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.45)';
    starlinkSlider.group.style.borderColor = which === 'starlink' ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.45)';
    launchSlider.group.style.boxShadow     = which === 'launch'   ? '0 0 0 2px rgba(255,255,255,.15) inset' : 'none';
    starlinkSlider.group.style.boxShadow   = which === 'starlink' ? '0 0 0 2px rgba(255,255,255,.15) inset' : 'none';
  }

  return {
    sliders: {
      launch:   { input: launchSlider.input,   val: launchSlider.val },
      starlink: { input: starlinkSlider.input, val: starlinkSlider.val }
    },
    setLabels,
    setValues,
    highlight,
  };
}

/* -------------------- NEW: 2 vertical KPIs (top-left) -------------------- */
function createStarlinkTwoKpisTopLeft() {
  const box = document.createElement('div');
  box.id = 'starlink-kpis';
  box.style.cssText = `
    position: fixed;
    top: 6vh;
    left: 3vw;
    display: grid;
    grid-auto-rows: 1fr;
    gap: 10px;
    z-index: 10020;
    width: clamp(180px, 16vw, 240px);
  `;
  const cardCss = `
    border:1px solid rgba(255,255,255,.5);
    border-radius:12px;
    background: rgba(0,0,0,.35);
    backdrop-filter: blur(3px);
    padding: 10px 12px;
    min-height: 64px;
  `;
  const make = (title, valueId) => {
    const c = document.createElement('div');
    c.style.cssText = cardCss;
    c.innerHTML = `
      <div style="font:700 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; opacity:.9;">${title}</div>
      <div id="${valueId}" style="margin-top:8px; font:700 18px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:#e8eefc;">—</div>
    `;
    return c;
  };

const cPercent = make('Working Satellites (%)', 'star-kpi-percent');
const cWork    = make('Working Satellites (#)', 'star-kpi-working');

  box.append(cPercent, cWork);
  document.body.appendChild(box);

  return {
    set(percentValue, workingValue) {
      const pEl = document.getElementById('star-kpi-percent');
      const wEl = document.getElementById('star-kpi-working');

      const pNum = parsePercent(percentValue);
      pEl.textContent = (pNum == null) ? '—' : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(pNum)}%`;
      pEl.style.color = colorForPercent(pNum);

      const w = yesNo(workingValue);
      wEl.textContent = w;
      wEl.style.color = colorForWorking(w);
    }
  };
}

/* ------------------------- Wire up sliders + KPIs ------------------------- */
// 7) Wire it up once CSVs are in (two sliders, mutually exclusive KPIs)
(async () => {
  try {
    const [launchText, starText] = await Promise.all([launchesCsvPromise, starlinkCsvPromise]);
    const launchRows = parseCSV(launchText);
    const starRows   = parseCSV(starText);

    const launchIdx   = buildLaunchIndex(launchRows);
    const starlinkIdx = buildStarlinkIndex(starRows);

    if (!launchIdx.size && !starlinkIdx.size) return;

    const ui = createMetricsUI();
    const starTopLeft = createStarlinkTwoKpisTopLeft(); // NEW

    // Slider ranges
    const launchFlights = Array.from(launchIdx.keys()).sort((a,b)=>a-b);
    const starFlights   = Array.from(starlinkIdx.keys()).sort((a,b)=>a-b);

    // Initialize launch slider if data present
    if (launchFlights.length) {
      const minF = launchFlights[0], maxF = launchFlights[launchFlights.length-1];
      ui.sliders.launch.input.min = String(minF);
      ui.sliders.launch.input.max = String(maxF);
      ui.sliders.launch.input.value = String(maxF);
      ui.sliders.launch.val.textContent = String(maxF);
    } else {
      ui.sliders.launch.input.disabled = true;
      ui.sliders.launch.val.textContent = '—';
    }

    // Initialize starlink slider if data present
    if (starFlights.length) {
      const minS = starFlights[0], maxS = starFlights[starFlights.length-1];
      ui.sliders.starlink.input.min = String(minS);
      ui.sliders.starlink.input.max = String(maxS);
      ui.sliders.starlink.input.value = String(maxS);
      ui.sliders.starlink.val.textContent = String(maxS);

      // NEW: set initial top-left KPIs from latest starlink
      const init = starlinkIdx.get(maxS);
      starTopLeft.set(init?.percent ?? null, init?.working ?? null);
    } else {
      ui.sliders.starlink.input.disabled = true;
      ui.sliders.starlink.val.textContent = '—';
      // Clear top-left KPIs if no starlink data
      starTopLeft.set(null, null);
    }

    // Deck label presets
    const LAUNCH_LABELS = {
      tl: 'Orbit',
      bl: 'Landing Outcome',
      tr: 'Payload',
      br: 'Payload Mass',
      c : 'Launch Date',
    };
    const STARLINK_LABELS = {
      tl: 'Altitude',
      bl: 'Inclination',
      tr: 'Mission',
      br: 'Vehicle',
      c : 'Date',
    };

    // Fill deck helpers for each dataset
    function fillFromLaunch(flight) {
      const d = launchIdx.get(flight);
      ui.setLabels(LAUNCH_LABELS);
      ui.setValues({
        tl: d?.orbit ?? '—',
        bl: d?.landing ?? '—',
        tr: d?.payload ?? '—',
        br: d?.mass ? formatMassKg(d.mass) : '—',
        c : d?.date ?? '—',
      });
    }
    function fillFromStarlink(flight) {
      const d = starlinkIdx.get(flight);
      ui.setLabels(STARLINK_LABELS);
      ui.setValues({
        tl: d?.altitude ? `${d.altitude}`.replace(/(km)?$/,' km') : '—',
        bl: d?.inclination ? `${d.inclination}°` : '—',
        tr: d?.mission ?? '—',
        br: d?.vehicle ?? '—',
        c : d?.date ?? '—',
      });
    }

    // Start with the newest Launch (if exists) otherwise Starlink
    if (launchFlights.length) {
      fillFromLaunch(launchFlights[launchFlights.length-1]);
      ui.highlight('launch');
    } else if (starFlights.length) {
      fillFromStarlink(starFlights[starFlights.length-1]);
      ui.highlight('starlink');
    }

    // Mutually exclusive: whichever slider you touch last controls the deck
    ui.sliders.launch.input.addEventListener('input', e => {
      const v = Number(e.target.value);
      ui.sliders.launch.val.textContent = String(v);
      fillFromLaunch(v);
      ui.highlight('launch');
      // NOTE: top-left KPIs are Starlink-only; do nothing here
    });

    ui.sliders.starlink.input.addEventListener('input', e => {
      const v = Number(e.target.value);
      ui.sliders.starlink.val.textContent = String(v);
      fillFromStarlink(v);
      ui.highlight('starlink');

      // NEW: update the two vertical KPIs (Percent, Working)
      const d = starlinkIdx.get(v);
      starTopLeft.set(d?.percent ?? null, d?.working ?? null);
    });

  } catch (err) {
    console.error('Analytics UI error:', err);
  }
})();


// --- Start network fetches ASAP (no waiting) ---
const manager = new THREE.LoadingManager();
const rgbeFalcon = new RGBELoader(manager).setPath('public/hdr/');
const rgbeStar   = new RGBELoader(manager).setPath('public/hdr/');

function makeGLTFLoader(renderer) {
  const draco = new DRACOLoader().setDecoderPath(
    'https://unpkg.com/three@0.163.0/examples/jsm/libs/draco/'
  );
  const ktx2 = new KTX2Loader().setTranscoderPath(
    'https://unpkg.com/three@0.163.0/examples/jsm/libs/basis/'
  );
  ktx2.detectSupport(renderer);

  const loader = new GLTFLoader(manager);
  loader.setDRACOLoader(draco);
  loader.setKTX2Loader(ktx2);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

// Kick off downloads immediately (parallel)
const falconGLTFPromise   = (async () => {
  // temporary headless renderer just for KTX2 detect; remove if you already have one ready
  const tmpRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  const falconLoader = makeGLTFLoader(tmpRenderer).setPath('public1/space/');
  return falconLoader.loadAsync('scene.gltf'); // or .glb
})();

const starlinkGLTFPromise = (async () => {
  const tmpRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  const starLoader = makeGLTFLoader(tmpRenderer).setPath('public1/space1/');
  return starLoader.loadAsync('scene.gltf');   // or .glb
})();

const falconHDRPromise = rgbeFalcon.loadAsync('studio_small_09_1k.hdr');
const starHDRPromise   = rgbeStar.loadAsync('studio_small_09_1k.hdr');

// ---- Keep your splash for 5s, but downloads are already happening
const BOOT_DELAY_MS = 3000;
await new Promise(r => setTimeout(r, BOOT_DELAY_MS));

// Now fade out splash
const splashEl = document.getElementById('splash');
if (splashEl) {
  splashEl.classList.add('splash--hide');
  setTimeout(() => splashEl.remove(), 650);
}



/* -------------------- Layout: 45% left (canvas) | 55% right (text) -------- */
const app = document.createElement('div');
app.style.cssText = `
  position: fixed; inset: 0; display: grid;
  grid-template-columns: 45% 55%;
  background: #0a0e17;
  overflow: hidden;
`;
document.body.style.margin = '0';
document.body.appendChild(app);

const left = document.createElement('div');   // left column
left.style.cssText = `position: relative; overflow: hidden;`;
app.appendChild(left);

/* --- Falcon 9 bordered container (existing) --- */
const falconWrap = document.createElement('div');
falconWrap.style.cssText = `
  position: absolute;
  top: 16px;
  left: 22vw;         /* start border near 22% of page width */
  right: 16px;
  bottom: 16px;
  border: 2px solid #ffffff;
  border-radius: 12px;
  background: #0a0e17;
  overflow: hidden;
  box-shadow: 0 6px 24px rgba(0,0,0,.35);
`;
left.appendChild(falconWrap);

/* label (existing) */
const label = document.createElement('div');
label.textContent = 'Falcon 9';
label.style.cssText = `
  position: absolute; z-index: 2; left: 18px; top: 14px;
  font: 600 13px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  color: #ffffff; opacity: .9; pointer-events: none;
`;
falconWrap.appendChild(label);

/* ---------------- Starlink container: from 10% to 20% of page width ------- */
const starlinkWrap = document.createElement('div');
starlinkWrap.style.cssText = `
  position: absolute;
  top: 20vw;
  bottom: 16px;
  left: 1vw;                 /* start at 10% of page width */
  width: 20vw;                /* extend to 20% of page width */
  border: 2px solid #ffffff;
  border-radius: 12px;
  background: #0a0e17;
  overflow: hidden;
  box-shadow: 0 6px 24px rgba(0,0,0,.35);
`;
left.appendChild(starlinkWrap);

const starlinkLabel = document.createElement('div');
starlinkLabel.textContent = 'Starlink';
starlinkLabel.style.cssText = `
  position: absolute; z-index: 2; left: 10px; top: 10px;
  font: 600 12px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  color: #ffffff; opacity: .9; pointer-events: none;
`;
starlinkWrap.appendChild(starlinkLabel);

/* ------------------------------ Right column ------------------------------ */
const right = document.createElement('div');  // text + KPIs + button
right.style.cssText = `
  position: relative; padding: 32px; color: #e8eefc;
  font: 500 18px/1.6 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  overflow: auto;
`;

// Falcon 9 and Starlink descriptions
const falconText = `
  Falcon 9 is a reusable, two-stage rocket designed and manufactured by SpaceX for the reliable and safe transport of people and payloads into Earth orbit and beyond. 
  Falcon 9 is the world’s first orbital class reusable rocket. 
  Reusability allows SpaceX to refly the most expensive parts of the rocket, which in turn drives down the cost of space access.
`;
const starlinkText = `
  Starlink satellites are a constellation of mass-produced, small satellites orbiting in low Earth orbit (LEO) 
  designed to provide high-speed, low-latency internet access, particularly in underserved areas. 
  Operated by SpaceX, the Starlink network uses a large number of satellites to create a global internet coverage.
`;

right.innerHTML = `
  <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
    <h1 style="margin:0; font-size:28px; line-height:1.2;">SpaceX Falcon 9 & Starlink Analytics</h1>
    <button id="toggle-rot" style="
      margin-left:auto; cursor:pointer; border:1px solid #2a3957; background:#12203a;
      color:#e8eefc; padding:8px 12px; border-radius:10px; font-weight:600;
      transition:transform .08s ease; 
    " title="Toggle auto-rotation">Stop Rotation</button>
  </div>

  <!-- Paragraph container -->
  <p id="info-text" style="opacity:.9; margin:12px 0 18px;">${falconText}</p>

  <!-- Vertical buttons -->
<div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px; margin-bottom:10px; margin-right:-25px;">
  <button id="btn-falcon" style="
    cursor:pointer; border:1px solid #2a3957; background:#12203a;
    color:#e8eefc; padding:4.8px 8px; /* 20% smaller padding */
    border-radius:8px; font-weight:600;
    font-size:14.4px; /* 20% smaller font */
    width:96px; /* 20% smaller width from 120px */
  ">Falcon 9</button>
  <button id="btn-starlink" style="
    cursor:pointer; border:1px solid #2a3957; background:#12203a;
    color:#e8eefc; padding:4.8px 8px; /* 20% smaller padding */
    border-radius:8px; font-weight:600;
    font-size:14.4px; /* 20% smaller font */
    width:96px; /* 20% smaller width from 120px */
  ">Starlink</button>
</div>


  <!-- KPI cards moved up by 30px -->
  <div style="
    display:grid; gap:12px; 
    grid-template-columns: repeat(3, minmax(120px, 1fr));
    max-width: 560px;
    margin-top: -80px;
  ">
    <div style="border:1px solid #2a3957; border-radius:12px; padding:12px 14px;">
      <div style="font-size:20px; font-weight:700; letter-spacing:.2px;">511</div>
      <div style="font-size:13px; opacity:.85;">Completed missions</div>
    </div>
    <div style="border:1px solid #2a3957; border-radius:12px; padding:12px 14px;">
      <div style="font-size:20px; font-weight:700; letter-spacing:.2px;">466</div>
      <div style="font-size:13px; opacity:.85;">Total landings</div>
    </div>
    <div style="border:1px solid #2a3957; border-radius:12px; padding:12px 14px;">
      <div style="font-size:20px; font-weight:700; letter-spacing:.2px;">435</div>
      <div style="font-size:13px; opacity:.85;">Total reflights</div>
    </div>
  </div>
`;

app.appendChild(right);

// Add button functionality
document.getElementById('btn-falcon').addEventListener('click', () => {
  document.getElementById('info-text').textContent = falconText;
});
document.getElementById('btn-starlink').addEventListener('click', () => {
  document.getElementById('info-text').textContent = starlinkText;
});


/* ============================== FALCON 9 VIEW ============================= */
/* (Unchanged logic) */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
falconWrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = null;
scene.background = new THREE.Color(0x0a0e17);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
camera.position.set(6, 4, 10);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 2;
controls.maxDistance = 200;
controls.target.set(0, 1, 0);
controls.update();

function sizeRendererToContainer() {
  const w = falconWrap.clientWidth;
  const h = falconWrap.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = Math.max(1e-6, w / Math.max(1, h));
  camera.updateProjectionMatrix();
}
sizeRendererToContainer();

const pmrem = new THREE.PMREMGenerator(renderer);
new RGBELoader().setPath('public/hdr/').load('studio_small_09_1k.hdr', (hdr) => {
  const envMap = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = envMap;
  hdr.dispose();
});

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.ShadowMaterial({ opacity: 0.35 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(8, 12, 6);
key.castShadow = true;
key.shadow.bias = -0.0002;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);

const fill = new THREE.HemisphereLight(0x94b6ff, 0x0b1220, 0.6);
scene.add(fill);

const rim = new THREE.DirectionalLight(0x88b4ff, 0.7);
rim.position.set(-6, 5, -8);
scene.add(rim);

function placeOnGroundFrameLeft(root, pad = 1.25, leftShiftFactor = 0.35) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  const target = 10;
  const scale = target / maxDim;
  if (isFinite(scale) && Math.abs(scale - 1) > 1e-3) root.scale.multiplyScalar(scale);

  box.setFromObject(root);
  box.getSize(size); box.getCenter(center);

  root.position.y += -box.min.y;
  root.position.x -= center.x;
  root.position.z -= center.z;

  const leftShift = Math.max(size.x, size.y, size.z) * leftShiftFactor;
  root.position.x -= leftShift;

  const newMax = Math.max(size.x, size.y, size.z) || 1;
  const fov = camera.fov * (Math.PI / 180);
  const dist = (newMax / (2 * Math.tan(fov / 2))) * pad;

  camera.position.set(dist * 0.6, dist * 0.35, dist);
  camera.near = Math.max(0.01, dist / 1000);
  camera.far  = dist * 2000;
  camera.updateProjectionMatrix();

  controls.target.set(-leftShift, newMax * 0.25, 0);
  controls.update();
}

/* Falcon 9 model */
let modelRoot = null;
new GLTFLoader().setPath('public1/space/').load(
  'test.gltf',
  (gltf) => {
    const root = gltf.scene || gltf.scenes[0];
    root.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; 
        o.receiveShadow = true;
        if (o.material && 'envMapIntensity' in o.material) o.material.envMapIntensity = 1.0;
      }
    });
    scene.add(root);
    modelRoot = root;
    placeOnGroundFrameLeft(root);
  },
  (xhr) => { if (xhr.total) console.log(`Loading… ${Math.round(100 * xhr.loaded / xhr.total)}%`); },
  (err) => { console.error(err); alert('Failed to load model. Check the path and that a local server is running.'); }
);

/* Rotation toggle (Falcon only) */
let rotationEnabled = true;
const toggleBtn = right.querySelector('#toggle-rot');
toggleBtn.addEventListener('click', () => {
  rotationEnabled = !rotationEnabled;
  toggleBtn.textContent = rotationEnabled ? 'Stop Rotation' : 'Start Rotation';
  toggleBtn.style.transform = 'scale(0.98)';
  setTimeout(() => (toggleBtn.style.transform = ''), 90);
});

/* ---------------------------- STARLINK VIEW ------------------------------- */
/* Fully independent renderer/scene/camera/controls */
const starRenderer = new THREE.WebGLRenderer({ antialias: true });
starRenderer.outputColorSpace = THREE.SRGBColorSpace;
starRenderer.toneMapping = THREE.ACESFilmicToneMapping;
starRenderer.toneMappingExposure = 1.1;
starRenderer.shadowMap.enabled = true;
starRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
starRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
starlinkWrap.appendChild(starRenderer.domElement);

const starScene = new THREE.Scene();
starScene.background = new THREE.Color(0x0a0e17);

const starCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
starCamera.position.set(6, 4, 10);

const starControls = new OrbitControls(starCamera, starRenderer.domElement);
starControls.enableDamping = true;
starControls.minDistance = 1;
starControls.maxDistance = 200;
starControls.target.set(0, 1, 0);
starControls.update();

/* Starlink env + lights + ground */
const starPMREM = new THREE.PMREMGenerator(starRenderer);
new RGBELoader().setPath('public/hdr/').load('studio_small_09_1k.hdr', (hdr) => {
  const env = starPMREM.fromEquirectangular(hdr).texture;
  starScene.environment = env;
  hdr.dispose();
});

const starKey = new THREE.DirectionalLight(0xffffff, 2.0);
starKey.position.set(8, 12, 6);
starKey.castShadow = true;
starKey.shadow.bias = -0.0002;
starKey.shadow.mapSize.set(2048, 2048);
starScene.add(starKey);

const starFill = new THREE.HemisphereLight(0x94b6ff, 0x0b1220, 0.6);
starScene.add(starFill);

const starRim = new THREE.DirectionalLight(0x88b4ff, 0.7);
starRim.position.set(-6, 5, -8);
starScene.add(starRim);

const starGround = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.ShadowMaterial({ opacity: 0.35 })
);
starGround.rotation.x = -Math.PI / 2;
starGround.receiveShadow = true;
starScene.add(starGround);

function sizeStarlinkToContainer() {
  const w = starlinkWrap.clientWidth;
  const h = starlinkWrap.clientHeight;
  starRenderer.setSize(w, h, false);
  starCamera.aspect = Math.max(1e-6, w / Math.max(1, h));
  starCamera.updateProjectionMatrix();
}
sizeStarlinkToContainer();

/* Center+frame helper for Starlink */
function frameStarToObject(obj, pad = 1.25) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  // Ground and center
  obj.position.y += -box.min.y;
  const center = box.getCenter(new THREE.Vector3());
  obj.position.x -= center.x;
  obj.position.z -= center.z;

  const fov = starCamera.fov * Math.PI / 180;
  const dist = (maxDim / (2 * Math.tan(fov / 2))) * pad;

  starCamera.position.set(dist * 0.6, dist * 0.35, dist);
  starCamera.near = Math.max(0.01, dist / 1000);
  starCamera.far  = dist * 2000;
  starCamera.updateProjectionMatrix();

  starControls.target.set(0, size.y * 0.4, 0);
  starControls.update();
}

/* Load Starlink model (independent from Falcon) */
let starlinkRoot = null;
new GLTFLoader().setPath('public1/space1/').load(
  'scene.gltf',
  (gltf) => {
    starlinkRoot = gltf.scene || gltf.scenes[0];
    starlinkRoot.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; 
        o.receiveShadow = true;
        if (o.material && 'envMapIntensity' in o.material) o.material.envMapIntensity = 1.0;
      }
    });
    starScene.add(starlinkRoot);
    frameStarToObject(starlinkRoot, 1.25);
  },
  (xhr) => { if (xhr.total) console.log(`Starlink Loading… ${Math.round(100 * xhr.loaded / xhr.total)}%`); },
  (err) => { console.error('Starlink load error', err); }
);

/* ------------------------------ Resize/render ----------------------------- */
/* Keep Falcon listeners untouched */
window.addEventListener('resize', sizeRendererToContainer);
new ResizeObserver(sizeRendererToContainer).observe(falconWrap);

/* Add independent listeners for Starlink */
window.addEventListener('resize', sizeStarlinkToContainer);
new ResizeObserver(sizeStarlinkToContainer).observe(starlinkWrap);

/* Existing Falcon animate loop (kept) */
(function animate() {
  requestAnimationFrame(animate);
  if (rotationEnabled && modelRoot) {
    modelRoot.rotation.y -= 0.01; // CCW
  }
  controls.update();
  renderer.render(scene, camera);
})();

/* Separate Starlink loop so it doesn't touch Falcon code */
(function animateStarlink() {
  requestAnimationFrame(animateStarlink);
  if (starlinkRoot) {
    // (optional) starlinkRoot.rotation.y -= 0.01;  // uncomment to auto-rotate
  }
  starControls.update();
  starRenderer.render(starScene, starCamera);
})();

