import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { clamp, design } from "../design";
import { Logo, MessagePair } from "./Elements";
import { FeatureConstellation } from "./Showcase";
import { FeatureJourney } from "./FeatureJourney";
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const base = { fontFamily: design.font, color: "#eef5ff" };
const blueText = {
  background: "linear-gradient(110deg,#d7efff,#84c7f3 75%,#b9b8eb)",
  backgroundClip: "text",
  color: "transparent",
};

const AwakeningInner = () => {
  const f = useCurrentFrame(),
    { fps } = useVideoConfig();
  return (
    <>
      <Interactive.Div
        name="Opening / a world worth understanding"
        style={{
          ...base,
          position: "absolute",
          left: 180,
          right: 180,
          top: 360,
          textAlign: "center",
          opacity: interpolate(
            f,
            [0, 1.3 * fps, 4.1 * fps, 5 * fps],
            [0, 1, 1, 0],
            clamp,
          ),
          translate: interpolate(f, [0, 5 * fps], ["0px 28px", "0px -8px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <div
          style={{
            fontSize: 20,
            letterSpacing: 8,
            color: "#a8bfd9",
            marginBottom: 32,
          }}
        >
          A SPACE, FOR YOU
        </div>
        <div
          style={{
            fontSize: 77,
            fontWeight: 450,
            letterSpacing: 2,
            lineHeight: 1.5,
          }}
        >
          你的世界，<span style={blueText}>值得被理解。</span>
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#9fb0ca",
            marginTop: 27,
            letterSpacing: 2,
          }}
        >
          让每一个想法，都有自己的去处。
        </div>
      </Interactive.Div>
    </>
  );
};
const ProductInner = () => {
  const f = useCurrentFrame(),
    { fps } = useVideoConfig();
  return (
    <>
      <Interactive.Div
        name="Brand / a personal AI space"
        style={{
          ...base,
          position: "absolute",
          left: 165,
          top: 260,
          width: 800,
          opacity: interpolate(
            f,
            [0.15 * fps, 1.35 * fps, 6.1 * fps, 7 * fps],
            [0, 1, 1, 0],
            clamp,
          ),
          translate: interpolate(f, [0, 3 * fps], ["0px 36px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 23 }}>
          <Logo size={88} />
          <span
            style={{
              fontSize: 153,
              fontWeight: 550,
              letterSpacing: -6,
              ...blueText,
            }}
          >
            Skivu
          </span>
        </div>
        <div
          style={{
            fontSize: 55,
            lineHeight: 1.55,
            fontWeight: 450,
            marginTop: 23,
          }}
        >
          一个属于你的
          <br />
          <span style={blueText}>AI 空间。</span>
        </div>
        <div
          style={{
            fontSize: 27,
            color: "#a3b6ce",
            marginTop: 32,
            lineHeight: 1.9,
          }}
        >
          我们相信，AI 的空间
          <br />
          应该由你来定义。
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="Floating feature constellation"
        style={{
          ...base,
          position: "absolute",
          left: 935,
          top: 175,
          opacity: interpolate(
            f,
            [0, 1 * fps, 6.2 * fps, 7 * fps],
            [0, 1, 1, 0],
            clamp,
          ),
          scale: interpolate(f, [0, 7 * fps], [0.93, 1], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <FeatureConstellation time={f / fps} showMeteor={false} />
      </Interactive.Div>
    </>
  );
};
const ConversationInner = () => {
  const f = useCurrentFrame(),
    { fps } = useVideoConfig();
  return (
    <>
      <Interactive.Div
        name="Dialogue / ideas turn into a first step"
        style={{
          ...base,
          position: "absolute",
          left: 165,
          top: 300,
          width: 655,
          opacity: interpolate(
            f,
            [0, 0.85 * fps, 10.1 * fps, 11 * fps],
            [0, 1, 1, 0],
            clamp,
          ),
          translate: interpolate(f, [0, 2 * fps], ["0px 22px", "0px 0px"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <div
          style={{
            fontSize: 19,
            letterSpacing: 4,
            color: "#8cafce",
            marginBottom: 32,
          }}
        >
          01 · A CONVERSATION, A BEGINNING
        </div>
        <div style={{ fontSize: 88, fontWeight: 500, lineHeight: 1.35 }}>
          让灵感，
          <br />
          <span style={blueText}>有来有往。</span>
        </div>
        <div
          style={{
            fontSize: 29,
            lineHeight: 1.9,
            color: "#a3b6ce",
            marginTop: 38,
          }}
        >
          从一个想法，
          <br />
          到今天能迈出的第一步。
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="Free floating conversation / streaming reply"
        style={{
          ...base,
          position: "absolute",
          left: 960,
          top: 260,
          perspective: 1800,
          opacity: interpolate(
            f,
            [0, 0.85 * fps, 10.2 * fps, 11 * fps],
            [0, 1, 1, 0],
            clamp,
          ),
          scale: interpolate(
            f,
            [0, 2 * fps, 9.7 * fps, 11 * fps],
            [0.94, 1, 1, 0.97],
            { ...clamp, easing: ease },
          ),
          rotate: interpolate(f, [0, 2 * fps], ["0 1 0 -4deg", "0 1 0 0deg"], {
            ...clamp,
            easing: ease,
          }),
        }}
      >
        <MessagePair time={f / fps} />
      </Interactive.Div>
    </>
  );
};
const PersonalizationInner = () => {
  const f = useCurrentFrame(),
    { fps } = useVideoConfig(),
    t = f / fps,
    phase = t < 2 ? 0 : t < 4 ? 1 : t < 6 ? 2 : 3;
  return (
    <Interactive.Div
      name="Personalization / a curved gallery of your choices"
      style={{
        ...base,
        position: "absolute",
        inset: 0,
        opacity: interpolate(
          f,
          [0, 0.6 * fps, 8.4 * fps, 9 * fps],
          [0, 1, 1, 0],
          clamp,
        ),
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 155,
          left: 150,
          right: 150,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 19,
            letterSpacing: 5,
            color: "#8eaccb",
            marginBottom: 25,
          }}
        >
          02 · MADE YOURS
        </div>
        <div style={{ fontSize: 65, fontWeight: 500 }}>
          以你的方式，<span style={blueText}>连接更多可能。</span>
        </div>
        <div style={{ fontSize: 28, color: "#a3b6ce", marginTop: 18 }}>
          同一个 App，慢慢成为你的样子。
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 480,
          right: 480,
          top: 363,
          display: "flex",
          justifyContent: "center",
          gap: 14,
        }}
      >
        {["角色选择", "自定义壁纸", "玻璃质感", "模型选择"].map((name, i) => (
          <div
            key={name}
            style={{
              fontSize: 23,
              padding: "12px 25px",
              borderRadius: 14,
              color: i === phase ? "#c8e8fc" : "#8197b5",
              border: `1px solid ${i === phase ? "#8ac8ef65" : "#c4daf315"}`,
              background: i === phase ? "#7cb2ec1a" : "#101e3425",
            }}
          >
            {name}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", top: 494, left: 220 }}>
        <FeatureJourney time={t} />
      </div>
    </Interactive.Div>
  );
};
const ClosingInner = () => {
  const f = useCurrentFrame(),
    { fps } = useVideoConfig();
  return (
    <Interactive.Div
      name="Closing / Skivu brand"
      style={{
        ...base,
        position: "absolute",
        left: 180,
        right: 180,
        top: 300,
        textAlign: "center",
        opacity: interpolate(f, [0.3 * fps, 2.3 * fps], [0, 1], clamp),
        translate: interpolate(f, [0, 3.5 * fps], ["0px 30px", "0px 0px"], {
          ...clamp,
          easing: ease,
        }),
      }}
    >
      <div
        style={{
          fontSize: 20,
          letterSpacing: 7,
          color: "#96b5d4",
          marginBottom: 24,
        }}
      >
        SK · I VALUE YOU
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 28,
        }}
      >
        <Logo size={104} />
        <span
          style={{
            fontSize: 173,
            fontWeight: 550,
            letterSpacing: -7,
            ...blueText,
          }}
        >
          Skivu
        </span>
      </div>
      <div style={{ fontSize: 53, fontWeight: 400, marginTop: 32 }}>
        {design.copy.core}
      </div>
    </Interactive.Div>
  );
};
export const Awakening = Interactive.create({
  Component: AwakeningInner,
  layout: "absolute-fill",
  schema: { ...Interactive.backgroundSchema },
});
export const Product = Interactive.create({
  Component: ProductInner,
  layout: "absolute-fill",
  schema: { ...Interactive.backgroundSchema },
});
export const Conversation = Interactive.create({
  Component: ConversationInner,
  layout: "absolute-fill",
  schema: { ...Interactive.backgroundSchema },
});
export const Personalization = Interactive.create({
  Component: PersonalizationInner,
  layout: "absolute-fill",
  schema: { ...Interactive.backgroundSchema },
});
export const Closing = Interactive.create({
  Component: ClosingInner,
  layout: "absolute-fill",
  schema: { ...Interactive.backgroundSchema },
});
