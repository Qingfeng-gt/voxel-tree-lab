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
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();

const DEFAULT_DEFINITIONS = [
  { id: 'log', label: '木头', color: 0x7a5230 },
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
  return def?.model?.geometry ?? BOX_GEOMETRY;
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
        case 'log':
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

/**
 * 给材质注入生长动画：每个实例带一个 aGrow（出现时间 0~1），
 * uProgress 到达该时间后实例从 0 平滑放大到 1。
 */
function attachGrowthShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uProgress = { value: 0 };
    shader.uniforms.uPopWindow = { value: 0.035 };
    shader.vertexShader =
      'attribute float aGrow;\nuniform float uProgress;\nuniform float uPopWindow;\n' +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float voxelGrow = smoothstep(aGrow, aGrow + uPopWindow, uProgress);
       transformed *= voxelGrow;`,
    );
    material.userData.growthShader = shader;
  };
  material.customProgramCacheKey = () => 'voxel-growth';
}

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
  if (usage === 'tree') attachGrowthShader(material);

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
 * 把一组方块坐标创建成一个 InstancedMesh。
 * @param {string} id 方块类型
 * @param {{ix:number, iy:number, iz:number}[]} blocks 方块整数坐标
 * @param {object} options
 * @param {number} [options.scale] 方块世界尺寸
 * @param {'tree'|'terrain'|'export'} [options.usage]
 * @param {number[]|null} [options.growthTimes] 与 blocks 对应的出现时间（0~1）
 * @param {number} [options.colorVariation] 每个方块的亮度随机扰动幅度（0~1）
 */
export function createInstancedLayer(id, blocks, {
  scale = 1,
  usage = 'terrain',
  castShadow = true,
  receiveShadow = true,
  growthTimes = null,
  colorVariation = 0,
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
    dummy.position.set((b.ix + 0.5) * scale, (b.iy + 0.5) * scale, (b.iz + 0.5) * scale);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  if (growthTimes) {
    geometry.setAttribute(
      'aGrow',
      new THREE.InstancedBufferAttribute(new Float32Array(growthTimes), 1),
    );
  }

  // 逐方块亮度扰动，打散纹理重复产生的条纹
  if (colorVariation > 0) {
    const color = new THREE.Color();
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      let h = Math.imul(b.ix + 0x1234, 374761393) ^
              Math.imul(b.iy + 0x2345, 668265263) ^
              Math.imul(b.iz + 0x3456, 1442695041);
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
