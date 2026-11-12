import * as THREE from 'three';
import { createInstancedLayer } from './blocks';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

function hash2(x, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x, z, seed) {
  return valueNoise(x, z, seed) * 0.65 + valueNoise(x * 2.1, z * 2.1, seed + 17) * 0.35;
}

/** 水面所在方块层（方块坐标） */
const WATER_LEVEL = -3;

/**
 * 小型体素岛屿地形。
 *
 * 中心平坦（树根处 y=0），向外有轻微起伏，边缘逐渐沉入水面。
 * 地表为草方块，水边为沙子，地下为泥土和石头。
 */
export class VoxelTerrain extends THREE.Group {
  constructor() {
    super();
    this.name = 'VoxelTerrain';

    this.options = {
      blockSize: 1,
      radius: 48,
      height: 2.5,
      seed: 7,
      water: true,
    };

    this.blockLayers = [];
    this.blockCount = 0;
    this.counts = { grass: 0, dirt: 0, stone: 0, sand: 0, water: 0 };
  }

  /**
   * 重建地形。传入部分参数即可增量修改。
   * @param {Partial<{blockSize:number, radius:number, height:number, seed:number, water:boolean}>} options
   */
  rebuild(options = {}) {
    Object.assign(this.options, options);
    this.disposeLayers();

    const { blockSize: bs, radius, height, seed, water } = this.options;
    const oceanRadius = radius + 16;

    /** @type {Map<string, {ix:number, iy:number, iz:number, type:string}>} */
    const map = new Map();
    const counts = { grass: 0, dirt: 0, stone: 0, sand: 0, water: 0 };

    const add = (ix, iy, iz, type) => {
      const key = `${ix},${iy},${iz}`;
      if (map.has(key)) return;
      map.set(key, { ix, iy, iz, type });
      counts[type]++;
    };

    for (let ix = -oceanRadius; ix <= oceanRadius; ix++) {
      for (let iz = -oceanRadius; iz <= oceanRadius; iz++) {
        const x = (ix + 0.5) * bs;
        const z = (iz + 0.5) * bs;
        const r = Math.hypot(x, z) / bs;

        if (r > oceanRadius) continue;

        // 岛外：只有一层水面
        if (r > radius) {
          if (water) add(ix, WATER_LEVEL, iz, 'water');
          continue;
        }

        const surface = this.#surfaceHeight(x, z, bs, radius, height, seed);

        if (water && surface < WATER_LEVEL) {
          add(ix, WATER_LEVEL, iz, 'water');
        }

        const underwater = surface < WATER_LEVEL;
        const beach = surface < WATER_LEVEL + 2;
        const topType = underwater || beach ? 'sand' : 'grass';

        const depth = 5;
        for (let y = surface; y >= surface - depth && y >= -14; y--) {
          let type;
          if (y === surface) {
            type = topType;
          } else if (y > surface - 3) {
            type = topType === 'grass' ? 'dirt' : 'sand';
          } else {
            type = 'stone';
          }
          add(ix, y, iz, type);
        }
      }
    }

    const byType = new Map();
    for (const block of map.values()) {
      if (!byType.has(block.type)) byType.set(block.type, []);
      byType.get(block.type).push(block);
    }

    for (const [type, list] of byType) {
      const mesh = createInstancedLayer(type, list, {
        scale: bs,
        usage: 'terrain',
        castShadow: false,
        receiveShadow: type !== 'water',
        colorVariation: type === 'water' ? 0 : 0.1,
      });
      if (type === 'water') mesh.renderOrder = 1;
      this.add(mesh);
      this.blockLayers.push(mesh);
    }

    // 让中心地表的顶面正好位于 y=0，树木根部与地面齐平
    this.position.y = -bs;

    this.blockCount = map.size;
    this.counts = counts;
  }

  /**
   * 返回地表方块层的 y 索引（方块的顶面 = y * blockSize）。
   */
  #surfaceHeight(x, z, bs, radius, height, seed) {
    const r = Math.hypot(x, z) / (radius * bs);
    const flat = smoothstep(0, 0.16, r);
    const edge = smoothstep(0.62, 1, r);
    const noise = (fbm(x * 0.045, z * 0.045, seed) - 0.5) * 2;
    return Math.round(noise * height * flat - edge * edge * 12);
  }

  disposeLayers() {
    for (const mesh of this.blockLayers) {
      this.remove(mesh);
      mesh.dispose();
      mesh.geometry.dispose();
    }
    this.blockLayers = [];
    this.blockCount = 0;
    this.counts = { grass: 0, dirt: 0, stone: 0, sand: 0, water: 0 };
  }
}
