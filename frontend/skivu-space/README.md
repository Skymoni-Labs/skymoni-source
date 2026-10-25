# Skivu 宇宙交互场景

独立的 Three.js + TypeScript 项目。包含可独立运行的国际空间站观察器与 Skivu 首屏自转星球；不修改 App 项目、后端或整站前端构建配置。

## 本地运行

需要 Node.js 22.12+（本机已验证 Node 24.11.1）。

```powershell
cd E:/zzz/skivu-universe-site-20261025/repository/frontend/skivu-space
npm ci
npm run dev
```

打开 http://127.0.0.1:18941/ 查看独立空间站。`index.html` 为页面，`src/station.css` 为样式，`src/station.ts` 管理场景与交互，`src/iss-model.ts` 生成模型，`src/procedural.ts` 生成纹理，`src/modules.ts` 管理信息和镜头。

## 构建与宣传页集成

```powershell
npm run build
cd ../web/public
python -m http.server 18940 --bind 127.0.0.1
```

宣传页：http://127.0.0.1:18940/skivu/ ，独立空间站：http://127.0.0.1:18940/skivu/interactive/ 。构建只更新专用的 `frontend/web/public/skivu/interactive` 目录。模块、纹理和轨道交互都由代码生成，没有 GLB/GLTF/OBJ 或远程模型、地球纹理下载；Three.js 也打包为本站本地模块。

左键/单指旋转，滚轮/双指缩放，右键/双指平移。右侧菜单与模型点选均可切换特写和资料。底部可切换自动旋转、重置、全屏。嵌入宣传页时先拖动或点击模型进入滚轮交互，右上角“退出交互”或 Escape 可恢复网页滚动。

## 尺度与真实性边界

空间站坐标 1 单位 = 1 米，主要舱段使用公开长度与直径，主桁架约 94 米，阵列横跨约 109 米。命运号、希望号及其物流/暴露平台、穹顶七窗、机械臂与主阵列分别建模。舱门、栏杆、蒙皮、机构文字等为程序化细节。附属舱段、连接关系与设备经过简化，整体不构成工程级 1:1 数字孪生，也不声称是当前每个在轨附件的完整配置。

地球为程序绘制的海洋、近似大陆、云层与冰盖，非卫星照片。背景单独采用公里单位：地球半径 6371 km，空间站到地心 6771 km（约 400 km 示意高度）；与前景米制相机共用姿态，保留正确的半径/高度比例和地平线视角。不是实时星历，也不显示实时 ISS 经纬度。

首屏星球由 `src/hero.ts` 使用原有 1672×941 背景作为正面投影纹理，初始投影以原图椭圆轮廓为基准（中心 1400,554；半径 448,420）。球面纹理自转，边缘与光照保留原图基准；单幅图没有记录的右侧/背面通过连续镜像延展，不能把这些区域理解为真实地理恢复。星空仍使用原来的背景。WebGL 不可用或减少动态效果时保留静态原图。

## 资料来源

- [NASA：空间站尺寸、轨道周期与概况](https://www.nasa.gov/international-space-station/space-station-facts-and-figures/)
- [NASA：主桁架与太阳能阵列安装时间](https://www.nasa.gov/international-space-station/integrated-truss-structure/)
- [NASA：命运号实验舱](https://www.nasa.gov/international-space-station/destiny-laboratory-module/)
- [NASA：希望号实验舱](https://www.nasa.gov/international-space-station/japanese-experiment-module-kibo/)
- [JAXA：希望号尺寸与构成](https://global.jaxa.jp/projects/iss_human/kibo/index.html)
- [NASA：穹顶观测舱](https://www.nasa.gov/international-space-station/cupola/)
- [CSA：Canadarm2 数据表](https://www.asc-csa.gc.ca/eng/iss/canadarm2/data-sheet.asp)
- [Three.js：OrbitControls 文档](https://threejs.org/docs/pages/OrbitControls.html)

上述机构名称用于事实介绍，没有使用机构官方图形标识或暗示机构背书。运行时第三方许可随构建写入 `interactive/THIRD_PARTY_NOTICES.txt`。

## 动画与性能

固定种子星空，桌面约 30 fps、手机约 24 fps 上限，限制像素比。不可见场景暂停、尊重减少动态效果，宿主动态开关同时控制两处 3D 场景。主要桁架梁合并为一个几何体，太阳能电池网格使用程序纹理，减少绘制调用。实际速度仍取决于设备，尚未进行实体手机 GPU 测试。
