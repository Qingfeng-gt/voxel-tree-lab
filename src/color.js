import * as THREE from 'three';
import { clamp, hash01 } from './core.js';

/* 叶片水分值 → 方块实例颜色（再乘上灰度叶贴图） */
export function makeLeafColor(species, hydro, seed) {
  const c = new THREE.Color(species.leaf);
  const hsl = {};
  c.getHSL(hsl);
  const t = clamp((hydro - 1) / 6, 0, 1);
  hsl.h = (hsl.h + (1 - t) * 0.028 + (hash01(seed, 3, 7) - 0.5) * 0.025 + 1) % 1;
  hsl.s = clamp(hsl.s * (0.66 + 0.38 * t), 0, 1);
  hsl.l = clamp(hsl.l * (0.82 + 0.45 * t), 0.18, 0.76);
  return c.setHSL(hsl.h, hsl.s, hsl.l);
}
