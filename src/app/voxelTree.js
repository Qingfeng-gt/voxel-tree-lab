import * as THREE from 'three';
import RNG from '../lib/rng';
import {
  createInstancedLayer,
  getBlockGeometry,
  getBlockMaterial,
} from './blocks';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * 五个生长阶段。每个阶段重新构建一棵完整的小树，
 * 保证任何阶段看起来都是一棵树，而不是“半棵树”。
 *
 * trunkCut：树干保留比例（相对树干自然高度）
 * maxLevel：包含的最高分枝层级
 * tuftRadius/tuftCount：该阶段在枝头生成的叶簇大小与数量
 * useLeaves：使用原始叶片骨架（最终成熟阶段）
 */
export const GROWTH_STAGES = [
  { name: '树苗', trunkCut: 0.22, maxLevel: 0, tuftRadius: 1.1, tuftCount: 9 },
  { name: '幼树', trunkCut: 0.42, maxLevel: 1, tuftRadius: 1.15, tuftCount: 8 },
  { name: '小树', trunkCut: 0.78, maxLevel: 1, tuftRadius: 1.3, tuftCount: 8 },
  { name: '成树', trunkCut: 1.0, maxLevel: 2, tuftRadius: 1.35, tuftCount: 7 },
  { name: '成熟', trunkCut: 1.0, maxLevel: Infinity, useLeaves: true },
];

// 树干 / 树枝 / 细枝 / 树叶 的方块尺寸（相对一个方块）
const BLOCK_SIZES = {
  trunk: 1.0,
  branch: 0.5,
  twig: 0.35,
  leaves: 0.8,
};

/**
 * 把 EZ-Tree 生成的树枝骨架转换成由不同尺寸方块组成的体素树，
 * 并按阶段（树苗 → 成熟）展示。
 */
export class VoxelTree extends THREE.Group {
  constructor() {
    super();
    this.name = 'VoxelTree';

    this.blockSize = 1;
    this.treeScale = 0.1;
    this.canopyStart = 0.6;
    this.leafDensity = 1;
    this.stage = GROWTH_STAGES.length - 1;
    this.maxStage = GROWTH_STAGES.length - 1;

    /** @type {{id: string, mesh: THREE.InstancedMesh}[]} */
    this.blockLayers = [];
    /** @type {{type: string, x: number, y: number, z: number, size: number}[]} */
    this.blockList = [];
    this.counts = { total: 0, trunk: 0, branch: 0, twig: 0, leaves: 0 };
    this.heightBlocks = 0;

    this._tree = null;
    this._vector = new THREE.Vector3();
    this._segment = new THREE.Vector3();
    this._closest = new THREE.Vector3();
    this._offset = new THREE.Vector3();
    this._pointA = new THREE.Vector3();
    this._pointB = new THREE.Vector3();
  }

  /**
   * 根据树的骨架重建指定阶段的体素。
   * @param {import('@dgreenheck/ez-tree').Tree} tree
   * @param {{blockSize?: number, treeScale?: number, canopyStart?: number, leafDensity?: number, stage?: number}} options
   */
  rebuild(tree, {
    blockSize = this.blockSize,
    treeScale = this.treeScale,
    canopyStart = this.canopyStart,
    leafDensity = this.leafDensity,
    stage = this.stage,
  } = {}) {
    this._tree = tree;
    this.blockSize = blockSize;
    this.treeScale = treeScale;
    this.canopyStart = canopyStart;
    this.leafDensity = leafDensity;
    this.stage = Math.max(0, Math.min(this.maxStage, Math.round(stage)));
    this.#build();
  }

  /** 切换到指定阶段（不重新生成树木骨架） */
  setStage(stage) {
    const next = Math.max(0, Math.min(this.maxStage, Math.round(stage)));
    if (next === this.stage) return;
    this.stage = next;
    this.#build();
  }

  get stageName() {
    return GROWTH_STAGES[this.stage]?.name ?? '';
  }

  #build() {
    this.disposeLayers();

    const tree = this._tree;
    const skeleton = tree?.skeleton;
    if (!skeleton) return;

    const bs = this.blockSize;
    const scale = this.treeScale;
    const stageDef = GROWTH_STAGES[this.stage];
    const offsetX = bs / 2;
    const offsetZ = bs / 2;
    const branchStep = bs * 0.5;

    const map = new Map();
    const rng = new RNG(((tree.options.seed >>> 0) ^ 0x51ed270b) >>> 0);

    // 树干自然高度（缩放后）
    let trunkHeight = 0;
    for (const branch of skeleton.branches) {
      if ((branch.level ?? 0) !== 0) continue;
      for (const section of branch.sections) {
        trunkHeight = Math.max(trunkHeight, section.origin.y * scale);
      }
    }
    const cutY = stageDef.trunkCut >= 1
      ? Infinity
      : trunkHeight * stageDef.trunkCut;

    // ---------------------------------------------------------------------
    // 树干（完整大小的方块）
    // ---------------------------------------------------------------------
    const trunkTop = new THREE.Vector3(offsetX, 0, offsetZ);
    for (const branch of skeleton.branches) {
      if ((branch.level ?? 0) !== 0) continue;
      const sections = branch.sections;
      for (let i = 0; i < sections.length - 1; i++) {
        const a = this._pointA.copy(sections[i].origin).multiplyScalar(scale);
        const b = this._pointB.copy(sections[i + 1].origin).multiplyScalar(scale);
        a.x += offsetX; a.z += offsetZ;
        b.x += offsetX; b.z += offsetZ;

        if (a.y >= cutY) break;

        let end = b;
        if (b.y > cutY) {
          const t = (cutY - a.y) / ((b.y - a.y) || 1);
          end = a.clone().lerp(b, clamp01(t));
        }

        this.#voxelizeTrunk(
          map,
          a,
          end,
          sections[i].radius * scale,
          sections[i + 1].radius * scale,
          bs,
        );
        trunkTop.copy(end);
      }
    }

    // ---------------------------------------------------------------------
    // 树枝 / 细枝（半格大小的小方块）
    // ---------------------------------------------------------------------
    const tuftAnchors = [];
    for (const branch of skeleton.branches) {
      const level = branch.level ?? 0;
      if (level === 0) continue;
      if (level > stageDef.maxLevel) continue;

      const sections = branch.sections;
      const attachY = sections[0].origin.y * scale;
      if (cutY !== Infinity && attachY > cutY) continue;

      const type = level === 1 ? 'branch' : 'twig';
      for (let i = 0; i < sections.length - 1; i++) {
        const a = this._pointA.copy(sections[i].origin).multiplyScalar(scale);
        const b = this._pointB.copy(sections[i + 1].origin).multiplyScalar(scale);
        a.x += offsetX; a.z += offsetZ;
        b.x += offsetX; b.z += offsetZ;

        const radiusA = sections[i].radius * scale;
        const radiusB = sections[i + 1].radius * scale;
        if (Math.max(radiusA, radiusB) <= branchStep * 0.75) {
          this.#voxelizeLineNode(map, a, b, branchStep, type);
        } else {
          this.#voxelizeCylinderNode(map, a, b, radiusA, radiusB, branchStep, type);
        }
      }

      if (level === stageDef.maxLevel) {
        tuftAnchors.push(this._pointB.clone());
      }
    }

    // ---------------------------------------------------------------------
    // 树叶
    // ---------------------------------------------------------------------
    if (stageDef.useLeaves) {
      let maxLeafY = 0;
      for (const leaf of skeleton.leaves) {
        maxLeafY = Math.max(maxLeafY, leaf.origin.y * scale);
      }
      const minLeafY = maxLeafY * this.canopyStart;

      const leafOrigin = new THREE.Vector3();
      for (const leaf of skeleton.leaves) {
        leafOrigin.copy(leaf.origin).multiplyScalar(scale);
        if (leafOrigin.y < minLeafY) continue;
        leafOrigin.x += offsetX;
        leafOrigin.z += offsetZ;

        const radius = Math.max(bs * 1.1, leaf.size * scale * 0.6);
        const count = Math.max(1, Math.min(
          12,
          Math.round((radius / bs) * (radius / bs) * 2.8 * this.leafDensity),
        ));
        this.#scatterLeaves(map, leafOrigin, radius, count, bs, rng);
      }

      // 用椭球裁掉四角，形成圆润的树冠轮廓
      this.#roundCanopy(map, bs);
    } else {
      // 早期阶段：树干顶端和每个末级枝头各来一簇叶子
      this.#scatterLeaves(
        map,
        trunkTop,
        stageDef.tuftRadius * bs,
        stageDef.tuftCount,
        bs,
        rng,
      );
      for (const anchor of tuftAnchors) {
        this.#scatterLeaves(
          map,
          anchor,
          stageDef.tuftRadius * bs,
          stageDef.tuftCount,
          bs,
          rng,
        );
      }
    }

    // ---------------------------------------------------------------------
    // 构建实例化网格
    // ---------------------------------------------------------------------
    const blocks = [...map.values()];
    const byType = new Map();
    for (const block of blocks) {
      if (!byType.has(block.type)) byType.set(block.type, []);
      byType.get(block.type).push(block);
    }

    const order = ['trunk', 'branch', 'twig', 'leaves'];
    for (const type of order) {
      const list = byType.get(type);
      if (!list || list.length === 0) continue;
      const mesh = createInstancedLayer(type, list, {
        usage: 'tree',
        castShadow: true,
        receiveShadow: true,
        colorVariation: type === 'leaves' ? 0.12 : 0.08,
      });
      this.add(mesh);
      this.blockLayers.push({ id: type, mesh });
    }

    this.blockList = blocks;
    this.counts = {
      total: blocks.length,
      trunk: byType.get('trunk')?.length ?? 0,
      branch: byType.get('branch')?.length ?? 0,
      twig: byType.get('twig')?.length ?? 0,
      leaves: byType.get('leaves')?.length ?? 0,
    };

    let maxTop = 0;
    for (const block of blocks) {
      maxTop = Math.max(maxTop, block.y + block.size / 2);
    }
    this.heightBlocks = Math.max(1, Math.round(maxTop / bs));
  }

  // -------------------------------------------------------------------------
  // 体素化辅助
  // -------------------------------------------------------------------------

  /** 在方块网格上记录一个方块（中心对齐到单元格中心） */
  #addCellBlock(map, type, x, y, z, size, grid) {
    const gx = Math.floor(x / grid);
    const gy = Math.floor(y / grid);
    const gz = Math.floor(z / grid);
    const key = `${type}:${gx},${gy},${gz}`;
    if (map.has(key)) return;
    map.set(key, {
      type,
      x: (gx + 0.5) * grid,
      y: (gy + 0.5) * grid,
      z: (gz + 0.5) * grid,
      size,
    });
  }

  /** 在细网格上记录一个方块（中心对齐到网格节点） */
  #addNodeBlock(map, type, x, y, z, size, grid) {
    const gx = Math.round(x / grid);
    const gy = Math.round(y / grid);
    const gz = Math.round(z / grid);
    const key = `${type}:${gx},${gy},${gz}`;
    if (map.has(key)) return;
    map.set(key, {
      type,
      x: gx * grid,
      y: gy * grid,
      z: gz * grid,
      size,
    });
  }

  /** 树干：完整大小的方块，按圆柱范围填充 */
  #voxelizeTrunk(map, originA, originB, radiusA, radiusB, bs) {
    const pad = Math.max(radiusA, radiusB) + bs;
    const minX = Math.floor((Math.min(originA.x, originB.x) - pad) / bs - 0.5);
    const maxX = Math.ceil((Math.max(originA.x, originB.x) + pad) / bs - 0.5);
    const minY = Math.floor((Math.min(originA.y, originB.y) - pad) / bs - 0.5);
    const maxY = Math.ceil((Math.max(originA.y, originB.y) + pad) / bs - 0.5);
    const minZ = Math.floor((Math.min(originA.z, originB.z) - pad) / bs - 0.5);
    const maxZ = Math.ceil((Math.max(originA.z, originB.z) + pad) / bs - 0.5);

    const segment = this._segment.subVectors(originB, originA);
    const lengthSq = segment.lengthSq();

    for (let ix = minX; ix <= maxX; ix++) {
      for (let iy = minY; iy <= maxY; iy++) {
        for (let iz = minZ; iz <= maxZ; iz++) {
          const point = this._vector.set(
            (ix + 0.5) * bs,
            (iy + 0.5) * bs,
            (iz + 0.5) * bs,
          );
          const t = lengthSq > 1e-12
            ? clamp01(
                ((point.x - originA.x) * segment.x +
                 (point.y - originA.y) * segment.y +
                 (point.z - originA.z) * segment.z) / lengthSq,
              )
            : 0;
          const closest = this._closest.copy(originA).addScaledVector(segment, t);
          const distance = point.distanceTo(closest);
          const radius = radiusA + (radiusB - radiusA) * t;
          if (distance > Math.max(radius, bs * 0.55)) continue;

          const key = `trunk:${ix},${iy},${iz}`;
          if (!map.has(key)) {
            map.set(key, {
              type: 'trunk',
              x: (ix + 0.5) * bs,
              y: (iy + 0.5) * bs,
              z: (iz + 0.5) * bs,
              size: bs * BLOCK_SIZES.trunk,
            });
          }
        }
      }
    }
  }

  /** 细枝：沿线段逐节点放置小方块 */
  #voxelizeLineNode(map, originA, originB, grid, type) {
    const length = originA.distanceTo(originB);
    const steps = Math.max(1, Math.ceil(length / (grid * 0.4)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.#addNodeBlock(
        map,
        type,
        originA.x + (originB.x - originA.x) * t,
        originA.y + (originB.y - originA.y) * t,
        originA.z + (originB.z - originA.z) * t,
        grid * (type === 'branch' ? 1.0 : 0.7),
        grid,
      );
    }
  }

  /** 较粗的树枝：按圆柱范围在半格网格上填充 */
  #voxelizeCylinderNode(map, originA, originB, radiusA, radiusB, grid, type) {
    const pad = Math.max(radiusA, radiusB) + grid;
    const minX = Math.floor((Math.min(originA.x, originB.x) - pad) / grid);
    const maxX = Math.ceil((Math.max(originA.x, originB.x) + pad) / grid);
    const minY = Math.floor((Math.min(originA.y, originB.y) - pad) / grid);
    const maxY = Math.ceil((Math.max(originA.y, originB.y) + pad) / grid);
    const minZ = Math.floor((Math.min(originA.z, originB.z) - pad) / grid);
    const maxZ = Math.ceil((Math.max(originA.z, originB.z) + pad) / grid);

    const segment = this._segment.subVectors(originB, originA);
    const lengthSq = segment.lengthSq();

    for (let ix = minX; ix <= maxX; ix++) {
      for (let iy = minY; iy <= maxY; iy++) {
        for (let iz = minZ; iz <= maxZ; iz++) {
          const point = this._vector.set(ix * grid, iy * grid, iz * grid);
          const t = lengthSq > 1e-12
            ? clamp01(
                ((point.x - originA.x) * segment.x +
                 (point.y - originA.y) * segment.y +
                 (point.z - originA.z) * segment.z) / lengthSq,
              )
            : 0;
          const closest = this._closest.copy(originA).addScaledVector(segment, t);
          const distance = point.distanceTo(closest);
          const radius = radiusA + (radiusB - radiusA) * t;
          if (distance > Math.max(radius, grid * 0.7)) continue;

          this.#addNodeBlock(
            map,
            type,
            ix * grid,
            iy * grid,
            iz * grid,
            grid * (type === 'branch' ? 1.0 : 0.7),
            grid,
          );
        }
      }
    }
  }

  /** 在球形范围内随机撒一簇树叶 */
  #scatterLeaves(map, center, radius, count, bs, rng) {
    const total = Math.max(1, Math.round(count * this.leafDensity));
    for (let i = 0; i < total; i++) {
      const offset = this._offset
        .set(rng.random() * 2 - 1, rng.random() * 2 - 1, rng.random() * 2 - 1)
        .normalize()
        .multiplyScalar(radius * Math.cbrt(rng.random()));

      this.#addCellBlock(
        map,
        'leaves',
        center.x + offset.x,
        center.y + offset.y,
        center.z + offset.z,
        bs * BLOCK_SIZES.leaves,
        bs,
      );
    }
  }

  /** 用椭球裁剪树冠，去掉方块轮廓的四角 */
  #roundCanopy(map, bs) {
    const leaves = [];
    for (const [key, block] of map) {
      if (block.type === 'leaves') leaves.push({ key, block });
    }
    if (leaves.length < 8) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const { block } of leaves) {
      minX = Math.min(minX, block.x);
      maxX = Math.max(maxX, block.x);
      minY = Math.min(minY, block.y);
      maxY = Math.max(maxY, block.y);
      minZ = Math.min(minZ, block.z);
      maxZ = Math.max(maxZ, block.z);
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const rx = Math.max(bs, (maxX - minX) / 2 + bs * 0.4);
    const ry = Math.max(bs, (maxY - minY) / 2 + bs * 0.2);
    const rz = Math.max(bs, (maxZ - minZ) / 2 + bs * 0.4);

    for (const { key, block } of leaves) {
      const nx = (block.x - cx) / rx;
      const ny = (block.y - cy) / ry;
      const nz = (block.z - cz) / rz;
      if (nx * nx + ny * ny + nz * nz > 1.0) map.delete(key);
    }
  }

  // -------------------------------------------------------------------------
  // 导出
  // -------------------------------------------------------------------------

  /** 导出所有方块数据（研究/分析用） */
  exportBlocksJson() {
    return {
      meta: {
        blockSize: this.blockSize,
        treeScale: this.treeScale,
        stage: this.stage,
        stageName: this.stageName,
        total: this.counts.total,
        heightBlocks: this.heightBlocks,
        counts: { ...this.counts },
      },
      blocks: this.blockList.map((b) => ({
        x: b.x,
        y: b.y,
        z: b.z,
        size: b.size,
        type: b.type,
      })),
    };
  }

  /** 合并成普通 Mesh 组，便于导出 GLB */
  toMergedGroup() {
    const group = new THREE.Group();
    group.name = 'VoxelTreeExport';

    const byType = new Map();
    for (const block of this.blockList) {
      if (!byType.has(block.type)) byType.set(block.type, []);
      byType.get(block.type).push(block);
    }

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const size = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();

    for (const [type, list] of byType) {
      const base = getBlockGeometry(type);
      const geometries = list.map((block) => {
        position.set(block.x, block.y, block.z);
        size.setScalar(block.size);
        matrix.compose(position, quaternion, size);
        const geometry = base.clone();
        geometry.applyMatrix4(matrix);
        return geometry;
      });

      let merged = geometries[0];
      if (geometries.length > 1) {
        try {
          merged = mergeGeometries(geometries, false);
        } catch {
          merged = geometries[0];
        }
      }

      if (merged) {
        const mesh = new THREE.Mesh(merged, getBlockMaterial(type, 'export'));
        mesh.name = type;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }

      for (const geometry of geometries) {
        if (geometry !== merged) geometry.dispose();
      }
    }

    return group;
  }

  disposeLayers() {
    for (const layer of this.blockLayers) {
      this.remove(layer.mesh);
      layer.mesh.dispose();
      layer.mesh.geometry.dispose();
    }
    this.blockLayers = [];
    this.blockList = [];
    this.counts = { total: 0, trunk: 0, branch: 0, twig: 0, leaves: 0 };
    this.heightBlocks = 0;
  }
}
