import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* -------------------- Layout: left (2 viewports) | right text ------------- */
const app = document.createElement('div');
app.style.cssText = `
  position: fixed; inset: 0; display: grid;
  grid-template-columns: 1fr 1fr; /* left 50% (two canvases) | right 50% (text) */
  background: #0a0e17;
  color: #e8eefc;
`;
document.body.style.margin = '0';
document.body.appendChild(app);

/* Left pane holds two bordered containers */
const leftPane = document.createElement('div');
leftPane.style.cssText = `
  position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  padding: 10px;
`;
app.appendChild(leftPane);

function makeViewport(title) {
  const wrap = document.createElement('div');
  wrap.style.cssText = `
    position: relative; overflow: hidden; 
    border: 2px solid #ffffff; border-radius: 10px;
    background: #0a0e17;
  `;
  const label = document.createElement('div');
  label.textContent = title;
  label.style.cssText = `
    position: absolute; left: 10px; top: 8px; z-index: 2;
    font: 600 13px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    opacity: .9; pointer-events: none;
  `;
  wrap.appendChild(label);
  leftPane.appendChild(wrap);
  return wrap;
}

const vpStarlink = makeViewport('Starlink');
const vpFalcon   = makeViewport('Falcon 9');

/* Right pane: text/KPIs/button (unchanged content) */
const right = document.createElement('div');
right.style.cssText = `
  position: relative; padding: 32px; overflow: auto;
  font: 500 18px/1.6 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
`;
right.innerHTML = `
  <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
    <h1 style="margin:0; font-size:28px; line-height:1.2; color:#e8eefc;">SpaceX</h1>
    <button id="toggle-rot" style="
      margin-left:auto; cursor:pointer; border:1px solid #2a3957; background:#12203a;
      color:#e8eefc; padding:8px 12px; border-radius:10px; font-weight:600;
      transition:transform .08s ease;
    ">Stop Rotation</button>
  </div>
  <p style="opacity:.9; margin:12px 0 18px; color:#e8eefc;">
    Falcon 9 is a reusable, two-stage rocket designed and manufactured by SpaceX for the reliable and safe transport of people and payloads into Earth orbit and beyond. Falcon 9 is the world’s first orbital class reusable rocket. Reusability allows SpaceX to refly the most expensive parts of the rocket, which in turn drives down the cost of space access.
  </p>

  <div style="
    display:grid; gap:12px; 
    grid-template-columns: repeat(3, minmax(120px, 1fr));
    max-width: 560px;
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

/* ---------------------- A tiny factory for each viewport ------------------- */
function createThreeViewport(container, { hdrPath, hdrFile }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e17);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
  camera.position.set(6, 4, 10);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 2;
  controls.maxDistance = 200;

  /* --- keep zoom centered on the model/container, not the mouse --- */
  controls.zoomToCursor = false;
  controls.enablePan = false;
  controls.target.set(0, 0, 0); // we’ll place the y focus in the framing step

  // Lights (boosted)
  const key = new THREE.DirectionalLight(0xffffff, 4.5);
  key.position.set(8, 12, 6);
  key.castShadow = true;
  key.shadow.bias = -0.0002;
  key.shadow.mapSize.set(4096, 4096);
  scene.add(key);

  const fill = new THREE.HemisphereLight(0x94b6ff, 0x0b1220, 1.5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x88b4ff, 2.0);
  rim.position.set(-6, 5, -8);
  scene.add(rim);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.ShadowMaterial({ opacity: 0.35 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Env
  const pmrem = new THREE.PMREMGenerator(renderer);
  new RGBELoader()
    .setPath(hdrPath)
    .load(hdrFile, (hdr) => {
      const envMap = pmrem.fromEquirectangular(hdr).texture;
      scene.environment = envMap;
      hdr.dispose();
    });

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = Math.max(1e-6, w / Math.max(1, h));
    camera.updateProjectionMatrix();
  }

  // Helpers
  function groundAndCenter(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    obj.position.y += -box.min.y;  // base to y=0
    obj.position.x -= center.x;    // X -> 0
    obj.position.z -= center.z;    // Z -> 0
    obj.updateMatrixWorld(true);   // lock in transforms for subsequent bounds
    return size;
  }
  function scaleToHeight(obj, targetHeight) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = targetHeight / maxDim;
    obj.scale.multiplyScalar(s);
    obj.updateMatrixWorld(true);
  }

  return {
    renderer, scene, camera, controls, resize,
    groundAndCenter, scaleToHeight,
  };
}

/* -------------------- Build two independent viewports --------------------- */
const vp1 = createThreeViewport(vpStarlink, { hdrPath: 'public/hdr/', hdrFile: 'studio_small_09_1k.hdr' });
const vp2 = createThreeViewport(vpFalcon,   { hdrPath: 'public/hdr/', hdrFile: 'studio_small_09_1k.hdr' });

/* ---------------------------- Load the models ----------------------------- */
let starlinkRoot = null;
let falconRoot = null;

const starlinkLoader = new GLTFLoader().setPath('public1/space1/'); // Starlink
starlinkLoader.load(
  'scene.gltf',
  (gltf) => {
    starlinkRoot = gltf.scene || gltf.scenes[0];
    starlinkRoot.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        if (o.material && 'envMapIntensity' in o.material) o.material.envMapIntensity = 2.0;
      }
    });
    // half the Falcon baseline (Falcon = 10)
    vp1.scaleToHeight(starlinkRoot, 10 * 0.5);
    vp1.groundAndCenter(starlinkRoot);
    vp1.scene.add(starlinkRoot);

    frameViewportToObject(vp1, starlinkRoot, 1.25);
  },
  (xhr) => { if (xhr.total) console.log(`Starlink Loading… ${Math.round(100 * xhr.loaded / xhr.total)}%`); },
  (err) => { console.error('Starlink load error', err); }
);

const falconLoader = new GLTFLoader().setPath('public1/space/');   // Falcon 9
falconLoader.load(
  'scene.gltf',
  (gltf) => {
    falconRoot = gltf.scene || gltf.scenes[0];
    falconRoot.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        if (o.material && 'envMapIntensity' in o.material) o.material.envMapIntensity = 2.0;
      }
    });
    // normalize Falcon to baseline height 10
    vp2.scaleToHeight(falconRoot, 10);
    vp2.groundAndCenter(falconRoot);
    vp2.scene.add(falconRoot);

    frameViewportToObject(vp2, falconRoot, 1.25);
  },
  (xhr) => { if (xhr.total) console.log(`Falcon 9 Loading… ${Math.round(100 * xhr.loaded / xhr.total)}%`); },
  (err) => { console.error('Falcon 9 load error', err); }
);

/* --------------------- Framing helper per viewport ------------------------ */
function frameViewportToObject(vp, obj, pad = 1.2) {
  obj.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  const fov = vp.camera.fov * (Math.PI / 180);
  const dist = (maxDim / (2 * Math.tan(fov / 2))) * pad;

  // camera at a nice 3/4 angle
  vp.camera.position.set(dist * 0.6, dist * 0.35, dist);
  vp.camera.near = Math.max(0.01, dist / 1000);
  vp.camera.far  = dist * 2000;
  vp.camera.updateProjectionMatrix();

  // focus at the exact centerline of the container: (0, yFocus, 0)
  const yFocus = size.y * 0.4;
  vp.controls.target.set(0, yFocus, 0);
  vp.controls.update();
}

/* ----------------------- Resize both viewports ---------------------------- */
function resizeAll() {
  vp1.resize();
  vp2.resize();
}
window.addEventListener('resize', resizeAll);
resizeAll();

/* -------------------------- Rotation toggle + UI -------------------------- */
let rotationEnabled = true;
const toggleBtn = right.querySelector('#toggle-rot');
toggleBtn.addEventListener('click', () => {
  rotationEnabled = !rotationEnabled;
  toggleBtn.textContent = rotationEnabled ? 'Stop Rotation' : 'Start Rotation';
  toggleBtn.style.transform = 'scale(0.98)';
  setTimeout(() => (toggleBtn.style.transform = ''), 90);
});

/* ------------------------------ Render loops ------------------------------ */
function animate() {
  requestAnimationFrame(animate);

  if (rotationEnabled) {
    if (starlinkRoot) starlinkRoot.rotation.y -= 0.01; // CCW
    if (falconRoot)   falconRoot.rotation.y -= 0.01;   // CCW
  }

  vp1.controls.update();
  vp2.controls.update();

  vp1.renderer.render(vp1.scene, vp1.camera);
  vp2.renderer.render(vp2.scene, vp2.camera);
}
animate();
