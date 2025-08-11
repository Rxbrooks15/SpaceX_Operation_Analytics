import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* -------------------- Layout: left canvas | right text -------------------- */
const app = document.createElement('div');
app.style.cssText = `
  position: fixed; inset: 0; display: grid;
  grid-template-columns: 1fr 1fr; /* 50% | 50% */
  background: #0a0e17;
  overflow: hidden;
`;
document.body.style.margin = '0';
document.body.appendChild(app);

const left = document.createElement('div');   // canvas container
left.style.cssText = `position: relative; overflow: hidden;`;
app.appendChild(left);

const right = document.createElement('div');  // text + KPIs + button
right.style.cssText = `
  position: relative; padding: 32px; color: #e8eefc;
  font: 500 18px/1.6 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  overflow: auto;
`;
right.innerHTML = `
  <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
    <h1 style="margin:0; font-size:28px; line-height:1.2;">SpaceX</h1>
    <button id="toggle-rot" style="
      margin-left:auto; cursor:pointer; border:1px solid #2a3957; background:#12203a;
      color:#e8eefc; padding:8px 12px; border-radius:10px; font-weight:600;
      transition:transform .08s ease; 
    " title="Toggle auto-rotation">Stop Rotation</button>
  </div>
  <p style="opacity:.9; margin:12px 0 18px;">
    Falcon 9 is a reusable, two-stage rocket designed and manufactured by SpaceX for the reliable and safe transport of people and payloads into Earth orbit and beyond. Falcon 9 is the world’s first orbital class reusable rocket. Reusability allows SpaceX to refly the most expensive parts of the rocket, which in turn drives down the cost of space access.
  </p>

  <!-- KPIs -->
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

/* -------------------------------- Renderer -------------------------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1; // fixed exposure (no auto-dim)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
left.appendChild(renderer.domElement);

/* ------------------------- Scene / Camera / Controls ---------------------- */
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

/* ----------------------- Size renderer to left column --------------------- */
function sizeRendererToLeft() {
  const w = left.clientWidth;
  const h = app.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
sizeRendererToLeft();

/* ---------------------------- Optional: HDRI env -------------------------- */
const pmrem = new THREE.PMREMGenerator(renderer);
new RGBELoader()
  .setPath('public/hdr/') // place your HDR here or remove this block
  .load('studio_small_09_1k.hdr', (hdr) => {
    const envMap = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = envMap;
    hdr.dispose();
  });

/* --------------------------- Ground shadow catcher ------------------------ */
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.ShadowMaterial({ opacity: 0.35 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ---------------------------- Lights (3-point) ---------------------------- */
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

/* ------------- Helper: place on ground, frame, shift LEFT in view --------- */
function placeOnGroundFrameLeft(root, pad = 1.25, leftShiftFactor = 0.35) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  // normalize scale (tallest ≈ 10 units)
  const target = 10;
  const scale = target / maxDim;
  if (isFinite(scale) && Math.abs(scale - 1) > 1e-3) root.scale.multiplyScalar(scale);

  // recompute after scaling
  box.setFromObject(root);
  box.getSize(size); box.getCenter(center);

  // place base on ground (y=0)
  root.position.y += -box.min.y;

  // center horizontally first...
  root.position.x -= center.x;
  root.position.z -= center.z;

  // ...then shift LEFT (negative X) so text fits on right
  const leftShift = Math.max(size.x, size.y, size.z) * leftShiftFactor;
  root.position.x -= leftShift;

  // camera framing from FOV
  const newMax = Math.max(size.x, size.y, size.z) || 1;
  const fov = camera.fov * (Math.PI / 180);
  const dist = (newMax / (2 * Math.tan(fov / 2))) * pad;

  camera.position.set(dist * 0.6, dist * 0.35, dist);
  camera.near = Math.max(0.01, dist / 1000);
  camera.far  = dist * 2000;
  camera.updateProjectionMatrix();

  // orbit target slightly above ground and also to the LEFT so controls pivot around the model
  controls.target.set(-leftShift, newMax * 0.25, 0);
  controls.update();
}

/* -------------------------------- Load model ------------------------------ */
let modelRoot = null;            // keep reference for rotation
const loader = new GLTFLoader().setPath('public1/space1/'); // adjust if needed
loader.load(
  'scene.gltf',
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
    const pc = document.getElementById('progress-container'); 
    if (pc) pc.style.display = 'none';
  },
  (xhr) => { if (xhr.total) console.log(`Loading… ${Math.round(100 * xhr.loaded / xhr.total)}%`); },
  (err) => { console.error(err); alert('Failed to load model. Check the path and that a local server is running.'); }
);

/* ------------------------- Rotation toggle + UI --------------------------- */
let rotationEnabled = true;  // auto-rotate on by default (CCW)
const toggleBtn = right.querySelector('#toggle-rot');
toggleBtn.addEventListener('click', () => {
  rotationEnabled = !rotationEnabled;
  toggleBtn.textContent = rotationEnabled ? 'Stop Rotation' : 'Start Rotation';
  toggleBtn.style.transform = 'scale(0.98)';
  setTimeout(() => (toggleBtn.style.transform = ''), 90);
});

/* ------------------------------ Resize/render ----------------------------- */
window.addEventListener('resize', sizeRendererToLeft);

(function animate() {
  requestAnimationFrame(animate);

  // counter-clockwise spin about Y (negative = CCW when viewed from above)
  if (rotationEnabled && modelRoot) {
    modelRoot.rotation.y -= 0.01; // adjust speed if you like
  }

  controls.update();
  renderer.render(scene, camera);
})();
