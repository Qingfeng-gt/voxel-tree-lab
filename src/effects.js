import * as THREE from 'three';
import { clamp } from './core.js';
import { makeLeafColor } from './color.js';
import { scene } from './world.js';
import {
  branchMat, leafMat, boxGeo, blockSize,
  ensureSpeciesTextures, fillInstances, view
} from './treeView.js';

const UP_AXIS = new THREE.Vector3(0, 1, 0);
let fall = null;

/* ------------------------------------------------------------
   方块粒子（骨粉、落叶、扬尘）
   ------------------------------------------------------------ */
class Particles {
  constructor(max = 280) {
    this.max = max;
    this.items = [];
    const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.95,
      transparent: true, opacity: 0.96, depthWrite: true
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
  }

  spawn(pos, color, count = 1, opts = {}) {
    const speed = opts.speed ?? 2.2;
    const spread = opts.spread ?? 1;
    const gravity = opts.gravity ?? 7;
    const life = opts.life ?? 1.6;
    const size = opts.size ?? 1;
    for (let i = 0; i < count; i++) {
      if (this.items.length >= this.max) this.items.shift();
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 2 * spread,
        Math.random() * 1.1,
        (Math.random() - 0.5) * 2 * spread
      ).multiplyScalar(speed * (0.5 + Math.random() * 0.8));
      v.y += speed * 0.35;
      this.items.push({
        p: pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.45,
          (Math.random() - 0.5) * 0.45,
          (Math.random() - 0.5) * 0.45
        )),
        v,
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        ),
        age: 0,
        life,
        gravity,
        size: size * (0.7 + Math.random() * 0.6),
        color: color.clone()
      });
    }
  }

  update(dt) {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.age += dt;
      if (it.age >= it.life) { items.splice(i, 1); continue; }
      it.v.y -= it.gravity * dt;
      it.v.multiplyScalar(Math.max(0, 1 - 0.9 * dt));
      it.p.addScaledVector(it.v, dt);
      it.rot.x += it.spin.x * dt;
      it.rot.y += it.spin.y * dt;
      it.rot.z += it.spin.z * dt;
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const k = 1 - it.age / it.life;
      this.dummy.position.copy(it.p);
      this.dummy.rotation.copy(it.rot);
      this.dummy.scale.setScalar(it.size * (0.45 + 0.55 * k));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, it.color);
    }
    this.mesh.count = items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export const particles = new Particles();

/* 骨粉/生长脉冲：根部冒绿色方块粒子 */
export function spawnGrowthBurst() {
  const colors = [0x9be36d, 0xc9f0a0, 0x74c24b, 0xffffff];
  for (let i = 0; i < 12; i++) {
    particles.spawn(
      new THREE.Vector3(0.5, 1.05, 0.5),
      new THREE.Color(colors[(Math.random() * colors.length) | 0]),
      1,
      { speed: 1.0, spread: 0.7, gravity: 3.4, life: 0.9, size: 0.7 }
    );
  }
}

/* ------------------------------------------------------------
   砍倒：把被砍下的方块组建成独立 Group，绕砍口旋转
   ------------------------------------------------------------ */
function disposeFall(f) {
  scene.remove(f.group);
  for (const m of f.mats) m.dispose();
  for (const g of f.geos || []) g.dispose();
}

export function startFall(tree, result, species, onLanded) {
  if (!tree || !result || !result.nodes.length) return false;

  view.build(tree);
  view.addCutFace(
    result.pivot.x, result.pivot.y, result.pivot.z,
    result.pivot.radius, result.cutDir, species
  );

  const pivot = new THREE.Vector3(result.pivot.x + 0.5, result.pivot.y + 0.5, result.pivot.z + 0.5);
  const group = new THREE.Group();
  group.position.copy(pivot);

  const bMat = branchMat.clone();
  const lMat = leafMat.clone();

  const capNodes = Math.max(1, result.nodes.length);
  const fallNodeMesh = new THREE.InstancedMesh(boxGeo, bMat, capNodes);
  const fallEdgeMesh = new THREE.InstancedMesh(boxGeo, bMat, capNodes);
  const fallLeafMesh = new THREE.InstancedMesh(boxGeo, lMat, Math.max(1, result.leaves.length));
  for (const m of [fallNodeMesh, fallEdgeMesh, fallLeafMesh]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  fillInstances({
    nodeM: fallNodeMesh, edgeM: fallEdgeMesh, leafM: fallLeafMesh,
    nodes: result.nodes,
    lookup: result.lookup,
    leaves: result.leaves,
    species,
    origin: { x: pivot.x, y: pivot.y, z: pivot.z }
  });

  /* 砍口截面（随树倒下一起旋转） */
  const cutSize = blockSize(result.pivot.radius);
  const cutGeo = new THREE.PlaneGeometry(cutSize, cutSize);
  const cutMat = new THREE.MeshStandardMaterial({
    map: ensureSpeciesTextures(species).rings,
    roughness: 0.95,
    side: THREE.DoubleSide
  });
  const cutFace = new THREE.Mesh(cutGeo, cutMat);
  const cutNormal = new THREE.Vector3(result.cutDir[0], result.cutDir[1], result.cutDir[2]).normalize();
  cutFace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), cutNormal);
  cutFace.position.copy(cutNormal).multiplyScalar(0.5);
  group.add(cutFace);

  scene.add(group);

  const fallDir = new THREE.Vector3(Math.cos(Math.random() * Math.PI * 2), 0, Math.sin(Math.random() * Math.PI * 2));
  const axis = new THREE.Vector3().crossVectors(UP_AXIS, fallDir).normalize();

  const leafPts = result.leaves.map((l) => new THREE.Vector3(
    l.x + 0.5 - pivot.x,
    l.y + 0.5 - pivot.y,
    l.z + 0.5 - pivot.z
  ));

  fall = {
    group, angle: 0, vel: 0.45, axis, landed: false, t: 0, leafT: 0,
    mats: [bMat, lMat, cutMat],
    geos: [cutGeo],
    leafPts,
    leafColor: new THREE.Color(species.leaf),
    onLanded
  };

  /* 初始树叶飘落 */
  if (leafPts.length) {
    group.updateMatrixWorld(true);
    for (let i = 0; i < 46; i++) {
      const p = leafPts[(Math.random() * leafPts.length) | 0].clone();
      p.applyMatrix4(group.matrixWorld);
      particles.spawn(p, makeLeafColor(species, 2 + (Math.random() * 5 | 0), Math.random() * 999), 1, {
        speed: 1.6, spread: 1.1, gravity: 4.5, life: 2.2, size: 0.85
      });
    }
  }

  return true;
}

export function cancelFall() {
  if (!fall) return;
  disposeFall(fall);
  fall = null;
}

export function updateFall(dt) {
  const f = fall;
  if (!f) return;

  if (!f.landed) {
    f.vel += (0.5 + f.angle * 1.35) * dt;
    f.angle += f.vel * dt;
    if (f.angle >= 1.42) {
      f.angle = 1.42;
      f.landed = true;
      f.t = 0;
      /* 落地扬尘 + 落叶 */
      const p = f.group.position.clone();
      p.y = 0.15;
      particles.spawn(p, new THREE.Color(0x8a7757), 26, {
        speed: 2.6, spread: 2.2, gravity: 9, life: 1.1, size: 0.65
      });
      if (f.leafPts.length) {
        f.group.updateMatrixWorld(true);
        for (let i = 0; i < 34; i++) {
          const lp = f.leafPts[(Math.random() * f.leafPts.length) | 0].clone();
          lp.applyMatrix4(f.group.matrixWorld);
          particles.spawn(lp, f.leafColor, 1, {
            speed: 2.4, spread: 1.6, gravity: 5.2, life: 2.0, size: 0.9
          });
        }
      }
      if (f.onLanded) f.onLanded();
    }
    f.group.quaternion.setFromAxisAngle(f.axis, Math.min(f.angle, 1.42));

    f.leafT -= dt;
    if (f.leafT <= 0 && f.leafPts.length) {
      f.leafT = 0.11;
      f.group.updateMatrixWorld(true);
      const base = f.leafPts[(Math.random() * f.leafPts.length) | 0].clone();
      base.applyMatrix4(f.group.matrixWorld);
      for (let i = 0; i < 5; i++) {
        particles.spawn(base, f.leafColor, 1, {
          speed: 1.1, spread: 1.3, gravity: 4.2, life: 2.2, size: 0.8
        });
      }
    }
  } else {
    f.t += dt;
    if (f.t > 1.25) {
      const k = clamp((f.t - 1.25) / 0.9, 0, 1);
      for (const m of f.mats) {
        m.transparent = true;
        m.opacity = 1 - k;
        m.depthWrite = k < 0.5;
      }
      if (k >= 1) {
        disposeFall(f);
        fall = null;
      }
    }
  }
}
