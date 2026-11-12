import * as THREE from 'three';
import RNG from '../lib/rng';
import {
  createInstancedLayer,
  getBlockGeometry,
  getBlockMaterial,
} from './blocks';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** 返回排序数组中第一个大于 value 的下标 */
function upperBound(times, value) {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * 把 EZ-Tree 生成的树枝骨架转换成体素方块，并管理生长动画。
 *
 * 生长顺序：按方块到树根的距离排序，树干从下往上长，
 * 侧枝向外长，树叶在枝干之后出现。
 */
export class VoxelTree extends THREE.Group {
  constructor() {
    super();
    this.name = 'VoxelTree';

    this.blockSize = 1;
    this.treeScale = 0.15;
    this.canopyStart = 0.35;
    this.leafDensity = 1;
    this.duration = 8; // 完整生长一次的秒数
    this.progress = 0;
    this.playing = true;
    this.popWindow = 0.035;

    /** @type {{id: string, mesh: THREE.InstancedMesh, times: Float32Array, count: number}[]} */
    this.blockLayers = [];
    /** @type {{ix:number, iy:number, iz:number, type:string, t:number}[]} */
    this.blockList = [];
    this.counts = { total: 0, log: 0, leaves: 0 };
    this.heightBlocks = 0;
    this.grown = 0;

    /** 生长统计回调（每 100ms 触发一次） */
    this.onStats = null;
    this._statsTimer = 0;

    this._vector = new THREE.Vector3();
    this._segment = new THREE.Vector3();
    this._closest = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._offset = new THREE.Vector3();
  }

  /**
   * 根据树的骨架重建体素。
   * @param {import('@dgreenheck/ez-tree').Tree} tree
   * @param {{blockSize?: number, treeScale?: number, canopyStart?: number, leafDensity?: number}} options
   */
  rebuild(tree, {
    blockSize = this.blockSize,
    treeScale = this.treeScale,
    canopyStart = this.canopyStart,
    leafDensity = this.leafDensity,
  } = {}) {
    this.disposeLayers();
    this.blockSize = blockSize;
    this.treeScale = treeScale;
    this.canopyStart = canopyStart;
    this.leafDensity = leafDensity;

    const skeleton = tree.skeleton;
    if (!skeleton) {
      this.progress = 0;
      return;
    }

    const bs = blockSize;
    const scale = treeScale;
    // 让树干轴线穿过方块中心，细枝才能是干净的 1 格宽
    const offsetX = bs / 2;
    const offsetZ = bs / 2;

    /** @type {Map<string, {ix:number, iy:number, iz:number, type:string}>} */
    const map = new Map();

    // 树干 / 树枝：逐段体素化；细枝用 1 格宽的线条
    const pointA = new THREE.Vector3();
    const pointB = new THREE.Vector3();
    for (const branch of skeleton.branches) {
      const sections = branch.sections;
      for (let i = 0; i < sections.length - 1; i++) {
        pointA.copy(sections[i].origin).multiplyScalar(scale);
        pointB.copy(sections[i + 1].origin).multiplyScalar(scale);
        pointA.x += offsetX;
        pointA.z += offsetZ;
        pointB.x += offsetX;
        pointB.z += offsetZ;

        const radiusA = sections[i].radius * scale;
        const radiusB = sections[i + 1].radius * scale;

        if (Math.max(radiusA, radiusB) <= bs * 0.75) {
          this.#voxelizeLine(map, pointA, pointB, bs);
        } else {
          this.#voxelizeSegment(map, pointA, pointB, radiusA, radiusB, bs);
        }
      }
    }

    // 树叶：在每片叶子的位置生成一小簇方块
    const rng = new RNG(((tree.options.seed >>> 0) ^ 0x51ed270b) >>> 0);
    const leafOrigin = new THREE.Vector3();

    // 树冠只保留上部，让树干露出来（更像游戏里的树）
    let maxLeafY = 0;
    for (const leaf of skeleton.leaves) {
      maxLeafY = Math.max(maxLeafY, leaf.origin.y * scale);
    }
    const minLeafY = maxLeafY * canopyStart;

    for (const leaf of skeleton.leaves) {
      leafOrigin.copy(leaf.origin).multiplyScalar(scale);
      if (leafOrigin.y < minLeafY) continue;
      leafOrigin.x += offsetX;
      leafOrigin.z += offsetZ;
      this.#addLeafCluster(map, leafOrigin, leaf.orientation, leaf.size * scale, bs, rng);
    }

    const blocks = [...map.values()];

    // 计算生长时间：越靠近根部越早出现，树叶整体延后
    let maxDistance = 1;
    for (const block of blocks) {
      const x = (block.ix + 0.5) * bs;
      const y = (block.iy + 0.5) * bs;
      const z = (block.iz + 0.5) * bs;
      block.distance = Math.sqrt(x * x + y * y + z * z);
      maxDistance = Math.max(maxDistance, block.distance);
    }

    for (const block of blocks) {
      const n = block.distance / maxDistance;
      if (block.type === 'leaves') {
        block.t = clamp01(0.5 + 0.5 * n + (rng.random() - 0.5) * 0.02);
      } else {
        block.t = clamp01(0.85 * n + (rng.random() - 0.5) * 0.015);
      }
    }

    // 按类型分组并按生长时间排序
    const byType = new Map();
    for (const block of blocks) {
      if (!byType.has(block.type)) byType.set(block.type, []);
      byType.get(block.type).push(block);
    }

    for (const [type, list] of byType) {
      list.sort((a, b) => a.t - b.t);
      const times = new Float32Array(list.length);
      for (let i = 0; i < list.length; i++) times[i] = list[i].t;

      const mesh = createInstancedLayer(type, list, {
        scale: bs,
        usage: 'tree',
        growthTimes: times,
        castShadow: true,
        receiveShadow: true,
        colorVariation: 0.08,
      });
      mesh.count = 0;
      this.add(mesh);
      this.blockLayers.push({ id: type, mesh, times, count: list.length });
    }

    this.blockList = blocks;
    this.counts.total = blocks.length;
    this.counts.log = byType.get('log')?.length ?? 0;
    this.counts.leaves = byType.get('leaves')?.length ?? 0;

    let maxIy = 0;
    for (const block of blocks) maxIy = Math.max(maxIy, block.iy);
    this.heightBlocks = maxIy + 1;

    this.progress = 0;
    this.playing = true;
    this._statsTimer = 0;
    this.#applyGrowth();
    this.#emitStats();
  }

  /**
   * 逐帧推进生长动画。
   * @param {number} delta 秒
   */
  update(delta) {
    if (this.playing && this.progress < 1) {
      this.progress = Math.min(1, this.progress + delta / Math.max(0.1, this.duration));
    }
    // 每帧都同步一次，确保材质编译后暂停状态下也能正确显示
    this.#applyGrowth();

    this._statsTimer += delta;
    if (this._statsTimer >= 0.1) {
      this._statsTimer = 0;
      this.#emitStats();
    }
  }

  setPlaying(playing) {
    this.playing = playing;
  }

  setDuration(seconds) {
    this.duration = Math.max(0.1, seconds);
  }

  setProgress(progress) {
    this.progress = clamp01(progress);
    this.#applyGrowth();
    this.#emitStats();
  }

  replay() {
    this.progress = 0;
    this.playing = true;
    this.#applyGrowth();
    this.#emitStats();
  }

  #applyGrowth() {
    const threshold = this.progress * (1 + this.popWindow);
    let grown = 0;

    for (const layer of this.blockLayers) {
      layer.mesh.count = upperBound(layer.times, threshold);
      grown += upperBound(layer.times, this.progress);

      const shader = layer.mesh.material.userData.growthShader;
      if (shader) {
        shader.uniforms.uProgress.value = threshold;
        shader.uniforms.uPopWindow.value = this.popWindow;
      }
    }
    this.grown = grown;
  }

  #emitStats() {
    this.onStats?.(this);
  }

  /**
   * 把一段树枝（近似为半径线性变化的圆柱）填充成方块。
   */
  #voxelizeSegment(map, originA, originB, radiusA, radiusB, bs) {
    const pad = Math.max(radiusA, radiusB) + bs;
    const minIx = Math.floor((Math.min(originA.x, originB.x) - pad) / bs - 0.5);
    const maxIx = Math.ceil((Math.max(originA.x, originB.x) + pad) / bs - 0.5);
    const minIy = Math.floor((Math.min(originA.y, originB.y) - pad) / bs - 0.5);
    const maxIy = Math.ceil((Math.max(originA.y, originB.y) + pad) / bs - 0.5);
    const minIz = Math.floor((Math.min(originA.z, originB.z) - pad) / bs - 0.5);
    const maxIz = Math.ceil((Math.max(originA.z, originB.z) + pad) / bs - 0.5);

    const segment = this._segment.subVectors(originB, originA);
    const lengthSq = segment.lengthSq();

    for (let ix = minIx; ix <= maxIx; ix++) {
      for (let iy = minIy; iy <= maxIy; iy++) {
        for (let iz = minIz; iz <= maxIz; iz++) {
          const point = this._vector.set(
            (ix + 0.5) * bs,
            (iy + 0.5) * bs,
            (iz + 0.5) * bs,
          );

          const t = lengthSq > 1e-12
            ? Math.max(0, Math.min(1,
                ((point.x - originA.x) * segment.x +
                 (point.y - originA.y) * segment.y +
                 (point.z - originA.z) * segment.z) / lengthSq))
            : 0;

          const closest = this._closest.copy(originA).addScaledVector(segment, t);
          const distance = point.distanceTo(closest);
          const radius = radiusA + (radiusB - radiusA) * t;

          // 细枝至少保留一个方块宽，避免出现断点
          const threshold = Math.max(radius, bs * 0.7);
          if (distance > threshold) continue;

          const key = `${ix},${iy},${iz}`;
          if (!map.has(key)) {
            map.set(key, { ix, iy, iz, type: 'log' });
          }
        }
      }
    }
  }

  /**
   * 细枝使用 1 格宽的线条体素化（类似 Minecraft 的树干/树枝）。
   */
  #voxelizeLine(map, originA, originB, bs) {
    const length = originA.distanceTo(originB);
    const steps = Math.max(1, Math.ceil(length / (bs * 0.4)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = originA.x + (originB.x - originA.x) * t;
      const y = originA.y + (originB.y - originA.y) * t;
      const z = originA.z + (originB.z - originA.z) * t;
      const ix = Math.floor(x / bs);
      const iy = Math.floor(y / bs);
      const iz = Math.floor(z / bs);
      const key = `${ix},${iy},${iz}`;
      if (!map.has(key)) {
        map.set(key, { ix, iy, iz, type: 'log' });
      }
    }
  }

  /**
   * 在叶子位置生成一小簇树叶方块（球状随机分布）。
   */
  #addLeafCluster(map, origin, orientation, size, bs, rng) {
    const normal = this._normal
      .set(0, 0, 1)
      .applyEuler(orientation);

    const radius = Math.max(bs * 1.2, size * 0.6);
    const count = Math.max(1, Math.min(
      24,
      Math.round((radius / bs) * (radius / bs) * 3.5 * this.leafDensity),
    ));

    const center = this._vector
      .copy(origin)
      .addScaledVector(normal, radius * 0.35);

    for (let i = 0; i < count; i++) {
      const offset = this._offset
        .set(rng.random() * 2 - 1, rng.random() * 2 - 1, rng.random() * 2 - 1)
        .normalize()
        .multiplyScalar(radius * Math.cbrt(rng.random()));

      const x = center.x + offset.x;
      const y = center.y + offset.y;
      const z = center.z + offset.z;

      const ix = Math.floor(x / bs);
      const iy = Math.floor(y / bs);
      const iz = Math.floor(z / bs);
      const key = `${ix},${iy},${iz}`;
      if (!map.has(key)) {
        map.set(key, { ix, iy, iz, type: 'leaves' });
      }
    }
  }

  /**
   * 导出所有方块数据（研究/分析用）。
   */
  exportBlocksJson() {
    const bs = this.blockSize;
    return {
      meta: {
        blockSize: bs,
        total: this.counts.total,
        log: this.counts.log,
        leaves: this.counts.leaves,
      },
      blocks: this.blockList.map((b) => ({
        x: (b.ix + 0.5) * bs,
        y: (b.iy + 0.5) * bs,
        z: (b.iz + 0.5) * bs,
        type: b.type,
        grow: Number(b.t.toFixed(4)),
      })),
    };
  }

  /**
   * 把所有方块合并成普通 Mesh（非实例化），便于导出 GLB，
   * 也方便把体素树导入到其他游戏引擎。
   * @returns {THREE.Group}
   */
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
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();

    for (const [type, list] of byType) {
      const base = getBlockGeometry(type);
      const geometries = list.map((block) => {
        position.set(
          (block.ix + 0.5) * this.blockSize,
          (block.iy + 0.5) * this.blockSize,
          (block.iz + 0.5) * this.blockSize,
        );
        scale.setScalar(this.blockSize);
        matrix.compose(position, quaternion, scale);
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
    this.counts = { total: 0, log: 0, leaves: 0 };
    this.heightBlocks = 0;
    this.grown = 0;
  }
}
