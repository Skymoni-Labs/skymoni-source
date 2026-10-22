import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp } from "../design";
// One continuous, frame-driven route. Feature triggers share these exact times.
const route = [
  [0, 180, 170],
  [1.4, 600, 310],
  [2.8, 1150, 580],
  [4.3, 1720, 190],
  [5.9, 1010, 260],
  [7.05, 1440, 400],
  [8.2, 1005, 590],
  [9.4, 1430, 700],
  [11, 1770, 450],
  [12.6, 1700, 300],
  [14, 1005, 540],
  [16, 960, 720],
  [18, 1680, 835],
  [20, 1770, 550],
  [22, 1080, 900],
  [23.4, 545, 680],
  [24.3, 740, 590],
  [24.8, 1040, 605],
  [25.2, 550, 840],
  [26, 1050, 620],
  [26.7, 1480, 805],
  [27.3, 600, 850],
  [28.5, 1260, 850],
  [29.6, 500, 655],
  [30.4, 1060, 655],
  [31.5, 1680, 760],
  [33, 1560, 400],
  [34.6, 740, 430],
  [35.7, 1100, 735],
  [37.8, 1700, 510],
  [40, 2010, 120],
];
export const guidePoint = (time: number) => {
  const t = Math.max(0, Math.min(40, time));
  let k = route.findIndex((v, i) => i > 0 && t < v[0]) - 1;
  if (k < 0) k = t >= 40 ? route.length - 2 : 0;
  const a = route[k],
    b = route[k + 1],
    prev = route[Math.max(0, k - 1)],
    next = route[Math.min(route.length - 1, k + 2)];
  const u = (t - a[0]) / (b[0] - a[0]);
  if (t >= 27.3 && t <= 28.5) return [600 + ((t - 27.3) / 1.2) * 660, 850];
  return [1, 2].map((d) => {
    const m0 = ((b[d] - prev[d]) / (b[0] - prev[0])) * (b[0] - a[0]) * 0.72;
    const m1 = ((next[d] - a[d]) / (next[0] - a[0])) * (b[0] - a[0]) * 0.72;
    return (
      (2 * u * u * u - 3 * u * u + 1) * a[d] +
      (u * u * u - 2 * u * u + u) * m0 +
      (-2 * u * u * u + 3 * u * u) * b[d] +
      (u * u * u - u * u) * m1
    );
  });
};
export const GuidingMeteor = () => {
  const f = useCurrentFrame(),
    { fps } = useVideoConfig(),
    time = f / fps;
  const head = guidePoint(time),
    tail = guidePoint(time - 0.22);
  const trail = Array.from({ length: 22 }, (_, i) =>
    guidePoint(time - 0.22 + (i * 0.22) / 21).join(","),
  ).join(" ");
  return (
    <svg
      aria-label="贯穿影片、触发功能变化的引导流星"
      width="1920"
      height="1080"
      viewBox="0 0 1920 1080"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity: interpolate(
          f,
          [0, 0.5 * fps, 37.5 * fps, 40 * fps],
          [0, 0.9, 0.9, 0],
          clamp,
        ),
      }}
    >
      <defs>
        <linearGradient
          id="film-guide-tail"
          x1={tail[0]}
          y1={tail[1]}
          x2={head[0]}
          y2={head[1]}
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#8acbff" stopOpacity="0" />
          <stop offset=".75" stopColor="#b7e5ff" stopOpacity=".6" />
          <stop offset="1" stopColor="#f2fbff" />
        </linearGradient>
        <radialGradient id="film-guide-head">
          <stop stopColor="#effaff" stopOpacity=".85" />
          <stop offset=".2" stopColor="#a9dfff" stopOpacity=".4" />
          <stop offset="1" stopColor="#6dabe9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <polyline
        points={trail}
        fill="none"
        stroke="url(#film-guide-tail)"
        strokeWidth="12"
        opacity=".07"
        strokeLinecap="round"
      />
      <polyline
        points={trail}
        fill="none"
        stroke="url(#film-guide-tail)"
        strokeWidth="5"
        opacity=".2"
        strokeLinecap="round"
      />
      <polyline
        points={trail}
        fill="none"
        stroke="url(#film-guide-tail)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx={head[0]} cy={head[1]} r="16" fill="url(#film-guide-head)" />
      <circle cx={head[0]} cy={head[1]} r="2.25" fill="#f3fcff" />
    </svg>
  );
};
