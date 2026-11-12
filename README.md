# Voxel Tree Lab

面向**方块体素游戏**的程序化树木生长研究项目，用于探索树木形态、分枝规则与生长参数，为游戏内的树木生成提供参考。

本项目基于开源项目 [EZ-Tree](https://github.com/dgreenheck/ez-tree)（作者 Daniel Greenheck）二次开发，保留其骨架生成算法，并把树木、树叶与地形全部改为**体素方块渲染**。

- 中文界面
- 体素渲染：树干、树枝、树叶与岛屿地形均由方块组成，默认树木高度约 7~15 个方块（视预设而定），接近方块游戏中的树木比例
- 连续动态生长：树干从根部向上、侧枝向外、树叶最后出现，可暂停 / 重播 / 调整时长
- 小型体素岛屿地形：可调岛屿半径、地形起伏、随机种子与水面
- 方块外观可定义：颜色、自定义贴图、自定义 GLB 模型、JSON 配置导入导出
- 数十个可实时调节的树木参数（分枝层级、角度、弯曲度、锥度、叶片密度等）
- 导出 GLB 模型、PNG 截图、方块数据 JSON 与预设 JSON

> 本项目是独立的研究/演示项目，与 EZ-Tree 原作者无隶属关系。原始项目的名称、版权与许可声明见下文「开源引用与致谢」。

## 快速开始

```bash
npm install
npm run dev
```

开发模式直接使用 `src/lib` 中的库源码，修改后会热更新。

如需以生产方式构建演示应用（先构建库，再构建应用）：

```bash
npm run app
```

构建产物输出到 `dist/`。也可以使用 Docker：

```bash
docker compose up -d
```

## 体素与生长模型

### 树木如何变成方块

1. 使用 EZ-Tree 生成树枝骨架（每段树枝的位置、方向和半径）。
2. 按「树木缩放」把骨架整体缩放。默认缩放下，白蜡树（中）约 12 个方块高、树干 1 格宽，接近方块游戏中常见的大型橡树；可在 0.04~0.3 之间调整。
3. 半径小于 1 格的细枝使用 1 格宽的线条体素化（类似 Minecraft 的树枝），较粗的树干按圆柱填充方块。
4. 在每个叶片骨架位置生成一簇树叶方块（球状随机分布），并自动去重；「树冠起始高度」会裁掉下部叶片，让树干露出来。
5. 每个方块记录一个**生长时间**（0~1）：按它到树根的距离排序，树干先长、侧枝后长、树叶最后出现；时间上加少量随机抖动，避免整排方块同时出现。

树木重建只在下一帧执行一次，滑块连续拖动不会反复卡顿。界面的「体素与生长」中可以调整树木缩放、方块尺寸、生长时长、树叶密度和树冠起始高度。

### 方块定义

所有方块类型在 `src/app/blocks.js` 中注册（木头、树叶、草、泥土、石头、沙子、水）。每种方块支持：

- **颜色**：界面中直接调整（会与程序化像素纹理相乘）。
- **自定义贴图**：在「方块定义」中选择方块类型后导入图片。
- **自定义 GLB 模型**：模型会被自动居中并缩放为 1×1×1 的方块。
- **JSON 配置**：导出/导入所有方块的颜色与自定义贴图（贴图以 data URL 保存）。

一棵树默认只使用**木头**和**树叶**两种方块，尽量少用自定义模型；地形使用草、泥土、石头、沙子和水。

### 导出

- **GLB**：将体素树合并为普通网格导出，便于导入游戏引擎。
- **方块数据 JSON**：每个方块的坐标、类型与生长时间，便于做数据分析或在自己的体素引擎中重放生长过程。
- **PNG**：导出当前视角的透明背景截图。

## 开源引用与致谢

本项目的核心能力来自以下开源项目与资源：

| 项目 / 资源 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| [EZ-Tree](https://github.com/dgreenheck/ez-tree)（`@dgreenheck/ez-tree`） | 1.1.0 | MIT | 程序化树木生成核心算法（`src/lib/` 即其源码） |
| [Three.js](https://threejs.org/) | ^0.167 | MIT | 3D 渲染引擎 |
| [GLTFExporter](https://threejs.org/docs/#examples/en/exporters/GLTFExporter) | 随 Three.js | MIT | 导出 GLB 模型 |
| [fflate](https://github.com/101arrowz/fflate) | 随 Three.js addons | MIT | 导出 LOD 时压缩 ZIP |
| [Heroicons](https://heroicons.com/) | 轮廓图标 | MIT | 界面 SVG 图标 |
| [Font Awesome Free](https://fontawesome.com/) | 6.0.0-beta3（CDN） | 图标 CC BY 4.0 / 字体 SIL OFL 1.1 / 代码 MIT | About 弹窗社交图标 |
| [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk)（Google Fonts） | — | SIL OFL 1.1 | 界面字体 |
| [ambientCG](https://ambientcg.com/) 树皮贴图 | 1K JPG | CC0 1.0 | 树皮材质（见 `src/app/public/textures/LICENSE.md`） |

开发工具：[Vite](https://vitejs.dev/)（MIT）、[Prettier](https://prettier.io/)（MIT）。

上游 EZ-Tree 仓库附带的演示资源（树叶贴图、低模 GLB、环境音效、字体等）随仓库一并保留；其中树叶贴图按上游说明随项目 MIT 许可提供，其余第三方资源的授权请以其原始来源为准。如需商用，请自行核实每项资源的许可。

完整的第三方声明见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

## 相对上游的改动

- 界面文案全面中文化
- 新增体素渲染层：树木、树叶与地形全部由方块组成（`blocks.js` / `voxelTree.js` / `voxelTerrain.js`）
- 新增连续生长动画：按方块到根部的距离依次生长，可暂停、重播、调速
- 新增小型体素岛屿地形与方块定义系统（颜色 / 贴图 / GLB / JSON）
- 移除平滑网格的 LOD 预览与 LOD 导出，改为体素方块数据与体素 GLB 导出
- 移除上游的 Google Analytics 统计与自定义域名配置
- 移除上游的 npm 发布工作流，保留 GitHub Pages 部署工作流
- 贴图资源改为直接提交（不使用 Git LFS），克隆后无需 `git lfs pull`
- 包名 / 版本 / 仓库地址改为本项目信息

## 树木参数说明

### 通用

- `seed`：随机种子，相同种子生成相同树木
- `type`：树木类型（`TreeType.Deciduous` 落叶树 / `TreeType.Evergreen` 常绿树）

### 树皮 `bark`

- `type`：树皮贴图类型（`BarkType`）
- `tint`：颜色色调（十六进制）
- `flatShading` / `textured`：平面着色 / 是否使用贴图
- `textureScale`：贴图在 X、Y 方向的缩放

### 树枝 `branch`

- `levels`：递归分枝层级数（0 表示只有树干）
- `angle`：各层级相对父枝的生长角度（度）
- `children`：各层级的子枝数量
- `force`：外部生长力，含 `direction` 与 `strength`
- `gnarliness`：各层级的弯曲/扭曲程度
- `length` / `radius`：各层级枝条长度 / 半径
- `sections`：沿枝条长度的分段数
- `segments`：枝条横截面的圆周细分
- `start`：子枝在父枝上的起始位置（0~1）
- `taper`：各层级的锥度（0~1）
- `twist`：各层级的扭转程度

### 树叶 `leaves`

- `type`：叶片贴图类型（`LeafType`）
- `billboard`：`Single` / `Double`，单面或十字交叉双面叶片
- `angle` / `count` / `start`：叶片角度、数量、起始位置
- `size` / `sizeVariance`：叶片大小与大小随机差异
- `tint`：叶片色调
- `alphaTest`：叶片透明度裁剪阈值

### LOD

本项目使用体素渲染，不使用 EZ-Tree 的平滑网格 LOD。`src/lib/tree.js` 仍保留 `generateLODs()` / `createGeometry()` 接口，方便在上游库或自定义渲染器中使用。

## 目录结构

```
src/lib/          树木骨架生成库（来自 EZ-Tree，MIT）
src/app/blocks.js       方块类型注册表、材质、贴图/模型/JSON 配置
src/app/voxelTree.js    树枝骨架 → 体素方块 + 生长动画
src/app/voxelTerrain.js 体素岛屿地形
src/app/ui.js           Three.js 演示应用与中文界面
src/app/public/         贴图、模型、字体、音效等静态资源
```

## 许可证

本项目沿用上游的 [MIT License](./LICENSE)。原始版权声明：

> Copyright (c) 2024 Daniel Greenheck

根据 MIT 许可，分发本项目的副本时须保留上述版权声明与许可声明。

## 相关链接

- 上游项目：https://github.com/dgreenheck/ez-tree
- 上游在线演示：https://eztree.dev
