import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp } from './core.js';

/* ============================================================
   二、Three.js 场景
   ============================================================ */

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe2f2, 60, 190);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(14.5, 10.5, 19);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.5, 6.2, 0.5);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 5;
controls.maxDistance = 60;
controls.minPolarAngle = 0.18;
controls.maxPolarAngle = Math.PI * 0.495;
controls.enablePan = false;
controls.update();

/* ---------- 天空 ---------- */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(230, 32, 18),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x79b0f5) },
      midColor: { value: new THREE.Color(0xd8e9f8) },
      bottomColor: { value: new THREE.Color(0xaec6d8) }
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vWorld = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      void main() {
        float h = normalize(vWorld).y;
        vec3 c = h > 0.0
          ? mix(midColor, topColor, smoothstep(0.0, 0.6, h))
          : mix(midColor, bottomColor, smoothstep(0.0, -0.25, h));
        gl_FragColor = vec4(c, 1.0);
      }
    `
  })
);
sky.frustumCulled = false;
scene.add(sky);

/* ---------- 光照 ---------- */
const hemi = new THREE.HemisphereLight(0xe2f1ff, 0x586b42, 1.35);
scene.add(hemi);

const ambient = new THREE.AmbientLight(0xffffff, 0.32);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff4de, 2.0);
sun.position.set(16, 25, 10);
sun.target.position.set(0, 6, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 26;
sun.shadow.camera.bottom = -8;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.025;
scene.add(sun);
scene.add(sun.target);

const fill = new THREE.DirectionalLight(0xbcd6e8, 0.35);
fill.position.set(-14, 8, -12);
scene.add(fill);

/* ---------- 像素贴图（Minecraft 风格） ---------- */
function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pixelTexture(size, painter) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  painter(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

function pixelShade(hex, factor) {
  const c = new THREE.Color(hex).multiplyScalar(clamp(factor, 0, 2));
  return '#' + c.getHexString();
}

/* 树皮：竖纹 + 随机噪点；白桦有横向深色斑纹 */
function makeBarkTexture(spec) {
  return pixelTexture(16, (ctx, size) => {
    const rand = mulberry32(spec.seed * 97 + 13);
    const base = new THREE.Color(spec.bark);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let factor = 0.80 + rand() * 0.32;
        factor += Math.sin((x + spec.seed) * 1.9 + Math.sin(y * 0.8)) * 0.06;
        if (rand() < 0.05) factor *= 0.72;
        ctx.fillStyle = '#' + base.clone().multiplyScalar(clamp(factor, 0.35, 1.35)).getHexString();
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 5; i++) {
      const x = (rand() * size) | 0;
      const y0 = (rand() * size) | 0;
      const len = 2 + ((rand() * 6) | 0);
      ctx.fillStyle = pixelShade(spec.bark, 0.55);
      for (let y = y0; y < Math.min(size, y0 + len); y++) ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
    if (spec.id === 'birch') {
      ctx.fillStyle = '#544a3f';
      for (let i = 0; i < 7; i++) {
        const y = (rand() * size) | 0;
        const x0 = (rand() * size) | 0;
        const len = 1 + ((rand() * 4) | 0);
        for (let x = x0; x < Math.min(size, x0 + len); x++) ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

/* 年轮截面 */
function makeRingsTexture(spec) {
  return pixelTexture(16, (ctx, size) => {
    const rand = mulberry32(spec.seed * 31 + 7);
    const base = new THREE.Color(spec.bark);
    const light = base.clone().lerp(new THREE.Color(0xd9b07a), 0.55);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        const c = (Math.floor(d) % 3 === 0 ? light : base).clone().multiplyScalar(0.85 + rand() * 0.25);
        ctx.fillStyle = '#' + c.getHexString();
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = pixelShade(spec.bark, 0.45);
    ctx.fillRect(7, 7, 2, 2);
  });
}

/* 树叶：灰度像素图，实际颜色由每个叶方块的实例颜色控制 */
function makeLeafTexture() {
  return pixelTexture(16, (ctx, size) => {
    const rand = mulberry32(9182);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (rand() < 0.06) continue; // 少量透明孔
        let v = 0.94 + rand() * 0.06;
        if (rand() < 0.10) v *= 0.90;
        if (rand() < 0.03) v *= 0.80;
        const l = Math.round(255 * v);
        ctx.fillStyle = 'rgb(' + l + ',' + l + ',' + l + ')';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = 'rgba(80,80,80,0.75)';
    for (let i = 0; i < 4; i++) {
      const x = (rand() * size) | 0;
      const y = (rand() * size) | 0;
      ctx.fillRect(x, y, 1, 2 + ((rand() * 3) | 0));
    }
  });
}

/* 草方块顶面：4×4 个方块拼成 64×64，重复后仍有像素变化 */
function makeGrassTexture() {
  return pixelTexture(64, (ctx, size) => {
    const rand = mulberry32(4242);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const tile = (((x >> 4) * 7 + (y >> 4) * 13) % 5) * 0.03;
        let v = 0.76 + rand() * 0.26 + tile;
        if (rand() < 0.08) v *= 0.72;
        if (x % 16 === 0 || y % 16 === 0) v *= 0.80; // 方块接缝
        const c = new THREE.Color(0x6f9a4a).multiplyScalar(v);
        ctx.fillStyle = '#' + c.getHexString();
        ctx.fillRect(x, y, 1, 1);
      }
    }
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = rand() < 0.5 ? '#5d7f3c' : '#8fb462';
      ctx.fillRect((rand() * size) | 0, (rand() * size) | 0, 1, 1);
    }
  });
}

/* 根土方块：泥土 + 树根 */
function makeDirtTexture() {
  return pixelTexture(16, (ctx, size) => {
    const rand = mulberry32(771);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v = 0.74 + rand() * 0.30;
        if (rand() < 0.10) v *= 0.72;
        const c = new THREE.Color(0x6d4b31).multiplyScalar(v);
        ctx.fillStyle = '#' + c.getHexString();
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.strokeStyle = '#46301f';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const x = (rand() * size) | 0;
      ctx.moveTo(x, size);
      ctx.lineTo(x + (rand() * 5 - 2), (size * 0.5) | 0);
      ctx.stroke();
    }
  });
}

const leafTex = makeLeafTexture();

/* ---------- 地面 / 根土 / 云 ---------- */
const groundTex = makeGrassTexture();
groundTex.repeat.set(60, 60);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 240),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const dirtTex = makeDirtTexture();
const soil = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1 })
);
soil.position.set(0.5, 0.5, 0.5);
soil.castShadow = true;
soil.receiveShadow = true;
scene.add(soil);

/* 方块云 */
const cloudMat = new THREE.MeshBasicMaterial({
  color: 0xffffff, transparent: true, opacity: 0.9, fog: false
});
const cloudMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cloudMat, 26);
cloudMesh.frustumCulled = false;
cloudMesh.count = 26;
scene.add(cloudMesh);
const clouds = [];
for (let i = 0; i < 26; i++) {
  clouds.push({
    x: (Math.random() - 0.5) * 160,
    y: 24 + Math.random() * 12,
    z: (Math.random() - 0.5) * 160,
    w: 6 + Math.random() * 12,
    h: 0.9 + Math.random() * 1.4,
    d: 4 + Math.random() * 8,
    speed: 0.25 + Math.random() * 0.5
  });
}
const _cloudObj = new THREE.Object3D();
function updateClouds(dt) {
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    c.x += c.speed * dt;
    if (c.x > 90) c.x = -90;
    _cloudObj.position.set(c.x, c.y, c.z);
    _cloudObj.rotation.set(0, 0, 0);
    _cloudObj.scale.set(c.w, c.h, c.d);
    _cloudObj.updateMatrix();
    cloudMesh.setMatrixAt(i, _cloudObj.matrix);
  }
  cloudMesh.instanceMatrix.needsUpdate = true;
}
updateClouds(0);


export {
  renderer, scene, camera, controls,
  leafTex, updateClouds,
  makeBarkTexture, makeRingsTexture
};
