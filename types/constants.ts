import { z } from "zod";

export const COMP_NAME = "MyComp";

/** One row in a deck → one scene (~3s). */
export const PptOutlineSceneSchema = z.object({
  label: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  /** Shown as accent line (e.g. URL) on CTA-style slides */
  footer: z.string().optional(),
});

export type PptOutlineScene = z.infer<typeof PptOutlineSceneSchema>;

export const CompositionProps = z.object({
  /** Server classification id, e.g. bathroom_sanitary — drives promo vs deck tone in Main */
  productCategory: z.string().optional(),
  /** Product image URL/path for a dedicated spotlight scene near the beginning */
  productImageFile: z.string().optional(),
  /** Backward-compatible alias for legacy render payloads */
  imageUrl: z.string().optional(),
  /** Shown on the opening / product image scene when provided */
  productTitle: z.string().optional(),
  productOverview: z.string().optional(),
  keySellingPoints: z.array(z.string()).optional(),
  /** Optional script from your generator (reserved for captions / future use) */
  video_script: z.string().optional(),
  /** Backward-compatible aliases from active backend payload */
  title: z.string().optional(),
  videoScript: z.string().optional(),
  slides: z.array(PptOutlineSceneSchema).optional(),
  ppt_outline: z.array(PptOutlineSceneSchema).optional(),
  /** Same shape as ppt_outline; used when ppt_outline is absent */
  video_plan: z.array(PptOutlineSceneSchema).optional(),
  /** Server-built promo beats from classification blueprint (preferred over scraping PPT bullets) */
  videoBeatPlan: z.array(PptOutlineSceneSchema).optional(),
});

/** ~12–21 scenes → ~30–55s at 30fps (see `computeCompositionDurationFrames`). */
export const defaultPptOutline: PptOutlineScene[] = [
  {
    title: "Category Demand Today",
    subtitle: "Premium bathroom upgrade momentum for showroom and distributor channels",
  },
  {
    title: "Design Language",
    subtitle: "Frameless appearance and clean lines built for elevated residential spaces",
  },
  {
    title: "Glass and Hardware Quality",
    subtitle: "Tempered glass clarity paired with stainless steel hardware",
  },
  {
    title: "Sizes and Configurations",
    subtitle: "Layout-friendly options for common residential bathroom plans",
  },
  {
    title: "Installation Fit",
    subtitle: "Installation-ready details for predictable on-site fitting",
  },
  {
    title: "Everyday Use Experience",
    subtitle: "Easy-clean finish with smooth opening and closing",
  },
  {
    title: "Sealing and Durability",
    subtitle: "Leak-resistant sealing and corrosion resistance for lasting appearance",
  },
  {
    title: "Showroom and Distributor Value",
    subtitle: "Display impact and sell-through support for partners",
  },
  {
    title: "Residential Application Example",
    subtitle: "Real bathroom context for fit, finish, and maintenance ease",
  },
  {
    title: "Samples, Quotes, and Next Steps",
    subtitle: "Sample request, quotation support, lead time clarity, and warranty confidence",
    footer: "Contact your distributor representative",
  },
];

export const defaultMyCompProps: z.infer<typeof CompositionProps> = {
  productImageFile: undefined,
  imageUrl: undefined,
  productTitle: undefined,
  productOverview: undefined,
  keySellingPoints: undefined,
  video_script: undefined,
  ppt_outline: defaultPptOutline,
  video_plan: undefined,
};

export const TRANSITION_FADE_FRAMES = 15;

/** 3 seconds per scene at 30fps */
export const SCENE_DURATION_FRAMES = 90;

export function computeCompositionDurationFrames(sceneCount: number): number {
  const n = Math.max(1, sceneCount);
  return n * SCENE_DURATION_FRAMES - (n - 1) * TRANSITION_FADE_FRAMES;
}

export function resolveOutlineFromProps(
  props: z.infer<typeof CompositionProps>,
): PptOutlineScene[] {
  if (props.slides?.length) {
    return props.slides;
  }
  if (props.ppt_outline?.length) {
    return props.ppt_outline;
  }
  if (props.video_plan?.length) {
    return props.video_plan;
  }
  if (props.keySellingPoints?.length) {
    return props.keySellingPoints.map((t) => ({ title: t }));
  }
  return defaultPptOutline;
}

const NARRATIVE_SKIP_PATTERNS = [
  /agenda|outline|table of contents|thank you/i,
  /^q&a$/i,
];

const NARRATIVE_CTA_PATTERNS =
  /book|contact|next step|quote|sample|walkthrough|showroom|start now|learn more/i;
const NARRATIVE_PROBLEM_PATTERNS =
  /problem|challenge|pain|broken|manual|fragmented|slow|visibility|risk|chaos|bottleneck/i;
const NARRATIVE_SOLUTION_PATTERNS =
  /solution|design|material|hardware|installation|fit|configuration|finish|durability|showroom|distributor/i;
const NARRATIVE_OUTCOME_PATTERNS =
  /outcome|roi|result|impact|faster|saving|efficien|reduce|improve|case study|customer|proof|launch|live/i;

const getSceneText = (scene: PptOutlineScene): string =>
  [scene.label, scene.title, scene.subtitle, ...(scene.bullets ?? []), scene.footer]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const dedupeByTitle = (scenes: PptOutlineScene[]): PptOutlineScene[] => {
  const seen = new Set<string>();
  const out: PptOutlineScene[] = [];
  scenes.forEach((scene) => {
    const k = scene.title.trim().toLowerCase();
    if (!k || seen.has(k)) {
      return;
    }
    seen.add(k);
    out.push(scene);
  });
  return out;
};

export function buildNarrativeOutline(
  props: z.infer<typeof CompositionProps>,
): PptOutlineScene[] {
  const outline = dedupeByTitle(resolveOutlineFromProps(props));
  if (outline.length <= 2) {
    return outline;
  }

  const opening = outline[0];
  const cta =
    [...outline]
      .reverse()
      .find((s) => s.footer || NARRATIVE_CTA_PATTERNS.test(getSceneText(s))) ??
    outline[outline.length - 1];

  const candidates = outline.filter(
    (s) =>
      s !== opening &&
      s !== cta &&
      !NARRATIVE_SKIP_PATTERNS.some((p) => p.test(getSceneText(s))),
  );

  const score = (scene: PptOutlineScene): number => {
    const text = getSceneText(scene);
    let points = 0;
    if (scene.bullets?.length) points += 2;
    if (scene.subtitle) points += 1;
    if (NARRATIVE_PROBLEM_PATTERNS.test(text)) points += 3;
    if (NARRATIVE_SOLUTION_PATTERNS.test(text)) points += 3;
    if (NARRATIVE_OUTCOME_PATTERNS.test(text)) points += 3;
    return points;
  };

  const targetCount = Math.min(
    15,
    Math.max(10, Math.round(outline.length * 0.72)),
  );

  const problems = candidates
    .filter((s) => NARRATIVE_PROBLEM_PATTERNS.test(getSceneText(s)))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3);
  const solutions = candidates
    .filter((s) => NARRATIVE_SOLUTION_PATTERNS.test(getSceneText(s)))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 5);
  const outcomes = candidates
    .filter((s) => NARRATIVE_OUTCOME_PATTERNS.test(getSceneText(s)))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 4);

  const picked = new Set<PptOutlineScene>([opening, cta]);
  const middle: PptOutlineScene[] = [];
  const pushIfFits = (scene: PptOutlineScene) => {
    if (picked.has(scene) || middle.length >= targetCount - 2) {
      return;
    }
    picked.add(scene);
    middle.push(scene);
  };

  [...problems, ...solutions, ...outcomes].forEach(pushIfFits);

  candidates
    .sort((a, b) => score(b) - score(a))
    .forEach(pushIfFits);

  return [opening, ...middle, cta];
}

export function productSpotlightCount(
  props: z.infer<typeof CompositionProps>,
): number {
  const hasImage = Boolean(props.productImageFile?.trim() || props.imageUrl?.trim());
  if (!hasImage) return 0;
  const textScenes = buildNarrativeOutline(props).length;
  if (textScenes >= 10) return 3;
  return 2;
}

/**
 * Opening title + optional product-image scene + remaining outline slides.
 */
/** Bathroom promo uses a dedicated 6-scene cinematic flow in Main.tsx. */
function isBathroomCategoryFromProps(
  props: z.infer<typeof CompositionProps>,
): boolean {
  const cat = props.productCategory?.trim();
  if (cat === "bathroom_sanitary") return true;
  if (cat) return false;
  const blob = [
    props.productTitle,
    props.productOverview,
    props.title,
    ...(props.ppt_outline?.map((s) => [s.title, s.subtitle].join(" ")) ?? []),
    ...(props.slides?.map((s) => [s.title, s.subtitle].join(" ")) ?? []),
  ]
    .filter(Boolean)
    .join(" ");
  return /(bathroom|faucet|vanity|sink|shower|tap|toilet|basin|washroom|chrome|matte black)/i.test(
    blob,
  );
}

export function sceneCountFromProps(
  props: z.infer<typeof CompositionProps>,
): number {
  if (isBathroomCategoryFromProps(props)) return 6;
  return 7;
}

export const DURATION_IN_FRAMES = computeCompositionDurationFrames(
  defaultPptOutline.length,
);

export const VIDEO_WIDTH = 1280;
export const VIDEO_HEIGHT = 720;
export const VIDEO_FPS = 30;
