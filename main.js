import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const canvas = document.getElementById('c');
const app = document.getElementById('app');

let DATA = null;
let eclipse = false;
let viewMode = 'overview';
let activeFloorNum = null;
let selectedBotId = null;
let approveFlash = 0;
let toastIdx = 0;

const TOASTS = [
  { title: 'Albus Dumbledore', body: 'הבוס במרחק 384,400 ק"מ. המורל עולה.' },
  { title: 'ים השלווה', body: 'כל הקומות פעילות · בסיס אורן.' },
  { title: 'מעקב בוטים', body: null }, // filled from data
  { title: 'מעלית זכוכית', body: 'נוסעת בין הקומות.' },
];

const botMeshes = new Map();
const clickables = [];
let chamberGroup = null;
let monolithMesh = null;
let rocketGroup = null;
let elevatorCar = null;
let sunMesh = null;
let earthMesh = null;
let rockRoot = null;
let floorsRoot = null;
let signMesh = null;
let starsPts = null;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const camTween = {
  active: false, t: 0, dur: 1.1,
  fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(),
  fromTarget: new THREE.Vector3(), toTarget: new THREE.Vector3(),
  fromZoom: 1, toZoom: 1,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050814);
scene.fog = new THREE.FogExp2(0x050814, 0.008);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const frustumSize = 30;
const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
const camera = new THREE.OrthographicCamera(
  (-frustumSize * aspect()) / 2, (frustumSize * aspect()) / 2,
  frustumSize / 2, -frustumSize / 2, 0.1, 250,
);
camera.position.set(24, 16, 24);
camera.lookAt(0, -2.5, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minZoom = 0.35;
controls.maxZoom = 3.5;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minPolarAngle = Math.PI * 0.12;
controls.target.set(0, -2.5, 0);
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.45, 0.78);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function resize() {
  const w = app.clientWidth || window.innerWidth;
  const h = app.clientHeight || window.innerHeight;
  const a = w / Math.max(1, h);
  camera.left = (-frustumSize * a) / 2;
  camera.right = (frustumSize * a) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
}
window.addEventListener('resize', resize);
resize();

const hemi = new THREE.HemisphereLight(0xd8e4ff, 0x3a3040, 0.85);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff0d8, 1.55);
key.position.set(-20, 30, 14);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1;
key.shadow.camera.far = 90;
Object.assign(key.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28 });
key.shadow.bias = -0.0004;
scene.add(key);
const fill = new THREE.DirectionalLight(0x88b4ff, 0.55);
fill.position.set(22, 12, -14);
scene.add(fill);
const warm = new THREE.AmbientLight(0xffe8d0, 0.28);
scene.add(warm);

function makeTextSprite(text, opts = {}) {
  const { w = 1024, h = 128, font = 'bold 64px system-ui,sans-serif', color = '#f0f0fa', planeH = 1 } = opts;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  return new THREE.Mesh(new THREE.PlaneGeometry((w / h) * planeH, planeH), mat);
}

function addStars(n = 700) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 50 + Math.random() * 90;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starsPts = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xeef3ff, size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.95,
  }));
  scene.add(starsPts);
}

function makeEarth() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0x2a7fd4, roughness: 0.5, emissive: 0x0a3060, emissiveIntensity: 0.55 }),
  );
  g.add(body);
  const landMat = new THREE.MeshStandardMaterial({ color: 0x3ca050, roughness: 0.75, emissive: 0x1a5030, emissiveIntensity: 0.3 });
  for (let i = 0; i < 9; i++) {
    const land = new THREE.Mesh(new THREE.SphereGeometry(0.45 + Math.random() * 0.4, 12, 12), landMat);
    const lat = (Math.random() - 0.5) * Math.PI;
    const lon = Math.random() * Math.PI * 2;
    land.position.set(Math.cos(lat) * Math.cos(lon) * 3.05, Math.sin(lat) * 3.05, Math.cos(lat) * Math.sin(lon) * 3.05);
    land.scale.set(1, 0.5, 1);
    g.add(land);
  }
  g.add(new THREE.Mesh(
    new THREE.SphereGeometry(3.5, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x7ec8ff, transparent: true, opacity: 0.14 }),
  ));
  // Place firmly in upper-right of overview frustum
  g.position.set(9, 10, -3);
  scene.add(g);
  return g;
}

function makeSun() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffe566 })));
  g.add(new THREE.Mesh(
    new THREE.SphereGeometry(3.0, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.28 }),
  ));
  g.add(new THREE.Mesh(
    new THREE.SphereGeometry(4.5, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.1 }),
  ));
  g.position.set(-10, 11, 6);
  scene.add(g);
  return g;
}

function createDecoBlob(colorHex) {
  const group = new THREE.Group();
  const col = new THREE.Color(colorHex);
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 16, 16),
    new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, emissive: col, emissiveIntensity: 0.7 }),
  );
  body.scale.set(1, 1.25, 1);
  group.add(body);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 12, 12),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45 }),
  );
  shell.scale.set(1, 1.25, 1);
  group.add(shell);
  for (const sx of [-0.15, 0.15]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.position.set(sx, 0.15, 0.42);
    group.add(eye);
  }
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 16),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02; group.add(disc);
  return group;
}

function createBlobBot(colorHex, status) {
  const group = new THREE.Group();
  const col = new THREE.Color(colorHex);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: col, roughness: 0.28, metalness: 0.08,
    emissive: col.clone(), emissiveIntensity: status === 'idle' ? 0.35 : 1.15,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 24), bodyMat);
  body.scale.set(1.05, 1.3, 1.05);
  body.castShadow = true;
  group.add(body);
  // bright shell so bloom picks them up even from far
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.78, 18, 18),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: status === 'idle' ? 0.35 : 0.7 }),
  );
  shell.scale.set(1.05, 1.3, 1.05);
  group.add(shell);
  for (const sx of [-0.2, 0.2]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.position.set(sx, 0.22, 0.55);
    group.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    pupil.position.set(sx, 0.22, 0.66);
    group.add(pupil);
  }
  const glowLight = new THREE.PointLight(col, status === 'working' ? 2.8 : status === 'waiting' ? 1.6 : 0.45, 5.5);
  glowLight.position.set(0, 0.3, 0);
  group.add(glowLight);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.95, 28),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: status === 'idle' ? 0.12 : 0.5, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.03;
  group.add(disc);
  group.userData = { bodyMat, shell, glowLight, disc, status, color: col, baseY: 0, phase: Math.random() * 10 };
  return group;
}

function makeDesk(eclipseMode, wide = false) {
  const g = new THREE.Group();
  const deskMat = new THREE.MeshStandardMaterial({
    color: eclipseMode ? 0x2a1a1a : 0x1e1e28, roughness: 0.4, metalness: 0.25,
  });
  const w = wide ? 2.2 : 1.7;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.8), deskMat);
  top.position.y = 0.5; top.castShadow = true; top.receiveShadow = true;
  g.add(top);
  for (const [x, z] of [[-w / 2 + 0.1, -0.3], [w / 2 - 0.1, -0.3], [-w / 2 + 0.1, 0.3], [w / 2 - 0.1, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), deskMat);
    leg.position.set(x, 0.25, z);
    g.add(leg);
  }
  const screenCol = eclipseMode ? 0xff5533 : 0x55e0ff;
  const nMon = wide ? 3 : 2;
  for (let i = 0; i < nMon; i++) {
    const ox = -w / 2 + 0.45 + i * (w / nMon);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.4, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x0a0a12, emissive: screenCol, emissiveIntensity: 0.55 }),
    );
    frame.position.set(ox, 0.85, -0.25);
    g.add(frame);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.34),
      new THREE.MeshBasicMaterial({ color: screenCol, transparent: true, opacity: 0.95 }),
    );
    glow.position.set(ox, 0.85, -0.21);
    g.add(glow);
  }
  // chair
  const chairMat = new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x1a1010 : 0x15151e, roughness: 0.45 });
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.1, 16), chairMat);
  seat.position.set(0, 0.32, 0.55);
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.08), chairMat);
  back.position.set(0, 0.55, 0.72);
  g.add(back);
  return g;
}

function makePlant(scale = 1) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16 * scale, 0.14 * scale, 0.22 * scale, 12),
    new THREE.MeshStandardMaterial({ color: 0x2d6a4f }),
  );
  pot.position.y = 0.11 * scale;
  g.add(pot);
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x52b788, roughness: 0.5, emissive: 0x1a4030, emissiveIntensity: 0.25,
  });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 10, 10), leafMat);
    leaf.position.set(
      Math.cos((i / 6) * Math.PI * 2) * 0.14 * scale,
      0.35 * scale + (i % 2) * 0.12 * scale,
      Math.sin((i / 6) * Math.PI * 2) * 0.14 * scale,
    );
    leaf.scale.set(1, 0.75, 1);
    g.add(leaf);
  }
  return g;
}

function makeCabinet(eclipseMode) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x2a1818 : 0x2a2a34, roughness: 0.55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.45), mat);
  body.position.y = 0.6; body.castShadow = true;
  g.add(body);
  return g;
}

function makePartition(eclipseMode) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.1, 1.6),
    new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x3a2222 : 0xd8d8e0, roughness: 0.6 }),
  );
}

function makeWhiteboard(eclipseMode) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.1, 0.06),
    new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x2a1515 : 0xf4f4f8, roughness: 0.4 }),
  );
  g.add(board);
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 1.2, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x333340 }),
  );
  frame.position.z = -0.02;
  g.add(frame);
  return g;
}

function makeWallScreen(eclipseMode) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(8.5, 1.7, 0.1), new THREE.MeshStandardMaterial({ color: 0x0c0c14 })));
  const c = document.createElement('canvas');
  c.width = 640; c.height = 224;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(8.1, 1.5), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.z = 0.06;
  g.add(screen);
  g.userData = {
    tex,
    draw(t) {
      ctx.fillStyle = eclipseMode ? '#180808' : '#061420';
      ctx.fillRect(0, 0, 640, 224);
      ctx.fillStyle = eclipseMode ? '#ff6644' : '#5ad4ff';
      ctx.font = 'bold 28px monospace';
      const mm = String(Math.floor((t * 7) % 60)).padStart(2, '0');
      const ss = String(Math.floor((t * 41) % 60)).padStart(2, '0');
      ctx.fillText('T-00:' + mm + ':' + ss, 20, 42);
      for (let i = 0; i < 10; i++) {
        const bh = 20 + ((Math.sin(t * 1.5 + i) + 1) / 2) * 90;
        ctx.fillStyle = i % 2 ? (eclipseMode ? '#ff8866' : '#7cffb2') : (eclipseMode ? '#ff4422' : '#5ad4ff');
        ctx.fillRect(28 + i * 58, 190 - bh, 40, bh);
      }
      ctx.strokeStyle = eclipseMode ? 'rgba(255,100,60,0.55)' : 'rgba(90,210,255,0.55)';
      ctx.beginPath();
      for (let x = 0; x < 640; x += 5) {
        const y = 95 + Math.sin(x * 0.04 + t * 2.2) * 32;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },
  };
  g.userData.draw(0);
  return g;
}

function makeElevatorShaft(height) {
  const g = new THREE.Group();
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xaaccff, transparent: true, opacity: 0.22, metalness: 0.35, roughness: 0.12,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xd0e0f0, metalness: 0.75, roughness: 0.22 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.5, height, 1.5), glassMat);
  shaft.position.y = height / 2;
  g.add(shaft);
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, height, 0.08), frameMat);
    post.position.set(x, height / 2, z);
    g.add(post);
  }
  const car = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.05, 1.1),
    new THREE.MeshStandardMaterial({ color: 0xdceeff, transparent: true, opacity: 0.55, metalness: 0.4, roughness: 0.18 }),
  );
  car.position.y = height - 1.4;
  g.add(car);
  const rider = createBlobBot('#f15bb5', 'waiting');
  rider.position.set(0, 0.55, 0);
  rider.scale.setScalar(0.7);
  car.add(rider);
  elevatorCar = car;
  g.userData.height = height;
  return g;
}

function makeRocket() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f7, metalness: 0.4, roughness: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, metalness: 0.45, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.78, 5.0, 28), white);
  body.position.y = 2.8; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.3, 28), black);
  nose.position.y = 5.95; g.add(nose);
  for (let i = 0; i < 4; i++) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.65), black);
    const a = (i / 4) * Math.PI * 2;
    flap.position.set(Math.cos(a) * 0.85, 1.4, Math.sin(a) * 0.85);
    flap.rotation.y = a; g.add(flap);
  }
  for (let i = 0; i < 3; i++) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.42, 12), black);
    const a = (i / 3) * Math.PI * 2;
    eng.position.set(Math.cos(a) * 0.32, 0.2, Math.sin(a) * 0.32); g.add(eng);
  }
  const plume = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 2.0, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x78c8ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  plume.rotation.x = Math.PI; plume.position.y = -0.6; g.add(plume);
  g.userData.plume = plume;
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.14, 40),
    new THREE.MeshStandardMaterial({ color: 0x555560, roughness: 0.65 }),
  );
  pad.position.y = 0.07; pad.receiveShadow = true; g.add(pad);
  return g;
}

function rockColor(eclipseMode, light = false) {
  if (eclipseMode) return light ? 0x5a3030 : 0x3a1818;
  return light ? 0x8a8a92 : 0x4e4e56;
}

function buildRockBlock(eclipseMode) {
  const root = new THREE.Group();
  const W = 16, D = 13, H = 17, thick = 1.8;
  const mat = new THREE.MeshStandardMaterial({
    color: rockColor(eclipseMode, true), roughness: 0.95, metalness: 0.04, flatShading: true,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: rockColor(eclipseMode, false), roughness: 0.97, flatShading: true,
  });

  const back = new THREE.Mesh(new THREE.BoxGeometry(W + thick * 2, H, thick), mat);
  back.position.set(0, -H / 2 + 0.5, -D / 2 - thick / 2);
  back.castShadow = true; back.receiveShadow = true; root.add(back);

  const left = new THREE.Mesh(new THREE.BoxGeometry(thick, H, D + thick), mat);
  left.position.set(-W / 2 - thick / 2, -H / 2 + 0.5, 0);
  left.castShadow = true; left.receiveShadow = true; root.add(left);

  const rightLip = new THREE.Mesh(new THREE.BoxGeometry(thick * 0.6, H, D * 0.2), dark);
  rightLip.position.set(W / 2 + thick * 0.3, -H / 2 + 0.5, -D / 2 + D * 0.08);
  root.add(rightLip);
  const frontLip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.2, H, thick * 0.6), dark);
  frontLip.position.set(-W / 2 + W * 0.08, -H / 2 + 0.5, D / 2 + thick * 0.3);
  root.add(frontLip);

  for (let i = 0; i < 12; i++) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(W + thick * 2 + 0.1, 0.45, thick + 0.1),
      new THREE.MeshStandardMaterial({ color: rockColor(eclipseMode, i % 2 === 0), roughness: 1, flatShading: true }),
    );
    band.position.set(0, -0.3 - i * 1.3, -D / 2 - thick / 2);
    root.add(band);
    const bandL = new THREE.Mesh(
      new THREE.BoxGeometry(thick + 0.1, 0.45, D + thick),
      new THREE.MeshStandardMaterial({ color: rockColor(eclipseMode, i % 2 === 0), roughness: 1, flatShading: true }),
    );
    bandL.position.set(-W / 2 - thick / 2, -0.3 - i * 1.3, 0);
    root.add(bandL);
  }

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(W + thick * 2, 0.9, D + thick * 2),
    new THREE.MeshStandardMaterial({ color: rockColor(eclipseMode, true), roughness: 0.95, flatShading: true }),
  );
  top.position.set(0, 1.1, 0); top.receiveShadow = true; top.castShadow = true; root.add(top);

  for (let i = 0; i < 16; i++) {
    const r = 0.25 + Math.random() * 0.6;
    const crater = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, 0.16, 14), dark);
    crater.position.set((Math.random() - 0.5) * 12, 1.5, (Math.random() - 0.5) * 10);
    root.add(crater);
  }

  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x152040, metalness: 0.65, roughness: 0.25,
    emissive: eclipseMode ? 0x401010 : 0x102048, emissiveIntensity: 0.4,
  });
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.9), panelMat);
    p.position.set(-0.2 + col * 1.4, 1.58, -3.5 + row * 1.1);
    p.rotation.x = -0.18; root.add(p);
  }

  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xc8c8d0, metalness: 0.55, roughness: 0.25, side: THREE.DoubleSide }),
  );
  dish.position.set(5.5, 1.65, -2.5); dish.rotation.x = Math.PI; root.add(dish);

  // rock shelves between floors (cutaway strata shelves)
  for (let i = 0; i < 5; i++) {
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.55, D * 0.85),
      new THREE.MeshStandardMaterial({ color: rockColor(eclipseMode, i % 2 === 0), roughness: 0.95, flatShading: true }),
    );
    shelf.position.set(-W / 2 + 0.4, -1.2 - i * 2.85, 0);
    root.add(shelf);
    const shelfB = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.9, 0.55, 1.6),
      new THREE.MeshStandardMaterial({ color: rockColor(eclipseMode, i % 2 === 1), roughness: 0.95, flatShading: true }),
    );
    shelfB.position.set(0, -1.2 - i * 2.85, -D / 2 + 0.5);
    root.add(shelfB);
  }

  // small rover
  const rover = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.35, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x888890, metalness: 0.4, roughness: 0.4 }),
  );
  rover.position.set(3.5, 1.4, 2.5); root.add(rover);

  return root;
}

const FLOOR_H = 2.85;
const FLOOR_W = 13.5;
const FLOOR_D = 10.2;

function floorY(fi) { return -1.5 - fi * FLOOR_H; }

function decorateFloorDensity(floorG, eclipseMode, fi) {
  // dense desk grid filling the floor
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const d = makeDesk(eclipseMode, true);
      d.position.set(-5.2 + col * 3.3, 0.1, -3.2 + row * 2.0);
      d.scale.setScalar(0.9);
      floorG.add(d);
      // idle glow blob deco on back rows (not clickable)
      if (row < 2) {
        const decoCols = ['#7cffb2', '#5ad4ff', '#ff9f1c', '#f15bb5', '#9b5de5'];
        const deco = createDecoBlob(decoCols[(col + row + fi) % decoCols.length]);
        deco.position.set(-5.2 + col * 3.3, 0.85, -3.2 + row * 2.0 + 0.55);
        deco.scale.setScalar(1.05);
        floorG.add(deco);
      }
    }
  }
  // partitions
  for (let i = 0; i < 3; i++) {
    const part = makePartition(eclipseMode);
    part.position.set(-3.5 + i * 3.0, 0.55, 0.2);
    floorG.add(part);
  }
  // cabinets
  for (let i = 0; i < 2; i++) {
    const cab = makeCabinet(eclipseMode);
    cab.position.set(-5.5 + i * 11, 0, 3.5);
    floorG.add(cab);
  }
  // whiteboard on side
  if (fi % 2 === 0) {
    const wb = makeWhiteboard(eclipseMode);
    wb.position.set(5.5, 1.1, 0);
    wb.rotation.y = -Math.PI / 2;
    floorG.add(wb);
  }
  // plants row
  for (let i = 0; i < 4; i++) {
    const plant = makePlant(1.1);
    plant.position.set(-5 + i * 3.2, 0.1, 4.0);
    floorG.add(plant);
  }
  // pillars
  for (const [x, z] of [[-5.5, -4], [5.5, -4], [-5.5, 3.5], [5.5, 3.5]]) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 2.3, 10),
      new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x2a1515 : 0x22222a, metalness: 0.5, roughness: 0.35 }),
    );
    pillar.position.set(x, 1.15, z);
    floorG.add(pillar);
  }
  // lounge couch every other floor
  if (fi % 2 === 1) {
    const couch = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.5, 0.8),
      new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x3a2030 : 0x5a4a7a, roughness: 0.55 }),
    );
    couch.position.set(3.2, 0.35, 2.0);
    floorG.add(couch);
  }
}

function buildFloors(data, eclipseMode) {
  const root = new THREE.Group();
  clickables.length = 0;
  botMeshes.clear();

  data.floors.forEach((floor, fi) => {
    const y = floorY(fi);
    const floorG = new THREE.Group();
    floorG.position.y = y;
    floorG.userData.floorNum = floor.num;

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(FLOOR_W, 0.22, FLOOR_D),
      new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x3a2222 : 0xeef0f5, roughness: 0.45, metalness: 0.08 }),
    );
    slab.receiveShadow = true; floorG.add(slab);

    const ceil = new THREE.Mesh(
      new THREE.BoxGeometry(FLOOR_W, 0.12, FLOOR_D),
      new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x2a1515 : 0xd8dae0, roughness: 0.65 }),
    );
    ceil.position.y = 2.45; floorG.add(ceil);

    for (let i = 0; i < 5; i++) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.07, 0.2),
        new THREE.MeshBasicMaterial({ color: eclipseMode ? 0xff5533 : 0xffffff }),
      );
      strip.position.set(-4.5 + i * 2.25, 2.38, -4.0);
      floorG.add(strip);
      const pl = new THREE.PointLight(eclipseMode ? 0xff4422 : 0xfff0dd, eclipseMode ? 0.5 : 0.85, 8);
      pl.position.set(-4.5 + i * 2.25, 2.1, 0);
      floorG.add(pl);
    }

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(FLOOR_W - 0.3, 2.25, 0.2),
      new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x1a1018 : 0x152033, roughness: 0.6 }),
    );
    wall.position.set(0, 1.2, -FLOOR_D / 2 + 0.25);
    floorG.add(wall);

    const screen = makeWallScreen(eclipseMode);
    screen.position.set(0, 1.25, -FLOOR_D / 2 + 0.4);
    floorG.add(screen);
    floorG.userData.screen = screen;

    decorateFloorDensity(floorG, eclipseMode, fi);

    // Bot desks — packed toward camera (+Z) so they read in overview
    const n = floor.bots.length;
    floor.bots.forEach((bot, bi) => {
      const t = n === 1 ? 0.5 : bi / Math.max(1, n - 1);
      const dx = -5.0 + t * 10.0;
      const deskZ = 2.6; // front row toward camera

      const desk = makeDesk(eclipseMode, true);
      desk.position.set(dx, 0.1, deskZ);
      floorG.add(desk);

      const blob = createBlobBot(bot.color, bot.status);
      blob.position.set(dx, 1.05, deskZ + 0.7);
      blob.scale.setScalar(1.85);
      blob.userData.botId = bot.id;
      blob.userData.baseY = 1.05;
      blob.userData.phase = bi * 1.7 + fi;
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.userData.botId = bot.id;
      blob.add(hit);
      floorG.add(blob);
      botMeshes.set(bot.id, { group: blob, floorNum: floor.num, bot });
      clickables.push(blob);
    });

    root.add(floorG);
  });

  const elev = makeElevatorShaft(FLOOR_H * 5 + 2.8);
  elev.position.set(FLOOR_W / 2 - 0.4, floorY(4) - 0.15, 0.8);
  root.add(elev);
  return root;
}

function buildChamber(eclipseMode) {
  const g = new THREE.Group();
  g.position.y = -16.5;

  const rockMat = new THREE.MeshStandardMaterial({
    color: eclipseMode ? 0x2a1210 : 0x2a2220, roughness: 0.95, flatShading: true,
  });
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.0, 0.5, 20), rockMat);
  floor.receiveShadow = true; g.add(floor);

  // uneven rocky mounds (not pillars)
  for (let i = 0; i < 10; i++) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.55, 0),
      rockMat,
    );
    const a = Math.random() * Math.PI * 2;
    const r = 1.8 + Math.random() * 2.2;
    rock.position.set(Math.cos(a) * r, 0.35, Math.sin(a) * r);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    g.add(rock);
  }

  // low cave backdrop only behind monolith
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(7, 5.5, 1.2),
    rockMat,
  );
  backWall.position.set(0, 2.4, -4.2);
  g.add(backWall);
  for (let i = 0; i < 4; i++) {
    const strata = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.35, 1.3),
      new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x3a1818 : 0x3a322e, roughness: 1, flatShading: true }),
    );
    strata.position.set(0, 0.8 + i * 1.1, -4.2);
    g.add(strata);
  }

  // SINGLE monolith
  const mono = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 4.6, 0.5),
    new THREE.MeshStandardMaterial({
      color: 0x030305, metalness: 0.95, roughness: 0.12,
      emissive: 0x222228, emissiveIntensity: 0.4,
    }),
  );
  mono.position.y = 2.4; mono.castShadow = true; mono.userData.isMonolith = true;
  g.add(mono);
  // thin gold rim light plane behind
  const rimPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 5.0),
    new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0.35 }),
  );
  rimPlane.position.set(0, 2.4, -0.4);
  g.add(rimPlane);
  monolithMesh = mono;
  clickables.push(mono);

  const label = makeTextSprite('● TMA-1', { w: 512, h: 128, font: 'bold 60px system-ui', planeH: 0.6 });
  label.position.set(0, 4.7, 0.3); g.add(label);

  g.add(new THREE.AmbientLight(0xffccaa, 0.7));
  const spot = new THREE.SpotLight(0xffbb77, 6.5, 30, 0.55, 0.35);
  spot.position.set(-3.8, 4.5, 3.0);
  spot.target.position.set(0, 1.5, 0);
  g.add(spot); g.add(spot.target);
  const rim = new THREE.PointLight(0xff6644, 3.5, 16);
  rim.position.set(3.0, 3.5, -2.0); g.add(rim);
  const fillL = new THREE.PointLight(0xffe0c0, 2.5, 14);
  fillL.position.set(0, 5, 4); g.add(fillL);

  const lamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.36, 1.0, 12),
    new THREE.MeshStandardMaterial({ color: 0x111111 }),
  );
  lamp.position.copy(spot.position); g.add(lamp);

  const b1 = createBlobBot('#ef233c', 'working');
  b1.position.set(1.6, 0.55, 1.5); b1.scale.setScalar(0.85); g.add(b1);
  const b2 = createBlobBot('#fee440', 'waiting');
  b2.position.set(-1.5, 0.55, 2.0); b2.scale.setScalar(0.8); g.add(b2);

  g.visible = false;
  scene.add(g);
  return g;
}

function styleBotsForEclipse(on) {
  botMeshes.forEach(({ group, bot }) => {
    const stayLit = bot.status === 'working';
    const ud = group.userData;
    if (!ud.bodyMat) return;
    if (on && !stayLit) {
      ud.bodyMat.emissiveIntensity = 0.05;
      if (ud.shell) ud.shell.material.opacity = 0.08;
      ud.glowLight.intensity = 0.05;
      ud.disc.material.opacity = 0.02;
      group.traverse((c) => {
        if (c.isMesh && c.material && !c.material.map && c !== ud.disc && c !== ud.shell) {
          c.material.transparent = true;
          c.material.opacity = 0.22;
        }
      });
    } else {
      ud.bodyMat.emissiveIntensity = bot.status === 'idle' ? 0.35 : 1.15;
      if (ud.shell) ud.shell.material.opacity = bot.status === 'idle' ? 0.35 : 0.7;
      ud.glowLight.intensity = bot.status === 'working' ? 2.8 : bot.status === 'waiting' ? 1.6 : 0.45;
      ud.disc.material.opacity = bot.status === 'idle' ? 0.12 : 0.5;
      group.traverse((c) => {
        if (c.isMesh && c.material && !c.material.map && c !== ud.disc && c !== ud.shell) {
          c.material.opacity = 1;
          c.material.transparent = false;
        }
      });
      ud.disc.material.transparent = true;
      if (ud.shell) ud.shell.material.transparent = true;
    }
  });
}

function applyEclipse(on) {
  eclipse = on;
  scene.background = new THREE.Color(on ? 0x140308 : 0x050814);
  scene.fog = new THREE.FogExp2(on ? 0x140308 : 0x050814, on ? 0.012 : 0.008);
  hemi.color.set(on ? 0xff8866 : 0xd8e4ff);
  hemi.groundColor.set(on ? 0x2a0a0c : 0x3a3040);
  hemi.intensity = on ? 0.4 : 0.85;
  key.color.set(on ? 0xff6644 : 0xfff0d8);
  key.intensity = on ? 0.7 : 1.55;
  warm.intensity = on ? 0.1 : 0.28;
  bloomPass.strength = on ? 0.9 : 0.7;
  renderer.toneMappingExposure = on ? 0.85 : 1.25;
  if (sunMesh) sunMesh.visible = !on;
  if (starsPts) starsPts.material.opacity = on ? 0.35 : 0.95;
  styleBotsForEclipse(on);
  document.getElementById('liveDot').textContent = on ? '● ליקוי' : '● Live';
  document.getElementById('liveDot').classList.toggle('eclipse', on);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function startCamTween(toPos, toTarget, toZoom, dur = 1.05) {
  camTween.active = true; camTween.t = 0; camTween.dur = dur;
  camTween.fromPos.copy(camera.position); camTween.toPos.copy(toPos);
  camTween.fromTarget.copy(controls.target); camTween.toTarget.copy(toTarget);
  camTween.fromZoom = camera.zoom; camTween.toZoom = toZoom;
  controls.enabled = false;
}

function updateCamTween(dt) {
  if (!camTween.active) return;
  camTween.t += dt / camTween.dur;
  const t = Math.min(1, camTween.t);
  const e = easeInOutCubic(t);
  camera.position.lerpVectors(camTween.fromPos, camTween.toPos, e);
  controls.target.lerpVectors(camTween.fromTarget, camTween.toTarget, e);
  camera.zoom = THREE.MathUtils.lerp(camTween.fromZoom, camTween.toZoom, e);
  camera.updateProjectionMatrix();
  if (t >= 1) { camTween.active = false; controls.enabled = true; }
}

function setFloorVisibility(activeNum) {
  if (!floorsRoot) return;
  floorsRoot.children.forEach((ch) => {
    if (ch.userData && ch.userData.floorNum != null) {
      ch.visible = activeNum == null || ch.userData.floorNum === activeNum;
    } else {
      ch.visible = true;
    }
  });
}

function flyToOverview() {
  viewMode = 'overview'; activeFloorNum = null;
  if (chamberGroup) chamberGroup.visible = false;
  if (floorsRoot) floorsRoot.visible = true;
  if (rockRoot) rockRoot.visible = true;
  if (rocketGroup) rocketGroup.visible = true;
  if (signMesh) signMesh.visible = true;
  if (earthMesh) earthMesh.visible = true;
  if (sunMesh) sunMesh.visible = !eclipse;
  setFloorVisibility(null);
  scene.fog.density = eclipse ? 0.012 : 0.008;
  // Pull back enough for Earth (TR) + Sun (TL) + full cutaway on portrait
  startCamTween(new THREE.Vector3(24, 16, 24), new THREE.Vector3(0, -2.5, 0), 0.68);
  updateToastDefault(); updateFloorPicker(); hideApprove(); closeBotPanel();
}

function flyToFloor(num) {
  viewMode = 'floor'; activeFloorNum = num;
  if (chamberGroup) chamberGroup.visible = false;
  if (floorsRoot) floorsRoot.visible = true;
  if (rockRoot) rockRoot.visible = false;
  if (rocketGroup) rocketGroup.visible = false;
  if (signMesh) signMesh.visible = false;
  setFloorVisibility(num);
  scene.fog.density = eclipse ? 0.012 : 0.008;
  const fi = DATA.floors.findIndex((f) => f.num === num);
  const y = floorY(fi) + 0.7;
  // Portrait-safe: lower zoom, look into office from corner
  startCamTween(new THREE.Vector3(11, y + 4.0, 12), new THREE.Vector3(0, y + 1.2, 1.0), 0.82, 1.15);
  const floor = DATA.floors.find((f) => f.num === num);
  setToast(floor.toastLine || floor.name, floor.toastSub || `${floor.bots.length} בוטים`);
  updateFloorPicker(); hideApprove(); closeBotPanel();
}

function flyToChamber() {
  viewMode = 'chamber'; activeFloorNum = null;
  if (chamberGroup) chamberGroup.visible = true;
  if (floorsRoot) floorsRoot.visible = false;
  if (rockRoot) rockRoot.visible = false;
  if (rocketGroup) rocketGroup.visible = false;
  if (signMesh) signMesh.visible = false;
  scene.fog.density = 0.002;
  startCamTween(new THREE.Vector3(7.5, -14.2, 8.5), new THREE.Vector3(0, -15.0, 0.2), 0.9, 1.2);
  setToast('TMA-1', 'סטטוס: מחכה. כבר 3.6 מיליארד שנים.');
  showApprove(); updateFloorPicker(); closeBotPanel();
}

function setToast(title, body, color) {
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastBody').textContent = body;
  if (color) document.getElementById('toastDot').style.background = color;
}
function updateToastDefault() {
  const t = TOASTS[toastIdx % TOASTS.length];
  if (t.body === null && DATA) {
    setToast(`${DATA.botCount} בוטים`, `${DATA.workingCount} עובדים · ${DATA.waitingCount} מחכים`);
  } else {
    setToast(t.title, t.body);
  }
}
function showApprove() { document.getElementById('approveBtn').style.display = ''; }
function hideApprove() { document.getElementById('approveBtn').style.display = 'none'; }

function updateFloorPicker() {
  const el = document.getElementById('floorPicker');
  el.innerHTML = '';
  const mk = (label, active, fn, secret) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (active) b.classList.add('active');
    if (secret) b.classList.add('secret');
    b.addEventListener('click', fn);
    el.appendChild(b);
  };
  mk('◆', viewMode === 'overview', flyToOverview);
  [5, 4, 3, 2, 1].forEach((n) => mk(String(n), viewMode === 'floor' && activeFloorNum === n, () => flyToFloor(n)));
  mk('?', viewMode === 'chamber', flyToChamber, true);
}

function openBotPanel(bot) {
  selectedBotId = bot.id;
  const panel = document.getElementById('botPanel');
  panel.style.display = '';
  document.getElementById('panelName').textContent = bot.name;
  document.getElementById('panelRole').textContent = bot.role;
  const st = document.getElementById('panelStatus');
  st.className = 'status ' + bot.status;
  st.textContent = bot.status === 'working' ? 'עובד' : bot.status === 'waiting' ? 'מחכה לך' : 'ממתין';
  document.getElementById('panelLine').textContent = bot.line;
  setToast(bot.name, bot.line, bot.color);
  document.getElementById('toastDot').style.background = bot.color;
}
function closeBotPanel() {
  selectedBotId = null;
  document.getElementById('botPanel').style.display = 'none';
}

function onPointerDown(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(clickables, true);
  if (!hits.length) return;
  let obj = hits[0].object;
  while (obj && !obj.userData.botId && !obj.userData.isMonolith) obj = obj.parent;
  if (!obj) return;
  if (obj.userData.isMonolith) { approveFlash = 1.2; return; }
  const entry = botMeshes.get(obj.userData.botId);
  if (entry) openBotPanel(entry.bot);
}
canvas.addEventListener('pointerdown', onPointerDown);

function clearGroup(obj) {
  if (!obj) return;
  scene.remove(obj);
  obj.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material.dispose();
    }
  });
}

function rebuildScene(data) {
  clearGroup(rockRoot); clearGroup(floorsRoot); clearGroup(chamberGroup);
  clearGroup(rocketGroup); clearGroup(signMesh);
  rockRoot = buildRockBlock(eclipse); scene.add(rockRoot);
  floorsRoot = buildFloors(data, eclipse); scene.add(floorsRoot);
  chamberGroup = buildChamber(eclipse);
  rocketGroup = makeRocket(); rocketGroup.position.set(-4.5, 1.5, -2.2); scene.add(rocketGroup);
  signMesh = makeTextSprite(data.sign || 'OREN · MOON BASE', {
    w: 1024, h: 128, font: 'bold 72px system-ui', planeH: 1.1,
  });
  signMesh.position.set(2.0, 2.85, -4.8);
  signMesh.rotation.y = 0.3;
  scene.add(signMesh);
  if (viewMode === 'chamber') {
    chamberGroup.visible = true; floorsRoot.visible = false; rockRoot.visible = false;
    rocketGroup.visible = false; signMesh.visible = false;
  }
  styleBotsForEclipse(eclipse);
}

function refreshCounters(data) {
  const bots = data.floors.flatMap((f) => f.bots);
  const working = bots.filter((b) => b.status === 'working').length;
  const waiting = bots.filter((b) => b.status === 'waiting').length;
  data.workingCount = working;
  data.waitingCount = waiting;
  data.botCount = bots.length;
  document.getElementById('workingPill').textContent = `● ${working} עובדים`;
  document.getElementById('waitingPill').textContent = `● ${waiting} מחכים`;
}

async function init() {
  addStars();
  earthMesh = makeEarth();
  sunMesh = makeSun();
  DATA = await (await fetch('./data.json')).json();
  rebuildScene(DATA);
  refreshCounters(DATA);

  document.getElementById('eclipseToggle').addEventListener('change', (e) => {
    const on = e.target.checked;
    rebuildScene(DATA);
    applyEclipse(on);
  });
  document.getElementById('panelClose').addEventListener('click', closeBotPanel);
  document.getElementById('approveBtn').addEventListener('click', () => { approveFlash = 1.2; });
  document.getElementById('waitingPill').addEventListener('click', () => {
    const waiting = DATA.floors.flatMap((f) => f.bots).filter((b) => b.status === 'waiting');
    if (waiting.length) openBotPanel(waiting[toastIdx % waiting.length]);
  });

  updateFloorPicker();
  updateToastDefault();
  // Start slightly zoomed so Earth/Sun frame in
  camera.zoom = 0.72;
  camera.updateProjectionMatrix();
  setInterval(() => {
    if (viewMode === 'overview' && !selectedBotId) { toastIdx++; updateToastDefault(); }
  }, 5000);
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  updateCamTween(dt);
  if (!camTween.active) controls.update();

  botMeshes.forEach(({ group }) => {
    const ud = group.userData;
    group.position.y = ud.baseY + Math.sin(t * 2.8 + ud.phase) * 0.08;
  });
  if (elevatorCar) {
    const h = FLOOR_H * 5;
    elevatorCar.position.y = 1.3 + ((Math.sin(t * 0.35) + 1) / 2) * (h - 2);
  }
  if (rocketGroup) {
    rocketGroup.position.y = 1.5 + Math.sin(t * 1.4) * 0.08;
    const plume = rocketGroup.userData.plume;
    if (plume) {
      plume.scale.y = 0.7 + 0.5 * (0.5 + 0.5 * Math.sin(t * 9));
      plume.material.opacity = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 11));
    }
  }
  if (earthMesh) earthMesh.rotation.y = t * 0.05;
  if (floorsRoot) {
    floorsRoot.traverse((o) => {
      if (o.userData && o.userData.draw) { o.userData.draw(t); o.userData.tex.needsUpdate = true; }
    });
  }
  if (monolithMesh && approveFlash > 0) {
    approveFlash -= dt;
    monolithMesh.material.emissiveIntensity = (0.3 + 0.7 * Math.abs(Math.sin(t * 20))) * 3;
    monolithMesh.material.emissive.set(0xff4422);
  } else if (monolithMesh) {
    monolithMesh.material.emissiveIntensity = 0.35;
    monolithMesh.material.emissive.set(0x1a1a22);
  }
  composer.render();
}

init().catch((err) => {
  console.error(err);
  document.getElementById('toastTitle').textContent = 'שגיאה';
  document.getElementById('toastBody').textContent = String(err);
});
