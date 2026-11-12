# 第三方开源组件声明（Third-Party Notices）

本项目（Voxel Tree Lab）基于 [EZ-Tree](https://github.com/dgreenheck/ez-tree) 二次开发，并使用了以下开源组件与资源。

---

## 1. EZ-Tree（@dgreenheck/ez-tree）

- 版本：1.1.0
- 来源：https://github.com/dgreenheck/ez-tree
- 许可证：MIT
- 用途：程序化树木生成核心算法，`src/lib/` 为其源码。

```
MIT License

Copyright (c) 2024 Daniel Greenheck

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 2. Three.js

- 版本：^0.167
- 来源：https://github.com/mrdoob/three.js
- 许可证：MIT
- 用途：3D 渲染引擎，以及 GLTFExporter、OrbitControls 等 addons。
- 随 Three.js 一同使用的 [fflate](https://github.com/101arrowz/fflate)（ZIP 压缩，MIT）也遵循同一许可。

```
MIT License

Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 3. Heroicons

- 来源：https://github.com/tailwindlabs/heroicons
- 许可证：MIT
- 用途：`src/app/ui.js` 中的界面 SVG 图标路径。

```
MIT License

Copyright (c) Tailwind Labs, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 4. Font Awesome Free 6

- 版本：6.0.0-beta3，通过 cdnjs 加载
- 来源：https://fontawesome.com/
- 许可证：
  - 图标：CC BY 4.0（https://creativecommons.org/licenses/by/4.0/）
  - 字体：SIL OFL 1.1（https://scripts.sil.org/OFL）
  - 代码：MIT
- 用途：About 弹窗中的社交平台图标。

## 5. Space Grotesk（Google Fonts）

- 来源：https://fonts.google.com/specimen/Space+Grotesk
- 许可证：SIL Open Font License 1.1
- 用途：界面标题与正文字体。

## 6. ambientCG 树皮贴图

- 来源：https://ambientcg.com/（Bark001 ~ Bark015）
- 许可证：Creative Commons CC0 1.0 Universal（公共领域贡献）
- 用途：树皮材质贴图。
- 详细清单见 [`src/app/public/textures/LICENSE.md`](./src/app/public/textures/LICENSE.md)。

## 7. 开发工具

| 工具 | 许可证 | 用途 |
| --- | --- | --- |
| [Vite](https://vitejs.dev/) | MIT | 开发服务器与构建 |
| [Prettier](https://prettier.io/) | MIT | 代码格式化 |
| [vite-plugin-dts](https://github.com/qmhc/vite-plugin-dts) | MIT | 构建库类型声明 |
| [vite-plugin-static-copy](https://github.com/sapphi-red/vite-plugin-static-copy) | MIT | 复制静态资源 |

## 8. 上游演示资源

以下资源随上游 EZ-Tree 仓库提供，本项目原样保留：

- 树叶贴图：`src/app/public/textures/leaves/`（上游说明为随项目许可提供）
- 低模模型：`src/app/public/models/*.glb`（花朵、草、岩石）
- 环境音效：`src/app/public/audio/ambience.mp3`
- 字体：`src/app/public/fonts/dumbeldor.ttf`
- Logo 与背景图：`src/app/public/images/`

这些资源的原始授权以上游仓库及其作者说明为准；如需商用或再分发，请自行核实。若权利人提出异议，请移除对应资源。

---

如有遗漏或授权疑问，请提交 Issue 指正。
