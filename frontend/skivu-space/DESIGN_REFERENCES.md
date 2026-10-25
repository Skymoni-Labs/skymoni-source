# 宇宙场景参考与本轮应用

查看日期：2026-10-25。参考页面仅用于观察视觉与交互方法，不复制页面代码、文案、布局或视觉资产。

| 参考 | 实际观察 | 对 Skivu 的应用 |
| --- | --- | --- |
| [NASA Eyes on the Solar System](https://eyes.nasa.gov/apps/solar-system/) · [官方介绍](https://science.nasa.gov/eyes/) | 主天体、细轨道线、远景星空形成尺度差；主体可探索，控制界面放在视口边缘 | 保留宽阔负空间与已有独立空间站观察器，行星表面与固定光照分别处理，避免整个光晕跟随表面转动 |
| [earth.nullschool](https://earth.nullschool.net/) · [数据与说明](https://earth.nullschool.net/about.html) | 地球轮廓清楚，流线持续运动，界面克制；动态依附于明确的球面 | 页尾地表与云层分层、以不同速度缓慢移动；停留时有细微生命感，离屏暂停以控制成本；不复用其数据、流线代码或视觉资产 |
| [Solar System Scope](https://www.solarsystemscope.com/) · [球面纹理说明](https://www.solarsystemscope.com/textures/) | 大幅天体建立规模感；真正完整的经纬贴图可以连续自转，单张摄影构图不能直接当完整球面 | 页尾使用来源清楚的 NASA 全地球经纬数据；首屏仍保留原创插画，明确是风格延展，限制采样范围并让边缘光固定，避免伪装成真实地理还原 |

## 本轮素材

实际加入页面的是 [NASA Blue Marble 2002](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/) 的地表、云层与东半球合成图；未下载或使用以上三个参考网站的代码、UI 或截图。

署名：NASA Goddard Space Flight Center；Reto Stöckli（地表、浅水及云层），Robert Simmon（海洋颜色、合成与三维地球）。遵守 [NASA 媒体使用说明](https://www.nasa.gov/nasa-brand-center/images-and-media/)，保留素材说明，不含人员或 NASA 官方标志，不表示任何合作或背书。完整下载地址、尺寸和校验值随 `earth-blue-marble.source.json` 保存。

## 真实性和验证边界

- 首屏是原创银河插画的表面动效，背面不是额外卫星观测数据。
- 页尾是基于真实卫星资料的历史合成地球，日照与自转是宣传视觉编排，不是实时地理状态。
- 空间站仍是程序化比例结构示意，背景大陆为近似绘制；本轮没有把它宣称成卫星影像。
- 全圈角度检查使用临时本地检查页，只替换动画角度与运动混合量，保留相同生产着色器。该检查页与控制代码不进入发布包。
