import type { CSSProperties } from "react";
import { interpolate } from "remotion";
import { clamp, design } from "../design";
import { Glass, Icon, Logo } from "./Elements";

export const colors = ["#8dcaf2", "#b9a7e7", "#9ed8c6", "#d8c0a0"];
export const IconTile = ({
  kind,
  color = colors[0],
  size = 58,
}: {
  kind: "chat" | "role" | "style" | "model";
  color?: string;
  size?: number;
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.29,
      background: `linear-gradient(135deg,${color}ee,${color}bb)`,
      color: "#213b55",
      display: "grid",
      placeItems: "center",
      boxShadow: `0 6px 25px ${color}12`,
      flexShrink: 0,
    }}
  >
    <Icon kind={kind} size={size * 0.6} />
  </div>
);

const activationTimes = [0.9, 2.05, 3.2, 4.4];
const meteorNodes = [
  [-100, -40],
  [75, 85],
  [505, 225],
  [70, 415],
  [495, 525],
  [930, 680],
];
const meteorTimes = [0.1, ...activationTimes, 5.3];
const meteorPoint = (time: number) => {
  const seg = Math.min(
    4,
    Math.max(
      0,
      (time >= meteorTimes[5]
        ? 5
        : meteorTimes.findIndex((v, i) => i > 0 && time < v)) - 1,
    ),
  );
  const u = Math.max(
    0,
    Math.min(
      1,
      (time - meteorTimes[seg]) / (meteorTimes[seg + 1] - meteorTimes[seg]),
    ),
  );
  const p0 = meteorNodes[Math.max(0, seg - 1)],
    p1 = meteorNodes[seg],
    p2 = meteorNodes[seg + 1],
    p3 = meteorNodes[Math.min(5, seg + 2)];
  return [0, 1].map(
    (k) =>
      0.5 *
      (2 * p1[k] +
        (-p0[k] + p2[k]) * u +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u),
  );
};
const Meteor = ({ time, namespace }: { time: number; namespace: string }) => {
  const head = meteorPoint(time),
    tail = meteorPoint(time - 0.24);
  const trail = Array.from({ length: 20 }, (_, i) =>
    meteorPoint(time - 0.24 + (i * 0.24) / 19).join(","),
  ).join(" ");
  return (
    <svg
      aria-label="流星依次点亮四个模块"
      width="850"
      height="670"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 3,
        opacity: interpolate(time, [0.1, 0.4, 4.95, 5.3], [0, 1, 1, 0], clamp),
      }}
    >
      <defs>
        <linearGradient
          id={`${namespace}-meteor-trail`}
          x1={tail[0]}
          y1={tail[1]}
          x2={head[0]}
          y2={head[1]}
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#90ccff" stopOpacity="0" />
          <stop offset=".75" stopColor="#a7d9ff" stopOpacity=".6" />
          <stop offset="1" stopColor="#ecf8ff" />
        </linearGradient>
        <radialGradient id={`${namespace}-meteor-halo`}>
          <stop stopColor="#effbff" stopOpacity=".9" />
          <stop offset=".15" stopColor="#b9e5ff" stopOpacity=".6" />
          <stop offset="1" stopColor="#7cb9ed" stopOpacity="0" />
        </radialGradient>
      </defs>
      <polyline
        points={trail}
        stroke={`url(#${namespace}-meteor-trail)`}
        strokeWidth="13"
        opacity=".06"
        fill="none"
        strokeLinecap="round"
      />
      <polyline
        points={trail}
        stroke={`url(#${namespace}-meteor-trail)`}
        strokeWidth="5"
        opacity=".22"
        fill="none"
        strokeLinecap="round"
      />
      <polyline
        points={trail}
        stroke={`url(#${namespace}-meteor-trail)`}
        strokeWidth="1.7"
        fill="none"
        strokeLinecap="round"
      />
      <circle
        cx={head[0]}
        cy={head[1]}
        r="19"
        fill={`url(#${namespace}-meteor-halo)`}
      />
      <circle cx={head[0]} cy={head[1]} r="2.6" fill="#f5fcff" />
    </svg>
  );
};
export const FeatureConstellation = ({
  time,
  namespace = "film",
  showMeteor = true,
}: {
  time: number;
  namespace?: string;
  showMeteor?: boolean;
}) => (
  <div
    style={{ position: "relative", width: 850, height: 670, perspective: 1800 }}
  >
    <svg width="850" height="670" style={{ position: "absolute", inset: 0 }}>
      <ellipse
        cx="430"
        cy="340"
        rx="395"
        ry="250"
        fill="none"
        stroke="#a9c5e5"
        strokeOpacity=".13"
        strokeWidth="1"
        style={{ rotate: "-20deg", transformOrigin: "430px 340px" }}
      />
    </svg>
    {[
      {
        kind: "chat" as const,
        label: "AI 对话",
        sub: "让每一个想法，有来有往。",
        x: 20,
        y: 30,
        w: 390,
      },
      {
        kind: "model" as const,
        label: "模型选择",
        sub: "找到适合当下的思考方式。",
        x: 450,
        y: 170,
        w: 350,
      },
      {
        kind: "role" as const,
        label: "角色设定",
        sub: "不同的相遇，自己的偏好。",
        x: 15,
        y: 360,
        w: 370,
      },
      {
        kind: "style" as const,
        label: "个性外观",
        sub: "壁纸、字体与玻璃，都由你。",
        x: 440,
        y: 470,
        w: 390,
      },
    ].map((item, i) => {
      const lit = interpolate(
        time,
        [activationTimes[i] - 0.1, activationTimes[i] + 0.23],
        [0, 1],
        clamp,
      );
      const pulse = interpolate(
        time,
        [
          activationTimes[i] - 0.07,
          activationTimes[i] + 0.09,
          activationTimes[i] + 0.6,
        ],
        [0, 1, 0],
        clamp,
      );
      return (
        <Glass
          key={item.kind}
          style={{
            position: "absolute",
            left: item.x,
            top: item.y,
            width: item.w,
            height: 152,
            padding: 28,
            translate: `0px ${Math.sin(time * 0.55 + i * 1.4) * 3}px`,
            rotate: `0 1 0 ${i % 2 === 0 ? 3 : -3}deg`,
            opacity: interpolate(time, [0, 0.45], [0, 1], clamp),
            borderColor: `rgba(171,215,247,${0.12 + lit * 0.25 + pulse * 0.35})`,
            background: `linear-gradient(125deg,rgba(31,54,82,${0.35 + lit * 0.4}),rgba(13,24,41,${0.48 + lit * 0.3}))`,
            boxShadow: `inset 0 1px 1px rgba(218,240,255,${0.07 + lit * 0.15}),0 16px 55px #0004,0 0 ${22 + pulse * 30}px rgba(126,192,242,${pulse * 0.2 + lit * 0.025})`,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 19,
              alignItems: "center",
              opacity: 0.35 + lit * 0.65,
            }}
          >
            <IconTile kind={item.kind} color={colors[i]} size={55} />
            <span style={{ fontSize: 30, fontWeight: 500 }}>{item.label}</span>
            <span
              style={{ marginLeft: "auto", fontSize: 27, color: "#91abc4" }}
            >
              ↗
            </span>
          </div>
          <div
            style={{
              fontSize: 21,
              color: "#9eafc7",
              marginTop: 18,
              opacity: 0.4 + lit * 0.6,
            }}
          >
            {item.sub}
          </div>
        </Glass>
      );
    })}
    {showMeteor ? <Meteor time={time} namespace={namespace} /> : null}
  </div>
);

const card: CSSProperties = {
  width: 390,
  height: 340,
  padding: 35,
  boxSizing: "border-box",
  position: "relative",
};
export const AppearanceGallery = ({ time }: { time: number }) => {
  const phase = time < 2 ? 0 : time < 4 ? 1 : time < 6 ? 2 : 3;
  const local = time - [0, 2, 4, 6][phase],
    limit = phase === 3 ? 3 : 2;
  const fade = interpolate(
    local,
    [0, 0.35, limit - 0.25, limit],
    [0, 1, 1, 0],
    clamp,
  );
  const select = interpolate(local, [0.4, 0.9], [0, 1], clamp);
  return (
    <div
      style={{
        position: "relative",
        width: 1480,
        height: 460,
        perspective: 2100,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 34,
          justifyContent: "center",
          opacity: fade,
          translate: `${interpolate(local, [0, 0.8], [35, 0], clamp)}px ${interpolate(local, [0, 0.9], [22, 0], clamp)}px`,
        }}
      >
        {[0, 1, 2].map((i) => {
          const active = i === 1;
          return (
            <Glass
              key={`${phase}-${i}`}
              style={{
                ...card,
                translate: `0px ${active ? -18 : 24}px`,
                rotate: `0 1 0 ${active ? 0 : i === 0 ? 9 : -9}deg`,
                background:
                  phase === 1
                    ? [
                        "linear-gradient(155deg,#133e59,#6097aa 65%,#b9dbdb)",
                        "linear-gradient(155deg,#202f62,#766ca2 65%,#d3bfe6)",
                        "linear-gradient(155deg,#163d43,#538178 65%,#bed4ba)",
                      ][i]
                    : active
                      ? "linear-gradient(135deg,#253c59bd,#111e35de)"
                      : "linear-gradient(135deg,#152338ca,#0b1322da)",
                borderColor: active ? "#94c8f17c" : "#c6d9f12c",
                boxShadow: active
                  ? "inset 0 1px 1px #d5ecff40,0 24px 70px #0004,0 0 65px #79b9ed0b"
                  : "inset 0 1px 1px #d5ecff15,0 22px 60px #0003",
              }}
            >
              {phase === 0 ? (
                <>
                  <IconTile kind="role" color={colors[i]} size={70} />
                  <div style={{ fontSize: 37, marginTop: 55, fontWeight: 450 }}>
                    {["灵感搭档", "耐心倾听", "创作伙伴"][i]}
                  </div>
                  <div
                    style={{ fontSize: 23, color: "#9bafc9", marginTop: 17 }}
                  >
                    以你的偏好，定义相遇。
                  </div>
                </>
              ) : null}
              {phase === 1 ? (
                <>
                  <div
                    style={{
                      height: 170,
                      width: 450,
                      borderTop: "1px solid #edf7ff50",
                      borderRadius: "50%",
                      rotate: "-24deg",
                      position: "absolute",
                      left: -40,
                      top: 170,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: 34,
                      left: 35,
                      fontSize: 37,
                      fontWeight: 450,
                    }}
                  >
                    {["晨光", "暮色", "森林"][i]}
                  </div>
                  <span
                    style={{
                      fontSize: 18,
                      letterSpacing: 3,
                      color: "#ecf5ffbb",
                    }}
                  >
                    YOUR BACKGROUND
                  </span>
                </>
              ) : null}
              {phase === 2 ? (
                <>
                  <div
                    style={{
                      position: "absolute",
                      inset: 15,
                      borderRadius: 30,
                      background: `radial-gradient(ellipse at 35% 40%,${colors[i]}45,transparent 65%)`,
                    }}
                  />
                  <Glass
                    style={{
                      position: "relative",
                      height: 170,
                      padding: 25,
                      background: `linear-gradient(130deg,#dceeff${Math.round(15 + select * (i + 1) * 10).toString(16)},#bbc6ff05)`,
                      backdropFilter: `blur(${3 + select * (i + 1) * 3}px)`,
                    }}
                  >
                    <Icon kind="style" size={50} />
                    <div style={{ fontSize: 25, marginTop: 12 }}>
                      透过光，看见层次。
                    </div>
                  </Glass>
                  <div
                    style={{ fontSize: 28, marginTop: 24, color: colors[i] }}
                  >
                    {["清透", "柔和", "朦胧"][i]}
                  </div>
                  <div
                    style={{
                      height: 3,
                      background: "#c9e1ff25",
                      marginTop: 23,
                      width: "100%",
                    }}
                  >
                    <div
                      style={{
                        height: 3,
                        width: `${22 + select * (i + 1) * 20}%`,
                        background: colors[i],
                      }}
                    />
                  </div>
                </>
              ) : null}
              {phase === 3 ? (
                <>
                  <IconTile kind="model" color={colors[i]} size={70} />
                  <div style={{ fontSize: 37, marginTop: 55 }}>
                    模型 {["A", "B", "C"][i]}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: active ? design.mint : "#92a6be",
                      fontSize: 23,
                      marginTop: 17,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: 8,
                        background: "currentColor",
                      }}
                    />
                    {active ? "已选择 · 适合此刻" : "更多思考方式"}
                  </div>
                </>
              ) : null}
              {active && phase !== 2 ? (
                <div
                  style={{
                    position: "absolute",
                    top: 29,
                    right: 28,
                    width: 31,
                    height: 31,
                    borderRadius: 31,
                    border: "1px solid #b6e2db70",
                    background: "#b6e2db19",
                    color: "#b5e4db",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 21,
                  }}
                >
                  ✓
                </div>
              ) : null}
            </Glass>
          );
        })}
      </div>
    </div>
  );
};

export const ChatIdentity = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      color: "#c2daf0",
      fontSize: 23,
      letterSpacing: 1,
    }}
  >
    <div
      style={{
        width: 43,
        height: 43,
        borderRadius: 15,
        display: "grid",
        placeItems: "center",
        background: "#88bce825",
      }}
    >
      <Logo size={30} />
    </div>
    SKIVU{" "}
    <span
      style={{
        marginLeft: "auto",
        fontSize: 19,
        letterSpacing: 0,
        color: "#86aecc",
      }}
    >
      一个想法的开始
    </span>
  </div>
);
