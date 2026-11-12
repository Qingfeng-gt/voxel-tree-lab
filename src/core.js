/* ============================================================
   一、生长模型（纯逻辑，不依赖 Three.js）
   移植自 Dynamic Trees NeoForge 1.8.0：
   - Species.grow / GrowSignal      → Tree.growPulse / growSignal
   - GrowthLogicKit 六向概率图      → Tree.selectDirection
   - 半径体积守恒 + tapering        → growSignal 尾部
   - 叶片水分扩散                  → addCluster / spreadLeaves
   ============================================================ */

const BASE_Y = 1;                 // 根土方块在 y=0，树干第一格在 y=1
const MAX_NODES = 1600;
const MAX_LEAVES = 6200;

const DIRS = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
const OPP = [1,0,3,2,5,4];
const DOWN = 0, UP = 1, NORTH = 2, SOUTH = 3, WEST = 4, EAST = 5;
const HORIZ = [NORTH, SOUTH, WEST, EAST];

const keyOf = (x, y, z) => x + ',' + y + ',' + z;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function hash01(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

const SPECIES_LIST = [
  {
    id: 'oak', name: '橡树', en: 'Oak', tag: '圆冠 · 落叶',
    tapering: 0.30, energy: 14, up: 3, lowest: 5, growthRate: 0.8,
    maxRadius: 8, primary: 1, secondary: 2,
    logic: 'default', kit: 'deciduous', leafWeight: 0.5,
    bark: 0x7a5737, leaf: 0x4f8f3a, leafSize: 0.39,
    cluster: { kind: 'round', rx: 1.50, ry: 1.05, rz: 1.50 },
    seed: 11
  },
  {
    id: 'birch', name: '白桦', en: 'Birch', tag: '细高 · 浅树皮',
    tapering: 0.10, energy: 18, up: 5, lowest: 6, growthRate: 1.25,
    maxRadius: 8, primary: 1, secondary: 2,
    logic: 'default', kit: 'deciduous', leafWeight: 0.5,
    bark: 0xd6d2c4, leaf: 0x7fae49, leafSize: 0.34,
    cluster: { kind: 'round', rx: 1.40, ry: 1.05, rz: 1.40 },
    seed: 23
  },
  {
    id: 'spruce', name: '云杉', en: 'Spruce', tag: '层叠 · 针叶',
    tapering: 0.25, energy: 18, up: 5, lowest: 4, growthRate: 0.9,
    maxRadius: 8, primary: 1, secondary: 2,
    logic: 'conifer', kit: 'conifer', leafWeight: 0.5,
    bark: 0x5a4433, leaf: 0x3b7351, leafSize: 0.28,
    cluster: { kind: 'conifer', rx: 1.75, ry: 0.8, rz: 1.75 },
    seed: 37
  },
  {
    id: 'acacia', name: '金合欢', en: 'Acacia', tag: '平顶 · 伞冠',
    tapering: 0.15, energy: 14, up: 0, lowest: 4, growthRate: 0.7,
    maxRadius: 8, primary: 1, secondary: 2,
    logic: 'acacia', kit: 'acacia', leafWeight: 0.5,
    bark: 0x8a6746, leaf: 0x8fa846, leafSize: 0.31,
    cluster: { kind: 'umbrella', rx: 2.00, ry: 0.9, rz: 2.00 },
    seed: 41
  },
  {
    id: 'dark_oak', name: '深色橡木', en: 'Dark Oak', tag: '粗壮 · 低冠',
    tapering: 0.30, energy: 14, up: 4, lowest: 6, growthRate: 0.8,
    maxRadius: 14, primary: 1, secondary: 2,
    logic: 'default', kit: 'dark_oak', leafWeight: 0.5,
    bark: 0x4a3626, leaf: 0x3c6b2f, leafSize: 0.39,
    cluster: { kind: 'round', rx: 1.85, ry: 1.35, rz: 1.85 },
    seed: 53
  },
  {
    id: 'jungle', name: '丛林', en: 'Jungle', tag: '高大 · 浓密',
    tapering: 0.20, energy: 26, up: 5, lowest: 4, growthRate: 1.0,
    maxRadius: 8, primary: 1, secondary: 2,
    logic: 'jungle', kit: 'deciduous', leafWeight: 0.5,
    bark: 0x74593c, leaf: 0x358640, leafSize: 0.37,
    cluster: { kind: 'round', rx: 2.00, ry: 1.45, rz: 2.00 },
    seed: 67
  }
];

/* 叶团模板：不同树种有不同体积（对应 mod 的 LeafClusters / CellKit） */
function buildCluster(spec) {
  const { rx, ry, rz, kind } = spec.cluster;
  const cells = [];
  const R = Math.ceil(Math.max(rx, ry, rz));
  for (let dx = -R; dx <= R; dx++) {
    for (let dy = -R; dy <= R; dy++) {
      for (let dz = -R; dz <= R; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const nx = dx / rx, ny = dy / ry, nz = dz / rz;
        let d2;
        if (kind === 'conifer') {
          if (Math.abs(dy) > 1) continue;
          d2 = nx * nx + nz * nz + Math.abs(ny) * 0.45;
        } else if (kind === 'umbrella') {
          if (dy < -1) continue;
          d2 = nx * nx + nz * nz + ny * ny * 2.0;
        } else {
          d2 = nx * nx + ny * ny + nz * nz;
        }
        if (d2 > 1) continue;
        const n = hash01(dx + spec.seed, dy, dz + spec.seed);
        if (d2 > 0.60 && n < 0.18) continue;
        if (n < 0.02) continue;
        const hydro = clamp(Math.round(6.5 - Math.sqrt(d2) * 4.8), 1, 7);
        cells.push({ dx, dy, dz, hydro });
      }
    }
  }
  return cells;
}
for (const sp of SPECIES_LIST) sp.clusterCells = buildCluster(sp);

class Tree {
  constructor(species) {
    this.species = species;
    this.nodes = new Map();
    this.leaves = new Map();
    this.pulses = 0;
    this.stagnant = 0;
    this.version = 0;
    this.dead = false;
    this.reset();
  }

  reset() {
    this.nodes.clear();
    this.leaves.clear();
    this.pulses = 0;
    this.stagnant = 0;
    this.dead = false;
    this.version++;
    this.baseKey = keyOf(0, BASE_Y, 0);
    this.addNode(0, BASE_Y, 0, this.species.primary, null);
    this.addLeaf(0, BASE_Y + 1, 0, 5, this.baseKey);
  }

  addNode(x, y, z, radius, parentKey) {
    if (y < BASE_Y) return null;
    const key = keyOf(x, y, z);
    const existing = this.nodes.get(key);
    if (existing) {
      if (radius > existing.radius) { existing.radius = radius; this.version++; }
      return existing;
    }
    if (this.nodes.size >= MAX_NODES) return null;
    const node = { x, y, z, radius, parent: parentKey, children: [] };
    this.nodes.set(key, node);
    if (parentKey) {
      const parent = this.nodes.get(parentKey);
      if (parent) parent.children.push(key);
    }
    this.version++;
    return node;
  }

  addLeaf(x, y, z, hydro, owner) {
    if (y < BASE_Y) return false;
    const key = keyOf(x, y, z);
    if (this.nodes.has(key) || this.leaves.has(key)) return false;
    if (this.leaves.size >= MAX_LEAVES) return false;
    this.leaves.set(key, { x, y, z, hydro: clamp(hydro, 1, 7), owner });
    this.version++;
    return true;
  }

  /* 对应 DynamicLeavesBlock.branchOut：在枝端铺开一团叶子 */
  addCluster(cx, cy, cz, owner) {
    let added = 0;
    for (const c of this.species.clusterCells) {
      if (cy + c.dy < 4) continue;
      if (this.addLeaf(cx + c.dx, cy + c.dy, cz + c.dz, c.hydro, owner)) added++;
    }
    return added;
  }

  isFree(x, y, z) {
    if (y < BASE_Y) return false;
    const k = keyOf(x, y, z);
    return !this.nodes.has(k) && !this.leaves.has(k);
  }

  isNextToBranch(x, y, z, exceptDir) {
    for (let d = 0; d < 6; d++) {
      if (d === exceptDir) continue;
      const [dx, dy, dz] = DIRS[d];
      if (this.nodes.has(keyOf(x + dx, y + dy, z + dz))) return true;
    }
    return false;
  }

  hydroForNewLeaf(x, y, z) {
    const sp = this.species;
    let best = 0;
    for (let d = 0; d < 6; d++) {
      const [dx, dy, dz] = DIRS[d];
      const nk = keyOf(x + dx, y + dy, z + dz);
      const node = this.nodes.get(nk);
      if (node) {
        best = Math.max(best, node.radius === sp.primary ? 5 : 3);
        continue;
      }
      const leaf = this.leaves.get(nk);
      if (leaf) best = Math.max(best, leaf.hydro - 1);
    }
    return best;
  }

  /* 一次「生长脉冲」：可能执行多次生长信号（Species.grow 的 growthRate 循环） */
  growPulse() {
    if (this.dead) return false;
    this.pulses++;
    const sp = this.species;
    const startVersion = this.version;
    let rate = sp.growthRate;
    do {
      if (rate > Math.random()) this.sendSignal();
    } while ((rate -= 1) > 0);

    this.spreadLeaves();
    this.pruneOrphans();
    this.crownApex();
    const grew = this.version !== startVersion;
    this.stagnant = grew ? 0 : this.stagnant + 1;
    return grew;
  }

  sendSignal() {
    const sp = this.species;
    const signal = {
      energy: sp.energy * (0.92 + Math.random() * 0.16),
      dir: UP,
      numTurns: 0,
      numSteps: 0,
      radius: 0,
      success: true,
      choked: false,
      defaultDir: UP
    };
    this.growSignal(this.baseKey, signal);
  }

  step(signal) {
    signal.numSteps++;
    if (--signal.energy <= 0) {
      signal.success = false;
      return false;
    }
    return true;
  }

  /* 对应 BasicBranchBlock.growSignal：从根向尖端递归，回溯时更新半径 */
  growSignal(key, signal) {
    if (!this.step(signal)) return signal;
    const node = this.nodes.get(key);
    if (!node) return signal;

    const sp = this.species;
    const inTrunk = signal.numTurns === 0;
    const originDir = OPP[signal.dir];

    const targetDir = this.selectDirection(node, signal, inTrunk);
    if (targetDir !== signal.dir) {
      signal.dir = targetDir;
      signal.numTurns++;
    }

    /* 特化生长逻辑：离开主干时削减能量 */
    if (inTrunk && targetDir !== UP) {
      if (sp.logic === 'conifer') signal.energy = Math.max(1, signal.energy / 3);
      else if (sp.logic === 'jungle') signal.energy = Math.min(signal.energy, 4);
    }

    const [dx, dy, dz] = DIRS[targetDir];
    const tx = node.x + dx, ty = node.y + dy, tz = node.z + dz;
    const targetKey = keyOf(tx, ty, tz);

    if (this.nodes.has(targetKey)) {
      this.growSignal(targetKey, signal);
    } else if (this.leaves.has(targetKey)) {
      this.growIntoLeaf(node, tx, ty, tz, signal);
    } else if (this.isFree(tx, ty, tz)) {
      this.growIntoAir(node, tx, ty, tz, signal, targetDir);
    }

    /* 半径守恒：r = sqrt(Σ 邻枝 r²) + tapering */
    let area = signal.radius * signal.radius;
    for (let d = 0; d < 6; d++) {
      if (d === originDir || d === targetDir) continue;
      const [ndx, ndy, ndz] = DIRS[d];
      const neighbour = this.nodes.get(keyOf(node.x + ndx, node.y + ndy, node.z + ndz));
      if (neighbour) area += neighbour.radius * neighbour.radius;
    }
    if (!signal.choked) {
      const maxRadius = inTrunk ? sp.maxRadius : Math.min(sp.maxRadius, 8);
      const raw = Math.sqrt(area) + sp.tapering;
      signal.radius = clamp(raw, node.radius, maxRadius);
      const targetRadius = Math.floor(signal.radius);
      if (targetRadius > node.radius) {
        node.radius = targetRadius;
        this.version++;
      }
    }
    return signal;
  }

  selectDirection(node, signal, inTrunk) {
    const sp = this.species;
    const prob = [0, 0, 0, 0, 0, 0];
    const origin = OPP[signal.dir];

    /* 六向概率图：默认方向 + 当前方向 + 六邻居树体/树叶 */
    prob[UP] = signal.dir !== DOWN ? sp.up : 0;
    prob[signal.dir] += 1;
    for (let d = 0; d < 6; d++) {
      if (d === origin) continue;
      const [dx, dy, dz] = DIRS[d];
      const nk = keyOf(node.x + dx, node.y + dy, node.z + dz);
      const nb = this.nodes.get(nk);
      if (nb) prob[d] += nb.radius + 2;
      else if (this.leaves.has(nk)) prob[d] += sp.leafWeight ?? 2;
    }

    /* 树种特化（对应 ConiferLogic / DarkOakLogic / JungleLogic） */
    if (sp.logic === 'conifer') {
      prob[DOWN] = 0;
      prob[UP] = inTrunk ? sp.up : 0;
      const whorl = inTrunk && signal.numSteps % 2 === 1 && node.radius > 1;
      for (const d of HORIZ) prob[d] = inTrunk ? (whorl ? 2 : 0) : 2;
      prob[signal.dir] += inTrunk ? 0 : (signal.numTurns === 1 ? 2 : 1);
    } else if (sp.logic === 'jungle') {
      prob[DOWN] = 0;
      prob[UP] = inTrunk ? sp.up : 0;
      const inCanopy = node.y - BASE_Y >= 12;
      for (const d of HORIZ) prob[d] = inCanopy ? 2 : 0;
      prob[signal.dir] += inTrunk ? 0 : (signal.numTurns === 1 ? 2 : 1);
    } else if (sp.logic === 'dark_oak') {
      prob[UP] = 4;
      if (!inTrunk) {
        prob[UP] = 0;
        prob[DOWN] = 0;
        prob[signal.dir] = Math.floor(prob[signal.dir] * 0.35);
      }
      const height = node.y - BASE_Y;
      const spreadPush = Math.max(1, (height / sp.energy) * 2);
      for (const d of HORIZ) prob[d] = Math.floor(prob[d] * spreadPush);
      if (inTrunk) {
        for (const d of HORIZ) if (prob[d] >= 7) prob[d] = 2;
        if (height > sp.lowest + 5) {
          prob[UP] = 0;
          signal.energy = 2;
        }
        if (height > 11) {
          prob[UP] = 0;
          for (const d of HORIZ) prob[d] = Math.max(prob[d], 2);
          signal.energy = Math.min(signal.energy, 4);
        }
      }
    } else if (sp.logic === 'acacia') {
      prob[DOWN] = 0;
      if (node.y - BASE_Y >= 5) {
        prob[UP] = 0;
        for (const d of HORIZ) prob[d] += 1;
      }
    }

    prob[origin] = 0;

    let total = 0;
    for (const p of prob) total += p;
    if (total <= 0) return signal.dir === DOWN ? UP : signal.dir;

    let roll = Math.random() * total;
    for (let d = 0; d < 6; d++) {
      roll -= prob[d];
      if (roll < 0) return d;
    }
    return UP;
  }

  /* 粗枝伸入空气：放一团叶 + 一根细枝（对应 branchOut） */
  growIntoAir(node, x, y, z, signal, dir) {
    const sp = this.species;
    const ownerKey = keyOf(node.x, node.y, node.z);

    if (node.radius !== sp.primary) {
      if (this.isNextToBranch(x, y, z, OPP[dir])) { signal.success = false; return; }
      const newKey = keyOf(x, y, z);
      const created = this.addNode(x, y, z, sp.primary, ownerKey);
      if (!created) { signal.success = false; return; }
      /* 叶团向生长方向再推一格，让树干/侧枝露出来 */
      const [ddx, ddy, ddz] = DIRS[dir];
      this.addCluster(x + ddx, y + ddy, z + ddz, newKey);
      signal.radius = sp.secondary;
      signal.success = true;
    } else {
      /* 细枝：只长单片叶子（下一脉冲再转成枝） */
      const hydro = this.hydroForNewLeaf(x, y, z);
      if (hydro > 0 && this.addLeaf(x, y, z, hydro, ownerKey)) {
        signal.success = true;
      } else {
        signal.success = false;
      }
    }
  }

  /* 生长信号进入树叶：树叶变成一级细枝（对应 DynamicLeavesBlock.branchOut） */
  growIntoLeaf(node, x, y, z, signal) {
    if (this.isNextToBranch(x, y, z, OPP[signal.dir])) { signal.success = false; return; }
    const key = keyOf(x, y, z);
    this.leaves.delete(key);
    const created = this.addNode(x, y, z, this.species.primary, keyOf(node.x, node.y, node.z));
    if (!created) { signal.success = false; return; }
    this.addCluster(x, y, z, key);
    signal.radius = this.species.secondary;
    signal.success = true;
  }

  /* 叶片水分扩散：值高的叶子向邻居生长，值随距离递减 */
  spreadLeaves() {
    if (this.leaves.size >= MAX_LEAVES) return;
    const keys = [...this.leaves.keys()];
    if (!keys.length) return;
    const tries = Math.min(keys.length, 340);
    let budget = 24;
    for (let i = 0; i < tries && budget > 0; i++) {
      const leaf = this.leaves.get(keys[(Math.random() * keys.length) | 0]);
      if (!leaf || leaf.hydro < 2) continue;
      if (Math.random() > 0.045 + leaf.hydro * 0.007) continue;
      const owner = this.nodes.get(leaf.owner);
      if (!owner) continue;
      const d = (Math.random() * 6) | 0;
      const [dx, dy, dz] = DIRS[d];
      const x = leaf.x + dx, y = leaf.y + dy, z = leaf.z + dz;
      if (y < 4 || !this.isFree(x, y, z)) continue;
      if (Math.abs(x - owner.x) + Math.abs(y - owner.y) + Math.abs(z - owner.z) > 3) continue;
      if (this.addLeaf(x, y, z, Math.max(1, leaf.hydro - 1), leaf.owner)) budget--;
    }
  }

  pruneOrphans() {
    for (const [k, leaf] of this.leaves) {
      if (!this.nodes.has(leaf.owner)) this.leaves.delete(k);
    }
  }

  /* 树冠顶部补一片顶芽叶，避免主枝裸露成光杆 */
  crownApex() {
    let top = null;
    for (const n of this.nodes.values()) {
      if (n.x === 0 && n.z === 0 && (!top || n.y > top.y)) top = n;
    }
    if (!top) return;
    if (this.species.crownLimit && top.y - BASE_Y >= this.species.crownLimit) return;
    const ay = top.y + 1;
    const key = keyOf(0, ay, 0);
    if (this.nodes.has(key) || this.leaves.has(key)) return;
    const hydro = this.hydroForNewLeaf(0, ay, 0);
    this.addLeaf(0, ay, 0, Math.max(5, hydro), keyOf(top.x, top.y, top.z));
  }

  /* 砍伐：取该节点及其全部后代，返回可交给倒下动画的副本 */
  chopAt(key) {
    const cut = this.nodes.get(key);
    if (!cut) return null;

    let cutDir = [0, -1, 0];
    const parent = cut.parent ? this.nodes.get(cut.parent) : null;
    if (parent) {
      cutDir = [
        Math.sign(parent.x - cut.x),
        Math.sign(parent.y - cut.y),
        Math.sign(parent.z - cut.z)
      ];
    }

    const subtree = new Set();
    const stack = [key];
    while (stack.length) {
      const k = stack.pop();
      if (subtree.has(k)) continue;
      subtree.add(k);
      const n = this.nodes.get(k);
      if (n) for (const c of n.children) stack.push(c);
    }

    const lookup = new Map();
    const nodes = [];
    for (const k of subtree) {
      const n = this.nodes.get(k);
      if (!n) continue;
      const copy = {
        x: n.x, y: n.y, z: n.z, radius: n.radius,
        parent: n.parent && subtree.has(n.parent) ? n.parent : null
      };
      lookup.set(k, copy);
      nodes.push(copy);
    }

    const leaves = [];
    for (const [lk, leaf] of this.leaves) {
      if (subtree.has(leaf.owner)) {
        leaves.push({ x: leaf.x, y: leaf.y, z: leaf.z, hydro: leaf.hydro, owner: leaf.owner });
        this.leaves.delete(lk);
      }
    }

    if (cut.parent) {
      const p = this.nodes.get(cut.parent);
      if (p) p.children = p.children.filter((c) => c !== key);
    }
    for (const k of subtree) this.nodes.delete(k);

    this.version++;
    return { pivot: { x: cut.x, y: cut.y, z: cut.z, radius: cut.radius }, cutDir, nodes, lookup, leaves };
  }

  findTrunkCutKey() {
    let best = this.baseKey;
    let bestY = BASE_Y - 1;
    for (const [k, n] of this.nodes) {
      if (n.x === 0 && n.z === 0 && n.y >= BASE_Y && n.y <= BASE_Y + 3 && n.y > bestY) {
        best = k;
        bestY = n.y;
      }
    }
    return best;
  }

  getStats() {
    let maxY = BASE_Y;
    let extent = 0;
    for (const n of this.nodes.values()) {
      if (n.y > maxY) maxY = n.y;
      extent = Math.max(extent, Math.abs(n.x), Math.abs(n.z));
    }
    for (const l of this.leaves.values()) {
      extent = Math.max(extent, Math.abs(l.x), Math.abs(l.z));
    }
    return {
      height: this.nodes.size ? maxY - BASE_Y + 1 : 0,
      extent,
      branches: this.nodes.size,
      leaves: this.leaves.size,
      pulses: this.pulses
    };
  }
}


export {
  BASE_Y, MAX_NODES, MAX_LEAVES,
  DIRS, OPP, DOWN, UP, NORTH, SOUTH, WEST, EAST, HORIZ,
  keyOf, clamp, hash01,
  SPECIES_LIST, buildCluster, Tree
};
