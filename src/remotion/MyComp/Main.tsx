import { fontFamily, loadFont } from "@remotion/google-fonts/Inter";
import React, { useMemo } from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import {
  buildNarrativeOutline,
  CompositionProps,
  PptOutlineScene,
  SCENE_DURATION_FRAMES,
  TRANSITION_FADE_FRAMES,
} from "../../../types/constants";

loadFont("normal", {
  subsets: ["latin"],
  weights: ["400", "500", "600", "700"],
});

const MAX_CONTENT_WIDTH = 920;
const BRAND_TAGLINE = "Premium bathroom fixtures for modern spaces.";
const HOOK_LINE_MAX = 118;

const BULLET_STAGGER_FRAMES = 5;
const BULLET_ANIM_DURATION = 11;
const TITLE_ANIM_FRAMES = 16;
const TITLE_ANIM_FRAMES_CINEMATIC = 20;
const SUBTITLE_DELAY = 10;

const slideUpFade = (
  rel: number,
  delay: number,
  duration: number,
): React.CSSProperties => {
  const t = interpolate(rel, [delay, delay + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const y = interpolate(t, [0, 1], [22, 0]);
  return {
    opacity: t,
    transform: `translateY(${y}px)`,
  };
};

const PromoBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const angle = interpolate(frame, [0, 240], [148, 162], {
    extrapolateRight: "extend",
    easing: Easing.inOut(Easing.sin),
  });
  const drift = frame * 0.012;
  const lightX = 55 + 16 * Math.sin(drift);
  const lightY = 35 + 12 * Math.cos(drift * 0.88);
  const lightX2 = 18 + 14 * Math.cos(drift * 1.05);
  const lightY2 = 82 + 8 * Math.sin(drift * 0.92);

  return (
    <>
      <AbsoluteFill
        style={{
          background: `linear-gradient(${angle}deg, #030712 0%, #0c1220 32%, #020617 68%, #000000 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 88% 60% at ${lightX}% ${lightY}%, rgba(56, 189, 248, 0.11), transparent 58%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 50% 48% at ${lightX2}% ${lightY2}%, rgba(129, 140, 248, 0.1), transparent 52%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.028) 0%, transparent 22%, transparent 78%, rgba(0,0,0,0.48) 100%)",
        }}
      />
      <AbsoluteFill
        style={{
          border: "1px solid rgba(255,255,255,0.04)",
          boxSizing: "border-box",
          pointerEvents: "none",
        }}
      />
    </>
  );
};

const CinematicVignette: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background:
        "radial-gradient(ellipse 85% 75% at 50% 45%, transparent 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.72) 100%)",
    }}
  />
);

/** Full-composition BGM; Sequence length matches metadata so long tracks end with the render. */
const BackgroundMusic: React.FC = () => {
  const { durationInFrames, fps } = useVideoConfig();
  const peakVolume = 0.08;
  const fadeInFrames = Math.max(
    1,
    Math.min(Math.round(fps * 0.75), durationInFrames),
  );
  const fadeOutFrames = Math.max(
    1,
    Math.min(Math.round(fps * 1.1), durationInFrames),
  );

  return (
    <Sequence durationInFrames={durationInFrames}>
      <Audio
        loop
        src={staticFile("bgm.mp3")}
        volume={(f) => {
          const up = interpolate(f, [0, fadeInFrames], [0, peakVolume], {
            extrapolateRight: "clamp",
          });
          const tail = interpolate(
            f,
            [durationInFrames - fadeOutFrames, durationInFrames],
            [1, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );
          return up * tail;
        }}
      />
    </Sequence>
  );
};

function truncateHook(text: string | undefined, max = HOOK_LINE_MAX): string {
  const t = text?.trim();
  if (!t) return "";
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1).trimEnd();
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${base}…`;
}

function toPromoLine(text: string | undefined, max = 58): string {
  const base = (text ?? "")
    .replace(/\bscene\s*\d*\b[:\-–—]?\s*/gi, "")
    .replace(/\bbeat\s*\d+\b[:\-–—]?\s*/gi, "")
    .replace(/\bopening\s+hook\s*[:\-–—]\s*/gi, "")
    .replace(/\bproduct\s+hero\s*[:\-–—]\s*/gi, "")
    .replace(/\bscene\b\s*[:\-–—]\s*/gi, "")
    .replace(/[.;:]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "";
  const sentence = truncateHook(base, max);
  return sentence.replace(/\s{2,}/g, " ").trim();
}

function cleanSceneToken(text: string | undefined): string {
  let t = (text ?? "").trim();
  if (!t) return "";
  t = t
    .replace(/\b(story|sequence)\s*\d+\s*[:\-–—]?\s*/gi, "")
    .replace(/\bscene\s*\d*\b[:\-–—]?\s*/gi, "")
    .replace(/\bbeat\s*\d+\b[:\-–—]?\s*/gi, "")
    .replace(/^scene\s*[:\-–—]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^scene$/i.test(t)) return "";
  return t;
}

function sceneBullets(scene: PptOutlineScene, fallback: string[]): string[] {
  const src = Array.isArray(scene.bullets) ? scene.bullets : [];
  const out = src.map((b) => toPromoLine(b, 54)).filter(Boolean).slice(0, 3);
  if (out.length >= 2) return out;
  return fallback.map((b) => toPromoLine(b, 54)).filter(Boolean).slice(0, 3);
}

/** Short lines from script — never rendered as one giant paragraph card. */
function scriptChipsFromProps(
  video_script: string | undefined,
  videoScript: string | undefined,
): string[] {
  const raw = [video_script, videoScript].filter(Boolean).join("\n").trim();
  if (!raw) return [];
  const parts = raw
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 220);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length >= 14) break;
    out.push(p);
  }
  return out;
}

type SceneContentProps = {
  scene: PptOutlineScene;
  /** Larger type on hero image */
  cinematic?: boolean;
};

const SceneCopy: React.FC<SceneContentProps> = ({ scene, cinematic }) => {
  const rel = useCurrentFrame();
  const label = cleanSceneToken(scene.label);
  const title = cleanSceneToken(scene.title);
  const subtitle = cleanSceneToken(scene.subtitle);
  const bullets = (scene.bullets ?? []).map((b) => cleanSceneToken(b)).filter(Boolean);
  const footer = cleanSceneToken(scene.footer);
  const hasBullets = Boolean(bullets?.length);
  const isCta = Boolean(footer);

  const labelStyle: React.CSSProperties = {
    ...slideUpFade(rel, 2, 12),
    fontFamily,
    fontSize: cinematic ? 12 : 13,
    fontWeight: 600,
    letterSpacing: cinematic ? "0.32em" : "0.22em",
    textTransform: "uppercase",
    color: cinematic ? "rgba(255,255,255,0.72)" : "rgba(148, 163, 184, 0.95)",
  };

  const titleStyle: React.CSSProperties = {
    ...slideUpFade(
      rel,
      hasBullets ? 6 : 4,
      cinematic ? TITLE_ANIM_FRAMES_CINEMATIC : TITLE_ANIM_FRAMES,
    ),
    fontFamily,
    fontSize: cinematic ? (hasBullets ? 38 : isCta ? 46 : 56) : isCta ? 48 : 46,
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: "-0.034em",
    color: "#f8fafc",
    maxWidth: "100%",
    textShadow: cinematic ? "0 2px 32px rgba(0,0,0,0.85)" : undefined,
  };

  const subtitleStyle: React.CSSProperties = {
    ...slideUpFade(rel, SUBTITLE_DELAY, 18),
    fontFamily,
    fontSize: cinematic ? 18 : 19,
    fontWeight: 500,
    lineHeight: 1.32,
    letterSpacing: "-0.02em",
    color: cinematic ? "rgba(241,245,249,0.92)" : "rgba(226, 232, 240, 0.92)",
    maxWidth: 760,
    textShadow: cinematic ? "0 2px 24px rgba(0,0,0,0.8)" : undefined,
  };

  if (isCta) {
    return (
      <div
        style={{
          width: "100%",
          maxWidth: MAX_CONTENT_WIDTH,
          borderRadius: cinematic ? 20 : 24,
          padding: cinematic ? "36px 32px" : "52px 44px",
          textAlign: "center",
          border: "1px solid rgba(255,255,255,0.14)",
          background: cinematic
            ? "linear-gradient(165deg, rgba(8,12,24,0.82), rgba(2,4,12,0.92))"
            : "linear-gradient(160deg, rgba(15,23,42,0.75), rgba(3,7,18,0.92))",
          boxShadow: cinematic
            ? "0 24px 64px rgba(0,0,0,0.55)"
            : "0 24px 52px rgba(0,0,0,0.45)",
          ...slideUpFade(rel, 4, 20),
        }}
      >
        {label ? (
          <p className="m-0" style={labelStyle}>
            {label}
          </p>
        ) : null}
        <p className="m-0" style={{ ...titleStyle, ...slideUpFade(rel, 4, 18) }}>
          {title}
        </p>
        {subtitle ? (
          <p
            className="m-0"
            style={{
              ...subtitleStyle,
              marginTop: 14,
              ...slideUpFade(rel, 12, 16),
            }}
          >
            {subtitle}
          </p>
        ) : null}
        <p
          className="m-0"
          style={{
            marginTop: 22,
            fontFamily,
            fontSize: cinematic ? 15 : 17,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "rgba(56, 189, 248, 0.98)",
            ...slideUpFade(rel, 18, 14),
          }}
        >
          {footer}
        </p>
        <p
          className="m-0"
          style={{
            marginTop: 16,
            fontFamily,
            fontSize: 14,
            fontWeight: 500,
            color: "rgba(148, 163, 184, 0.88)",
            ...slideUpFade(rel, 22, 12),
          }}
        >
          {BRAND_TAGLINE}
        </p>
      </div>
    );
  }

  if (hasBullets && bullets) {
    return (
      <div
        style={{
          width: "100%",
          maxWidth: MAX_CONTENT_WIDTH,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: cinematic ? 12 : 14,
        }}
      >
        {label ? (
          <p className="m-0" style={labelStyle}>
            {label}
          </p>
        ) : null}
        <h2 className="m-0" style={titleStyle}>
          {title}
        </h2>
        <ul
          className="m-0 p-0"
          style={{
            listStyle: "none",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: cinematic ? 12 : 16,
            marginTop: 4,
          }}
        >
          {bullets.map((line, i) => {
            const st = slideUpFade(
              rel,
              14 + i * BULLET_STAGGER_FRAMES,
              BULLET_ANIM_DURATION,
            );
            return (
              <li
                key={i}
                style={{
                  ...st,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    marginTop: 8,
                    height: 6,
                    width: 6,
                    flexShrink: 0,
                    borderRadius: 2,
                    background:
                      "linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)",
                    boxShadow: cinematic
                      ? "0 0 20px rgba(56, 189, 248, 0.5)"
                      : "0 0 18px rgba(56, 189, 248, 0.4)",
                  }}
                />
                <span
                  style={{
                    fontFamily,
                    fontSize: cinematic ? 18 : 20,
                    fontWeight: 500,
                    lineHeight: 1.3,
                    letterSpacing: "-0.016em",
                    color: "#e2e8f0",
                    textShadow: cinematic
                      ? "0 2px 16px rgba(0,0,0,0.75)"
                      : undefined,
                  }}
                >
                  {line}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: MAX_CONTENT_WIDTH,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: cinematic ? 18 : 22,
      }}
    >
      {label ? (
        <p className="m-0" style={labelStyle}>
          {label}
        </p>
      ) : null}
      <h1
        className="m-0"
        style={{
          ...titleStyle,
          fontSize: cinematic ? 58 : subtitle ? 48 : 56,
        }}
      >
        {title}
      </h1>
      {subtitle ? (
        <p className="m-0" style={subtitleStyle}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
};

/** Scene 1 — title-led hook only, no overview paragraph block. */
const OpeningHookScene: React.FC<{
  label?: string;
  title: string;
  hookLine: string;
}> = ({ label, title, hookLine }) => {
  const rel = useCurrentFrame();
  const pulse = interpolate(rel, [0, SCENE_DURATION_FRAMES], [0.97, 1.01], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });
  const driftY = interpolate(rel, [0, SCENE_DURATION_FRAMES], [10, -8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden", perspective: 1600 }}>
      <PromoBackground />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 56px",
          transform: `translateY(${driftY}px) scale(${pulse})`,
        }}
      >
        {label ? (
          <p
            className="m-0"
            style={{
              ...slideUpFade(rel, 2, 14),
              fontFamily,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.34em",
              textTransform: "uppercase",
              color: "rgba(148, 163, 184, 0.95)",
              marginBottom: 18,
            }}
          >
            {label}
          </p>
        ) : null}
        <h1
          className="m-0"
          style={{
            ...slideUpFade(rel, 6, 20),
            fontFamily,
            fontWeight: 800,
            fontSize: 58,
            lineHeight: 1.05,
            letterSpacing: "-0.042em",
            textAlign: "center",
            maxWidth: 1000,
            color: "#f8fafc",
            textShadow: "0 4px 48px rgba(0,0,0,0.45)",
          }}
        >
          {title}
        </h1>
        {hookLine ? (
          <p
            className="m-0"
            style={{
              ...slideUpFade(rel, 16, 18),
              marginTop: 22,
              fontFamily,
              fontWeight: 500,
              fontSize: 22,
              lineHeight: 1.35,
              letterSpacing: "-0.02em",
              textAlign: "center",
              maxWidth: 720,
              color: "rgba(226, 232, 240, 0.94)",
            }}
          >
            {hookLine}
          </p>
        ) : null}
      </AbsoluteFill>
      <CinematicVignette />
    </AbsoluteFill>
  );
};

type ProductImageFraming = "full" | "detailTopRight" | "detailBottom" | "hardwareBand";

const FRAMING: Record<
  ProductImageFraming,
  { objectPosition: string; parallaxMul: number; zoomMul: number }
> = {
  full: { objectPosition: "50% 50%", parallaxMul: 1, zoomMul: 1 },
  detailTopRight: { objectPosition: "72% 38%", parallaxMul: 1.25, zoomMul: 1.12 },
  detailBottom: { objectPosition: "48% 70%", parallaxMul: 1.15, zoomMul: 1.1 },
  hardwareBand: { objectPosition: "50% 86%", parallaxMul: 0.9, zoomMul: 1.06 },
};

/** Bathroom opening: product visible immediately, headline stack, no scene labels. */
const OpeningProductHookScene: React.FC<{
  imageUrl: string;
  headline: string;
  productName: string;
  subline: string;
}> = ({ imageUrl, headline, productName, subline }) => {
  const frame = useCurrentFrame();
  const ken = interpolate(
    frame,
    [0, Math.max(1, SCENE_DURATION_FRAMES - 1)],
    [1.22, 1.03],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );
  const panX = interpolate(frame, [0, SCENE_DURATION_FRAMES], [28, -20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });
  const panY = interpolate(frame, [0, SCENE_DURATION_FRAMES], [10, -8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const imageOpacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ background: "#020617", perspective: 1600 }}>
      <AbsoluteFill style={{ opacity: imageOpacity }}>
        <Img
          src={imageUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "50% 44%",
            transform: `translate3d(${panX}px, ${panY}px, 0) scale(${ken})`,
            transformOrigin: "50% 50%",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(2,6,23,0.55) 0%, transparent 38%, transparent 58%, rgba(2,6,23,0.92) 100%)",
          pointerEvents: "none",
        }}
      />
      <CinematicVignette />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "52px 56px 64px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 980, textAlign: "center" }}>
          <h1
            className="m-0"
            style={{
              ...slideUpFade(frame, 2, 20),
              fontFamily,
              fontWeight: 800,
              fontSize: 56,
              lineHeight: 1.05,
              letterSpacing: "-0.04em",
              color: "#f8fafc",
              textShadow:
                "0 4px 48px rgba(0,0,0,0.82), 0 0 1px rgba(255,255,255,0.12)",
            }}
          >
            {headline}
          </h1>
          <p
            className="m-0"
            style={{
              ...slideUpFade(frame, 14, 18),
              marginTop: 18,
              fontFamily,
              fontWeight: 600,
              fontSize: 27,
              letterSpacing: "-0.026em",
              color: "rgba(248, 250, 252, 0.97)",
              textShadow: "0 2px 32px rgba(0,0,0,0.72)",
            }}
          >
            {productName}
          </p>
          {subline ? (
            <p
              className="m-0"
              style={{
                ...slideUpFade(frame, 26, 16),
                marginTop: 16,
                fontFamily,
                fontWeight: 500,
                fontSize: 16,
                lineHeight: 1.38,
                letterSpacing: "-0.016em",
                color: "rgba(226, 232, 240, 0.86)",
                maxWidth: 600,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              {subline}
            </p>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const ProductImageScene: React.FC<{
  imageUrl: string;
  scene: PptOutlineScene;
  variant: "hero" | "mid" | "final";
  framing?: ProductImageFraming;
}> = ({ imageUrl, scene, variant, framing = "full" }) => {
  const frame = useCurrentFrame();
  const intensity = variant === "hero" ? 1 : variant === "mid" ? 0.85 : 0.92;
  const fm = FRAMING[framing];
  const zm = fm.zoomMul;

  const kenBurns = interpolate(
    frame,
    [0, Math.max(1, SCENE_DURATION_FRAMES - 1)],
    variant === "final"
      ? [1.1 * zm, 1.0 * zm]
      : variant === "mid"
        ? [1.04 * zm, 1.14 * zm]
        : [1 * zm, 1 + 0.12 * intensity * zm],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.quad),
    },
  );

  const imageOpacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const contentOpacity = interpolate(frame, [6, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const parallaxX = interpolate(
    frame,
    [0, SCENE_DURATION_FRAMES],
    [-36 * intensity * fm.parallaxMul, 32 * intensity * fm.parallaxMul],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.sin),
    },
  );
  const parallaxY = interpolate(
    frame,
    [0, SCENE_DURATION_FRAMES],
    [18 * intensity * fm.parallaxMul, -20 * intensity * fm.parallaxMul],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.sin),
    },
  );
  const rotateY = interpolate(
    frame,
    [0, SCENE_DURATION_FRAMES],
    [-4.2 * intensity, 4.2 * intensity],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.sin),
    },
  );
  const foregroundDrift = interpolate(
    frame,
    [0, SCENE_DURATION_FRAMES],
    [-14 * intensity, 14 * intensity],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.quad),
    },
  );

  return (
    <AbsoluteFill
      style={{
        background: "#020617",
        perspective: 1600,
      }}
    >
      <AbsoluteFill style={{ opacity: imageOpacity }}>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <Img
            src={imageUrl}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: fm.objectPosition,
              transform: `translate3d(${parallaxX}px, ${parallaxY}px, 0) rotateY(${rotateY}deg) scale(${kenBurns})`,
              transformOrigin: "50% 50%",
            }}
          />
        </div>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity: 0.3,
          transform: `translateX(${foregroundDrift}px)`,
          background:
            "linear-gradient(115deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 36%, rgba(255,255,255,0.0) 65%)",
          mixBlendMode: "screen",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.38) 0%, transparent 34%, transparent 52%, rgba(2,6,23,0.94) 100%)",
          pointerEvents: "none",
        }}
      />
      <CinematicVignette />
      <AbsoluteFill
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          padding: "48px 56px 56px",
          opacity: contentOpacity,
        }}
      >
        <SceneCopy scene={scene} cinematic />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const TextSlideScene: React.FC<{ scene: PptOutlineScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const textSeed = cleanSceneToken(scene.title).length % 3;
  const scaleRange =
    textSeed === 0 ? [0.985, 1.03] : textSeed === 1 ? [1.025, 0.99] : [0.99, 1.02];
  const driftRange =
    textSeed === 0 ? [-14, 14] : textSeed === 1 ? [10, -14] : [-8, 10];
  const tiltRange = textSeed === 0 ? [-1.6, 1.6] : textSeed === 1 ? [1.2, -1.4] : [-1, 1.2];
  const scale = interpolate(frame, [0, SCENE_DURATION_FRAMES], scaleRange, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });
  const driftX = interpolate(frame, [0, SCENE_DURATION_FRAMES], driftRange, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });
  const tiltY = interpolate(frame, [0, SCENE_DURATION_FRAMES], tiltRange, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "0 56px",
        perspective: 1400,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          transform: `translate3d(${driftX}px, 0, 0) rotateY(${tiltY}deg) scale(${scale})`,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        <SceneCopy scene={scene} />
      </div>
    </AbsoluteFill>
  );
};

const transitionTiming = linearTiming({
  durationInFrames: TRANSITION_FADE_FRAMES,
});

const TextPanelScene: React.FC<{ scene: PptOutlineScene }> = ({ scene }) => (
  <AbsoluteFill style={{ overflow: "hidden" }}>
    <PromoBackground />
    <TextSlideScene scene={scene} />
  </AbsoluteFill>
);

/** Scene 6 — dealer / showroom / CTA: typography-led, not a script wall. */
const DealerCtaScene: React.FC<{ scene: PptOutlineScene }> = ({ scene }) => {
  const rel = useCurrentFrame();
  const glow = interpolate(rel, [0, SCENE_DURATION_FRAMES], [0.12, 0.22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <PromoBackground />
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity: glow,
          background:
            "radial-gradient(ellipse 70% 55% at 50% 38%, rgba(56, 189, 248, 0.14), transparent 62%)",
        }}
      />
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 56px",
        }}
      >
        <SceneCopy scene={scene} cinematic />
      </AbsoluteFill>
      <CinematicVignette />
    </AbsoluteFill>
  );
};

/** Full-bleed product with premium CTA stack — commercial close, not typography-only. */
const ClosingProductCtaScene: React.FC<{
  scene: PptOutlineScene;
  imageUrl: string;
}> = ({ scene, imageUrl }) => {
  const frame = useCurrentFrame();
  const ken = interpolate(
    frame,
    [0, Math.max(1, SCENE_DURATION_FRAMES - 1)],
    [1.12, 0.99],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.quad),
    },
  );
  const pan = interpolate(frame, [0, SCENE_DURATION_FRAMES], [-14, 14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });
  const wash = interpolate(frame, [0, SCENE_DURATION_FRAMES], [0.52, 0.68], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: "#020617", overflow: "hidden" }}>
      <AbsoluteFill>
        <Img
          src={imageUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "50% 48%",
            transform: `translate3d(${pan}px, 0, 0) scale(${ken})`,
            transformOrigin: "50% 50%",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: `linear-gradient(185deg, rgba(2,6,23,${0.25 + wash * 0.15}) 0%, transparent 40%, rgba(2,6,23,0.88) 72%, rgba(0,0,0,0.94) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity: 0.22,
          background:
            "radial-gradient(ellipse 80% 50% at 50% 72%, rgba(56, 189, 248, 0.2), transparent 55%)",
        }}
      />
      <CinematicVignette />
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          padding: "36px 44px 52px",
          opacity: interpolate(frame, [4, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        <SceneCopy scene={scene} cinematic />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SplitProductScene: React.FC<{
  scene: PptOutlineScene;
  imageUrl: string;
  imageObjectPosition?: string;
}> = ({ scene, imageUrl, imageObjectPosition = "50% 50%" }) => {
  const frame = useCurrentFrame();
  const mediaScale = interpolate(frame, [0, SCENE_DURATION_FRAMES], [1.2, 0.94], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const mediaPan = interpolate(frame, [0, SCENE_DURATION_FRAMES], [-36, 28], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });
  const panelShift = interpolate(frame, [0, SCENE_DURATION_FRAMES], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <PromoBackground />
      <AbsoluteFill
        style={{
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: 24,
          padding: 36,
        }}
      >
        <div
          style={{
            borderRadius: 24,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          }}
        >
          <Img
            src={imageUrl}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: imageObjectPosition,
              transform: `translateX(${mediaPan}px) scale(${mediaScale}) rotateY(-2deg)`,
              transformOrigin: "50% 50%",
            }}
          />
        </div>
        <div
          style={{
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,0.12)",
            background:
              "linear-gradient(170deg, rgba(10,15,34,0.88), rgba(2,6,23,0.92))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "28px 26px",
            transform: `translate3d(${panelShift}px, 0, 0)`,
          }}
        >
          <SceneCopy scene={scene} />
        </div>
      </AbsoluteFill>
      <CinematicVignette />
    </AbsoluteFill>
  );
};

/** Scene 4 — image-led, short title + tight bullet cluster (not a slide deck card). */
const CompactInstallScene: React.FC<{
  scene: PptOutlineScene;
  imageUrl: string;
  focalPoint?: string;
}> = ({ scene, imageUrl, focalPoint = "62% 48%" }) => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, SCENE_DURATION_FRAMES], [1.12, 1.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const pan = interpolate(frame, [0, SCENE_DURATION_FRAMES], [22, -18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });
  const rel = frame;
  const bullets = (scene.bullets ?? []).slice(0, 3);
  const lab = scene.label ? cleanSceneToken(scene.label) : "";
  const ttl = cleanSceneToken(scene.title);

  return (
    <AbsoluteFill style={{ overflow: "hidden", perspective: 1400 }}>
      <Img
        src={imageUrl}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: focalPoint,
          transform: `translate3d(${pan}px, 0, 0) scale(${zoom}) rotateY(-2.2deg)`,
          transformOrigin: focalPoint,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(105deg, rgba(2,6,23,0.05) 0%, rgba(2,6,23,0.55) 45%, rgba(2,6,23,0.88) 100%)",
        }}
      />
      <CinematicVignette />
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          padding: "44px 48px 52px",
        }}
      >
        <div style={{ maxWidth: 560 }}>
          {lab ? (
            <p
              className="m-0"
              style={{
                ...slideUpFade(rel, 2, 10),
                fontFamily,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "rgba(148, 163, 184, 0.95)",
                marginBottom: 10,
              }}
            >
              {lab}
            </p>
          ) : null}
          <h2
            className="m-0"
            style={{
              ...slideUpFade(rel, 6, 14),
              fontFamily,
              fontWeight: 800,
              fontSize: 34,
              lineHeight: 1.12,
              letterSpacing: "-0.03em",
              color: "#f8fafc",
              textShadow: "0 3px 28px rgba(0,0,0,0.75)",
            }}
          >
            {ttl}
          </h2>
          <ul
            className="m-0 p-0"
            style={{
              listStyle: "none",
              marginTop: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {bullets.map((line, i) => (
              <li
                key={i}
                style={{
                  ...slideUpFade(rel, 12 + i * 5, 8),
                  fontFamily,
                  fontSize: 17,
                  fontWeight: 500,
                  lineHeight: 1.3,
                  color: "rgba(226,232,240,0.96)",
                  paddingLeft: 16,
                  borderLeft: "3px solid rgba(56, 189, 248, 0.85)",
                }}
              >
                {cleanSceneToken(line)}
              </li>
            ))}
          </ul>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

function normalizeOutlinePool(
  props: z.infer<typeof CompositionProps>,
): PptOutlineScene[] {
  const anyProps = props as z.infer<typeof CompositionProps> & {
    title?: string;
    slides?: Array<
      Partial<PptOutlineScene> & {
        content?: string;
      }
    >;
    videoScript?: string;
  };
  const rawSlides = (anyProps.slides ?? []) as Array<
    Partial<PptOutlineScene> & { content?: string }
  >;
  const fromSlides = rawSlides
    .map((slide) => {
      const legacy = slide as { slide_title?: string; slide_bullets?: string[] };
      const rawTitle =
        slide.title?.trim() ||
        legacy.slide_title?.trim() ||
        slide.content?.trim();
      const bullets = Array.isArray(slide.bullets)
        ? slide.bullets.filter((v): v is string => Boolean(v?.trim()))
        : Array.isArray(legacy.slide_bullets)
          ? legacy.slide_bullets.filter((v): v is string => Boolean(v?.trim()))
          : undefined;
      return {
        label: slide.label?.trim(),
        title: cleanSceneToken(rawTitle) || "Product highlight",
        subtitle: slide.subtitle?.trim(),
        bullets,
        footer: slide.footer?.trim(),
      } satisfies PptOutlineScene;
    })
    .filter((scene) => Boolean(scene.title));

  if (fromSlides.length > 0) {
    return fromSlides;
  }
  return buildNarrativeOutline({
    ...props,
    productTitle: props.productTitle ?? anyProps.title,
    video_script: props.video_script ?? anyProps.videoScript,
  });
}

function takeSceneByPattern(
  middle: PptOutlineScene[],
  pattern: RegExp,
  fallbackIndex: number,
): PptOutlineScene {
  const found = middle.find((s) => {
    const text = [s.label, s.title, s.subtitle, ...(s.bullets ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return pattern.test(text);
  });
  return (
    found ??
    middle[fallbackIndex] ?? {
      title: "Product details",
    }
  );
}

type SevenScenePlan =
  | { kind: "opening"; label?: string; title: string; hookLine: string }
  | {
      kind: "opening_product";
      headline: string;
      productName: string;
      subline: string;
    }
  | { kind: "text"; scene: PptOutlineScene }
  | {
      kind: "product";
      scene: PptOutlineScene;
      variant: "hero" | "mid" | "final";
      framing?: ProductImageFraming;
    }
  | { kind: "split"; scene: PptOutlineScene; imageObjectPosition?: string }
  | { kind: "install_compact"; scene: PptOutlineScene; focalPoint?: string }
  | { kind: "dealer_cta"; scene: PptOutlineScene }
  | { kind: "closing_product_cta"; scene: PptOutlineScene };

function buildSevenScenePlan(props: z.infer<typeof CompositionProps>): {
  imageUrl?: string;
  scenes: SevenScenePlan[];
} {
  const anyProps = props as z.infer<typeof CompositionProps> & {
    title?: string;
    videoScript?: string;
    productCategory?: string;
    videoBeatPlan?: Array<Partial<PptOutlineScene>>;
  };
  const imageUrl =
    props.productImageFile?.trim() || props.imageUrl?.trim() || undefined;

  const beatPlanRaw = anyProps.videoBeatPlan;
  const beatPlan =
    Array.isArray(beatPlanRaw) && beatPlanRaw.length >= 6
      ? beatPlanRaw.map((b) => ({
          label: b.label?.trim(),
          title: cleanSceneToken(b.title?.trim()) || "Product highlight",
          subtitle: b.subtitle?.trim(),
          bullets: Array.isArray(b.bullets)
            ? b.bullets.filter((v): v is string => Boolean(v?.trim()))
            : undefined,
          footer: b.footer?.trim(),
        }))
      : null;

  const outline = normalizeOutlinePool(props);
  const chips = scriptChipsFromProps(props.video_script, anyProps.videoScript);

  const allText = [
    props.productTitle,
    props.productOverview,
    ...outline.map((s) =>
      [s.label, s.title, s.subtitle, ...(s.bullets ?? []), s.footer].join(" "),
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const categoryHint = anyProps.productCategory?.trim();
  const isBathroom =
    categoryHint === "bathroom_sanitary" ||
    (!categoryHint &&
      /(bathroom|faucet|vanity|sink|shower|tap|toilet|basin|washroom|chrome|matte black)/i.test(
        allText,
      ));

  const openingBase = outline[0] ?? {
    title: props.productTitle?.trim() || anyProps.title?.trim() || "Product overview",
  };
  const fallbackCta =
    outline.length > 1 ? outline[outline.length - 1] : undefined;
  const middle = outline.slice(1, -1);

  const titleMain =
    props.productTitle?.trim() || anyProps.title?.trim() || openingBase.title;

  const hookSource =
    props.productOverview?.trim() ||
    openingBase.subtitle?.trim() ||
    chips[0] ||
    (isBathroom
      ? "Premium materials and considered proportions for elevated spaces."
      : "A focused look at design, fit, and everyday performance.");

  const opening: SevenScenePlan = {
    kind: "opening",
    label: isBathroom ? "Modern Frameless Design" : cleanSceneToken(openingBase.label),
    title: titleMain,
    hookLine: truncateHook(hookSource),
  };

  const [bpHero, bpMat, bpIns, bpDaily, bpCta, bpFinal] = beatPlan || [];

  const heroProduct: PptOutlineScene = beatPlan
    ? {
        label: bpHero.label ? cleanSceneToken(bpHero.label) : undefined,
        title: toPromoLine(bpHero.title, 58) || titleMain,
        subtitle: toPromoLine(
          bpHero.subtitle ||
            props.productOverview?.trim() ||
            chips[0] ||
            openingBase.subtitle ||
            "",
          96,
        ),
      }
    : {
        label: isBathroom ? undefined : "Product spotlight",
        title: titleMain,
        subtitle: toPromoLine(
          props.productOverview?.trim() || chips[0] || openingBase.subtitle,
          92,
        ),
      };

  const mat = takeSceneByPattern(
    middle,
    /material|finish|texture|surface|coating|style|design|quality/i,
    0,
  );
  const materials: PptOutlineScene = beatPlan
    ? {
        label: bpMat.label ? cleanSceneToken(bpMat.label) : undefined,
        title: toPromoLine(bpMat.title, 56) || "Materials & quality",
        subtitle: bpMat.subtitle ? toPromoLine(bpMat.subtitle, 92) : undefined,
        bullets: isBathroom
          ? undefined
          : sceneBullets(
              { bullets: bpMat.bullets } as PptOutlineScene,
              [
                "Tempered glass clarity",
                "Stainless steel hardware",
                "Premium finish consistency",
              ],
            ),
      }
    : {
        label: isBathroom ? "Stainless Steel Hardware" : "Materials & quality",
        title: toPromoLine(mat.title, 52) || (isBathroom ? "Material quality in focus" : "Material quality"),
        bullets: isBathroom
          ? sceneBullets(mat, [
              "Tempered glass clarity",
              "Stainless steel hardware",
              "Premium finish consistency",
            ])
          : sceneBullets(mat, chips.slice(0, 3).length >= 2 ? chips.slice(0, 3) : ["Material confidence", "Consistent finish", "Quality in motion"]),
        subtitle: mat.subtitle ? toPromoLine(mat.subtitle, 78) : undefined,
      };

  const ins = takeSceneByPattern(
    middle,
    /install|fit|mount|dimension|compatib|space|layout|plumb/i,
    1,
  );
  const install: PptOutlineScene = beatPlan
    ? {
        label: bpIns.label ? cleanSceneToken(bpIns.label) : undefined,
        title: toPromoLine(bpIns.title, 56) || "Installation-ready fit",
        subtitle: bpIns.subtitle ? toPromoLine(bpIns.subtitle, 90) : undefined,
        bullets: isBathroom
          ? undefined
          : sceneBullets(
              { bullets: bpIns.bullets } as PptOutlineScene,
              [
                "Straightforward install path",
                "Clear fit planning",
                "Reliable project timing",
              ],
            ),
      }
    : {
        label: isBathroom ? "Installation-Ready Fit" : "Installation & fit",
        title: toPromoLine(ins.title, 52) || "Installation-ready fit",
        bullets: isBathroom
          ? sceneBullets(ins, [
              "Installation-ready configurations",
              "Layout-friendly dimensions",
              "Leak-resistant sealing confidence",
            ])
          : sceneBullets(ins, ["Straightforward install path", "Clear fit planning", "Reliable project timing"]),
        subtitle: ins.subtitle ? toPromoLine(ins.subtitle, 76) : undefined,
      };

  const dailySrc = takeSceneByPattern(
    middle,
    /clean|durab|daily|mainten|scratch|resist|wear|care|value/i,
    2,
  );
  const daily: PptOutlineScene = beatPlan
    ? {
        label: bpDaily.label ? cleanSceneToken(bpDaily.label) : undefined,
        title: toPromoLine(bpDaily.title, 56) || "Daily-use confidence",
        subtitle: bpDaily.subtitle ? toPromoLine(bpDaily.subtitle, 96) : undefined,
        bullets: isBathroom
          ? undefined
          : sceneBullets(
              { bullets: bpDaily.bullets } as PptOutlineScene,
              [
                "Simple upkeep",
                "Reliable daily performance",
                "Built for long use",
              ],
            ),
      }
    : {
        label: isBathroom ? "Easy-Clean Confidence" : "Daily use & durability",
        title: toPromoLine(dailySrc.title, 52) || (isBathroom ? "Easy-clean daily confidence" : "Daily-use confidence"),
        bullets: isBathroom
          ? sceneBullets(dailySrc, [
              "Easy-clean, durable finish",
              "Smooth opening and closing",
              "Corrosion-resistant hardware",
            ])
          : sceneBullets(
              dailySrc,
              chips.slice(3, 6).length >= 2 ? chips.slice(3, 6) : ["Simple upkeep", "Reliable daily performance", "Built for long use"],
            ),
        subtitle: dailySrc.subtitle ? toPromoLine(dailySrc.subtitle, 82) : undefined,
      };

  const ctaScene: PptOutlineScene = beatPlan
    ? {
        label: bpCta.label,
        title: toPromoLine(bpCta.title, 52) || "Next steps",
        subtitle: toPromoLine(bpCta.subtitle, 92),
        footer: toPromoLine(bpCta.footer, 44) || "Quote and sample available",
      }
    : {
        label: isBathroom ? "Showroom-Ready Presentation" : "Distributor & showroom",
        title: toPromoLine(fallbackCta?.title, 52) || "Showroom-ready presentation",
        subtitle: toPromoLine(
          fallbackCta?.subtitle ||
            "Built for premium bathroom upgrades with quote-ready documentation.",
          92,
        ),
        footer: toPromoLine(fallbackCta?.footer, 44) || "Quote and sample available",
      };

  const bathroomClosing: PptOutlineScene = beatPlan
    ? {
        title: toPromoLine(bpCta.title, 54) || "Showroom-Ready Presentation",
        subtitle: toPromoLine(
          [bpCta.subtitle, bpFinal?.subtitle].filter(Boolean).join(" · "),
          120,
        ),
        footer: toPromoLine(bpCta.footer, 52) || "Quote and Sample Available",
      }
    : {
        title:
          toPromoLine(fallbackCta?.title, 54) ||
          "Showroom-Ready Presentation",
        subtitle: toPromoLine(
          [
            fallbackCta?.subtitle,
            "Samples, written quotations, and showroom-ready documentation for your pipeline.",
          ]
            .filter(Boolean)
            .join(" "),
          120,
        ),
        footer:
          toPromoLine(fallbackCta?.footer, 52) ||
          "Quote and Sample Available",
      };

  const midMotionCopy: PptOutlineScene = beatPlan
    ? {
        label: bpDaily.label,
        title: toPromoLine(bpDaily.title, 48),
        subtitle: toPromoLine(
          bpDaily.subtitle ||
            (isBathroom
              ? "Finish, clarity, and leak-resistant sealing in motion."
              : "Form, tolerances, and material depth in motion."),
          88,
        ),
        bullets: (daily.bullets ?? []).slice(0, 2).map((b) => toPromoLine(b, 44)).filter(Boolean),
      }
    : {
        label: daily.label,
        title: toPromoLine(daily.title, 48),
        subtitle: toPromoLine(
          daily.subtitle ||
            (isBathroom
              ? "Lifestyle framing highlights finish, clarity, and leak-resistant sealing."
              : "Camera drift emphasizes form, tolerances, and material depth."),
          88,
        ),
        bullets: (daily.bullets ?? []).slice(0, 2).map((b) => toPromoLine(b, 44)).filter(Boolean),
      };

  /** Scene 7 — product return: image-led close, not a script paragraph. */
  const finalProductReturn: PptOutlineScene = beatPlan
    ? {
        label: bpFinal.label,
        title: toPromoLine(bpFinal.title, 52) || titleMain,
        subtitle: toPromoLine(
          bpFinal.subtitle ||
            (isBathroom
              ? "Sample request, quotation support, lead time clarity, and warranty confidence."
              : props.productOverview?.trim() || chips[0] || "Premium details you can see and feel."),
          84,
        ),
      }
    : {
        label: isBathroom ? "Samples, Quotes, and Next Steps" : titleMain,
        title: isBathroom
          ? "Samples, quotes, and dedicated next-step support"
          : "Bring this into your project",
        subtitle: toPromoLine(
          isBathroom
            ? "Sample request, quotation support, lead time clarity, and warranty confidence for your showroom pipeline."
            : props.productOverview?.trim() ||
                chips[0] ||
                "Premium details you can see and feel.",
          84,
        ),
      };

  if (isBathroom && imageUrl) {
    return {
      imageUrl,
      scenes: [
        {
          kind: "opening_product",
          headline: "Modern Frameless Design",
          productName: titleMain,
          subline: truncateHook(hookSource, 96),
        },
        { kind: "product", scene: heroProduct, variant: "hero", framing: "full" },
        {
          kind: "split",
          scene: materials,
          imageObjectPosition: "74% 38%",
        },
        {
          kind: "install_compact",
          scene: install,
          focalPoint: "52% 76%",
        },
        {
          kind: "product",
          scene: daily,
          variant: "mid",
          framing: "detailTopRight",
        },
        { kind: "closing_product_cta", scene: bathroomClosing },
      ],
    };
  }

  if (isBathroom && !imageUrl) {
    return {
      imageUrl,
      scenes: [
        {
          ...opening,
          label: "Modern Frameless Design",
        },
        { kind: "text", scene: heroProduct },
        { kind: "text", scene: materials },
        { kind: "text", scene: install },
        { kind: "text", scene: daily },
        { kind: "dealer_cta", scene: bathroomClosing },
      ],
    };
  }

  const scenes: SevenScenePlan[] = [opening];

  if (imageUrl) {
    scenes.push(
      { kind: "product", scene: heroProduct, variant: "hero" },
      { kind: "split", scene: materials },
      { kind: "install_compact", scene: install },
      { kind: "product", scene: midMotionCopy, variant: "mid" },
      { kind: "dealer_cta", scene: ctaScene },
      { kind: "product", scene: finalProductReturn, variant: "final" },
    );
  } else {
    scenes.push(
      { kind: "text", scene: heroProduct },
      { kind: "text", scene: materials },
      { kind: "text", scene: install },
      { kind: "text", scene: midMotionCopy },
      { kind: "dealer_cta", scene: ctaScene },
      { kind: "text", scene: finalProductReturn },
    );
  }

  return { imageUrl, scenes };
}

function renderSevenScene(
  plan: SevenScenePlan,
  imageUrl: string | undefined,
): React.ReactNode {
  if (plan.kind === "opening") {
    return (
      <OpeningHookScene
        label={plan.label}
        title={plan.title}
        hookLine={plan.hookLine}
      />
    );
  }
  if (plan.kind === "opening_product") {
    if (!imageUrl) return null;
    return (
      <OpeningProductHookScene
        imageUrl={imageUrl}
        headline={plan.headline}
        productName={plan.productName}
        subline={plan.subline}
      />
    );
  }
  if (plan.kind === "text") {
    return <TextPanelScene scene={plan.scene} />;
  }
  if (plan.kind === "dealer_cta") {
    return <DealerCtaScene scene={plan.scene} />;
  }
  if (plan.kind === "closing_product_cta") {
    if (!imageUrl) return null;
    return (
      <ClosingProductCtaScene imageUrl={imageUrl} scene={plan.scene} />
    );
  }
  if (!imageUrl) {
    return null;
  }
  const url = imageUrl;
  switch (plan.kind) {
    case "product":
      return (
        <ProductImageScene
          imageUrl={url}
          scene={plan.scene}
          variant={plan.variant}
          framing={plan.framing}
        />
      );
    case "split":
      return (
        <SplitProductScene
          scene={plan.scene}
          imageUrl={url}
          imageObjectPosition={plan.imageObjectPosition}
        />
      );
    case "install_compact":
      return (
        <CompactInstallScene
          scene={plan.scene}
          imageUrl={url}
          focalPoint={plan.focalPoint}
        />
      );
    default:
      return null;
  }
}

export const Main: React.FC<z.infer<typeof CompositionProps>> = (props) => {
  const { imageUrl, scenes } = useMemo(
    () => buildSevenScenePlan(props),
    [
      props.productCategory,
      props.productImageFile,
      props.imageUrl,
      props.productTitle,
      props.productOverview,
      props.video_script,
      props.ppt_outline,
      props.video_plan,
      props.videoBeatPlan,
      props.slides,
      props.keySellingPoints,
      props.title,
      props.videoScript,
    ],
  );

  const seriesChildren = useMemo(() => {
    const nodes: React.ReactNode[] = [];
    scenes.forEach((scenePlan, i) => {
      if (i > 0) {
        nodes.push(
          <TransitionSeries.Transition
            key={`t-${i}`}
            presentation={fade()}
            timing={transitionTiming}
          />,
        );
      }
      nodes.push(
        <TransitionSeries.Sequence
          key={`s-${i}`}
          durationInFrames={SCENE_DURATION_FRAMES}
        >
          {renderSevenScene(scenePlan, imageUrl)}
        </TransitionSeries.Sequence>,
      );
    });
    return nodes;
  }, [imageUrl, scenes]);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <BackgroundMusic />
      <TransitionSeries>{seriesChildren}</TransitionSeries>
    </AbsoluteFill>
  );
};
