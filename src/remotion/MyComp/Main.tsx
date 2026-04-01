import { fontFamily, loadFont } from "@remotion/google-fonts/Inter";
import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { z } from "zod";
import {
  CompositionProps,
  SCENE_DURATION_FRAMES,
  TRANSITION_FADE_FRAMES,
} from "../../../types/constants";

loadFont("normal", {
  subsets: ["latin"],
  weights: ["400", "500", "600", "700"],
});

const MAX_CONTENT_WIDTH = 920;

/** B2B demo copy — swap for your product. */
const pitch = {
  brand: "ProcureFlow",
  tagline: "Procurement that moves as fast as your business.",
  scenes: {
    intro: {
      title: "ProcureFlow",
      subtitle: "The operating system for modern B2B procurement",
    },
    problem: {
      label: "The problem",
      title: "Procurement is broken at scale",
      bullets: [
        "Fragmented tools and spreadsheets slow every purchase",
        "No real-time visibility into spend and compliance risk",
        "Finance and ops teams stuck reconciling instead of strategizing",
      ],
    },
    solution: {
      label: "The solution",
      title: "One platform. Full control.",
      bullets: [
        "Unify sourcing, approvals, and payments in a single workspace",
        "AI-assisted workflows that adapt to your policies",
        "Built for enterprises that cannot afford downtime",
      ],
    },
    features: {
      label: "Platform",
      title: "Everything your team needs",
      bullets: [
        "Smart intake & guided buying across categories",
        "Policy engine with audit-ready trails",
        "Deep ERP, P2P, and finance stack integrations",
        "Real-time dashboards and savings analytics",
        "Role-based access and SSO out of the box",
      ],
    },
    benefits: {
      label: "Outcomes",
      title: "ROI you can measure",
      bullets: [
        "20–40% faster cycle times on average engagements",
        "Fewer maverick purchases and leakage",
        "Hours back for finance and procurement each week",
      ],
    },
    useCase: {
      label: "In practice",
      title: "From chaos to clarity in weeks",
      bullets: [
        "Global manufacturer: unified 14 regions onto one workflow",
        "Cut approval time by 62% while strengthening compliance",
        "Live in 90 days with dedicated onboarding",
      ],
    },
    cta: {
      headline: "Book a live walkthrough",
      sub: "See ProcureFlow on your data. Pilot in weeks, not quarters.",
      buttonHint: "procureflow.io/demo",
    },
  },
} as const;

const BULLET_STAGGER_FRAMES = 10;
const BULLET_ANIM_DURATION = 14;
const TITLE_ANIM_FRAMES = 22;
const SUBTITLE_DELAY = 14;

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
  const y = interpolate(t, [0, 1], [28, 0]);
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

const SceneZoom: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, SCENE_DURATION_FRAMES], [1, 1.03], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        transform: `scale(${scale})`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </div>
  );
};

const SceneIntro: React.FC = () => {
  const rel = useCurrentFrame();
  const { title, subtitle } = pitch.scenes.intro;

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "0 56px",
      }}
    >
      <SceneZoom>
        <div
          style={{
            width: "100%",
            maxWidth: MAX_CONTENT_WIDTH,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 28,
          }}
        >
          <p
            className="m-0"
            style={{
              ...slideUpFade(rel, 2, 18),
              fontFamily,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "rgba(56, 189, 248, 0.9)",
            }}
          >
            {pitch.brand}
          </p>
          <h1
            className="m-0"
            style={{
              ...slideUpFade(rel, 6, TITLE_ANIM_FRAMES),
              fontFamily,
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: "-0.038em",
              color: "#f8fafc",
            }}
          >
            {title}
          </h1>
          <p
            className="m-0"
            style={{
              ...slideUpFade(rel, SUBTITLE_DELAY, 24),
              fontFamily,
              fontSize: 30,
              fontWeight: 500,
              lineHeight: 1.4,
              letterSpacing: "-0.022em",
              color: "rgba(226, 232, 240, 0.92)",
              maxWidth: 820,
            }}
          >
            {subtitle}
          </p>
        </div>
      </SceneZoom>
    </AbsoluteFill>
  );
};

type BulletSlideProps = {
  label: string;
  title: string;
  bullets: readonly string[];
};

const BulletSlide: React.FC<BulletSlideProps> = ({
  label,
  title,
  bullets,
}) => {
  const rel = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "0 56px",
      }}
    >
      <SceneZoom>
        <div
          style={{
            width: "100%",
            maxWidth: MAX_CONTENT_WIDTH,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 20,
          }}
        >
          <p
            className="m-0"
            style={{
              ...slideUpFade(rel, 2, 16),
              fontFamily,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(148, 163, 184, 0.95)",
            }}
          >
            {label}
          </p>
          <h2
            className="m-0"
            style={{
              ...slideUpFade(rel, 8, TITLE_ANIM_FRAMES),
              fontFamily,
              fontSize: 48,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: "-0.032em",
              color: "#f1f5f9",
              maxWidth: "100%",
            }}
          >
            {title}
          </h2>
          <ul
            className="m-0 p-0"
            style={{
              listStyle: "none",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 18,
              marginTop: 8,
            }}
          >
            {bullets.map((line, i) => {
              const st = slideUpFade(
                rel,
                18 + i * BULLET_STAGGER_FRAMES,
                BULLET_ANIM_DURATION,
              );
              return (
                <li
                  key={i}
                  style={{
                    ...st,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 16,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      marginTop: 10,
                      height: 7,
                      width: 7,
                      flexShrink: 0,
                      borderRadius: 2,
                      background:
                        "linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)",
                      boxShadow: "0 0 18px rgba(56, 189, 248, 0.4)",
                    }}
                  />
                  <span
                    style={{
                      fontFamily,
                      fontSize: 26,
                      fontWeight: 500,
                      lineHeight: 1.38,
                      letterSpacing: "-0.018em",
                      color: "#e2e8f0",
                    }}
                  >
                    {line}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </SceneZoom>
    </AbsoluteFill>
  );
};

const SceneCta: React.FC = () => {
  const rel = useCurrentFrame();
  const { headline, sub, buttonHint } = pitch.scenes.cta;
  const glowPulse = interpolate(rel, [0, SCENE_DURATION_FRAMES], [0.88, 1], {
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
      }}
    >
      <SceneZoom>
        <div
          style={{
            width: "100%",
            maxWidth: MAX_CONTENT_WIDTH,
            borderRadius: 24,
            padding: "52px 44px",
            textAlign: "center",
            border: "1px solid rgba(255,255,255,0.1)",
            background:
              "linear-gradient(160deg, rgba(15,23,42,0.75), rgba(3,7,18,0.92))",
            boxShadow: `0 0 ${56 * glowPulse}px rgba(56, 189, 248, ${0.11 * glowPulse}), 0 24px 52px rgba(0,0,0,0.45)`,
            ...slideUpFade(rel, 4, 24),
          }}
        >
          <p
            className="m-0"
            style={{
              fontFamily,
              fontSize: 52,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: "-0.034em",
              color: "#ffffff",
            }}
          >
            {headline}
          </p>
          <p
            className="m-0"
            style={{
              marginTop: 18,
              fontFamily,
              fontSize: 22,
              fontWeight: 500,
              lineHeight: 1.45,
              letterSpacing: "-0.016em",
              color: "rgba(203, 213, 225, 0.95)",
            }}
          >
            {sub}
          </p>
          <p
            className="m-0"
            style={{
              marginTop: 28,
              fontFamily,
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: "0.06em",
              color: "rgba(56, 189, 248, 0.95)",
            }}
          >
            {buttonHint}
          </p>
          <p
            className="m-0"
            style={{
              marginTop: 20,
              fontFamily,
              fontSize: 15,
              fontWeight: 500,
              color: "rgba(148, 163, 184, 0.88)",
            }}
          >
            {pitch.tagline}
          </p>
        </div>
      </SceneZoom>
    </AbsoluteFill>
  );
};

const transitionTiming = linearTiming({
  durationInFrames: TRANSITION_FADE_FRAMES,
});

export const Main: React.FC<z.infer<typeof CompositionProps>> = () => {
  const { problem, solution, features, benefits, useCase } = pitch.scenes;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <PromoBackground />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION_FRAMES}>
          <SceneIntro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={transitionTiming}
        />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION_FRAMES}>
          <BulletSlide
            label={problem.label}
            title={problem.title}
            bullets={problem.bullets}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={transitionTiming}
        />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION_FRAMES}>
          <BulletSlide
            label={solution.label}
            title={solution.title}
            bullets={solution.bullets}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={transitionTiming}
        />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION_FRAMES}>
          <BulletSlide
            label={features.label}
            title={features.title}
            bullets={features.bullets}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={transitionTiming}
        />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION_FRAMES}>
          <BulletSlide
            label={benefits.label}
            title={benefits.title}
            bullets={benefits.bullets}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={transitionTiming}
        />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION_FRAMES}>
          <BulletSlide
            label={useCase.label}
            title={useCase.title}
            bullets={useCase.bullets}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={transitionTiming}
        />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION_FRAMES}>
          <SceneCta />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
