# Skivu 宇宙交互场景

独立的 Three.js + TypeScript 项目。当前使用用户提供的 `iss-3d` 空间站展馆，配合 Skivu 首屏和页尾运动星球。页尾保留电影感银河、远月及日出；星球内部云海连续运动，大气边缘固定。未修改 App、后端或整站前端构建配置。

## 本地运行

需要 Node.js 22.12+（本机已验证 Node 24.11.1）。

```powershell
cd E:/zzz/skivu-universe-site-20261025/repository/frontend/skivu-space
npm ci
npm run dev
```

打开 http://127.0.0.1:18941/ 查看独立空间站。`index.html` 为页面，兼容引导入口为 `src/observatory/boot.ts`，按需载入三维入口 `src/observatory/main.ts`；该目录内的 `station.ts` 生成空间站，`Earth.ts` 管理地球，`textures.ts` 生成纹理，`data.ts` 管理资料和特写，`style.css` 为界面样式。`IMPORTED_SOURCE.json` 记录接入前六个源文件的 SHA，`UPSTREAM_README.md` 保留提供项目的说明。没有复制浏览器配置、缓存、截图或 node_modules；原始提供目录保持不变。

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

首屏星球由 `src/hero.ts` 保留原有 1672×941 插画的椭圆轮廓（中心 1400,554；半径 448,420）、银河与已烘焙的大气高光。插画没有背面；为了避免循环裁切图在四分之一圈时拉成长带，内部表面改为 NASA Blue Marble 完整经纬地表和独立云层，以真实球面经纬连续取样并作冰蓝、淡紫调色。`src/planet-surface.ts` 统一纹理加载和球面 Shader。转动后内部地理/云层会变化，不是单幅插画的精确三维复原。原图边缘光固定，不会转入内部形成第二个亮圈。WebGL 不可用时保留静态原图。

页尾全景为 OpenAI 内置图像工具基于既有原创银河主视觉的风格生成：宽阔银河、远月、星球地平线和低位逆光。`src/finale.ts` 保留原有大气轮廓、日出和银河，用匹配地平线的球面投影绘制同一套 NASA 地表和云层，内部持续转动。另有 CSS 缓慢推进、轻微视差与星光呼吸。插画提示词见 `../web/public/skivu/assets/universe-finale-20261025.source.txt`，NASA 素材原始地址、字节和 SHA 见同目录 `earth-blue-marble.source.json`；署名 NASA Goddard Space Flight Center、Reto Stöckli、Robert Simmon，遵循素材声明页列出的 NASA 媒体使用说明，不代表机构背书或实时影像。旧 `src/earth.ts` 和早期 `src/station.ts` 均不作为当前入口。

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

固定种子星空，桌面约 30 fps、手机约 24 fps 上限，限制像素比。不可见场景与后台暂停，宿主动态开关控制星球、空间站及页尾 CSS 动效。桌面阴影图初始化一次，细小太阳翼运动不反复刷新阴影贴图。手机关闭阴影和多重采样、地球纹理降至 512，按材质与顶点属性布局合并静态同级网格；保留模块分组、太阳翼轴和机械臂动画边界。实际速度取决于设备，尚未进行实体手机 GPU 测试。

接入保留拖动、平移、缩放、导航特写、键盘1—6/R、自动旋转与全屏。相机根据侧面信息面板和下方导航计算可见区域；手机不会将模型主体放在面板下面。嵌入时默认关闭滚轮缩放，点击模型或导航进入交互，退出按钮/Escape恢复浏览。父子窗口消息校验同源及窗口来源。减少动态效果下仍可操作模型，镜头切换直接到位。参考分析见 `DESIGN_REFERENCES.md`。

## R5 手机首帧与兼容恢复

首帧直接绘制后才撤下加载层，不等待宿主消息。父子双向就绪握手，返回页面重新同步；子页面也独立观察自身可见性。初始化等待帧带超时，避免手机暂停离屏 iframe 的 RAF 后一直停在加载中。手机视图与桌面视图仍共享同一套完整结构。

三维导入、WebGL 2、着色器或上下文中断时使用内联 SVG 二维结构示意，不伪称三维录屏。导航仍可查看模块资料，提供重新加载入口。可用 `interactive/?compat=1` 主动打开兼容预览，重新加载按钮移除此参数。HTML 也包含无模块浏览器与超时兜底。兼容模式不提供三维旋转/缩放控制。

本轮在桌面浏览器的 390×844 视口验证手机质量分支、无宿主通知的 iframe 首帧和导航、兼容预览及资料切换；不等同于实体手机 GPU 验收。构建目标为 ES2018。当前页仍保留原有减少动态效果选项。
