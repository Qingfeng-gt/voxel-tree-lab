import * as THREE from 'three';
import { SPECIES_LIST, Tree, clamp } from './core.js';
import { makeLeafColor } from './color.js';
import { renderer, scene, camera, controls, updateClouds } from './world.js';
import {
  nodeMesh, leafMesh, view, outline, applySpeciesTextures
} from './treeView.js';
import {
  particles, spawnGrowthBurst, startFall, updateFall, cancelFall
} from './effects.js';

/* ============================================================
   五、状态 / UI
   ============================================================ */

let tree = null;
const state = {
  species: SPECIES_LIST[0],
  auto: true,
  speed: 2,
  burst: 0
};

const $ = (id) => document.getElementById(id);
const toastEl = $('toast');
let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function updateStats() {
  if (!tree) return;
  const s = tree.getStats();
  $('statHeight').innerHTML = s.height + '<small>格</small>';
  $('statBranches').textContent = s.branches;
  $('statLeaves').textContent = s.leaves;
  $('statPulses').textContent = s.pulses;
}

function updateAutoBtn() {
  const btn = $('autoBtn');
  btn.classList.toggle('on', state.auto);
  btn.setAttribute('aria-pressed', String(state.auto));
}

function renderLegend(species) {
  const bar = $('legendBar');
  bar.innerHTML = '';
  for (let h = 1; h <= 7; h++) {
    const sw = document.createElement('span');
    sw.style.background = '#' + makeLeafColor(species, h, h * 3.7).getHexString();
    bar.appendChild(sw);
  }
}

function markSpeciesActive(id) {
  for (const btn of document.querySelectorAll('.sp')) {
    btn.classList.toggle('active', btn.dataset.id === id);
  }
  const sp = SPECIES_LIST.find((s) => s.id === id);
  $('speciesLabel').textContent = sp ? sp.en.toLowerCase().replace(' ', '_') : id;
}

function plant(species, preGrow = 14) {
  cancelFall();
  view.clearCuts();

  state.species = species;
  applySpeciesTextures(species);
  outline.visible = false;
  tree = new Tree(species);
  for (let i = 0; i < preGrow; i++) tree.growPulse();
  view.build(tree);
  updateStats();
  const stats = tree.getStats();
  const h = stats.height;
  const targetY = clamp((h + 3) * 0.5, 3.6, 13);
  const dir = camera.position.clone().sub(controls.target).normalize();
  const dist = Math.max(18, (h + 5) * 1.75, stats.extent * 2.3);
  controls.target.set(0.5, targetY, 0.5);
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.update();
  renderLegend(species);
  markSpeciesActive(species.id);
  state.auto = true;
  updateAutoBtn();
}

function doPulse(isUser) {
  if (!tree || tree.dead) return;
  tree.growPulse();
  view.build(tree);
  updateStats();
  if (state.auto && tree.stagnant > 30) {
    state.auto = false;
    updateAutoBtn();
    toast('树冠已长成 · 点击树体即可砍伐');
  }
}

function chopAtKey(key) {
  if (!tree || tree.dead) return;
  const result = tree.chopAt(key);
  if (!result || !result.nodes.length) return;

  outline.visible = false;
  const wholeTree = tree.nodes.size === 0;
  if (wholeTree) {
    tree.dead = true;
    state.auto = false;
    updateAutoBtn();
  }
  updateStats();

  startFall(tree, result, tree.species, () => {
    if (wholeTree) toast('树已倒下 · 按 R 重新种树');
  });
  toast(wholeTree ? '整棵树正在倒下' : '树枝被砍下');
}

function speciesButton(sp) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sp';
  btn.dataset.id = sp.id;
  btn.innerHTML =
    '<span class="dot" style="color:#' + sp.leaf.toString(16).padStart(6, '0') + '"></span>' +
    '<span><span class="n">' + sp.name + '</span><span class="s">' + sp.tag + '</span></span>';
  btn.addEventListener('click', () => {
    if (state.species.id === sp.id) return;
    plant(sp, 160);
    toast('已种下 ' + sp.name);
  });
  return btn;
}

for (const sp of SPECIES_LIST) $('speciesGrid').appendChild(speciesButton(sp));

$('growBtn').addEventListener('click', () => {
  if (!tree || tree.dead) { toast('树已倒下 · 请先重新种树'); return; }
  doPulse(true);
  spawnGrowthBurst();
});
$('boneBtn').addEventListener('click', () => {
  if (!tree || tree.dead) { toast('树已倒下 · 请先重新种树'); return; }
  state.burst = Math.min(state.burst + 14, 28);
  spawnGrowthBurst();
  toast('骨粉催熟 · 连续生长');
});
$('autoBtn').addEventListener('click', () => {
  if (tree && tree.dead) { toast('树已倒下 · 请先重新种树'); return; }
  state.auto = !state.auto;
  updateAutoBtn();
});
$('chopBtn').addEventListener('click', () => {
  if (!tree || tree.dead) { toast('树已倒下 · 请先重新种树'); return; }
  chopAtKey(tree.findTrunkCutKey());
});
$('replantBtn').addEventListener('click', () => {
  plant(state.species, 140);
  toast('已重新种下 ' + state.species.name);
});
$('viewBtn').addEventListener('click', () => {
  camera.position.set(14.5, 10.5, 19);
  controls.target.set(0.5, 6.2, 0.5);
  controls.update();
});

$('speed').addEventListener('input', (e) => {
  state.speed = Number(e.target.value);
  $('speedOut').textContent = state.speed + '×';
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const k = e.key.toLowerCase();
  if (k === 'g') $('growBtn').click();
  else if (k === 'b') $('boneBtn').click();
  else if (k === 'c') $('chopBtn').click();
  else if (k === 'r') $('replantBtn').click();
});

/* 点击树体：射线拾取实例，换算到所属树枝 */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPos = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  downPos = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 6 || !tree || tree.dead) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([leafMesh, nodeMesh], false);
  if (!hits.length) return;

  const hit = hits[0];
  let key = null;
  if (hit.object === nodeMesh) key = view.nodeKeys[hit.instanceId];
  else key = view.leafOwners[hit.instanceId];
  if (key && tree.nodes.has(key)) {
    chopAtKey(key);
  }
});

/* 悬停高亮：Minecraft 风格方块黑框 */
let lastHover = 0;
renderer.domElement.addEventListener('pointermove', (e) => {
  const now = performance.now();
  if (now - lastHover < 70) return;
  lastHover = now;
  if (!tree || tree.dead) {
    outline.visible = false;
    renderer.domElement.style.cursor = 'grab';
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([leafMesh, nodeMesh], false);
  if (!hits.length) {
    outline.visible = false;
    renderer.domElement.style.cursor = 'grab';
    return;
  }
  const hit = hits[0];
  let cell = null;
  if (hit.object === nodeMesh) {
    const key = view.nodeKeys[hit.instanceId];
    if (key) {
      const p = key.split(',');
      cell = { x: +p[0], y: +p[1], z: +p[2] };
    }
  } else {
    cell = view.leafCells[hit.instanceId];
  }
  if (cell) {
    outline.position.set(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
    outline.visible = true;
    renderer.domElement.style.cursor = 'crosshair';
  } else {
    outline.visible = false;
    renderer.domElement.style.cursor = 'grab';
  }
});
renderer.domElement.addEventListener('pointerleave', () => {
  outline.visible = false;
  renderer.domElement.style.cursor = 'grab';
});


/* ============================================================
   主循环
   ============================================================ */

let autoAcc = 0;
let burstAcc = 0;
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  controls.update();
  updateFall(dt);
  particles.update(dt);
  updateClouds(dt);

  if (tree && !tree.dead) {
    if (state.auto) {
      autoAcc += dt;
      const interval = 0.86 / state.speed;
      while (autoAcc >= interval) {
        autoAcc -= interval;
        doPulse(false);
        if (!tree || tree.dead) break;
      }
    }
    if (state.burst > 0) {
      burstAcc += dt;
      if (burstAcc >= 0.075) {
        burstAcc = 0;
        state.burst--;
        doPulse(true);
      }
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
});

/* 初始：种一棵已经长大一点的橡树 */
plant(SPECIES_LIST[0], 200);
toast('拖拽环视 · 点击树体可砍伐');
animate();
