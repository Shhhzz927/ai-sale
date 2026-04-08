import type { z } from "zod";
import { CalculateMetadataFunction, Composition } from "remotion";
import {
  COMP_NAME,
  CompositionProps,
  computeCompositionDurationFrames,
  defaultMyCompProps,
  DURATION_IN_FRAMES,
  sceneCountFromProps,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "../../types/constants";
import { Main } from "./MyComp/Main";
import { NextLogo } from "./MyComp/NextLogo";

const calculateMyCompMetadata: CalculateMetadataFunction<
  z.infer<typeof CompositionProps>
> = ({ props }) => ({
  durationInFrames: computeCompositionDurationFrames(
    sceneCountFromProps(props),
  ),
});

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id={COMP_NAME}
        component={Main}
        durationInFrames={DURATION_IN_FRAMES}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={defaultMyCompProps}
        schema={CompositionProps}
        calculateMetadata={calculateMyCompMetadata}
      />
      <Composition
        id="NextLogo"
        component={NextLogo}
        durationInFrames={300}
        fps={30}
        width={140}
        height={140}
        defaultProps={{
          outProgress: 0,
        }}
      />
    </>
  );
};
