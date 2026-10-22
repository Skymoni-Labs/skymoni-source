import type { CSSProperties, ReactNode } from "react";
import { interpolate, staticFile } from "remotion";
import { clamp, design } from "../design";

export const Logo = ({ size = 64 }: { size?: number }) => (
  <div
    aria-label="Skivu 标识"
    style={{
      width: size,
      height: size,
      background: design.silver,
      maskImage: `url(${staticFile("brand/skivu.png")})`,
      maskMode: "luminance",
      maskSize: "contain",
      maskRepeat: "no-repeat",
    }}
  />
);

export const glass: CSSProperties = {
  boxSizing: "border-box",
  background: "linear-gradient(125deg,#1c304bc9,#111e33c9 52%,#151d32c9)",
  border: "1px solid #b2d8f547",
  boxShadow:
    "inset 0 1px 1px #dcefff35,inset 0 -1px 1px #b5d9f212,0 24px 80px #00000035",
  borderRadius: 28,
};

export const Glass = ({
  children,
  style,
}: {
  children?: ReactNode;
  style?: CSSProperties;
}) => <div style={{ ...glass, ...style }}>{children}</div>;

/** An open glass ribbon, not an orb, device, or screen. Its motion is periodic. */
export const LightRibbon = ({
  time = 0,
  opacity = 1,
}: {
  time?: number;
  opacity?: number;
}) => (
  <svg
    aria-label="星空中的玻璃光带"
    width="1100"
    height="850"
    viewBox="0 0 1100 850"
    style={{
      overflow: "visible",
      opacity,
      rotate: `${-9 + Math.sin(time * 0.15) * 2}deg`,
      translate: `0px ${Math.sin(time * 0.22) * 9}px`,
    }}
  >
    <defs>
      <linearGradient id="open-glass" x1="0" y1="1" x2="1" y2="0">
        <stop stopColor="#88c9e8" stopOpacity=".02" />
        <stop offset=".42" stopColor="#b2d9ec" stopOpacity=".13" />
        <stop offset=".69" stopColor="#c5b8e7" stopOpacity=".22" />
        <stop offset="1" stopColor="#bde5eb" stopOpacity=".02" />
      </linearGradient>
      <linearGradient id="open-edge" x1="0" y1="1" x2="1" y2="0">
        <stop stopColor="#bfe6ff" stopOpacity="0" />
        <stop offset=".42" stopColor="#d0e8ff" stopOpacity=".3" />
        <stop offset=".65" stopColor="#e0dcff" stopOpacity=".9" />
        <stop offset="1" stopColor="#bfe6ff" stopOpacity="0" />
      </linearGradient>
    </defs>
    <path
      d="M-50 735 C180 645 245 310 510 240 C760 175 840 410 1180 70 L1180 150 C870 488 747 259 523 318 C285 381 217 704 -50 790Z"
      fill="url(#open-glass)"
    />
    <path
      d="M-50 735 C180 645 245 310 510 240 C760 175 840 410 1180 70"
      fill="none"
      stroke="url(#open-edge)"
      strokeWidth="1.8"
    />
    <path
      d="M-50 790 C217 704 285 381 523 318 C747 259 870 488 1180 150"
      fill="none"
      stroke="url(#open-edge)"
      strokeWidth=".7"
      opacity=".5"
    />
    <path
      d="M-80 803 C220 720 290 408 530 347 C760 290 875 515 1180 176"
      fill="none"
      stroke="url(#open-edge)"
      strokeWidth=".7"
      opacity=".18"
    />
  </svg>
);

export const Icon = ({
  kind,
  size = 54,
}: {
  kind: "chat" | "role" | "model" | "style";
  size?: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {kind === "chat" ? (
      <>
        <path d="M13 14h38v28H30L18 51v-9h-5z" />
        <path d="M23 24h18M23 32h12" />
      </>
    ) : kind === "role" ? (
      <>
        <circle cx="32" cy="23" r="10" />
        <path d="M13 53c0-20 38-20 38 0" />
      </>
    ) : kind === "model" ? (
      <>
        <path d="m32 9 23 13-23 13L9 22 32 9Zm-23 23 23 13 23-13M9 42l23 13 23-13" />
      </>
    ) : (
      <>
        <path d="m14 11 39 9-9 35-34-8 4-36Z" />
        <path d="m23 17 34 17-16 27M19 35l7-7 13 17" />
        <circle cx="39" cy="27" r="3" />
      </>
    )}
  </svg>
);

export const MessagePair = ({ time }: { time: number }) => {
  const reply = design.copy.assistant.slice(
    0,
    Math.floor(
      interpolate(time, [1.8, 5.8], [0, design.copy.assistant.length], clamp),
    ),
  );
  const push = interpolate(
    time,
    [0, 7.1, 7.7, 7.9, 8.1, 8.8, 9.45, 9.7, 10],
    [0, 0, 1.012, 0.995, 1, 1, -0.006, 0.002, 0],
    clamp,
  );
  return (
    <div style={{ position: "relative", width: 780, height: 550 }}>
      <Glass
        style={{
          position: "absolute",
          left: 90,
          top: 15,
          width: 650,
          padding: "30px 36px",
          color: "#d5e8f7",
          fontSize: 34,
          lineHeight: 1.7,
          background: "linear-gradient(125deg,#32618f70,#17334e9c)",
          translate: `${push * 20}px ${Math.sin(time * 0.5) * 3}px`,
        }}
      >
        {design.copy.user.split("，")[0]}，<br />
        {design.copy.user.split("，")[1]}
      </Glass>
      <Glass
        style={{
          position: "absolute",
          left: 0,
          top: 242,
          width: 720,
          height: 320,
          padding: "32px 38px",
          fontSize: 34,
          lineHeight: 1.85,
          color: design.silver,
          opacity: interpolate(time, [1.35, 1.85], [0, 1], clamp),
          translate: `${push * 48}px ${interpolate(time, [1.35, 2.2], [22, 0], clamp)}px`,
          rotate: `0 1 0 ${push * -3}deg`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 20,
            letterSpacing: 2,
            color: design.mint,
            marginBottom: 15,
          }}
        >
          <Logo size={27} /> SKIVU
        </div>
        <span>
          {reply.split("。").map((line, i) => (
            <span key={i}>
              {i > 0 ? <br /> : null}
              {line}
              {i < reply.split("。").length - 1 ? "。" : ""}
            </span>
          ))}
        </span>
        <span style={{ opacity: time < 5.8 ? 0.6 : 0, color: design.mint }}>
          │
        </span>
      </Glass>
    </div>
  );
};

export const FeatureObjects = ({ time }: { time: number }) => {
  const phase = time < 2 ? 0 : time < 4 ? 1 : time < 6 ? 2 : 3;
  const local = time - [0, 2, 4, 6][phase];
  const limit = phase === 3 ? 3 : 2;
  const alpha = interpolate(
    local,
    [0, 0.35, limit - 0.3, limit],
    [0, 1, 1, 0],
    clamp,
  );
  return (
    <div
      style={{
        width: 760,
        height: 500,
        position: "relative",
        perspective: 1800,
      }}
    >
      <div
        style={{
          opacity: alpha,
          translate: `0px ${interpolate(local, [0, 0.7], [28, 0], clamp)}px`,
          rotate: `0 1 0 ${interpolate(local, [0, 0.8], [-3, 0], clamp)}deg`,
        }}
      >
        {phase === 0 ? (
          <div style={{ display: "flex", gap: 22, paddingTop: 55 }}>
            {["灵感搭档", "耐心倾听", "创作伙伴"].map((name, i) => (
              <Glass
                key={name}
                style={{
                  width: 225,
                  height: 278,
                  padding: 28,
                  boxSizing: "border-box",
                  translate: `0px ${i === 1 ? -22 : 14}px`,
                  background:
                    i === 1
                      ? "linear-gradient(145deg,#b8deeb39,#a6b0da18)"
                      : glass.background,
                  borderColor: i === 1 ? "#afddd48c" : "#d3e2ff30",
                  color: i === 1 ? design.mint : design.ice,
                }}
              >
                <Icon kind="role" size={64} />
                <div
                  style={{ fontSize: 27, marginTop: 48, color: design.silver }}
                >
                  {name}
                </div>
                <div
                  style={{ fontSize: 19, color: design.muted, marginTop: 12 }}
                >
                  {i === 1 ? "以你的偏好" : "不同的相遇"}
                </div>
              </Glass>
            ))}
          </div>
        ) : null}
        {phase === 1 ? (
          <div style={{ display: "flex", gap: 22, paddingTop: 55 }}>
            {[
              "linear-gradient(150deg,#10283c,#7b9cae 70%,#cbd7d5)",
              "linear-gradient(155deg,#151d37,#64618e 65%,#ada8ce)",
              "linear-gradient(150deg,#143a3b,#637f78 70%,#bed0bb)",
            ].map((bg, i) => (
              <Glass
                key={bg}
                style={{
                  width: 225,
                  height: 278,
                  background: bg,
                  padding: 25,
                  boxSizing: "border-box",
                  translate: `0px ${i === 1 ? -22 : 14}px`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: 175,
                    borderRadius: "50%",
                    borderTop: "1px solid #ffffff50",
                    rotate: "-30deg",
                    scale: 2.5,
                    translate: "0px 190px",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    bottom: 25,
                    left: 25,
                    fontSize: 25,
                    color: "#eef1f9",
                  }}
                >
                  {["晨光", "暮色", "森林"][i]}
                </span>
              </Glass>
            ))}
          </div>
        ) : null}
        {phase === 2 ? (
          <>
            <div
              style={{
                position: "absolute",
                top: 30,
                left: 50,
                width: 650,
                height: 290,
                background:
                  "radial-gradient(ellipse at 25% 65%,#73d7c544,transparent 60%),radial-gradient(ellipse at 80% 20%,#b0a1ff55,transparent 65%)",
                maskImage: "radial-gradient(ellipse,black 25%,transparent 72%)",
              }}
            />
            <Glass
              style={{
                position: "relative",
                top: 45,
                left: 20,
                width: 640,
                height: 255,
                padding: 40,
                boxSizing: "border-box",
                background: `linear-gradient(125deg,#e8efff${Math.round(interpolate(local, [0, 1.5], [28, 70], clamp)).toString(16)},#c7e2ff12)`,
                backdropFilter: `blur(${interpolate(local, [0.3, 1.5], [0, 14], clamp)}px)`,
              }}
            >
              <Icon kind="style" size={58} />
              <div style={{ fontSize: 32, marginTop: 35 }}>
                光影，恰如所愿。
              </div>
            </Glass>
            <div
              style={{
                position: "absolute",
                top: 355,
                left: 65,
                width: 575,
                height: 3,
                background: "#b8cce430",
              }}
            >
              <div
                style={{
                  height: 3,
                  width: `${interpolate(local, [0.25, 1.5], [25, 78], clamp)}%`,
                  background: design.mint,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: -9,
                  left: `${interpolate(local, [0.25, 1.5], [25, 78], clamp)}%`,
                  width: 20,
                  height: 20,
                  borderRadius: 20,
                  background: "#d2ebe7",
                  boxShadow: "0 0 20px #c4eee52f",
                }}
              />
            </div>
          </>
        ) : null}
        {phase === 3 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              padding: "12px 20px",
            }}
          >
            {["模型 A", "模型 B", "模型 C"].map((name, i) => (
              <Glass
                key={name}
                style={{
                  height: 105,
                  boxSizing: "border-box",
                  padding: "23px 28px",
                  display: "flex",
                  alignItems: "center",
                  gap: 25,
                  color: i === 1 ? design.mint : design.ice,
                  borderColor: i === 1 ? "#a4d8c980" : "#d3e2ff30",
                  background:
                    i === 1
                      ? "linear-gradient(125deg,#a1e5d42b,#c9d7ef12)"
                      : glass.background,
                  translate: `${i === 1 ? -18 : 0}px 0px`,
                }}
              >
                <Icon kind="model" size={44} />
                <span style={{ fontSize: 30, color: design.silver }}>
                  {name}
                </span>
                {i === 1 ? (
                  <span style={{ marginLeft: "auto", fontSize: 22 }}>
                    已选择 ✓
                  </span>
                ) : null}
              </Glass>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
