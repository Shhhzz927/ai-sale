"use client";

import { Player } from "@remotion/player";
import type { NextPage } from "next";
import { useCallback, useMemo } from "react";
import { z } from "zod";
import {
  CompositionProps,
  computeCompositionDurationFrames,
  defaultMyCompProps,
  sceneCountFromProps,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "../../types/constants";
import { AlignEnd } from "../components/AlignEnd";
import { Button } from "../components/Button";
import { InputContainer } from "../components/Container";
import { RenderControls } from "../components/RenderControls";
import { Spacing } from "../components/Spacing";
import { Tips } from "../components/Tips";
import { Main } from "../remotion/MyComp/Main";

const DEMO_VIDEO_SCRIPT = `[INTRO — 0:00–0:05]
Logo lockup, subtle motion. Music: upbeat, 120 BPM.

[SCENE 1 — 0:05–0:20]
On-screen title: "Hello, world". Narrator welcomes the viewer.

[SCENE 2 — 0:20–0:35]
B-roll placeholder. Lower third with key message.

[OUTRO — 0:35–0:45]
CTA card, fade to black.`;

const Home: NextPage = () => {
  const inputProps: z.infer<typeof CompositionProps> = useMemo(
    () => defaultMyCompProps,
    [],
  );

  const durationInFrames = useMemo(
    () => computeCompositionDurationFrames(sceneCountFromProps(inputProps)),
    [inputProps],
  );

  const generateVideo = useCallback(() => {
    const out = document.getElementById("out-video");
    if (out) {
      out.textContent = DEMO_VIDEO_SCRIPT;
    }
    const video = document.getElementById(
      "video-player",
    ) as HTMLVideoElement | null;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();

      video.src = "https://www.w3schools.com/html/mov_bbb.mp4";

      video.load();

      video.play().catch(() => {});
    }
  }, []);

  return (
    <div>
      <div className="max-w-screen-md m-auto mb-5 px-4">
        <div className="overflow-hidden rounded-geist shadow-[0_0_200px_rgba(0,0,0,0.15)] mb-10 mt-16">
          <Player
            component={Main}
            inputProps={inputProps}
            durationInFrames={durationInFrames}
            fps={VIDEO_FPS}
            compositionHeight={VIDEO_HEIGHT}
            compositionWidth={VIDEO_WIDTH}
            style={{
              width: "100%",
            }}
            controls
            autoPlay
            loop
          />
        </div>
        <RenderControls inputProps={inputProps}></RenderControls>
        <Spacing></Spacing>
        <InputContainer>
          <h3 className="font-geist font-semibold text-foreground mb-3">
            Video script
          </h3>
          <AlignEnd>
            <Button onClick={generateVideo}>Generate Video Script</Button>
          </AlignEnd>
          <Spacing></Spacing>
          <div className="copy-block" id="out-video" />
          <video
            id="video-player"
            controls
            autoPlay
            muted
            playsInline
            style={{
              display: "block",
              width: "100%",
              marginTop: "12px",
              borderRadius: "8px",
              background: "black",
            }}
          />
        </InputContainer>
        <Spacing></Spacing>
        <Spacing></Spacing>
        <Spacing></Spacing>
        <Spacing></Spacing>
        <Tips></Tips>
      </div>
    </div>
  );
};

export default Home;
