import * as THREE from 'three';
import { clamp, keyOf, hash01, MAX_NODES, MAX_LEAVES } from './core.js';
import { makeLeafColor } from './color.js';
import { scene, leafTex, makeBarkTexture, makeRingsTexture } from './world.js';

/* ============================================================
   三、树的渲染：枝 = 方块核心 + 方块连接；叶 = 整块方块
   ============================================================ */

const branchMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.98, metalness: 0 });
const leafMat = new THREE.MeshStandardMaterial({
  map: leafTex, color: 0xffffff, roughness: 0.96, metalness: 0,
  alphaTest: 0.45
});
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

function makeInstanced(geo, mat, count, cast) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = !!cast;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

const nodeMesh = makeInstanced(boxGeo, branchMat, MAX_NODES, true);
const edgeMesh = makeInstanced(boxGeo, branchMat, MAX_NODES, true);
const leafMesh = makeInstanced(boxGeo, leafMat, MAX_LEAVES, true);

const _obj = new THREE.Object3D();
const _color = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

/* mod 的 radius 1..8 对应 1/8..1 格宽的方块柱 */
const blockSize = (r) => clamp(r / 8, 0.125, 1.75);

const speciesTexCache = new WeakMap();
function ensureSpeciesTextures(species) {
  let tex = speciesTexCache.get(species);
  if (!tex) {
    tex = { bark: makeBarkTexture(species), rings: makeRingsTexture(species) };
    speciesTexCache.set(species, tex);
  }
  return tex;
}
function applySpeciesTextures(species) {
  const tex = ensureSpeciesTextures(species);
  if (branchMat.map !== tex.bark) {
    branchMat.map = tex.bark;
    branchMat.needsUpdate = true;
  }
  return tex;
}

/* 通用：把一组节点 / 边 / 叶写入实例网格。origin 用于让倒下的树以砍口为原点。 */
function fillInstances(opts) {
  const { nodeM, edgeM, leafM, nodes, lookup, leaves, species } = opts;
  const o = opts.origin || { x: 0, y: 0, z: 0 };
  const nodeKeys = opts.nodeKeys || null;
  const leafOwners = opts.leafOwners || null;
  const leafCells = opts.leafCells || null;

  let ni = 0;
  let ei = 0;
  for (const n of nodes) {
    if (ni >= nodeM.instanceMatrix.count) break;
    const cx = n.x + 0.5 - o.x;
    const cy = n.y + 0.5 - o.y;
    const cz = n.z + 0.5 - o.z;
    const size = blockSize(n.radius);

    _obj.position.set(cx, cy, cz);
    _obj.rotation.set(0, 0, 0);
    _obj.scale.set(size, size, size);
    _obj.updateMatrix();
    nodeM.setMatrixAt(ni, _obj.matrix);
    const v = 0.93 + hash01(n.x, n.y, n.z) * 0.10;
    _color.setRGB(v, v, v);
    nodeM.setColorAt(ni, _color);
    if (nodeKeys) nodeKeys.push(keyOf(n.x, n.y, n.z));
    ni++;

    if (n.parent && lookup.has(n.parent)) {
      const p = lookup.get(n.parent);
      const px = p.x + 0.5 - o.x;
      const py = p.y + 0.5 - o.y;
      const pz = p.z + 0.5 - o.z;
      const dx = cx - px, dy = cy - py, dz = cz - pz;
      const cross = Math.min(size, blockSize(p.radius));
      if (ei < edgeM.instanceMatrix.count) {
        _obj.position.set((cx + px) / 2, (cy + py) / 2, (cz + pz) / 2);
        _obj.rotation.set(0, 0, 0);
        if (dx !== 0) _obj.scale.set(1, cross, cross);
        else if (dy !== 0) _obj.scale.set(cross, 1, cross);
        else _obj.scale.set(cross, cross, 1);
        _obj.updateMatrix();
        edgeM.setMatrixAt(ei, _obj.matrix);
        const ve = 0.88 + hash01(n.x + 1, n.y, n.z) * 0.10;
        _color.setRGB(ve, ve, ve);
        edgeM.setColorAt(ei, _color);
        ei++;
      }
    }
  }

  nodeM.count = ni;
  edgeM.count = ei;
  nodeM.instanceMatrix.needsUpdate = true;
  edgeM.instanceMatrix.needsUpdate = true;
  if (nodeM.instanceColor) nodeM.instanceColor.needsUpdate = true;
  if (edgeM.instanceColor) edgeM.instanceColor.needsUpdate = true;

  let li = 0;
  for (const l of leaves) {
    if (li >= leafM.instanceMatrix.count) break;
    const cx = l.x + 0.5 - o.x;
    const cy = l.y + 0.5 - o.y;
    const cz = l.z + 0.5 - o.z;

    _obj.position.set(cx, cy, cz);
    _obj.rotation.set(0, 0, 0);
    const scale = 0.985;
    _obj.scale.set(scale, scale, scale);
    _obj.updateMatrix();
    leafM.setMatrixAt(li, _obj.matrix);

    _color.copy(makeLeafColor(species, l.hydro, l.x * 7 + l.y * 13 + l.z * 29));
    const shade = 0.92 + hash01(l.x, l.y + 5, l.z) * 0.18;
    _color.multiplyScalar(shade);
    leafM.setColorAt(li, _color);
    if (leafOwners) leafOwners.push(l.owner);
    if (leafCells) leafCells.push({ x: l.x, y: l.y, z: l.z });
    li++;
  }

  leafM.count = li;
  leafM.instanceMatrix.needsUpdate = true;
  if (leafM.instanceColor) leafM.instanceColor.needsUpdate = true;
}

const view = {
  nodeKeys: [],
  leafOwners: [],
  leafCells: [],
  cutGroup: new THREE.Group(),
  build(tree) {
    this.nodeKeys.length = 0;
    this.leafOwners.length = 0;
    this.leafCells.length = 0;
    fillInstances({
      nodeM: nodeMesh, edgeM: edgeMesh, leafM: leafMesh,
      nodes: tree.nodes.values(),
      lookup: tree.nodes,
      leaves: tree.leaves.values(),
      species: tree.species,
      nodeKeys: this.nodeKeys,
      leafOwners: this.leafOwners,
      leafCells: this.leafCells
    });
  },
  addCutFace(x, y, z, radius, dir, species) {
    const tex = ensureSpeciesTextures(species);
    const size = blockSize(radius);
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.rings, roughness: 0.95, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    const n = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    mesh.position.set(x + 0.5 + dir[0] * 0.5, y + 0.5 + dir[1] * 0.5, z + 0.5 + dir[2] * 0.5);
    mesh.receiveShadow = true;
    this.cutGroup.add(mesh);
    return mesh;
  },
  clearCuts() {
    for (const child of [...this.cutGroup.children]) {
      this.cutGroup.remove(child);
      child.geometry.dispose();
      child.material.dispose();
    }
  }
};
view.cutGroup.renderOrder = 1;
scene.add(view.cutGroup);

/* 鼠标悬停时的 Minecraft 方块黑框 */
const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001)),
  new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.6 })
);
outline.visible = false;
outline.renderOrder = 3;
scene.add(outline);


export {
  branchMat, leafMat, boxGeo, blockSize,
  nodeMesh, edgeMesh, leafMesh,
  fillInstances, view, outline,
  ensureSpeciesTextures, applySpeciesTextures
};
