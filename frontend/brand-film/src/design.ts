import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

void loadFont({
  family: "Skivu Sans",
  url: staticFile("fonts/NotoSansSC.ttf"),
  weight: "100 900",
});
export const design = {
  ink: "#030611",
  ice: "#bfdcf1",
  violet: "#bcb3e4",
  silver: "#eef1f9",
  mint: "#a4d8c9",
  muted: "#808ca6",
  font: '"Skivu Sans", sans-serif',
  copy: {
    opening: "你的世界，值得被理解。",
    core: "一个属于你的 AI 空间。",
    conversation: "让灵感，\n有来有往。",
    personal: "以你的方式，\n连接更多可能。",
    cta: "探索 Skivu",
    user: "想把今天零散的灵感，整理成一个开始。",
    assistant: "先选一个你最想实现的。我们把它拆成今天就能完成的第一步。",
  },
  audio: {
    music: "audio/skivu-atmosphere-40s.wav",
    drop: "audio/water-drop.wav",
    touch: "audio/glass-touch.wav",
    sweep: "audio/soft-sweep.wav",
    arrival: "audio/product-arrival.wav",
    loop: "audio/orbit-loop-10s.wav",
  },
};
export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
export const shots = [
  { id: "Awakening", name: "世界苏醒", start: 0, end: 5 },
  { id: "Product", name: "产品出现", start: 5, end: 12 },
  { id: "Conversation", name: "对话与交互", start: 12, end: 23 },
  { id: "Personalization", name: "属于你的空间", start: 23, end: 32 },
  { id: "Closing", name: "品牌收束", start: 32, end: 40 },
];
