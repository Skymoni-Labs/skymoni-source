import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Track,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Awakening,
  Product,
  Conversation,
  Personalization,
  Closing,
} from "./Scenes";
import { Galaxy } from "./Galaxy";
import { clamp, design } from "../design";
import { Logo } from "./Elements";
import { GuidingMeteor } from "./Guide";

export const BrandFilm = () => {
  const f = useCurrentFrame(),
    { fps } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        background: design.ink,
        fontFamily: design.font,
        overflow: "hidden",
      }}
    >
      <Galaxy />
      <Track name="Story / original forty-second rhythm">
        <Awakening name="01 · 你的世界" from={0} durationInFrames={5 * fps} />
        <Product
          name="02 · 为什么做 Skivu"
          from={5 * fps}
          durationInFrames={7 * fps}
        />
        <Conversation
          name="03 · 灵感有来有往"
          from={12 * fps}
          durationInFrames={11 * fps}
        />
        <Personalization
          name="04 · 以你的方式"
          from={23 * fps}
          durationInFrames={9 * fps}
        />
        <Closing
          name="05 · 属于你的空间"
          from={32 * fps}
          durationInFrames={8 * fps}
        />
      </Track>
      <GuidingMeteor />
      <Track name="Music / preserved first forty-second score">
        <Audio
          name="Original forty-second atmosphere"
          src={staticFile(design.audio.music)}
          durationInFrames={40 * fps}
          volume={
            0.68 *
            interpolate(
              f,
              [0, 1.5 * fps, 37.5 * fps, 40 * fps],
              [0, 1, 1, 0],
              clamp,
            )
          }
        />
      </Track>
      <Track name="Glass and touch / restrained accents">
        <Audio
          name="Distant light"
          from={Math.round(0.7 * fps)}
          durationInFrames={Math.round(1.6 * fps)}
          src={staticFile(design.audio.touch)}
          volume={0.22}
        />
        <Audio
          name="Space revealed"
          from={Math.round(5.4 * fps)}
          durationInFrames={Math.round(3.4 * fps)}
          src={staticFile(design.audio.arrival)}
          volume={0.65}
        />
        <Audio
          name="Reply arrives"
          from={14 * fps}
          durationInFrames={Math.round(1.6 * fps)}
          src={staticFile(design.audio.touch)}
          volume={0.4}
        />
        <Audio
          name="Character selection"
          from={Math.round(23.5 * fps)}
          durationInFrames={Math.round(1.6 * fps)}
          src={staticFile(design.audio.touch)}
          volume={0.35}
        />
        <Audio
          name="Glass adjustment"
          from={Math.round(27.4 * fps)}
          durationInFrames={Math.round(1.6 * fps)}
          src={staticFile(design.audio.touch)}
          volume={0.3}
        />
        <Audio
          name="Model selection"
          from={Math.round(29.6 * fps)}
          durationInFrames={Math.round(1.6 * fps)}
          src={staticFile(design.audio.touch)}
          volume={0.35}
        />
      </Track>
      <Track name="Meteor / four soft activation tones">
        <Audio
          name="AI dialogue ignites"
          from={Math.round(5.9 * fps)}
          durationInFrames={Math.round(1.1 * fps)}
          src={staticFile(design.audio.touch)}
          volume={
            0.12 *
            interpolate(f, [5.9 * fps, 6.5 * fps, 7 * fps], [1, 1, 0], clamp)
          }
        />
        <Audio
          name="Model choice ignites"
          from={Math.round(7.05 * fps)}
          durationInFrames={Math.round(1.1 * fps)}
          src={staticFile(design.audio.touch)}
          volume={
            0.11 *
            interpolate(
              f,
              [7.05 * fps, 7.65 * fps, 8.15 * fps],
              [1, 1, 0],
              clamp,
            )
          }
        />
        <Audio
          name="Character ignites"
          from={Math.round(8.2 * fps)}
          durationInFrames={Math.round(1.1 * fps)}
          src={staticFile(design.audio.touch)}
          volume={
            0.11 *
            interpolate(f, [8.2 * fps, 8.8 * fps, 9.3 * fps], [1, 1, 0], clamp)
          }
        />
        <Audio
          name="Appearance ignites"
          from={Math.round(9.4 * fps)}
          durationInFrames={Math.round(1.1 * fps)}
          src={staticFile(design.audio.touch)}
          volume={
            0.14 *
            interpolate(f, [9.4 * fps, 10 * fps, 10.5 * fps], [1, 1, 0], clamp)
          }
        />
      </Track>
      <Track name="Motion / first-cut gentle sweeps">
        <Audio
          name="Gentle push"
          from={Math.round(19.1 * fps)}
          durationInFrames={Math.round(1.8 * fps)}
          src={staticFile(design.audio.sweep)}
          volume={0.42}
        />
        <Audio
          name="Pull back"
          from={Math.round(31.8 * fps)}
          durationInFrames={Math.round(1.8 * fps)}
          src={staticFile(design.audio.sweep)}
          volume={0.4}
        />
      </Track>
    </AbsoluteFill>
  );
};

export const WebsiteLoop = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        background: design.ink,
        fontFamily: design.font,
        overflow: "hidden",
      }}
    >
      <Galaxy loop />
      <div
        style={{
          position: "absolute",
          left: 175,
          bottom: 120,
          display: "flex",
          alignItems: "center",
          gap: 17,
          color: design.silver,
        }}
      >
        <Logo size={48} />
        <span style={{ fontSize: 44, letterSpacing: -1, fontWeight: 450 }}>
          Skivu
        </span>
      </div>
      <Audio
        name="Optional loop ambience / muted by default"
        src={staticFile(design.audio.loop)}
        durationInFrames={10 * fps}
        volume={0.45}
      />
    </AbsoluteFill>
  );
};
