import { z } from "zod";
export const COMP_NAME = "MyComp";

export const CompositionProps = z.object({});

export const defaultMyCompProps: z.infer<typeof CompositionProps> = {};

/** Seven pitch scenes with crossfades between them. */
export const SCENE_COUNT = 7;

export const TRANSITION_FADE_FRAMES = 15;

/**
 * ~11s per scene → total ~75s (within 60–90s). Entrance motion stays in the first ~3s of each scene.
 */
export const SCENE_DURATION_FRAMES = 334;

export const DURATION_IN_FRAMES =
  SCENE_COUNT * SCENE_DURATION_FRAMES -
  (SCENE_COUNT - 1) * TRANSITION_FADE_FRAMES;

export const VIDEO_WIDTH = 1280;
export const VIDEO_HEIGHT = 720;
export const VIDEO_FPS = 30;
