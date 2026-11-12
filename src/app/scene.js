import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Tree } from '@dgreenheck/ez-tree';
import { Environment } from './environment';
import { VoxelTree } from './voxelTree';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a new instance of the Three.js scene.
 * @param {THREE.WebGLRenderer} renderer
 */
export async function createScene(renderer) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x94b9f8, 0.0015);

  // 体素岛屿地形 + 天空盒 + 云
  const environment = new Environment();
  scene.add(environment);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2000,
  );
  camera.position.set(21, 11, 21);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = true;
  controls.minPolarAngle = Math.PI * 0.15;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 2;
  controls.maxDistance = 120;
  controls.target.set(0, 4, 0);
  controls.update();

  // 保留 EZ-Tree 的骨架生成与参数系统，但不再渲染平滑网格
  const tree = new Tree();
  tree.loadPreset('Ash Medium');
  tree.branchesMesh.visible = false;
  tree.leavesMesh.visible = false;
  scene.add(tree);

  // 把骨架体素化成方块树
  const voxel = new VoxelTree();
  tree.add(voxel);
  voxel.rebuild(tree);

  const logoElement = document.getElementById('logo');
  const progressElement = document.getElementById('loading-text');
  progressElement.innerHTML = '加载中... 100%';
  logoElement.style.clipPath = 'inset(0% 0% 0% 0%)';
  await sleep(250);
  document.getElementById('loading-screen').style.display = 'none';

  return {
    scene,
    environment,
    tree,
    voxel,
    camera,
    controls
  }
}
