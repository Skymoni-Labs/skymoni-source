import { Easing, interpolate } from "remotion";
import { clamp } from "../design";
import { Glass, Icon } from "./Elements";
import { IconTile, colors } from "./Showcase";
const ease = { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) };

const RoleMotion = ({ time: t }: { time: number }) => (
  <div style={{ position: "absolute", inset: 0, perspective: 1800 }}>
    <svg width="1480" height="390" style={{ position: "absolute", inset: 0 }}>
      <path
        d="M330 180C610 30 680 250 1010 160"
        fill="none"
        stroke="#a9d9e5"
        strokeOpacity=".3"
        strokeWidth="1"
        strokeDasharray="4 9"
        strokeDashoffset={-t * 22}
      />
    </svg>
    <div
      style={{
        position: "absolute",
        left: 210,
        top: 90,
        width: 210,
        height: 210,
        border: "1px solid #b3d1ee30",
        borderRadius: 46,
        background: "linear-gradient(125deg,#45628950,#24364f70)",
        display: "grid",
        placeItems: "center",
        translate: `${interpolate(t, [0, 0.65], [-120, 0], ease)}px 0px`,
        rotate: `0 1 0 ${interpolate(t, [0, 1], [-22, 0], ease)}deg`,
        boxShadow: "inset 0 1px 1px #e8f3ff30,0 15px 60px #0004",
      }}
    >
      <Icon kind="role" size={125} />
    </div>
    {["创作伙伴", "耐心倾听", "灵感搭档"].map((name, i) => (
      <Glass
        key={name}
        style={{
          position: "absolute",
          left: 90 + i * 170,
          top: i === 1 ? 5 : 270,
          padding: "16px 27px",
          fontSize: 24,
          color: i === 2 ? "#c8eaf7" : "#9aafc8",
          translate: `0px ${interpolate(t, [0, 0.8], [i === 1 ? -60 : 60, 0], ease)}px`,
          opacity: interpolate(t, [0, 0.5], [0, 1], clamp),
          rotate: `${i === 0 ? -5 : i === 2 ? 5 : 0}deg`,
        }}
      >
        {name}
      </Glass>
    ))}
    <Glass
      style={{
        position: "absolute",
        left: 790,
        top: 45,
        width: 500,
        height: 290,
        padding: 35,
        opacity: interpolate(t, [0.45, 0.95], [0, 1], clamp),
        translate: `${interpolate(t, [0.4, 1.2], [130, 0], ease)}px 0px`,
        rotate: `0 1 0 ${interpolate(t, [0.4, 1.2], [15, 0], ease)}deg`,
        borderColor: "#9bd5df70",
      }}
    >
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        <IconTile kind="role" color={colors[2]} size={58} />
        <span style={{ fontSize: 35 }}>灵感搭档</span>
        <span style={{ marginLeft: "auto", color: "#a4ddcd" }}>✓</span>
      </div>
      <p
        style={{
          fontSize: 25,
          color: "#abc1d8",
          lineHeight: 1.9,
          marginTop: 28,
        }}
      >
        从你喜欢的表达方式，
        <br />
        开始一段不同的对话。
      </p>
    </Glass>
  </div>
);

const WallpaperMotion = ({ time: t }: { time: number }) => {
  const hue = interpolate(t, [0.1, 0.95, 1.7], [0, 1, 2], clamp);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          left: 170,
          right: 170,
          top: 5,
          height: 305,
          borderRadius: 32,
          overflow: "hidden",
          border: "1px solid #c2ddff60",
          boxShadow: "0 25px 70px #0004",
          scale: interpolate(t, [0, 1], [0.92, 1], ease),
        }}
      >
        {[
          "linear-gradient(145deg,#12364d,#72a9b6)",
          "linear-gradient(145deg,#27345e,#9385b9)",
          "linear-gradient(145deg,#143c42,#81ab95)",
        ].map((bg, i) => (
          <div
            key={bg}
            style={{
              position: "absolute",
              inset: 0,
              background: bg,
              opacity:
                i === 0
                  ? 1
                  : i === 1
                    ? interpolate(hue, [0, 0.8], [0, 1], clamp)
                    : interpolate(hue, [1, 1.85], [0, 1], clamp),
            }}
          />
        ))}
        <svg
          width="1140"
          height="305"
          style={{
            position: "absolute",
            inset: 0,
            translate: `${interpolate(t, [0, 2], [24, -20], clamp)}px 0px`,
          }}
        >
          <path
            d="M-70 255Q170 65 440 200T1220 70L1220 350H-70Z"
            fill="#d5e3f01a"
            stroke="#e7f3ff65"
            strokeWidth="1"
          />
          <path
            d="M-100 280Q260 110 590 250T1230 115L1230 350H-100Z"
            fill="#bdd3e522"
          />
          <path
            d="M-100 320Q390 180 630 295T1250 200L1250 350H-100Z"
            fill="#0f29452b"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            left: 40,
            bottom: 35,
            fontSize: 38,
            fontWeight: 450,
          }}
        >
          让背景，跟随心情。
        </div>
        <div
          style={{
            position: "absolute",
            right: 35,
            top: 28,
            color: "#d3e8f8",
            fontSize: 19,
            letterSpacing: 3,
          }}
        >
          YOUR BACKGROUND
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 450,
          right: 450,
          top: 345,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {["晨光", "暮色", "森林"].map((name, i) => (
          <div
            key={name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 23,
              color: Math.round(hue) === i ? "#d5f0ff" : "#748daa",
            }}
          >
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 24,
                background: colors[i],
                border:
                  Math.round(hue) === i
                    ? "3px solid #effaff"
                    : "3px solid transparent",
                boxShadow:
                  Math.round(hue) === i ? "0 0 23px #9ad5ff30" : "none",
              }}
            />
            {name}
          </div>
        ))}
      </div>
    </div>
  );
};

const GlassMotion = ({ time: t }: { time: number }) => {
  const amount = interpolate(t, [0.3, 1.5], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 1900 }}>
      <div
        style={{
          position: "absolute",
          left: 350,
          top: 35,
          width: 780,
          height: 260,
          background:
            "radial-gradient(ellipse at 20% 40%,#9bdac750,transparent 52%),radial-gradient(ellipse at 75% 60%,#a7a4e880,transparent 52%)",
          maskImage: "radial-gradient(ellipse,black 30%,transparent 74%)",
        }}
      />
      <Glass
        style={{
          position: "absolute",
          left: 260,
          top: 48,
          width: 960,
          height: 245,
          rotate: `0 1 0 ${interpolate(t, [0, 0.9], [-12, 0], ease)}deg`,
          translate: `${interpolate(t, [0, 0.9], [60, 0], ease)}px 0px`,
          borderColor: "#badfff65",
          background: `linear-gradient(125deg,rgba(209,229,255,${0.08 + amount * 0.16}),rgba(140,177,225,.045))`,
          backdropFilter: `blur(${amount * 15}px)`,
          padding: 35,
          boxShadow: "inset 0 1px 2px #effaff55,0 24px 70px #0003",
        }}
      >
        <Icon kind="style" size={58} />
        <div style={{ fontSize: 37, marginTop: 33 }}>清透与朦胧，刚刚好。</div>
        <div
          style={{
            position: "absolute",
            right: 35,
            top: 38,
            fontSize: 21,
            color: "#b3cee6",
          }}
        >
          {Math.round(amount * 24)} px
        </div>
      </Glass>
      <div
        style={{
          position: "absolute",
          left: 380,
          top: 356,
          width: 660,
          height: 3,
          background: "#bddef32e",
        }}
      >
        <div
          style={{
            width: `${amount * 100}%`,
            height: 3,
            background: "#b2e2dc",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${amount * 100}%`,
            top: -8,
            width: 19,
            height: 19,
            borderRadius: 19,
            background: "#d9f1f0",
            boxShadow: "0 0 28px #b5eee540",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 380,
          top: 385,
          fontSize: 21,
          color: "#8da9c5",
        }}
      >
        玻璃模糊
      </div>
      <div
        style={{
          position: "absolute",
          right: 440,
          top: 385,
          fontSize: 21,
          color: "#8da9c5",
        }}
      >
        随心调节
      </div>
    </div>
  );
};

const ModelMotion = ({ time: t }: { time: number }) => {
  const chosen = t > 0.6;
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 1800 }}>
      <svg width="1480" height="410" style={{ position: "absolute", inset: 0 }}>
        <path
          d="M500 185C650 185 645 160 790 160"
          fill="none"
          stroke="#92cde4"
          strokeWidth="1.2"
          strokeOpacity={chosen ? 0.6 : 0.15}
          strokeDasharray="5 10"
          strokeDashoffset={-t * 35}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 235,
          top: 10,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {["A", "B", "C"].map((name, i) => (
          <Glass
            key={name}
            style={{
              width: 320,
              height: 90,
              padding: "20px 25px",
              display: "flex",
              gap: 20,
              alignItems: "center",
              translate: `${interpolate(t, [0, 0.7], [i % 2 ? 90 : -90, 0], ease)}px 0px`,
              borderColor: chosen && i === 1 ? "#a1dacf85" : "#bdd9f030",
              background:
                chosen && i === 1
                  ? "linear-gradient(125deg,#2d557975,#15263db0)"
                  : "linear-gradient(125deg,#1b304870,#121e3290)",
            }}
          >
            <Icon kind="model" size={40} />
            <span style={{ fontSize: 29 }}>模型 {name}</span>
            {chosen && i === 1 ? (
              <span style={{ color: "#a4d9ca", marginLeft: "auto" }}>✓</span>
            ) : null}
          </Glass>
        ))}
      </div>
      <Glass
        style={{
          position: "absolute",
          left: 790,
          top: 35,
          width: 465,
          height: 270,
          padding: 34,
          opacity: interpolate(t, [0.65, 1.15], [0, 1], clamp),
          scale: interpolate(t, [0.6, 1.4], [0.88, 1], ease),
          borderColor: "#9dcfea75",
        }}
      >
        <IconTile kind="model" color={colors[1]} size={60} />
        <div style={{ fontSize: 39, marginTop: 27 }}>
          模型 B{" "}
          <span style={{ fontSize: 22, color: "#abdfd2", marginLeft: 20 }}>
            已选择
          </span>
        </div>
        <div style={{ fontSize: 23, color: "#a3bad3", marginTop: 18 }}>
          适合此刻的思考方式。
        </div>
      </Glass>
    </div>
  );
};

export const FeatureJourney = ({ time }: { time: number }) => {
  const phase = time < 2 ? 0 : time < 4 ? 1 : time < 6 ? 2 : 3;
  const local = time - [0, 2, 4, 6][phase],
    duration = phase === 3 ? 3 : 2;
  return (
    <div
      style={{
        position: "relative",
        width: 1480,
        height: 430,
        opacity: interpolate(
          local,
          [0, 0.22, duration - 0.2, duration],
          [0, 1, 1, 0],
          clamp,
        ),
      }}
    >
      {phase === 0 ? (
        <RoleMotion time={local} />
      ) : phase === 1 ? (
        <WallpaperMotion time={local} />
      ) : phase === 2 ? (
        <GlassMotion time={local} />
      ) : (
        <ModelMotion time={local} />
      )}
    </div>
  );
};
