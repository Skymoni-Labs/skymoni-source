import { memo } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp } from "../design";

// Seeded geometry is shared by the film and the surrounding website. No image assets.
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const stars = Array.from({ length: 1650 }, (_, i) => {
  const band = i > 210;
  const x = hash(i + 9) * 2320 - 200;
  const spread = (hash(i + 83) + hash(i + 114) + hash(i + 161) - 1.5) * 145;
  return {
    x: band ? x : hash(i + 1) * 2160 - 120,
    y: band ? 850 - x * 0.38 + spread : hash(i + 2) * 1280 - 100,
    r: band ? 0.25 + hash(i + 3) * 0.66 : 0.5 + hash(i + 3) * 1.1,
    alpha: band ? 0.1 + hash(i + 4) * 0.42 : 0.16 + hash(i + 4) * 0.5,
    color: i % 9 === 0 ? "#c4b5ff" : i % 7 === 0 ? "#88d5f4" : "#d2e5fa",
  };
});

export const GalaxyArt = memo(function GalaxyArt() {
  return (
    <svg
      aria-label="深蓝星空与银河星带"
      width="1920"
      height="1080"
      viewBox="0 0 1920 1080"
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        inset: 0,
        overflow: "visible",
      }}
    >
      <defs>
        <radialGradient id="galaxy-blue">
          <stop stopColor="#2564a5" stopOpacity=".4" />
          <stop offset=".42" stopColor="#264f8d" stopOpacity=".16" />
          <stop offset="1" stopColor="#142449" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="galaxy-purple">
          <stop stopColor="#615099" stopOpacity=".27" />
          <stop offset=".42" stopColor="#403f81" stopOpacity=".16" />
          <stop offset="1" stopColor="#17152c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="galaxy-dust">
          <stop stopColor="#9cabc9" stopOpacity=".13" />
          <stop offset=".4" stopColor="#7586b2" stopOpacity=".07" />
          <stop offset="1" stopColor="#2a3960" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="galaxy-star">
          <stop stopColor="#ecf7ff" />
          <stop offset=".12" stopColor="#abd7ff" stopOpacity=".82" />
          <stop offset=".35" stopColor="#6fa4d8" stopOpacity=".25" />
          <stop offset="1" stopColor="#4884bf" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="1450" cy="265" rx="1050" ry="690" fill="url(#galaxy-blue)" />
      <ellipse cx="330" cy="775" rx="910" ry="580" fill="url(#galaxy-purple)" />
      <g
        style={{
          rotate: "-21deg",
          transformOrigin: "960px 540px",
          mixBlendMode: "screen",
        }}
      >
        <ellipse
          cx="820"
          cy="720"
          rx="1170"
          ry="155"
          fill="url(#galaxy-dust)"
        />
        <ellipse
          cx="1580"
          cy="708"
          rx="850"
          ry="130"
          fill="url(#galaxy-dust)"
        />
        <ellipse
          cx="420"
          cy="745"
          rx="680"
          ry="85"
          fill="url(#galaxy-purple)"
        />
      </g>
      <g>
        {stars.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={s.color}
            opacity={s.alpha}
          />
        ))}
      </g>
      {[
        { x: 1660, y: 185 },
        { x: 1260, y: 332 },
        { x: 415, y: 680 },
        { x: 1430, y: 605 },
        { x: 240, y: 285 },
        { x: 930, y: 935 },
        { x: 1760, y: 810 },
        { x: 710, y: 220 },
        { x: 110, y: 890 },
      ].map((s, i) => (
        <g key={i}>
          <circle
            cx={s.x}
            cy={s.y}
            r={i % 3 === 0 ? 16 : 11}
            fill="url(#galaxy-star)"
            opacity={0.65}
          />
          <circle
            cx={s.x}
            cy={s.y}
            r={i % 3 === 0 ? 1.7 : 1.1}
            fill="#d9edff"
            opacity=".8"
          />
        </g>
      ))}
      <path
        d="M-500 1260 Q960 385 2420 1260"
        fill="none"
        stroke="#c8dbff"
        strokeOpacity=".16"
        strokeWidth="1"
      />
    </svg>
  );
});

export const Galaxy = ({ loop = false }: { loop?: boolean }) => {
  const f = useCurrentFrame(),
    { fps } = useVideoConfig(),
    t = f / fps,
    phase = (2 * Math.PI * t) / 10;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#060b16",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -70,
          scale: loop
            ? 1.045 + Math.sin(phase) * 0.012
            : interpolate(
                f,
                [0, 12 * fps, 32 * fps, 40 * fps],
                [1.08, 1.035, 1.055, 1.02],
                clamp,
              ),
          translate: loop
            ? `${Math.cos(phase) * 5}px ${Math.sin(phase) * 4}px`
            : `${Math.sin(t * 0.06) * 9}px ${Math.cos(t * 0.07) * 6}px`,
          opacity: loop ? 1 : interpolate(f, [0, 2 * fps], [0.38, 1], clamp),
        }}
      >
        <GalaxyArt />
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 45%,transparent 20%,#02050b75 100%)",
        }}
      />
    </div>
  );
};
