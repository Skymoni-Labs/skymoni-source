import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { clamp, design } from "../design";

const starPoints = Array.from({ length: 64 }, (_, i) => ({
  x: (i * 7919 + 631) % 1920,
  y: (i * 3571 + 127) % 760,
  r: i % 13 === 0 ? 1.4 : 0.45 + (i % 4) * 0.17,
  phase: i * 1.414,
}));
export const Space = ({ loop = false }: { loop?: boolean }) => {
  const frame = useCurrentFrame(),
    { fps } = useVideoConfig();
  const t = frame / fps;
  const phase = loop ? (2 * Math.PI * frame) / (10 * fps) : t * 0.07;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: design.ink,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -120,
          background:
            "radial-gradient(ellipse at 68% 49%,#25274438,transparent 47%), radial-gradient(ellipse at 43% 73%,#37476622,transparent 53%)",
          scale: loop
            ? 1.03 + Math.sin(phase) * 0.015
            : 1 + Math.min(t, 40) * 0.002,
        }}
      />
      <svg
        width={1920}
        height={1080}
        viewBox="0 0 1920 1080"
        style={{ position: "absolute", inset: 0, width: 1920, height: 1080 }}
      >
        <defs>
          <linearGradient id="space-horizon">
            <stop stopColor="#b2cbe0" stopOpacity="0" />
            <stop offset=".35" stopColor="#b2cbe0" stopOpacity=".2" />
            <stop offset=".53" stopColor="#c3d3f3" stopOpacity=".65" />
            <stop offset=".7" stopColor="#b2cbe0" stopOpacity=".2" />
            <stop offset="1" stopColor="#b2cbe0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g
          opacity={
            loop
              ? 0.6
              : interpolate(
                  frame,
                  [0, 5 * fps, 12 * fps],
                  [0.12, 0.6, 0.55],
                  clamp,
                )
          }
        >
          {starPoints.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              fill="#d6deef"
              opacity={
                0.24 +
                0.3 * (0.5 + 0.5 * Math.sin(phase * (loop ? 1 : 2) + s.phase))
              }
            />
          ))}
        </g>
        <path
          d="M-700 1250 Q960 335 2620 1250"
          stroke="url(#space-horizon)"
          strokeWidth={1.3}
          fill="none"
          opacity={
            loop
              ? 0.8
              : interpolate(
                  frame,
                  [0, 3 * fps, 12 * fps, 32 * fps, 36 * fps],
                  [0.08, 0.4, 0.8, 0.65, 0.9],
                  clamp,
                )
          }
        />
        <path
          d="M-700 1260 Q960 345 2620 1260"
          stroke="#a5c4e1"
          strokeWidth={12}
          opacity={0.025}
          fill="none"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 350,
          right: 350,
          top: 675,
          height: 400,
          background:
            "radial-gradient(ellipse at 50% 20%,#a5c9f61a,transparent 64%)",
          maskImage:
            "linear-gradient(transparent,black 25%,black 80%,transparent)",
          opacity: loop
            ? 0.8
            : interpolate(
                frame,
                [0, 5 * fps, 32 * fps, 36 * fps],
                [0.05, 0.6, 0.6, 1],
                clamp,
              ),
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -40,
          left: -100,
          right: -100,
          height: 310,
          background: "linear-gradient(transparent,#02050bd9)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

export const Orbit = ({
  time = 0,
  opacity = 0.55,
}: {
  time?: number;
  opacity?: number;
}) => (
  <div
    style={{
      position: "absolute",
      left: -180,
      top: 180,
      width: 1250,
      height: 520,
      rotate: `${-19 + Math.sin(time * 0.08) * 2}deg`,
      opacity,
      pointerEvents: "none",
    }}
  >
    <svg
      width={1250}
      height={520}
      viewBox="0 0 1250 520"
      style={{ width: 1250, height: 520, overflow: "visible" }}
    >
      <defs>
        <linearGradient id="orbit-line">
          <stop stopColor="#9fc2dd" stopOpacity="0" />
          <stop offset=".4" stopColor="#9fc2dd" stopOpacity=".08" />
          <stop offset=".67" stopColor="#ddd6ef" stopOpacity=".6" />
          <stop offset="1" stopColor="#9fc2dd" stopOpacity=".05" />
        </linearGradient>
      </defs>
      <ellipse
        cx={625}
        cy={260}
        rx={610}
        ry={205}
        fill="none"
        stroke="url(#orbit-line)"
        strokeWidth={1.1}
      />
      <ellipse
        cx={625}
        cy={260}
        rx={610}
        ry={205}
        fill="none"
        stroke="#abc3e4"
        strokeWidth={10}
        opacity={0.016}
      />
    </svg>
  </div>
);
