# Skivu 宇宙交互场景

独立的 Three.js + TypeScript 项目。当前使用用户提供的 `iss-3d` 空间站展馆，配合 Skivu 首屏星球。页尾改为独立生成的电影感银河全景，不再挂载上一版的纯地球球面。未修改 App、后端或整站前端构建配置。

## 本地运行

需要 Node.js 22.12+（本机已验证 Node 24.11.1）。

```powershell
cd E:/zzz/skivu-universe-site-20261025/repository/frontend/skivu-space
npm ci
npm run dev
```

打开 http://127.0.0.1:18941/ 查看独立空间站。`index.html` 为页面，当前实际入口为 `src/observatory/main.ts`；该目录内的 `station.ts` 生成空间站，`Earth.ts` 管理地球，`textures.ts` 生成纹理，`data.ts` 管理资料和特写，`style.css` 为界面样式。`IMPORTED_SOURCE.json` 记录接入前六个源文件的 SHA，`UPSTREAM_README.md` 保留提供项目的说明。没有复制浏览器配置、缓存、截图或 node_modules；原始提供目录保持不变。

## 构建与宣传页集成

```powershell
npm run build
cd ../web/public
python -m http.server 18940 --bind 127.0.0.1
```

宣传页：http://127.0.0.1:18940/skivu/ ，独立空间站：http://127.0.0.1:18940/skivu/interactive/ 。构建只更新专用的 `frontend/web/public/skivu/interactive` 目录。空间站及其纹理由代码生成，没有 GLB/GLTF/OBJ，Three.js 打包在本站，运行时不依赖第三方 CDN。

左键/单指旋转，滚轮/双指缩放，右键/双指平移。右侧菜单与模型点选均可切换特写和资料。底部可切换自动旋转、重置、全屏。嵌入宣传页时先拖动或点击模型进入滚轮交互，右上角“退出交互”或 Escape 可恢复网页滚动。

## 尺度与真实性边界

空间站坐标 1 单位 = 1 米，主要舱段使用公开长度与直径，主桁架约 94 米，阵列横跨约 109 米。命运号、希望号及其物流/暴露平台、穹顶七窗、机械臂与主阵列分别建模。舱门、栏杆、蒙皮、机构文字等为程序化细节。附属舱段、连接关系与设备经过简化，整体不构成工程级 1:1 数字孪生，也不声称是当前每个在轨附件的完整配置。

地球沿用 `iss-3d` 的程序化海陆、云层与冰盖，非卫星照片。地球半径 6,371,000 米、示意高度 408,000 米，使用对数深度缓冲。接入时为云层和大气自定义 Shader 补齐相同的对数深度写入，避免它们与实体地球深度不一致形成白色硬边。不是实时星历或遥测。

首屏星球由 `src/hero.ts` 使用原有 1672×941 插画，以原图椭圆轮廓为基准（中心 1400,554；半径 448,420）。这不是完整球面贴图：原图边缘包含已烘焙的大气高光，右侧和背面没有数据。表面运动改为两条内侧纹理的周期交叠，互补 sin² 权重在接缝前归零；仅采样原图球体内部，原图边缘光固定。避免将高光随球面旋转到内部形成第二个亮圈，也避免镜像经度在四分之一圈时拉成长带。背面仍是风格延展，不是真实地理恢复。原图星空、构图和配色保留；WebGL 不可用或减少动态效果时保留静态原图。

页尾全景为 OpenAI 内置图像工具基于既有原创银河主视觉的风格生成：宽阔银河、远月、星球地平线和低位逆光，配合 CSS 缓慢推进、轻微视差与星光呼吸。完整提示词与资产记录见 `../web/public/skivu/assets/universe-finale-20261025.source.txt`。上一版的 `src/earth.ts` 与 NASA 贴图保留作历史参考，但不再作为当前页面入口加载；早期 `src/station.ts` 等文件也不是当前空间站入口。

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

固定种子星空，桌面约 30 fps、手机约 24 fps 上限，限制像素比。不可见场景与后台暂停，宿主动态开关控制星球、空间站及页尾 CSS 动效。空间站保留提供项目的细节与阴影，阴影图初始化一次，细小太阳翼运动不反复刷新阴影贴图。实际速度取决于设备，尚未进行实体手机 GPU 测试。

接入保留拖动、平移、缩放、导航特写、键盘1—6/R、自动旋转与全屏。相机根据侧面信息面板和下方导航计算可见区域；手机不会将模型主体放在面板下面。嵌入时默认关闭滚轮缩放，点击模型或导航进入交互，退出按钮/Escape恢复浏览。父子窗口消息校验同源及窗口来源。减少动态效果下仍可操作模型，镜头切换直接到位。参考分析见 `DESIGN_REFERENCES.md`。
