import * as THREE from 'three';
import { Skybox } from './skybox';
import { VoxelTerrain } from './voxelTerrain';
import { Clouds } from './clouds';

/**
 * 场景环境：体素岛屿 + 天空盒 + 云层。
 * 原有的平滑地面、草丛与岩石已被体素地形替代。
 */
export class Environment extends THREE.Object3D {
  constructor() {
    super();

    this.terrain = new VoxelTerrain();
    this.terrain.rebuild();
    this.add(this.terrain);

    this.skybox = new Skybox();
    this.add(this.skybox);

    this.clouds = new Clouds();
    this.clouds.position.set(0, 200, 0);
    this.clouds.rotation.x = Math.PI / 2;
    this.add(this.clouds);
  }

  update(elapsedTime) {
    this.clouds.update(elapsedTime);
  }
}
