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
  { title: 'שדה סולארי', body: '41 קילוואט. ליקוי בעוד רגע.' },
  { title: 'הזמנה נשלחה', body: '1.3 שניות לירח.' },
  { title: 'ים השלווה', body: 'כל הקומות פעילות · בסיס אורן.' },
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
scene.background = new THREE.Color(0x03050c);
scene.fog = new THREE.FogExp2(0x03050c, 0.01);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const frustumSize = 26;
const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
const camera = new THREE.OrthographicCamera(
  (-frustumSize * aspect()) / 2, (frustumSize * aspect()) / 2,
  frustumSize / 2, -frustumSize / 2, 0.1, 200,
);
camera.position.set(20, 16, 20);
camera.lookAt(0, -3, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minZoom = 0.4;
controls.maxZoom = 4;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minPolarAngle = Math.PI * 0.15;
controls.target.set(0, -3, 0);
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.65, 0.5, 0.82);
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

const hemi = new THREE.HemisphereLight(0xb8c8ff, 0x2a2030, 0.65);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff2d6, 1.4);
key.position.set(-16, 26, 12);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1;
key.shadow.camera.far = 80;
Object.assign(key.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22 });
key.shadow.bias = -0.0005;
scene.add(key);
const fill = new THREE.DirectionalLight(0x6aa8ff, 0.4);
fill.position.set(18, 8, -10);
scene.add(fill);

function makeTextSprite(text, opts = {}) {
  const { w = 1024, h = 128, font = 'bold 64px system-ui,sans-serif', color = '#f0f0fa', bg = null } = opts;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  return new THREE.Mesh(new THREE.PlaneGeometry((w / h) * (opts.planeH || 1), opts.planeH || 1), mat);
}

function addStars(n = 500) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 55 + Math.random() * 70;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starsPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xeef3ff, size: 0.2, sizeAttenuation: true, transparent: true, opacity: 0.9 }));
  scene.add(starsPts);
}

function makeEarth() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 28, 28),
    new THREE.MeshStandardMaterial({ color: 0x2a7fd4, roughness: 0.55, emissive: 0x0a2040, emissiveIntensity: 0.4 }),
  );
  g.add(body);
  const landMat = new THREE.MeshStandardMaterial({ color: 0x3ca050, roughness: 0.8, emissive: 0x1a4020, emissiveIntensity: 0.25 });
  for (let i = 0; i < 7; i++) {
    const land = new THREE.Mesh(new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 10, 10), landMat);
    const lat = (Math.random() - 0.5) * Math.PI;
    const lon = Math.random() * Math.PI * 2;
    land.position.set(Math.cos(lat) * Math.cos(lon) * 1.7, Math.sin(lat) * 1.7, Math.cos(lat) * Math.sin(lon) * 1.7);
    land.scale.set(1, 0.55, 1);
    g.add(land);
  }
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1.95, 20, 20), new THREE.MeshBasicMaterial({ color: 0x7ec8ff, transparent: true, opacity: 0.12 })));
  g.position.set(12, 11, -8);
  scene.add(g);
  return g;
}

function makeSun() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 20), new THREE.MeshBasicMaterial({ color: 0xffe566 })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 14), new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.22 })));
  g.position.set(-14, 13, 7);
  scene.add(g);
  return g;
}

function createBlobBot(colorHex, status) {
  const group = new THREE.Group();
  const col = new THREE.Color(colorHex);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: col, roughness: 0.3, metalness: 0.12,
    emissive: col.clone(), emissiveIntensity: status === 'idle' ? 0.2 : 0.95,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 22, 22), bodyMat);
  body.scale.set(1, 1.2, 1);
  body.castShadow = true;
  group.add(body);
  for (const sx of [-0.13, 0.13]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.position.set(sx, 0.14, 0.34);
    group.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    pupil.position.set(sx, 0.14, 0.41);
    group.add(pupil);
  }
  const glowLight = new THREE.PointLight(col, status === 'working' ? 2.2 : status === 'waiting' ? 1.1 : 0.25, 4.5);
  glowLight.position.set(0, 0.25, 0);
  group.add(glowLight);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 24),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: status === 'idle' ? 0.08 : 0.4, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  group.add(disc);
  group.userData = { bodyMat, glowLight, disc, status, color: col, baseY: 0, phase: Math.random() * 10 };
  return group;
}

function makeDesk(eclipseMode) {
  const g = new THREE.Group();
  const deskMat = new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x2a1a1a : 0x22222c, roughness: 0.45, metalness: 0.25 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.1, 0.75), deskMat);
  top.position.y = 0.48; top.castShadow = true; top.receiveShadow = true;
  g.add(top);
  for (const [x, z] of [[-0.6, -0.28], [0.6, -0.28], [-0.6, 0.28], [0.6, 0.28]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.48, 0.07), deskMat);
    leg.position.set(x, 0.24, z);
    g.add(leg);
  }
  const screenCol = eclipseMode ? 0xff5533 : 0x55d4ff;
  for (const ox of [-0.28, 0.35]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.05), new THREE.MeshStandardMaterial({ color: 0x0c0c12, emissive: screenCol, emissiveIntensity: 0.35 }));
    frame.position.set(ox, 0.78, -0.22);
    g.add(frame);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.3), new THREE.MeshBasicMaterial({ color: screenCol, transparent: true, opacity: 0.7 }));
    glow.position.set(ox, 0.78, -0.18);
    g.add(glow);
  }
  return g;
}

function makePlant() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x2d6a4f }));
  pot.position.set(0, 0.1, 0); g.add(pot);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x52b788, roughness: 0.55, emissive: 0x143820, emissiveIntensity: 0.2 });
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), leafMat);
    leaf.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.12, 0.32 + (i % 2) * 0.1, Math.sin((i / 5) * Math.PI * 2) * 0.12);
    leaf.scale.set(1, 0.75, 1);
    g.add(leaf);
  }
  return g;
}

function makeElevatorShaft(height) {
  const g = new THREE.Group();
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xaaccff, transparent: true, opacity: 0.22, metalness: 0.3, roughness: 0.15 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xd0e0f0, metalness: 0.7, roughness: 0.25 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.35, height, 1.35), glassMat);
  shaft.position.y = height / 2;
  g.add(shaft);
  for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, height, 0.07), frameMat);
    post.position.set(x, height / 2, z);
    g.add(post);
  }
  const car = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.95, 1.0), new THREE.MeshStandardMaterial({ color: 0xdceeff, transparent: true, opacity: 0.5, metalness: 0.35, roughness: 0.2 }));
  car.position.y = height - 1.2;
  g.add(car);
  const rider = createBlobBot('#f15bb5', 'idle');
  rider.position.set(0, 0.4, 0);
  rider.scale.setScalar(0.75);
  car.add(rider);
  elevatorCar = car;
  g.userData.height = height;
  return g;
}

function makeRocket() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f7, metalness: 0.4, roughness: 0.32 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, metalness: 0.45, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.72, 4.6, 26), white);
  body.position.y = 2.6; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 26), black);
  nose.position.y = 5.5; g.add(nose);
  for (let i = 0; i < 4; i++) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.6), black);
    const a = (i / 4) * Math.PI * 2;
    flap.position.set(Math.cos(a) * 0.78, 1.3, Math.sin(a) * 0.78);
    flap.rotation.y = a; g.add(flap);
  }
  for (let i = 0; i < 3; i++) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.4, 12), black);
    const a = (i / 3) * Math.PI * 2;
    eng.position.set(Math.cos(a) * 0.3, 0.18, Math.sin(a) * 0.3); g.add(eng);
  }
  const plume = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 1.8, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x78c8ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  plume.rotation.x = Math.PI; plume.position.y = -0.55; g.add(plume);
  g.userData.plume = plume;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.14, 36), new THREE.MeshStandardMaterial({ color: 0x555560, roughness: 0.7 }));
  pad.position.y = 0.07; pad.receiveShadow = true; g.add(pad);
  return g;
}

function makeWallScreen(eclipseMode) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.55, 0.1), new THREE.MeshStandardMaterial({ color: 0x101018 })));
  const c = document.createElement('canvas');
  c.width = 512; c.height = 192;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 1.35), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.z = 0.06; g.add(screen);
  g.userData = {
    tex,
    draw(t) {
      ctx.fillStyle = eclipseMode ? '#180808' : '#071420';
      ctx.fillRect(0, 0, 512, 192);
      ctx.fillStyle = eclipseMode ? '#ff6644' : '#5ad4ff';
      ctx.font = 'bold 26px monospace';
      const mm = String(Math.floor((t * 7) % 60)).padStart(2, '0');
      const ss = String(Math.floor((t * 41) % 60)).padStart(2, '0');
      ctx.fillText('T-00:' + mm + ':' + ss, 18, 40);
      for (let i = 0; i < 8; i++) {
        const bh = 18 + ((Math.sin(t * 1.5 + i) + 1) / 2) * 70;
        ctx.fillStyle = i % 2 ? (eclipseMode ? '#ff8866' : '#7cffb2') : (eclipseMode ? '#ff4422' : '#5ad4ff');
        ctx.fillRect(30 + i * 58, 160 - bh, 36, bh);
      }
      ctx.strokeStyle = eclipseMode ? 'rgba(255,100,60,0.5)' : 'rgba(90,210,255,0.5)';
      ctx.beginPath();
      for (let x = 0; x < 512; x += 6) {
        const y = 90 + Math.sin(x * 0.05 + t * 2.2) * 28;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },
  };
  g.userData.draw(0);
  return g;
}

function rockColor(eclipseMode, light = false) {
  if (eclipseMode) return light ? 0x5a3030 : 0x3a1818;
  return light ? 0x8a8a92 : 0x4e4e56;
}

function buildRockBlock(eclipseMode) {
  const root = new THREE.Group();
  const W = 15, D = 12, H = 16, thick = 1.6;
  const mat = new THREE.MeshStandardMaterial({ color: rockColor(eclipseMode, true), roughness: 0.95, metalness: 0.04, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: rockColor(eclipseMode, false), roughness: 0.97, flatShading: true });

  // Open cutaway: solid back (-Z) and left (-X) only; front/right open so interiors read
  const back = new THREE.Mesh(new THREE.BoxGeometry(W + thick * 2, H, thick), mat);
  back.position.set(0, -H / 2 + 0.8, -D / 2 - thick / 2);
  back.castShadow = true; back.receiveShadow = true; root.add(back);

  const left = new THREE.Mesh(new THREE.BoxGeometry(thick, H, D + thick), mat);
  left.position.set(-W / 2 - thick / 2, -H / 2 + 0.8, 0);
  left.castShadow = true; left.receiveShadow = true; root.add(left);

  // partial right/front lips so it still feels like a block
  const rightLip = new THREE.Mesh(new THREE.BoxGeometry(thick * 0.7, H, D * 0.22), dark);
  rightLip.position.set(W / 2 + thick * 0.35, -H / 2 + 0.8, -D / 2 + D * 0.08);
  root.add(rightLip);
  const frontLip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.22, H, thick * 0.7), dark);
  frontLip.position.set(-W / 2 + W * 0.08, -H / 2 + 0.8, D / 2 + thick * 0.35);
  root.add(frontLip);

  for (let i = 0; i < 11; i++) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(W + thick * 2 + 0.08, 0.4, thick + 0.08),
      new THREE.MeshStandardMaterial({ color: rockColor(eclipseMode, i % 2 === 0), roughness: 1, flatShading: true }),
    );
    band.position.set(0, -0.5 - i * 1.35, -D / 2 - thick / 2);
    root.add(band);
    const bandL = new THREE.Mesh(
      new THREE.BoxGeometry(thick + 0.08, 0.4, D + thick),
      new THREE.MeshStandardMaterial({ color: rockColor(eclipseMode, i % 2 === 0), roughness: 1, flatShading: true }),
    );
    bandL.position.set(-W / 2 - thick / 2, -0.5 - i * 1.35, 0);
    root.add(bandL);
  }

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(W + thick * 2, 0.85, D + thick * 2),
    new THREE.MeshStandardMaterial({ color: rockColor(eclipseMode, true), roughness: 0.95, flatShading: true }),
  );
  top.position.set(0, 1.15, 0); top.receiveShadow = true; top.castShadow = true; root.add(top);

  for (let i = 0; i < 14; i++) {
    const r = 0.25 + Math.random() * 0.55;
    const crater = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, 0.16, 14), dark);
    crater.position.set((Math.random() - 0.5) * 11, 1.52, (Math.random() - 0.5) * 9);
    root.add(crater);
  }

  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x152040, metalness: 0.65, roughness: 0.28,
    emissive: eclipseMode ? 0x401010 : 0x102048, emissiveIntensity: 0.35,
  });
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.85), panelMat);
    p.position.set(-0.5 + col * 1.35, 1.62, -3.8 + row * 1.05);
    p.rotation.x = -0.18; root.add(p);
  }

  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xc8c8d0, metalness: 0.55, roughness: 0.28, side: THREE.DoubleSide }),
  );
  dish.position.set(5.2, 1.7, -2.8); dish.rotation.x = Math.PI; root.add(dish);
  return root;
}

const FLOOR_H = 2.7;
const FLOOR_W = 12.5;
const FLOOR_D = 9.5;

function floorY(fi) { return -1.35 - fi * FLOOR_H; }

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
      new THREE.BoxGeometry(FLOOR_W, 0.2, FLOOR_D),
      new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x3a2222 : 0xe6e6ee, roughness: 0.5, metalness: 0.08 }),
    );
    slab.receiveShadow = true; floorG.add(slab);

    // ceiling
    const ceil = new THREE.Mesh(
      new THREE.BoxGeometry(FLOOR_W, 0.12, FLOOR_D),
      new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x2a1515 : 0xd0d0d8, roughness: 0.7 }),
    );
    ceil.position.y = 2.35; floorG.add(ceil);

    for (let i = 0; i < 5; i++) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.06, 0.18),
        new THREE.MeshBasicMaterial({ color: eclipseMode ? 0xff5533 : 0xffffff }),
      );
      strip.position.set(-4.2 + i * 2.1, 2.28, -3.8);
      floorG.add(strip);
      const pl = new THREE.PointLight(eclipseMode ? 0xff4422 : 0xffe6c8, eclipseMode ? 0.4 : 0.7, 7);
      pl.position.set(-4.2 + i * 2.1, 2.0, 0);
      floorG.add(pl);
    }

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(FLOOR_W - 0.4, 2.15, 0.18),
      new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x1a1018 : 0x152033, roughness: 0.65 }),
    );
    wall.position.set(0, 1.15, -FLOOR_D / 2 + 0.25);
    floorG.add(wall);

    const screen = makeWallScreen(eclipseMode);
    screen.position.set(0, 1.2, -FLOOR_D / 2 + 0.38);
    floorG.add(screen);
    floorG.userData.screen = screen;

    for (let i = 0; i < 3; i++) {
      const plant = makePlant();
      plant.position.set(-4.5 + i * 4.2, 0.1, 3.6);
      floorG.add(plant);
    }

    // lounge couch on some floors
    if (fi % 2 === 1) {
      const couch = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.45, 0.7),
        new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x3a2030 : 0x5a4a7a, roughness: 0.6 }),
      );
      couch.position.set(3.5, 0.35, 2.2);
      floorG.add(couch);
    }

    floor.bots.forEach((bot, bi) => {
      const dx = -5 + (bot.desk?.x ?? (0.2 + bi * 0.2)) * 10;
      const dz = -3 + (bot.desk?.y ?? 0.4) * 5.5;
      const desk = makeDesk(eclipseMode);
      desk.position.set(dx, 0.1, dz);
      floorG.add(desk);

      const blob = createBlobBot(bot.color, bot.status);
      blob.position.set(dx, 0.72, dz + 0.45);
      blob.scale.setScalar(1.15);
      blob.userData.botId = bot.id;
      blob.userData.baseY = 0.72;
      blob.userData.phase = bi * 1.7 + fi;
      // hit proxy
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 8, 8),
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

  const elev = makeElevatorShaft(FLOOR_H * 5 + 2.5);
  elev.position.set(FLOOR_W / 2 - 0.5, floorY(4) - 0.2, 0.5);
  root.add(elev);
  return root;
}

function buildChamber(eclipseMode) {
  const g = new THREE.Group();
  g.position.y = -16.2;
  const rockMat = new THREE.MeshStandardMaterial({ color: eclipseMode ? 0x2a1010 : 0x241818, roughness: 0.95, flatShading: true });
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, 0.45, 18), rockMat);
  floor.receiveShadow = true; g.add(floor);
  for (let i = 0; i < 8; i++) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.8, 1.3), rockMat);
    const a = (i / 8) * Math.PI * 2;
    wall.position.set(Math.cos(a) * 4.6, 2.1, Math.sin(a) * 4.6);
    wall.lookAt(0, 2.1, 0);
    g.add(wall);
  }
  const mono = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 3.8, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x08080a, metalness: 0.9, roughness: 0.18, emissive: 0x111118, emissiveIntensity: 0.25 }),
  );
  mono.position.y = 2.0; mono.castShadow = true; mono.userData.isMonolith = true;
  g.add(mono);
  monolithMesh = mono;
  clickables.push(mono);

  const label = makeTextSprite('● TMA-1', { w: 512, h: 128, font: 'bold 56px system-ui', planeH: 0.55 });
  label.position.set(0, 4.3, 0); g.add(label);

  g.add(new THREE.AmbientLight(0xffccaa, 0.55));
  const spot = new THREE.SpotLight(0xffaa66, 5.5, 28, 0.55, 0.4);
  spot.position.set(-3.6, 3.8, 2.2);
  spot.target.position.set(0, 1, 0);
  g.add(spot); g.add(spot.target);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  lamp.position.copy(spot.position); g.add(lamp);
  const fillL = new THREE.PointLight(0xff7744, 2.2, 14);
  fillL.position.set(2.5, 3.2, 2.5); g.add(fillL);

  const b1 = createBlobBot('#ef233c', 'working'); b1.position.set(1.5, 0.45, 1.3); g.add(b1);
  const b2 = createBlobBot('#fee440', 'waiting'); b2.position.set(-1.3, 0.45, 1.9); g.add(b2);

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
      ud.bodyMat.emissiveIntensity = 0.04;
      ud.glowLight.intensity = 0.04;
      ud.disc.material.opacity = 0.02;
      group.traverse((c) => {
        if (c.isMesh && c.material && !c.material.map && c !== ud.disc) {
          c.material.transparent = true;
          c.material.opacity = 0.22;
        }
      });
    } else {
      ud.bodyMat.emissiveIntensity = bot.status === 'idle' ? 0.2 : 0.95;
      ud.glowLight.intensity = bot.status === 'working' ? 2.2 : bot.status === 'waiting' ? 1.1 : 0.25;
      ud.disc.material.opacity = bot.status === 'idle' ? 0.08 : 0.4;
      group.traverse((c) => {
        if (c.isMesh && c.material && !c.material.map && c !== ud.disc) {
          c.material.opacity = 1;
          c.material.transparent = false;
        }
      });
      ud.disc.material.transparent = true;
      ud.disc.material.opacity = bot.status === 'idle' ? 0.08 : 0.4;
    }
  });
}

function applyEclipse(on) {
  eclipse = on;
  scene.background = new THREE.Color(on ? 0x140308 : 0x03050c);
  scene.fog = new THREE.FogExp2(on ? 0x140308 : 0x03050c, on ? 0.014 : 0.01);
  hemi.color.set(on ? 0xff8866 : 0xb8c8ff);
  hemi.groundColor.set(on ? 0x2a0a0c : 0x2a2030);
  hemi.intensity = on ? 0.35 : 0.65;
  key.color.set(on ? 0xff6644 : 0xfff2d6);
  key.intensity = on ? 0.65 : 1.4;
  bloomPass.strength = on ? 0.85 : 0.65;
  renderer.toneMappingExposure = on ? 0.8 : 1.15;
  if (sunMesh) sunMesh.visible = !on;
  if (starsPts) starsPts.material.opacity = on ? 0.35 : 0.9;
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

function flyToOverview() {
  viewMode = 'overview'; activeFloorNum = null;
  if (chamberGroup) chamberGroup.visible = false;
  if (floorsRoot) floorsRoot.visible = true;
  if (rockRoot) rockRoot.visible = true;
  if (rocketGroup) rocketGroup.visible = true;
  if (signMesh) signMesh.visible = true;
  setFloorVisibility(null);
  scene.fog.density = eclipse ? 0.014 : 0.01;
  startCamTween(new THREE.Vector3(20, 16, 20), new THREE.Vector3(0, -3, 0), 1.0);
  updateToastDefault(); updateFloorPicker(); hideApprove(); closeBotPanel();
}

function setFloorVisibility(activeNum) {
  if (!floorsRoot) return;
  floorsRoot.children.forEach((ch) => {
    if (ch.userData && ch.userData.floorNum != null) {
      ch.visible = activeNum == null || ch.userData.floorNum === activeNum;
    } else {
      ch.visible = activeNum == null; // elevator only in overview
    }
  });
}

function flyToFloor(num) {
  viewMode = 'floor'; activeFloorNum = num;
  if (chamberGroup) chamberGroup.visible = false;
  if (floorsRoot) floorsRoot.visible = true;
  if (rockRoot) rockRoot.visible = false;
  if (rocketGroup) rocketGroup.visible = false;
  if (signMesh) signMesh.visible = false;
  setFloorVisibility(num);
  scene.fog.density = eclipse ? 0.014 : 0.01;
  const fi = DATA.floors.findIndex((f) => f.num === num);
  const y = floorY(fi) + 0.6;
  startCamTween(new THREE.Vector3(7.5, y + 5.5, 8.5), new THREE.Vector3(0, y + 0.4, 0), 2.8, 1.15);
  const floor = DATA.floors.find((f) => f.num === num);
  setToast(floor.name, floor.depthLabel + ' · ' + floor.bots.length + ' בוטים');
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
  startCamTween(new THREE.Vector3(6.5, -13.2, 7.5), new THREE.Vector3(0, -14.8, 0), 2.4, 1.2);
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
  setToast(t.title, t.body);
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
  rocketGroup = makeRocket(); rocketGroup.position.set(-4.2, 1.55, -2.0); scene.add(rocketGroup);
  signMesh = makeTextSprite(data.sign || 'OREN · MOON BASE', { w: 1024, h: 128, font: 'bold 70px system-ui', planeH: 1.0 });
  signMesh.position.set(1.8, 2.9, -4.6);
  signMesh.rotation.y = 0.35;
  scene.add(signMesh);
  // restore view visibility
  if (viewMode === 'chamber') {
    chamberGroup.visible = true; floorsRoot.visible = false; rockRoot.visible = false;
    rocketGroup.visible = false; signMesh.visible = false;
  }
  styleBotsForEclipse(eclipse);
}

async function init() {
  addStars();
  earthMesh = makeEarth();
  sunMesh = makeSun();
  DATA = await (await fetch('./data.json')).json();
  rebuildScene(DATA);

  document.getElementById('workingPill').textContent = `● ${DATA.workingCount} עובדים`;
  document.getElementById('waitingPill').textContent = `● ${DATA.waitingCount} מחכים`;

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
    group.position.y = ud.baseY + Math.sin(t * 2.8 + ud.phase) * 0.07;
  });
  if (elevatorCar) {
    const h = FLOOR_H * 5;
    elevatorCar.position.y = 1.2 + ((Math.sin(t * 0.35) + 1) / 2) * (h - 2);
  }
  if (rocketGroup) {
    rocketGroup.position.y = 1.55 + Math.sin(t * 1.4) * 0.08;
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
    monolithMesh.material.emissiveIntensity = (0.3 + 0.7 * Math.abs(Math.sin(t * 20))) * 2.5;
    monolithMesh.material.emissive.set(0xff4422);
  } else if (monolithMesh) {
    monolithMesh.material.emissiveIntensity = 0.25;
    monolithMesh.material.emissive.set(0x111118);
  }
  composer.render();
}

init().catch((err) => {
  console.error(err);
  document.getElementById('toastTitle').textContent = 'שגיאה';
  document.getElementById('toastBody').textContent = String(err);
});
