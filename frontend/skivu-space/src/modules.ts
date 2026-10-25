export type ModuleId = "solar" | "destiny" | "kibo" | "cupola" | "truss" | "arm";
export type ModuleInfo = {
  name: string;
  kicker: string;
  description: string;
  date: string;
  agency: string;
  source: string;
  target: [number, number, number];
  offset: [number, number, number];
};
export const moduleInfo: Record<ModuleId, ModuleInfo> = {
  solar: {
    name: "太阳能阵列",
    kicker: "POWER / SOLAR ARRAY WINGS",
    description:
      "八片主太阳能翼为轨道实验室提供电力。四组主阵列分阶段部署，后续增加 iROSA 卷展式阵列；本场景同时呈现两种翼面结构。",
    date: "主阵列 2000—2009 年分阶段部署",
    agency: "NASA / 国际合作伙伴",
    source: "https://www.nasa.gov/international-space-station/integrated-truss-structure/",
    target: [30, 3, 19],
    offset: [27, 22, 35],
  },
  destiny: {
    name: "命运号实验舱",
    kicker: "RESEARCH / DESTINY LABORATORY",
    description:
      "美国主要研究实验舱，长度约 8.5 米、直径约 4.3 米。舱内实验机架支持微重力科学、生命科学与技术研究。",
    date: "2001 年 2 月 10 日安装",
    agency: "NASA / 美国",
    source: "https://www.nasa.gov/international-space-station/destiny-laboratory-module/",
    target: [0, -3, 4],
    offset: [15, 8, 20],
  },
  kibo: {
    name: "希望号实验舱",
    kicker: "DISCOVERY / JAPANESE EXPERIMENT MODULE",
    description:
      "日本“希望”实验舱的加压舱长 11.2 米、直径 4.4 米，配有物流舱、外部实验平台与机械臂，连接舱内与舱外研究。",
    date: "加压舱 2008 年 6 月 3 日安装",
    agency: "JAXA / 日本",
    source: "https://www.nasa.gov/international-space-station/japanese-experiment-module-kibo/",
    target: [-7, -3, 15],
    offset: [-16, 10, 22],
  },
  cupola: {
    name: "穹顶观测舱",
    kicker: "OBSERVATION / CUPOLA",
    description:
      "六扇侧窗与一扇朝向地球的中央舷窗，形成独特的七窗观测空间，也用于观察机械臂操作、飞船来访和舱外活动。",
    date: "2010 年 2 月 15 日安装",
    agency: "ESA / 欧洲 · NASA 合作",
    source: "https://www.nasa.gov/international-space-station/cupola/",
    target: [-7.5, -7, -4],
    offset: [-7, -11, 10],
  },
  truss: {
    name: "主桁架",
    kicker: "STRUCTURE / INTEGRATED TRUSS",
    description:
      "横贯空间站的外部骨架，由多个桁架段连接而成，承载太阳能翼、散热器、供电和冷却管线。长轴按公开的约 94 米桁架尺度构建。",
    date: "2000—2009 年分阶段组装",
    agency: "NASA / 国际合作伙伴",
    source: "https://www.nasa.gov/international-space-station/integrated-truss-structure/",
    target: [10, 3, 0],
    offset: [30, 20, 30],
  },
  arm: {
    name: "Canadarm2 机械臂",
    kicker: "ROBOTICS / CANADARM2",
    description:
      "长约 17 米，具有七个自由度。机械臂参与空间站组装、设备维护、飞船捕获与舱外作业支持。",
    date: "2001 年 4 月 22 日连接空间站",
    agency: "CSA / 加拿大",
    source: "https://www.asc-csa.gc.ca/eng/iss/canadarm2/data-sheet.asp",
    target: [1, 8, 7],
    offset: [15, 11, 20],
  },
};
