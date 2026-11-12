import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 方块类型注册表。
 *
 * 每种方块都可以自定义：
 *  - color：颜色（材质会乘以程序化像素纹理）
 *  - texture：自定义贴图（通过导入图片设置）
 *  - model：自定义 GLB 模型（会被归一化到 1×1×1 的方块空间）
 *
 * 一棵树默认只使用 log（木头）和 leaves（树叶）两种方块，
 * 地形使用 grass / dirt / stone / sand / water。
 */

const BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
// 树叶使用多面体叶团模型，而不是立方体
const LEAF_GEOMETRY = new THREE.IcosahedronGeometry(0.5, 1);
// 轻微打乱顶点，避免所有叶团都长得一模一样
{
  const pos = LEAF_GEOMETRY.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    const f = 0.92 + (n - Math.floor(n)) * 0.16;
    pos.setXYZ(i, x * f, y * f, z * f);
  }
  LEAF_GEOMETRY.computeVertexNormals();
}
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();

const DEFAULT_DEFINITIONS = [
  { id: 'trunk', label: '树干', color: 0x6e4a2f },
  { id: 'branch', label: '树枝', color: 0x8b5e3a },
  { id: 'twig', label: '细枝', color: 0xb08052 },
  { id: 'leaves', label: '树叶', color: 0x4f8b3a },
  { id: 'grass', label: '草方块', color: 0x6cae46 },
  { id: 'dirt', label: '泥土', color: 0x8a6242 },
  { id: 'stone', label: '石头', color: 0x8f8f8f },
  { id: 'sand', label: '沙子', color: 0xd8c48a },
  { id: 'water', label: '水', color: 0x3f7fbf },
];

/** @type {Map<string, {id: string, label: string, color: number, texture: THREE.Texture|null, textureUrl: string|null, model: {geometry: THREE.BufferGeometry, material: THREE.Material|null, name: string}|null}>} */
const registry = new Map();

/**
 * 材质缓存。树木使用带生长动画的材质（tree），
 * 地形与导出使用普通材质（terrain / export）。
 */
const materials = {
  tree: new Map(),
  terrain: new Map(),
  export: new Map(),
};

const proceduralTextures = new Map();

function initRegistry() {
  if (registry.size > 0) return;
  for (const def of DEFAULT_DEFINITIONS) {
    registry.set(def.id, {
      ...def,
      defaultColor: def.color,
      texture: null,
      textureUrl: null,
      model: null,
    });
  }
}
initRegistry();

export function getBlockDefinitions() {
  return [...registry.values()];
}

export function getBlockDefinition(id) {
  return registry.get(id);
}

export function getBlockGeometry(id) {
  const def = registry.get(id);
  if (def?.model?.geometry) return def.model.geometry;
  if (id === 'leaves') return LEAF_GEOMETRY;
  return BOX_GEOMETRY;
}

// ============================================================================
// 程序化像素纹理
// ============================================================================

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** 世界坐标 → 0~1 的确定性随机数 */
function hash01(x, y, z) {
  let h = Math.imul(Math.round(x * 100) + 0x1234, 374761393) ^
          Math.imul(Math.round(y * 100) + 0x2345, 668265263) ^
          Math.imul(Math.round(z * 100) + 0x3456, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 生成 16×16 的灰度像素纹理，最终颜色由材质 color 着色。
 * 不同方块类型使用不同的花纹，保证体素风格。
 */
function createProceduralTexture(id) {
  if (proceduralTextures.has(id)) return proceduralTextures.get(id);

  const size = 16;
  const data = new Uint8Array(size * size * 4);
  const rand = mulberry32(hashString(id) || 1);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = rand();
      let shade;
      switch (id) {
        case 'trunk':
        case 'branch':
        case 'twig':
          shade = 0.68 + 0.24 * r;
          if ((x + Math.floor(y / 4)) % 6 === 0) shade -= 0.14;
          if (r > 0.94) shade -= 0.18;
          break;
        case 'leaves':
          shade = 0.58 + 0.42 * r;
          if (r < 0.14) shade *= 0.68;
          break;
        case 'grass':
          shade = 0.84 + 0.16 * r;
          if (r < 0.1) shade *= 0.9;
          break;
        case 'dirt':
          shade = 0.75 + 0.25 * r;
          if (r < 0.12) shade *= 0.86;
          break;
        case 'stone':
          shade = 0.66 + 0.34 * r;
          break;
        case 'sand':
          shade = 0.86 + 0.14 * r;
          break;
        case 'water':
          shade = 0.92 + 0.08 * r;
          break;
        default:
          shade = 0.7 + 0.3 * r;
      }
      const v = Math.max(0, Math.min(255, Math.round(shade * 255)));
      const i = (y * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  proceduralTextures.set(id, texture);
  return texture;
}

// ============================================================================
// 材质
// ============================================================================

function applyDefinitionToMaterial(id, material) {
  const def = registry.get(id);
  if (!def) return;

  if (material.color && typeof material.color.setHex === 'function') {
    material.color.setHex(def.color);
  }

  const modelMap = def.model?.material?.map ?? null;
  material.map = def.texture ?? modelMap ?? createProceduralTexture(id);

  if (id === 'water') {
    material.transparent = true;
    material.opacity = 0.82;
    material.depthWrite = false;
    material.roughness = 0.25;
    material.metalness = 0;
  } else {
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    if (material.roughness !== undefined) material.roughness = 0.95;
    if (material.metalness !== undefined) material.metalness = 0;
  }
  if (material.flatShading !== undefined) {
    material.flatShading = id === 'leaves';
  }
  material.needsUpdate = true;
}

/**
 * 获取（或创建）指定用途的方块材质。
 * @param {string} id 方块类型
 * @param {'tree'|'terrain'|'export'} usage
 */
export function getBlockMaterial(id, usage = 'terrain') {
  const cache = materials[usage] ?? materials.terrain;
  if (cache.has(id)) return cache.get(id);

  const def = registry.get(id);
  let material;
  if (def?.model?.material) {
    material = def.model.material.clone();
  } else {
    material = new THREE.MeshStandardMaterial({
      roughness: 0.95,
      metalness: 0,
      dithering: true,
    });
  }
  material.name = `${id}-${usage}`;
  material.side = THREE.FrontSide;

  applyDefinitionToMaterial(id, material);

  cache.set(id, material);
  return material;
}

/** 方块定义改变后，刷新所有已创建的材质 */
export function refreshBlockMaterials() {
  for (const cache of Object.values(materials)) {
    for (const [id, material] of cache) {
      applyDefinitionToMaterial(id, material);
    }
  }
}

// ============================================================================
// 方块定义修改
// ============================================================================

export function setBlockColor(id, color) {
  const def = registry.get(id);
  if (!def) return;
  def.color = color >>> 0;
  refreshBlockMaterials();
}

export async function setBlockTexture(id, dataUrl) {
  const def = registry.get(id);
  if (!def) return;
  def.texture?.dispose?.();
  if (!dataUrl) {
    def.texture = null;
    def.textureUrl = null;
    refreshBlockMaterials();
    return;
  }
  const texture = await textureLoader.loadAsync(dataUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  def.texture = texture;
  def.textureUrl = dataUrl;
  refreshBlockMaterials();
}

/**
 * 导入 GLB 作为方块模型。模型会被居中并等比缩放到 1×1×1。
 */
export async function setBlockModel(id, arrayBuffer, name = 'custom.glb') {
  const def = registry.get(id);
  if (!def) throw new Error(`未知方块类型: ${id}`);

  const gltf = await new Promise((resolve, reject) => {
    gltfLoader.parse(arrayBuffer, '', resolve, reject);
  });

  const meshes = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  if (meshes.length === 0) throw new Error('GLB 中没有可用的网格');

  const geometries = [];
  let material = null;
  for (const mesh of meshes) {
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    for (const attr of Object.keys(geometry.attributes)) {
      if (!['position', 'normal', 'uv'].includes(attr)) geometry.deleteAttribute(attr);
    }
    if (!Array.isArray(mesh.material) && !material) material = mesh.material;
    geometries.push(geometry);
  }

  let merged = geometries[0];
  if (geometries.length > 1) {
    try {
      merged = mergeGeometries(geometries, false);
    } catch {
      merged = geometries[0];
    }
  }

  merged.computeBoundingBox();
  const box = merged.boundingBox;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const scale = 1 / Math.max(size.x, size.y, size.z, 1e-6);
  merged.translate(-center.x, -center.y, -center.z);
  merged.scale(scale, scale, scale);
  merged.computeVertexNormals();

  def.model?.geometry?.dispose?.();
  def.model = {
    geometry: merged,
    material: material ? material.clone() : null,
    name,
  };

  // 材质若已存在，重新按新模型构建
  for (const cache of Object.values(materials)) {
    const old = cache.get(id);
    if (old) {
      old.dispose?.();
      cache.delete(id);
    }
  }
  refreshBlockMaterials();
}

export function clearBlockCustom(id) {
  const def = registry.get(id);
  if (!def) return;
  def.texture?.dispose?.();
  def.model?.geometry?.dispose?.();
  def.texture = null;
  def.textureUrl = null;
  def.model = null;
  def.color = def.defaultColor;
  for (const cache of Object.values(materials)) {
    const old = cache.get(id);
    if (old) {
      old.dispose?.();
      cache.delete(id);
    }
  }
  refreshBlockMaterials();
}

// ============================================================================
// JSON 配置
// ============================================================================

export function exportBlockConfig() {
  const blocks = {};
  for (const def of registry.values()) {
    blocks[def.id] = {
      color: def.color,
      texture: def.textureUrl ?? null,
      model: def.model?.name ?? null,
    };
  }
  return { version: 1, blocks };
}

export async function importBlockConfig(config) {
  if (!config?.blocks) throw new Error('无效的方块配置：缺少 blocks 字段');
  for (const [id, cfg] of Object.entries(config.blocks)) {
    const def = registry.get(id);
    if (!def) continue;
    if (typeof cfg.color === 'number') def.color = cfg.color >>> 0;
    if (cfg.texture !== undefined) {
      await setBlockTexture(id, cfg.texture || null);
    }
  }
  refreshBlockMaterials();
}

// ============================================================================
// 实例化渲染
// ============================================================================

/**
 * 把一组方块创建成一个 InstancedMesh。
 *
 * 方块可以是：
 *  - 世界坐标 {x, y, z, size, type}：直接使用（树木使用不同尺寸的方块）
 *  - 网格坐标 {ix, iy, iz}：按 scale 计算中心（地形使用）
 *
 * @param {string} id 方块类型
 * @param {object[]} blocks 方块列表
 * @param {object} options
 * @param {number} [options.scale] 网格坐标的方块世界尺寸
 * @param {'tree'|'terrain'|'export'} [options.usage]
 * @param {number} [options.colorVariation] 每个方块的亮度随机扰动幅度（0~1）
 * @param {boolean} [options.randomRotation] 每个实例随机旋转（用于叶团）
 * @param {number} [options.sizeVariation] 每个实例的尺寸随机扰动幅度（0~1）
 */
export function createInstancedLayer(id, blocks, {
  scale = 1,
  usage = 'terrain',
  castShadow = true,
  receiveShadow = true,
  colorVariation = 0,
  randomRotation = false,
  sizeVariation = 0,
} = {}) {
  const geometry = getBlockGeometry(id).clone();
  const material = getBlockMaterial(id, usage);
  const mesh = new THREE.InstancedMesh(geometry, material, blocks.length);
  mesh.name = `${id}-blocks`;
  mesh.frustumCulled = false;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const px = b.x ?? (b.ix + 0.5) * scale;
    const py = b.y ?? (b.iy + 0.5) * scale;
    const pz = b.z ?? (b.iz + 0.5) * scale;
    const size = b.size ?? scale;
    dummy.position.set(px, py, pz);

    if (randomRotation) {
      dummy.rotation.set(
        hash01(px, py, pz) * Math.PI * 2,
        hash01(pz, px, py) * Math.PI * 2,
        hash01(py, pz, px) * Math.PI * 2,
      );
    } else {
      dummy.rotation.set(0, 0, 0);
    }

    const variance = sizeVariation > 0
      ? 1 + (hash01(py, pz, px) - 0.5) * sizeVariation
      : 1;
    dummy.scale.setScalar(size * variance);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  // 逐方块亮度扰动，打散纹理重复产生的条纹
  if (colorVariation > 0) {
    const color = new THREE.Color();
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const gx = Math.round((b.x ?? (b.ix + 0.5) * scale) * 16);
      const gy = Math.round((b.y ?? (b.iy + 0.5) * scale) * 16);
      const gz = Math.round((b.z ?? (b.iz + 0.5) * scale) * 16);
      let h = Math.imul(gx + 0x1234, 374761393) ^
              Math.imul(gy + 0x2345, 668265263) ^
              Math.imul(gz + 0x3456, 1442695041);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      const t = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
      const k = 1 - colorVariation * 0.5 + colorVariation * t;
      color.setRGB(k, k, k);
      mesh.setColorAt(i, color);
    }
    mesh.instanceColor.needsUpdate = true;
  }

  return mesh;
}

export { BOX_GEOMETRY };
