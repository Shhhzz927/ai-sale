const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const util = require("util");
const { spawn } = require("child_process");
const multer = require("multer");
const OpenAI = require("openai");
const {
  classifyProductStructured,
  categoryFlagsFromClassification,
  logStructuredClassification
} = require("./lib/classification");
const {
  deckSpineFromBlueprint,
  hasFixedPptTitles,
  getPptTitles,
  BATHROOM_VIDEO_ONSCREEN_LINES,
  buildVideoBeatPlanForRemotion,
  buildVideoScriptFromBlueprint
} = require("./lib/blueprints");

const app = express();
const PORT = 3000;

const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Remotion project (relative to this server) and rendered MP4 output. */
const REMOTION_PROJECT = path.join(__dirname, "my-video");
const REMOTION_ENTRY = "src/remotion/index.ts";
const REMOTION_COMPOSITION_ID = "MyComp";
const REMOTION_RENDER_TIMEOUT_MS = 120000;
const PUBLIC_DIR = path.join(__dirname, "public");
const OUTPUT_DIR = path.join(PUBLIC_DIR, "generated-videos");
const REMOTION_PROPS_DIR = path.join(__dirname, ".remotion-render");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(REMOTION_PROPS_DIR, { recursive: true });

const REMOTION_LOG = "[remotion]";

app.use(cors());
app.use(express.json());
// Serve user uploads first so /uploads always maps to UPLOAD_DIR (not shadowed by other static assets).
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));
app.use(express.static(__dirname));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".jpg";
    const safeExt = /^\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?)$/i.test(ext)
      ? ext.toLowerCase()
      : ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 12)}${safeExt}`);
  }
});

const IMAGE_PIPELINE_LOG = "[image pipeline]";

function isAllowedImageUpload(file) {
  if (!file) return false;
  const mime = String(file.mimetype || "").toLowerCase().trim();
  const ext = path.extname(file.originalname || "").toLowerCase();
  const okMime =
    /^image\/(jpeg|jpe?g|pjpeg|png|gif|webp|heic|heif|avif|bmp|tiff?|x-ms-bmp)$/i.test(mime);
  const okExt = /^\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?)$/i.test(ext);
  if (okMime) return true;
  if ((mime === "" || mime === "application/octet-stream") && okExt) return true;
  return false;
}

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file) {
      return cb(new Error("Missing upload file"));
    }
    if (isAllowedImageUpload(file)) {
      return cb(null, true);
    }
    cb(new Error("Only JPEG, PNG, GIF, WebP, HEIC, AVIF, or similar raster images are allowed"));
  }
});

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Encode an on-disk image as a data URL for Remotion props. CLI render does not reliably
 * resolve /render-assets/... or other HTTP URLs; embedding bytes avoids 404s.
 * @param {Buffer} buffer
 * @param {string} ext file extension including dot, e.g. ".jpg"
 */
function bufferToImageDataUrl(buffer, ext) {
  const e = (ext && String(ext).toLowerCase()) || ".jpg";
  const mimeByExt = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".jpe": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".heic": "image/heic",
    ".heif": "image/heif"
  };
  const mime = mimeByExt[e] || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/** --- /api/generate debugging --- */

const GENERATE_LOG = "[/api/generate]";

/**
 * Maps structured generation output to Remotion `MyComp` input props (see my-video/types/constants.ts).
 * @param {Record<string, unknown>} data
 * @param {{ productType: string }} fields
 * @param {{ productImageFile: string | null }} [asset] data URL or null for Remotion <Img>
 */
function buildRemotionRenderInput(data, fields, asset) {
  const productCategory =
    (data.classification && data.classification.product_category) || "generic_b2b_product";
  const isBathroomLike = productCategory === "bathroom_sanitary";
  const slides = Array.isArray(data.ppt_outline) ? data.ppt_outline : [];
  const firstTitle = slides[0] && str(slides[0].slide_title);
  const overviewLine = str(data.product_overview).split(/[\n\r]+/).find((l) => str(l)) || "";
  const raw =
    firstTitle ||
    str(fields.productType) ||
    overviewLine ||
    "Product";
  const title = raw.slice(0, 280);

  /** Video beats from classification blueprint — Remotion prefers this over scraping PPT bullets. */
  const videoBeatPlan = buildVideoBeatPlanForRemotion(productCategory, fields);

  const sourceSlides = isBathroomLike ? curateBathroomVideoSlides(slides, fields) : slides.slice(0, 10);
  const slidePayload = sourceSlides.map((s) => {
    const slide = s && typeof s === "object" ? s : {};
    const bullets = Array.isArray(slide.slide_bullets)
      ? slide.slide_bullets.map((b) => str(b).slice(0, 500)).filter((x) => x.length > 0)
      : [];
    const titleRaw = str(slide.slide_title) || str(slide.title);
    return {
      title: titleRaw.slice(0, 300),
      bullets
    };
  });

  const videoScriptBlueprint = buildVideoScriptFromBlueprint(productCategory, fields);

  return {
    title,
    productCategory,
    productOverview: str(data.product_overview).slice(0, 8000),
    slides: slidePayload,
    videoBeatPlan,
    videoScript: isBathroomLike
      ? buildBathroomVideoSceneScript(fields, Boolean(asset && asset.productImageFile)).slice(0, 12000)
      : videoScriptBlueprint.slice(0, 12000),
    productImageFile: asset && asset.productImageFile ? asset.productImageFile : null
  };
}

function curateBathroomVideoSlides(slides, fields) {
  const safeSlides = Array.isArray(slides) ? slides : [];
  const slotIndexes = [0, 1, 3, 5, 6, 9];
  const template = getPptTitles("bathroom_sanitary");
  const slide10Bullets = bathroomSlide10CanonicalBullets(fields);
  return slotIndexes.map((idx, sceneNo) => {
    const slide = safeSlides[idx] || {};
    const title = template[idx] || str(slide.slide_title) || "Bathroom presentation";
    const bullets =
      idx === 9
        ? slide10Bullets
        : Array.isArray(slide.slide_bullets)
          ? slide.slide_bullets.map((b) => str(b)).filter(Boolean)
          : [];
    return {
      slide_title: title,
      slide_bullets: bullets.slice(0, 4)
    };
  });
}

/** Short premium promo lines only — no "Scene" labels or internal theme names. */
function buildBathroomVideoSceneScript(fields, hasProductImage) {
  const p = str(fields.productType) || "Bathroom product";
  const m = str(fields.material) || "specified material";
  const st = str(fields.style) || "defined style";
  const tm = str(fields.targetMarket) || "target buyers";
  const [L0, L1, L2, L3, L4, L5, L6, L7] = BATHROOM_VIDEO_ONSCREEN_LINES;
  const imageNote = hasProductImage
    ? "Glass, hardware, and silhouette carry straight from your product photo."
    : "Positioning anchored in your stated materials and finish story.";
  return [
    `${L0} — premium bathroom presence for ${tm}.`,
    `${p} in ${st}. ${imageNote}`,
    `${L1} and ${L2}: ${m} for gallery-grade specification.`,
    `${L3}: layout-friendly configurations; dealer-ready fit and documentation.`,
    `${L4} and ${L5}: easy-clean finish; smooth motion; sealing confidence.`,
    `${L6}. ${L7} — samples, written quotations, and lead-time clarity for partners.`
  ].join("\n");
}

/**
 * @param {string} outputAbs absolute path for the MP4
 * @param {string} propsAbs absolute path to JSON props file
 * @returns {Promise<void>}
 */
function runRemotionCliRender(outputAbs, propsAbs) {
  const baseArgs = [
    "remotion",
    "render",
    REMOTION_ENTRY,
    REMOTION_COMPOSITION_ID,
    outputAbs,
    "--props",
    propsAbs,
    "--timeout",
    String(REMOTION_RENDER_TIMEOUT_MS)
  ];
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const spawnRender = (args) =>
    new Promise((resolve, reject) => {
      const child = spawn(npxCmd, args, {
        cwd: REMOTION_PROJECT,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stderr = "";
      let stdout = "";
      const append = (buf, which) => {
        const s = buf.toString();
        if (which === "stderr") {
          stderr += s;
          if (stderr.length > 60000) stderr = stderr.slice(-50000);
        } else {
          stdout += s;
          if (stdout.length > 60000) stdout = stdout.slice(-50000);
        }
      };
      child.stdout.on("data", (d) => append(d, "stdout"));
      child.stderr.on("data", (d) => append(d, "stderr"));
      child.on("error", (err) => reject(err));
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          const tail = (stderr || stdout).slice(-4500);
          const err = new Error(
            `remotion render exited with code ${code}${tail ? `\n---\n${tail}` : ""}`
          );
          err.name = "RemotionRenderError";
          err.exitCode = code;
          err.stderr = stderr;
          err.stdout = stdout;
          reject(err);
        }
      });
    });

  // Prefer stability over speed: force single-worker rendering when CLI supports it.
  return spawnRender([...baseArgs, "--concurrency", "1"]).catch((err) => {
    const stderr = String((err && err.stderr) || "");
    const stdout = String((err && err.stdout) || "");
    const output = `${stderr}\n${stdout}`.toLowerCase();
    const unsupportedConcurrency =
      output.includes("unknown option") && output.includes("concurrency");
    if (!unsupportedConcurrency) throw err;
    return spawnRender(baseArgs);
  });
}

async function assertRemotionProjectPresent() {
  const pkg = path.join(REMOTION_PROJECT, "package.json");
  const remotionPkg = path.join(REMOTION_PROJECT, "node_modules", "remotion", "package.json");
  try {
    await fs.promises.access(pkg);
  } catch (_) {
    throw new Error(`Remotion project missing at ${REMOTION_PROJECT}`);
  }
  try {
    await fs.promises.access(remotionPkg);
  } catch (_) {
    throw new Error("Remotion dependencies not installed. Run: cd my-video && npm install");
  }
}

function summarizeBodyForLog(body) {
  if (!body || typeof body !== "object") return {};
  const out = {};
  for (const key of Object.keys(body)) {
    const v = body[key];
    if (v == null) {
      out[key] = null;
    } else if (Buffer.isBuffer(v)) {
      out[key] = `<Buffer ${v.length} bytes>`;
    } else if (typeof v === "string") {
      out[key] = v.length > 500 ? `${v.slice(0, 500)}… (${v.length} chars)` : v;
    } else {
      out[key] = v;
    }
  }
  return out;
}

function promptPreview(text, maxLen = 480) {
  const t = String(text || "");
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}… [total ${t.length} chars]`;
}

function publicProductImageUrl(filename) {
  const base = String(filename || "").replace(/^\/+/, "").replace(/\.\./g, "");
  return `/uploads/${base}`;
}

/** Full URL for the client (e.g. img src) when the request has a usable Host. */
function absolutePublicUploadUrl(req, pathname) {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const host = req.get("host") || `localhost:${PORT}`;
  const proto = req.protocol || "http";
  return `${proto}://${host}${p}`;
}

/** @returns {Promise<{ absolutePath: string, size: number }>} */
async function verifySavedUpload(file) {
  if (!file || !file.filename) {
    throw new Error("No upload metadata");
  }
  const absolutePath = path.resolve(
    String(file.path || path.join(UPLOAD_DIR, file.filename))
  );
  const st = await fs.promises.stat(absolutePath);
  if (!st.isFile()) {
    throw new Error("Upload path is not a regular file");
  }
  if (st.size < 1) {
    throw new Error("Uploaded file is empty");
  }
  return { absolutePath, size: st.size };
}

function pipelineFieldReport(body, file) {
  const b = body || {};
  return {
    productType: Boolean(str(b.productType)),
    material: Boolean(str(b.material)),
    style: Boolean(str(b.style)),
    priceRange: Boolean(str(b.priceRange)),
    targetMarket: Boolean(str(b.targetMarket)),
    image: Boolean(file)
  };
}

/** --- Classification + deck spine live in lib/classification.js and lib/blueprints.js --- */

const GENERIC_SAAS_SLIDE_TITLE_RES = [
  /\bintroduction\s+to\s+(our\s+)?platform\b/i,
  /\bkey\s+features\b/i,
  /^integrations?$/i,
  /\bpricing\s+(structure|overview)\b/i,
  /\bsecurity\s+(&|and)\s+compliance\b/i,
  /\bour\s+platform\b/i,
  /\bproduct\s+overview\b/i,
  /\bwhy\s+choose\s+us\b/i,
  /\bone\s+stop\s+shop\b/i
];

function titleLooksGenericSaaS(title) {
  const t = str(title);
  return GENERIC_SAAS_SLIDE_TITLE_RES.some((re) => re.test(t));
}

function sanitizeSlideTitle(title, slideIndex, category, fields, spineRow) {
  const p = str(fields.productType) || "Product";
  const tm = str(fields.targetMarket) || "buyers";
  if (hasFixedPptTitles(category.id)) {
    const fixed = getPptTitles(category.id);
    return fixed[slideIndex] ?? fixed[0];
  }
  const fallbackFromSpine = () => {
    const short = spineRow.focus.replace(/\s+/g, " ").slice(0, 72);
    return `${p} for ${tm}: ${short}`;
  };

  if (titleLooksGenericSaaS(title) || str(title) === "") {
    return fallbackFromSpine();
  }
  if (category.isIndustrialLike && /\b(lifestyle|aesthetic|decor|mood)\b/i.test(str(title))) {
    return fallbackFromSpine();
  }
  return str(title);
}

/** Longest / most specific first; applied before forbidden stripping. Skipped when user fields contain the match. */
const BATHROOM_PHRASE_REPLACEMENTS = [
  [/\bperformance\s+metrics\b/gi, "finish and sizing detail"],
  [/\bsite\s+surveys\b/gi, "showroom measurement visits"],
  [/\bwater[-\s]?tight\b/gi, "leak-resistant"],
  [/\bingress\s+sealing\s+or\s+gasketing\b/gi, "leak-resistant sealing"],
  [/\bingress\s+sealing\b/gi, "leak-resistant sealing"],
  [/\bgasketing\b/gi, "sealing"],
  [/\bgaskets?\b/gi, "seals"],
  [/\bingress\b/gi, "moisture protection"],
  [/\bsite\s+survey\b/gi, "showroom measurement review"],
  [/\bmtbf[-\s]?style\b/gi, "warranty-backed reliability"],
  [/\bmtbf\b/gi, "warranty confidence"],
  [/\bmttr\b/gi, "service response clarity"],
  [/\bpreventive\s+maintenance\b/gi, "routine care"],
  [/\bpilot\s+project\b/gi, "sample evaluation path"],
  [/\bcommissioning\b/gi, "first use and handover"],
  [/\bthroughput\b/gi, "daily use flow"],
  [/\bperformance\s+envelope\b/gi, "size and configuration range"],
  [/\boperational\s+technology\b/gi, "everyday fixture performance"],
  [/\bconnectivity\s+and\s+data\b/gi, "dimensions and configuration"],
  [/\bconnectivity\s+options\b/gi, "configuration and finish options"],
  [/\bsecure\s+connectivity\b/gi, "secure mounting and leak-resistant sealing"],
  [/\bnetwork\s+connectivity\b/gi, "plumbing and trim compatibility"],
  [/\bwireless\s+connectivity\b/gi, "hardware and bracket options"],
  [/\biot\s+connectivity\b/gi, "fixture durability and finish consistency"],
  [/\bcloud\s+connectivity\b/gi, "distributor and warranty support"],
  [/\breal[-\s]?time\s+(?:data|analytics)\b/gi, "finish and qc consistency"],
  [/\bdata\s+integration\b/gi, "specification alignment"],
  [/\bdata\s+layer\b/gi, "finish specification"],
  [/\bdata\s+centric\b/gi, "specification-led"],
  [/\bedge\s+processing\b/gi, "on-site installation precision"],
  [/\bedge\s+platform\b/gi, "installation and sealing package"],
  [/\bdigital\s+infrastructure\b/gi, "installation and support package"],
  [/\bsoftware\s+as\s+a\s+service\b/gi, "warranty and service program"],
  [/\bsoftware\s+solution\b/gi, "product and finish solution"],
  [/\bsoftware\s+update\b/gi, "range refresh options"],
  [/\b(?:it|ot)\s+security\s+posture\b/gi, "warranty and after-sales posture"],
  [/\boperational\s+technology\b/gi, "day-to-day fixture performance"],
  [/\basset\s+tracking\b/gi, "SKU and batch traceability"],
  [/\banalytics\s+dashboard\b/gi, "dealer sell-through materials"],
  [/\bsubscription\s+platform\b/gi, "warranty program"],
  [/\bedge\s+computing\b/gi, "leak-resistant sealing"],
  [/\bedge\s+deployment\b/gi, "on-site installation fit"],
  [/\bedge\s+devices?\b/gi, "fixture hardware"],
  [/\bpilot\s+line\b/gi, "lead time and quotation path"],
  [/\bpilot\s+program\b/gi, "sample program"],
  [/\bdata\s+relevance\b/gi, "bathroom compatibility"],
  [/\bdata\s+pipeline\b/gi, "supply consistency"],
  [/\bdata\s+driven\b/gi, "specification-driven"],
  [/\bconnectivity\b/gi, "installation fit"],
  [/\bcalibration\b/gi, "installation alignment"],
  [/\bthe\s+cloud\b/gi, "distributor channels"],
  [/\bcloud[-\s]?native\b/gi, "showroom-ready"],
  [/\bcloud[-\s]?based\b/gi, "showroom-ready supply"],
  [/\bcloud\s+services\b/gi, "warranty and service"],
  [/\bcloud\s+platform\b/gi, "dealer program"],
  [/\bcloud\s+architecture\b/gi, "dealer program"],
  [/\bcloud\b/gi, "distributor support"],
  [/\bsoftware\s+platform\b/gi, "product lineup"],
  [/\btechnology\s+platform\b/gi, "finish and specification package"],
  [/\bdigital\s+platform\b/gi, "showroom presentation"],
  [/\bsoftware\s+stack\b/gi, "hardware and finish package"],
  [/\btechnology\s+stack\b/gi, "material and hardware package"],
  [/\btech\s+stack\b/gi, "material and hardware package"],
  [/\bit\s+infrastructure\b/gi, "installation requirements"],
  [/\binfrastructure\s+layer\b/gi, "installation package"],
  [/\binfrastructure\b/gi, "installation package"],
  [/\bsoftware\s+layer\b/gi, "hardware finish"],
  [/\bintegrations?\b/gi, "plumbing and trim compatibility"],
  [/\banalytics\s+platform\b/gi, "dealer sell-through support"],
  [/\bdeployment\b/gi, "installation fit"],
  [/\bdigital\s+twin\b/gi, "sample fit-out review"],
  [/\biiot\b/gi, "fixture reliability"],
  [/\biot\s+stack\b/gi, "hardware package"],
  [/\bmachine\s+learning\b/gi, "finish consistency"],
  [/\bover[-\s]?the[-\s]?air\b/gi, "warranty service"],
  [/\bota\s+updates?\b/gi, "warranty updates"]
];

const BATHROOM_FORBIDDEN_LANGUAGE_RES = [
  /\bperformance\s+metrics\b/gi,
  /\bsite\s+surveys\b/gi,
  /\bindustrial\s+maintenance\s+language\b/gi,
  /\bindustrial\s+maintenance\b/gi,
  /\bpilot\b/gi,
  /\bmtbf\b/gi,
  /\bmttr\b/gi,
  /\bthroughput\b/gi,
  /\bperformance\s+envelope\b/gi,
  /\bconnectivity\b/gi,
  /\bdataset\b/gi,
  /\bdata\s+lake\b/gi,
  /\bdata\s+pipeline\b/gi,
  /\bdata\s+relevance\b/gi,
  /\bdata\s+security\b/gi,
  /\bdata\s+sovereignty\b/gi,
  /\bdata\s+centric\b/gi,
  /\bdata[-\s]?driven\b/gi,
  /\bprotocols?\b/gi,
  /\bplatform\b/gi,
  /\bsite\s+survey\b/gi,
  /\bdeployment\b/gi,
  /\bingress\b/gi,
  /\bgasketing\b/gi,
  /\bgaskets?\b/gi,
  /\bpreventive\s+maintenance\b/gi,
  /\bedge\s+computing\b/gi,
  /\bedge\s+deployment\b/gi,
  /\bedge\s+devices?\b/gi,
  /\btelemetry\b/gi,
  /\bcloud\b/gi,
  /\bcalibration\b/gi,
  /\bpilot\s+line\b/gi,
  /\bpilot\s+project\b/gi,
  /\bpilot\s+program\b/gi,
  /\bsaas\b/gi,
  /\bmicroservices\b/gi,
  /\bapis?\b/gi,
  /\bapi\s+gateway\b/gi,
  /\bfactory(\s+deployment)?\b/gi,
  /\bplant\b/gi,
  /\bcommissioning\b/gi,
  /\boperational\s+technology\b/gi,
  /\buser[-\s]?friendly\s+interfaces?\b/gi,
  /\buptime\b/gi,
  /\bot\b/gi,
  /\bscada\b/gi,
  /\bmodbus\b/gi,
  /\bprofinet\b/gi,
  /\bopc\s?ua\b/gi,
  /\biiot\b/gi,
  /\bsdk\b/gi,
  /\bdevops\b/gi,
  /\bkubernetes\b/gi,
  /\bk8s\b/gi,
  /\bgraphql\b/gi,
  /\bwebhook(s)?\b/gi,
  /\brest\s+api\b/gi,
  /\bapi\s+integration\b/gi,
  /\btelemetry\s+pipeline\b/gi,
  /\bserverless\b/gi,
  /\bsubscription\s+model\b/gi,
  /\bzero\s+trust\b/gi,
  /\bdigital\s+infrastructure\b/gi,
  /\bedge\s+processing\b/gi,
  /\bedge\s+platform\b/gi,
  /\bsoftware\s+solution\b/gi,
  /\bsoftware\s+as\s+a\s+service\b/gi,
  /\bmachine\s+learning\b/gi,
  /\bover[-\s]?the[-\s]?air\b/gi,
  /\bota\s+updates?\b/gi
];

function bathroomInputAllowsTerm(fields, tokenRe) {
  const source = [
    str(fields && fields.productType),
    str(fields && fields.material),
    str(fields && fields.style),
    str(fields && fields.priceRange),
    str(fields && fields.targetMarket)
  ]
    .join(" ")
    .toLowerCase();
  return tokenRe.test(source);
}

function bathroomForbiddenLanguageForFields(fields) {
  void fields;
  return BATHROOM_FORBIDDEN_LANGUAGE_RES;
}

function bathroomPhraseReplacementsForFields(fields) {
  void fields;
  return BATHROOM_PHRASE_REPLACEMENTS;
}

function collapseOutputWhitespace(text) {
  return str(text)
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/^\s*[,.;:]\s*/g, "")
    .trim();
}

function sanitizeBathroomSentence(text, fields) {
  let out = str(text);
  for (const [re, rep] of bathroomPhraseReplacementsForFields(fields)) {
    out = out.replace(re, rep);
  }
  const forbidden = bathroomForbiddenLanguageForFields(fields);
  for (let pass = 0; pass < 4; pass++) {
    const before = out;
    for (const re of forbidden) {
      out = out.replace(re, "");
    }
    if (before === out) break;
  }
  return collapseOutputWhitespace(out);
}

function bathroomTextHasForbiddenLanguage(text) {
  const s = str(text);
  if (!s) return false;
  for (const re of BATHROOM_FORBIDDEN_LANGUAGE_RES) {
    const r = re.global ? re : new RegExp(re.source, re.flags + "g");
    if (r.test(s)) return true;
  }
  return false;
}

/** Category-specific slide 8–9 (1-based) fallbacks — no industrial phrasing. */
const BATHROOM_SLIDE8_FALLBACK_BULLETS = [
  "Gallery-scale display impact: frameless glass, finish depth, and hardware glint that read as premium under real showroom lighting.",
  "Perceived value rises when buyers can see tempered glass clarity and stainless steel hardware before the conversation turns to price.",
  "Premium sell-through improves when partners merchandise a coherent story — sightlines, touch points, and easy-clean confidence in one glance.",
  "Inventory planning confidence from documented configurations, finish matrices, and predictable replenishment rhythms distributors can forecast.",
  "Lead time clarity and quotation support strengthen distributor positioning — your floor team sounds as premium as the fixture on display."
];

const BATHROOM_SLIDE9_FALLBACK_BULLETS = [
  "Primary bath renovation in a modern residential setting: frameless enclosure as the visual anchor for a full premium bathroom upgrade.",
  "Realistic buyer outcome — brighter sightlines, elevated daily ritual, and a finish story guests notice without a hard sell.",
  "Showroom relevance: the same sightlines and hardware presence you merchandise translate directly into what homeowners see at home.",
  "Design-fit proof under gallery lighting — tile, stone, and plumbing choices stay visible; the enclosure frames the upgrade instead of hiding it.",
  "Partner takeaway: a credible vignette you can walk a buyer through in minutes, then quote with configuration confidence and warranty clarity."
];

/** Slide 5 (1-based) / index 4 — installation fit without industrial leakage. */
const BATHROOM_SLIDE5_FALLBACK_BULLETS = [
  "Mounting and bracket clarity in the partner pack reduces guesswork — installers align glass and hardware with less rework on site.",
  "Installation fit tuned for common residential openings, trim conditions, and wet-area footprints your dealers see every week.",
  "Alignment tolerance and hardware adjustment range spelled plainly — bathroom compatibility that feels intentional, not improvised.",
  "Faster setup confidence for trusted installers translates into fewer call-backs and stronger word-of-mouth in distributor territories.",
  "Reduced showroom risk: when the gallery story matches what crews experience on site, partners defend premium pricing without apology."
];

function bathroomSlideBulletFallback(slideIndex, slotIndex, fields) {
  if (slideIndex === 4) {
    return BATHROOM_SLIDE5_FALLBACK_BULLETS[slotIndex % BATHROOM_SLIDE5_FALLBACK_BULLETS.length];
  }
  if (slideIndex === 7) {
    return BATHROOM_SLIDE8_FALLBACK_BULLETS[slotIndex % BATHROOM_SLIDE8_FALLBACK_BULLETS.length];
  }
  if (slideIndex === 8) {
    return BATHROOM_SLIDE9_FALLBACK_BULLETS[slotIndex % BATHROOM_SLIDE9_FALLBACK_BULLETS.length];
  }
  const spine = deckSpineFromBlueprint("bathroom_sanitary", fields);
  const spineRow = spine[slideIndex] || spine[0];
  const pool = bathroomAnchoredFallbackBullets(fields, spineRow, slideIndex);
  return pool[slotIndex % pool.length] || pool[0];
}

function finalizeBathroomBullet(raw, slideIndex, slotIndex, fields) {
  const original = str(raw);
  if (!original) return bathroomSlideBulletFallback(slideIndex, slotIndex, fields);
  const cleaned = sanitizeBathroomSentence(original, fields);
  const stillForbidden =
    bathroomTextHasForbiddenLanguage(original) || bathroomTextHasForbiddenLanguage(cleaned);
  if (stillForbidden || cleaned.length < 14) {
    return bathroomSlideBulletFallback(slideIndex, slotIndex, fields);
  }
  return cleaned;
}

/**
 * Per-category output cleanup: removes obvious vocabulary from *other* domains.
 * Rules are skipped when the same pattern already appears in user text fields (intentional use).
 */
function userFieldsBlob(fields) {
  return [
    str(fields && fields.productType),
    str(fields && fields.material),
    str(fields && fields.style),
    str(fields && fields.priceRange),
    str(fields && fields.targetMarket)
  ]
    .join(" ")
    .toLowerCase();
}

function categoryRuleSkipsForUserFields(fields, patternRe) {
  const probe = new RegExp(patternRe.source, patternRe.flags.replace(/g/g, "") + "g");
  return probe.test(userFieldsBlob(fields));
}

/** @type {Record<string, { replacements: [RegExp, string][], strip: RegExp[] }>} */
const CATEGORY_SPECIFIC_OUTPUT_RULES = {
  industrial_iot_equipment: {
    replacements: [
      [/\bframeless\s+(?:shower|enclosure|door)\b/gi, "modular enclosure fit"],
      [/\bshower\s+door\b/gi, "access door or panel"],
      [/\bshower\s+screen\b/gi, "protective panel or glazing"],
      [/\banti[-\s]?limescale\b/gi, "chemical compatibility"],
      [/\bbathroom\s+compatibility\b/gi, "site compatibility"],
      [/\bshowroom\s+value\b/gi, "channel demonstration value"],
      [/\bresidential\s+washroom\b/gi, "installed environment"],
      [/\bdistributor\s+showroom\b/gi, "partner evaluation site"],
      [/\beasy\s+cleaning\s+experience\b/gi, "service accessibility"],
      [/\bwater[-\s]?tight\s+sealing\b/gi, "ingress sealing or gasketing"],
      [/\btempered\s+glass\s+(?:door|enclosure)\b/gi, "tempered viewport or panel"]
    ],
    strip: []
  },
  building_materials: {
    replacements: [
      [/\bedge\s+computing\b/gi, "field performance"],
      [/\bcloud[-\s]?native\b/gi, "supply-chain ready"],
      [/\bsoftware\s+platform\b/gi, "product line"],
      [/\bpilot\s+line\b/gi, "trial batch or sample run"],
      [/\bdata\s+relevance\b/gi, "job-site relevance"],
      [/\bdigital\s+twin\b/gi, "sample mock-up"],
      [/\bsaas\b/gi, "supplier program"],
      [/\biiot\b/gi, "batch consistency"],
      [/\btelemetry\b/gi, "quality documentation"],
      [/\bframeless\s+(?:shower|enclosure)\b/gi, "panel system"],
      [/\bshower\s+enclosure\b/gi, "wet-area enclosure"]
    ],
    strip: [/\b(?:modbus|profinet|ethercat|opc\s*ua|scada|mqtt)\b/gi]
  },
  consumer_hardware: {
    replacements: [
      [/\bedge\s+computing\b/gi, "on-device processing"],
      [/\bpilot\s+line\b/gi, "early production run"],
      [/\bdistributor\s+economics\b/gi, "retail economics"],
      [/\bcommissioning\b/gi, "setup and first use"],
      [/\bframeless\s+shower\b/gi, "compact enclosure"],
      [/\bshowroom\s+value\b/gi, "retail shelf appeal"],
      [/\bbathroom\s+compatibility\b/gi, "home fit and placement"],
      [/\biiot\b/gi, "connected features"],
      [/\bopc\s*ua\b/gi, ""],
      [/\bscada\b/gi, ""]
    ],
    strip: [/\b(?:modbus|profinet|ethercat)\b/gi]
  },
  generic_b2b_product: {
    replacements: [
      [/\bedge\s+computing\b/gi, "operational fit"],
      [/\bframeless\s+shower\b/gi, "enclosure system"],
      [/\bdata\s+relevance\b/gi, "buyer relevance"]
    ],
    strip: [/\b(?:scada|modbus|opc\s*ua)\b/gi]
  }
};

function applyCategoryOutputRules(text, categoryId, fields) {
  const rules = CATEGORY_SPECIFIC_OUTPUT_RULES[categoryId];
  if (!rules) return collapseOutputWhitespace(str(text));
  let out = str(text);
  for (const [re, rep] of rules.replacements) {
    if (categoryRuleSkipsForUserFields(fields, re)) continue;
    out = out.replace(re, rep);
  }
  for (const re of rules.strip) {
    if (categoryRuleSkipsForUserFields(fields, re)) continue;
    out = out.replace(re, "");
  }
  return collapseOutputWhitespace(out);
}

function enforceNonBathroomOutputShaping(data, category, fields) {
  if (category.id === "bathroom_sanitary") return data;
  const rules = CATEGORY_SPECIFIC_OUTPUT_RULES[category.id];
  if (!rules) return data;

  const out = data && typeof data === "object" ? data : {};
  const san = (t) => applyCategoryOutputRules(t, category.id, fields);

  out.product_overview = san(out.product_overview);
  out.cold_email = san(out.cold_email);
  out.whatsapp_script = san(out.whatsapp_script);
  out.key_selling_points = Array.isArray(out.key_selling_points)
    ? out.key_selling_points.map(san).filter(Boolean)
    : [];
  out.technical_specifications = Array.isArray(out.technical_specifications)
    ? out.technical_specifications.map(san).filter(Boolean)
    : [];
  return out;
}

/** Slide 10 — fixed closing; never model-invented or industrial-flavored. */
function bathroomSlide10CanonicalBullets(fields) {
  void fields;
  return [
    "Finish samples on request so boards, vignettes, and quoted jobs stay perfectly aligned before you commit stock.",
    "Written quotation support with configuration confirmation — fewer revisions, cleaner handoffs from gallery to delivery.",
    "Lead-time confirmation your sales team can repeat with confidence, backed by warranty clarity partners trust.",
    "Showroom review to align display lighting, merchandising, and the premium upgrade story buyers experience on the floor.",
    "A clear order path from spec to delivery — partner-ready documentation that turns interest into repeat sell-through."
  ];
}

function bathroomSafeOverviewFallback(fields) {
  const p = str(fields.productType) || "This bathroom range";
  const tm = str(fields.targetMarket) || "showroom and distributor partners";
  return `${p} is positioned for ${tm} as a premium residential upgrade: frameless presence, high-clarity tempered glass for showroom display appeal, stainless hardware with confident hand-feel, leak-resistant sealing, and easy-clean surfaces that support sell-through, repeat orders, and distributor confidence.`;
}

/** Light safeguard: forbidden industrial/IT tokens → replace the whole field (no token-stripping war). */
function lightBathroomTextOrFallback(text, fields, kind) {
  const t = collapseOutputWhitespace(str(text));
  if (t.length > 0 && !bathroomTextHasForbiddenLanguage(t)) return t;
  const p = str(fields.productType) || "our bathroom range";
  const tm = str(fields.targetMarket) || "your team";
  if (kind === "email") {
    return `Quick note on ${p} for ${tm}: frameless display appeal, high-clarity glass and stainless hardware story, showroom conversion angles, plus written quotes and lead-time clarity — sample sets available on request.`;
  }
  if (kind === "whatsapp") {
    return `Hi — ${p} for ${tm}: frameless premium look, high-clarity glass, hardware feel buyers notice, easy-clean finish. Samples or a written quote?`;
  }
  return bathroomSafeOverviewFallback(fields);
}

function enforceBathroomOutputShaping(data, fields) {
  const out = data && typeof data === "object" ? data : {};
  out.product_overview = lightBathroomTextOrFallback(out.product_overview, fields, "overview");
  out.cold_email = lightBathroomTextOrFallback(out.cold_email, fields, "email");
  out.whatsapp_script = lightBathroomTextOrFallback(out.whatsapp_script, fields, "whatsapp");

  const spine0 = deckSpineFromBlueprint("bathroom_sanitary", fields)[0];
  out.key_selling_points = Array.isArray(out.key_selling_points)
    ? out.key_selling_points
        .map((x, j) => {
          const line = collapseOutputWhitespace(str(x));
          if (line && !bathroomTextHasForbiddenLanguage(line)) return line;
          const pool = bathroomAnchoredFallbackBullets(fields, spine0, 0);
          return pool[j % pool.length] || pool[0];
        })
        .filter(Boolean)
    : [];
  out.technical_specifications = Array.isArray(out.technical_specifications)
    ? out.technical_specifications
        .map((x) => {
          const line = collapseOutputWhitespace(str(x));
          if (line && !bathroomTextHasForbiddenLanguage(line)) return line;
          return "Dimensions, glass thickness, hardware series, finish codes, warranty term, and lead time — confirm against your project pack.";
        })
        .filter(Boolean)
    : [];

  const desiredTitles = getPptTitles("bathroom_sanitary");
  const slide10 = bathroomSlide10CanonicalBullets(fields);
  let slides = Array.isArray(out.ppt_outline) ? out.ppt_outline.slice(0, 10) : [];
  while (slides.length < 10) slides.push({ slide_title: "", slide_bullets: [] });
  out.ppt_outline = slides.map((slide, i) => {
    if (i === 9) {
      return { slide_title: desiredTitles[9], slide_bullets: slide10 };
    }
    const bullets = Array.isArray(slide && slide.slide_bullets)
      ? slide.slide_bullets
          .map((b, j) => finalizeBathroomBullet(b, i, j, fields))
          .filter(Boolean)
      : [];
    return {
      slide_title: desiredTitles[i],
      slide_bullets: bullets
    };
  });
  return out;
}

const SYSTEM_PROMPT = `You are a senior GTM strategist and technical marketer. You write copy that could not be pasted onto a different SKU without sounding wrong.

Hard rules:
1) Every paragraph, bullet, slide title, and script beat must visibly depend on the user's product type, material, style, price band, target market, and (if provided) the product image. Name those anchors often enough that a reader can trace claims back to inputs.
2) Do not invent certifications, customers, metrics, or integrations unless they are clearly implied by the inputs; when inferring, label inference as plausible industry practice, not fact.
3) Forbidden filler: "streamline workflows", "single source of truth", "unlock synergies", "empower teams", "next-gen", "world-class", "cutting-edge".
4) Output is ONLY valid JSON (no markdown fences, no commentary). Match the schema the user gives exactly.
5) ppt_outline must contain EXACTLY 10 slides. Each slide_bullets: 4–5 substantive bullets (not placeholders).
6) Slide titles must read like chapter headings for THIS product. NEVER use generic SaaS deck titles such as "Introduction to Our Platform", "Key Features", "Integrations", "Pricing Structure", or "Security and Compliance".
7) Follow the numbered deck blueprint in order. When the user task lists required slide_title strings, copy those titles verbatim for ppt_outline; only the bullet content should elaborate in product-specific language.
8) If category is bathroom/sanitary, use only bathroom-native vocabulary unless user inputs explicitly name an industrial/tech term. Forbidden by default (including metaphors): MTBF, deployment, site survey, pilot project, pilot line, commissioning, ingress sealing, gasketing, operational technology, throughput, performance envelope, platform/stack/SaaS/API/DevOps language, connectivity, cloud, edge computing, calibration, OT/SCADA/IIoT, industrial maintenance framing. Prefer instead: frameless appearance, high-clarity tempered glass, stainless steel hardware, finish quality, hardware feel, corrosion resistance, leak-resistant sealing, easy-clean finish, smooth opening and closing, installation fit, premium bathroom upgrade, showroom conversion, display value, distributor confidence, sell-through, perceived value, premium positioning, margin opportunity, warranty confidence, lead time clarity, sample request, quotation support. Bathroom ppt_outline bullets must read like a high-end sanitary brand sales deck: punchy (often 6–14 words), varied openings, strong commercial outcomes — avoid repeating scaffold patterns such as "X provides Y" or "X ensures Y" across bullets.
9) Stay inside the classified category lexicon: industrial_iot_equipment → floor/OT/reliability/installation language; building_materials → spec/jobsite/durability/supply-chain language; consumer_hardware → ownership, UX, retail, and everyday-use language; generic_b2b_product → neutral physical-product buying logic. Do not borrow another category's stock phrases unless the user's inputs explicitly justify it.`;

function fixedDeckTitlesInstruction(categoryId) {
  return getPptTitles(categoryId)
    .map((t, i) => `${i + 1}. ${t}`)
    .join("\n");
}

function buildUserTask(fields, category, spine, classification) {
  const p = str(fields.productType) || "(not specified)";
  const m = str(fields.material) || "(not specified)";
  const st = str(fields.style) || "(not specified)";
  const pr = str(fields.priceRange) || "(not specified)";
  const tm = str(fields.targetMarket) || "(not specified)";
  const c = classification || category.classification || {};

  const imageBlock = fields.hasImage
    ? `A product reference image is attached. You MUST:
- Ground at least three distinct claims across the deck in visible traits (silhouette, finish, color, labeling, packaging, scale cues, interface elements).
- Visual evidence outweighs vague productType wording; classify and describe what you see for appearance and product family.
- If the image conflicts with text fields, prefer the fields for commercial terms and use the image for appearance.`
    : `No image was provided. Do not claim to have seen the product; infer appearance only from text fields.`;

  const classificationLock = `## Structured classification (SOURCE OF TRUTH — do not override)
${JSON.stringify({
  product_category: c.product_category,
  audience_type: c.audience_type,
  content_mode: c.content_mode,
  confidence: c.confidence,
  reason: c.reason
})}
Write only for product_category "${c.product_category}". Match audience_type "${c.audience_type}" and content_mode "${c.content_mode}" (${
    c.content_mode === "product_promo"
      ? "short premium lines, promo energy, minimal jargon"
      : "clear slide-style narrative suitable for a formal presentation"
  }).`;

  const categoryBlock = `SERVER_CLASSIFIED_CATEGORY: ${category.id} (${category.label})
Interpretation rules:
- This is a physical product category system. Avoid software-platform framing unless explicitly requested in user inputs.
${category.isIndustrialLike ? "- Industrial / IoT framing: reliability, installation, protocols, maintenance, uptime, compliance, deployment context. Do not use shower-enclosure, washroom-showroom, or residential bathroom fixture vocabulary unless the user's fields name those applications." : ""}
${category.isBathroomLike ? "- Bathroom/sanitary framing only: frameless design, finish quality, hardware feel, high-clarity tempered glass, stainless steel hardware, corrosion resistance, leak-resistant sealing, easy-clean finish, smooth opening and closing, installation fit, premium bathroom upgrade, residential upgrade context, showroom conversion, display value, perceived value, sell-through, premium positioning, distributor confidence, margin opportunity, warranty confidence, lead time clarity, sample request, quotation support.\n- Deck copy tone: premium sales-level — short, direct bullets; foreground partner and gallery outcomes, not generic category observations.\n- Never use: MTBF, deployment, site survey, pilot project, pilot line, commissioning, ingress sealing, gasketing, operational technology, throughput, performance envelope, platform language, industrial maintenance idioms, connectivity, cloud, edge computing, calibration, or software/SaaS/infrastructure/stack metaphors unless those exact words appear in the user's text fields." : ""}
${category.isBuildingLike ? "- Building materials framing: durability, finish, sizing, use scenarios, contractor/distributor value, logistics, batch consistency. Avoid OT protocol names, edge/cloud software stacks, and SaaS metaphors unless the user explicitly names them." : ""}
${category.isConsumerHardwareLike ? "- Consumer hardware framing: features, usability, design, compatibility, packaging, target buyer intent. Avoid industrial OT stack language and B2B sanitary-ware distributor jargon unless the user explicitly names them." : ""}
${!category.isIndustrialLike && !category.isBathroomLike && !category.isBuildingLike && !category.isConsumerHardwareLike ? "- Generic B2B framing: neutral physical product structure with concrete buying, specification, and adoption logic. Avoid category-specific jargon from industrial IoT, bathroom, building, or consumer retail unless justified by user inputs." : ""}`;

  const bathroomDeckTitlesBlock = category.isBathroomLike
    ? `
## Bathroom deck — required slide_title strings (copy verbatim for ppt_outline slides 1–10)
${fixedDeckTitlesInstruction("bathroom_sanitary")}

Each slide_bullets array: exactly 4–5 lines rooted in the inputs. Write for a spoken sales presentation — commercially dense, premium in tone, distributor- and showroom-aware; every bullet should stand alone as something a rep would say on the floor. Vary how each bullet starts; do not lean on repetitive "provides/ensures" patterns. No factory-floor, software-stack, or industrial IoT vocabulary; never use: uptime, deployment, site survey, pilot, MTBF, commissioning, performance metrics, performance envelope, platform, operational technology, throughput, protocols, or generic SaaS tone.`
    : "";

  const fixedNonBathroomTitlesBlock =
    !category.isBathroomLike && hasFixedPptTitles(category.id)
      ? `
## Required slide_title strings (copy verbatim for ppt_outline slides 1–10)
${fixedDeckTitlesInstruction(category.id)}

Bullets must follow the numbered blueprint focuses below — do not invent different slide titles.`
      : "";

  const spineBlock = spine
    .map((row, i) => `${i + 1}. ${row.focus}`)
    .join("\n");

  return `## Authoritative inputs (do not swap for a generic narrative)
- productType: ${p}
- material: ${m}
- style: ${st}
- priceRange: ${pr}
- targetMarket: ${tm}

## Image
${imageBlock}

${classificationLock}

## Category lock-in
${categoryBlock}
${bathroomDeckTitlesBlock}
${fixedNonBathroomTitlesBlock}

## Deck blueprint (10 slides, this order — bullets follow these focuses; use required titles verbatim when provided)
${spineBlock}

## JSON schema (respond with ONLY this JSON object)
{
  "product_overview": "About 150 words; every paragraph rooted in the five fields above${fields.hasImage ? " and visible traits from the image" : ""}",

  "key_selling_points": [
    "Exactly five bullets; each references at least two of: productType, material, style, priceRange, targetMarket"
  ],

  "technical_specifications": [
    "Three or more lines appropriate to the classified category (e.g., industrial: interfaces/ratings/maintenance; bathroom: dimensions/tempered glass/stainless hardware/leak-resistant sealing/corrosion resistance/warranty/lead time; building materials: tolerances/applications/durability; consumer hardware: performance/compatibility/power)"
  ],

  "ppt_outline": [
    {
      "slide_title": "string",
      "slide_bullets": ["4-5 bullets tied to this slide's spine item and the inputs"]
    }
  ],

  "cold_email": "To ${tm}; mention ${p} and a hook from ${m} or ${st}",
  "whatsapp_script": "Short; respects ${pr} and ${tm}",
  "video_script": "Product promo film beats (not a slide readout): short lines, no 'Scene' labels, minimal bullet-style stacking; mirror category blueprint emotionally without copying slide titles verbatim"
}

Generate EXACTLY 10 objects in ppt_outline, in spine order.`;
}

async function buildUserMessage(taskText, fileMeta, absolutePath) {
  if (!fileMeta || !absolutePath) {
    return { role: "user", content: taskText };
  }

  const buf = await fs.promises.readFile(absolutePath);
  const mime = fileMeta.mimetype || "image/jpeg";
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

  return {
    role: "user",
    content: [
      { type: "text", text: taskText },
      { type: "image_url", image_url: { url: dataUrl } }
    ]
  };
}

function parseModelJson(text) {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

function inputAnchoredFallbackBullets(fields, spineRow) {
  const p = fields.productType || "this product";
  const m = fields.material || "the stated materials";
  const s = fields.style || "the positioning";
  const r = fields.priceRange || "the commercial framing";
  const t = fields.targetMarket || "the buyer";
  const hook = spineRow ? spineRow.focus : `Why ${t} should care about ${p}.`;
  return [
    `${hook}`,
    `Tie differentiation to ${m} and ${s} with concrete buyer language for ${t}.`,
    `Connect economics to ${r} (how they budget, compare, or approve).`,
    `Name a realistic objection for ${t} and answer it with specifics about ${p}.`,
    `End with one tangible next step (sample, pilot, site visit, scoped demo, RFQ).`
  ];
}

function bathroomAnchoredFallbackBullets(fields, spineRow, slideIndex) {
  const p = fields.productType || "this product";
  const m = fields.material || "the stated materials";
  const s = fields.style || "the positioning";
  const r = fields.priceRange || "the commercial framing";
  const t = fields.targetMarket || "the buyer";
  const hook = spineRow ? spineRow.focus : `Why ${t} should care about ${p} in the bathroom category.`;
  const sceneBullets = {
    0: [
      `Residential upgrade demand is tilting toward visible wet-area quality — ${p} gives ${t} a premium bathroom upgrade story that converts on the floor.`,
      `Showroom conversion rises when buyers feel immediate perceived value; frameless presence and tempered glass clarity answer that expectation before price talk.`,
      `Premium positioning separates distributor lines in crowded markets — partners win margin when the gallery narrative matches what homeowners want installed.`,
      `Buyer expectations are shaped by editorial baths and design media; ${r} framing lands when your display proves the same sightlines and hardware feel.`,
      `Lead with quotation support and lead time clarity — ${t} closes faster when every conversation can move from inspiration to a written path forward.`
    ],
    1: [
      `${p} reads ${s} through uninterrupted frameless sightlines — clean geometry that feels intentional, not decorative.`,
      `Visual openness preserves tile, stone, and plumbing investments; the enclosure becomes a premium frame instead of visual clutter.`,
      `Premium bathroom styling under gallery lighting depends on disciplined reveals and glass clarity — this design language photographs and merchandises consistently.`,
      `Display appeal for walk-in buyers: hardware points catch light, glass reads deep, and the overall silhouette signals a considered upgrade.`,
      `A coherent aesthetic from catalog to vignette helps ${t} repeat the same premium story across territories without retraining the floor.`
    ],
    2: [
      `${m} — tempered glass clarity presents true color and depth so buyers read quality before they read a line-item spec.`,
      `Safety perception strengthens at the counter when edges, corners, and hardware integration look deliberate and residential-grade.`,
      `Stainless steel hardware with consistent finish quality delivers corrosion resistance and a tactile premium feel during the hand-off moment.`,
      `Finish harmony across hinges, brackets, and handles reinforces buyer confidence — small details signal how the whole bath will age in humid daily use.`,
      `Partners stock and specify with confidence when material claims are visible, touchable, and easy to repeat in written quotations.`
    ],
    3: [
      `Opening styles and footprints align with common residential layouts — ${t} can quote walk-in expectations without overpromising custom work.`,
      `Flexible sizing narratives help gallery teams map SKUs to real bathrooms, shortening the path from floor interest to a documented configuration.`,
      `Quote-ready configuration clarity reduces back-and-forth: dimensions, handing, and hardware series stated in language installers recognize.`,
      `When buyers understand options quickly, ${r} positioning feels fair — premium is explained by fit, finish, and sealing confidence, not ambiguity.`,
      `Distributor sell-through improves when the range covers typical wet-area plans while still feeling bespoke on display.`
    ],
    4: [
      `Mounting clarity and hardware adjustment range reduce installation surprises — crews align ${p} with predictable bathroom conditions.`,
      `Installation fit tuned for residential trim, thresholds, and plumb variance keeps premium projects on schedule and protects partner reputation.`,
      `Bathroom compatibility is explained in dealer language, not abstract jargon — faster setup confidence for crews ${t} already trust.`,
      `Glass-to-hardware alignment that respects real-world tolerance cuts call-backs and protects the premium story after the sale.`,
      `Showroom risk drops when the gallery promise matches what installers experience on site — partners defend price with field-credible fit.`
    ],
    5: [
      `Smooth opening and closing keeps daily use feeling premium — motion quality is part of the ${r} experience homeowners remember.`,
      `Easy-clean finish and disciplined glass planes reduce maintenance anxiety; the bath stays gallery-bright with realistic homeowner care.`,
      `Daily touch experience on stainless steel hardware should feel solid and precise — tactile quality drives referrals long after install.`,
      `Lasting appearance under steam and humidity protects word-of-mouth in ${t} territories; buyers recommend what still looks intentional years later.`,
      `Recommendation potential rises when everyday use reinforces the same premium cues buyers first saw on your floor.`
    ],
    6: [
      `Leak-resistant sealing and disciplined perimeter detailing protect floors and adjacent finishes — durability that feels residential-careful, not industrial.`,
      `Corrosion resistance across hardware and exposed metal keeps humid-bathroom performance looking composed season after season.`,
      `Long-term finish retention supports warranty-backed confidence — partners repeat the same story without hedging at the counter.`,
      `Humid bathroom performance is where cheap enclosures fail quietly; premium sealing and material discipline preserve perceived value after move-in.`,
      `Warranty clarity paired with visible build quality lets ${t} stake reputation on every quoted job.`
    ],
    7: [
      `Showroom display value: ${p} merchandises as a hero SKU — frameless sightlines and hardware presence lift the entire surrounding assortment.`,
      `Perceived value and ${r} framing compound when lighting, photography, and floor copy align; premium sell-through follows a coherent premium narrative.`,
      `Distributor sell-through improves with inventory planning confidence — documented SKUs, finish matrices, and replenishment rhythm your team can forecast.`,
      `Lead time clarity and quotation support keep gallery conversations moving; hesitation is replaced by a partner-ready path from sample to order.`,
      `Stronger distributor positioning: when display impact, warranty confidence, and installation fit all line up, ${t} owns the upgrade conversation in their market.`
    ],
    8: [
      `Believable use case: a primary bath renovation where ${p} anchors a ${s} residential setting — realistic layout, premium finishes, and a buyer-ready outcome.`,
      `Homeowners experience brighter sightlines, calmer geometry, and hardware that feels expensive in daily touch — the same cues ${t} merchandise in vignettes.`,
      `Showroom relevance stays high when the residential example mirrors what crews install weekly — design-fit proof buyers can picture in their own homes.`,
      `The upgrade story stays credible: easy-clean confidence, leak-resistant sealing, and stainless steel hardware that still reads premium after humid seasons.`,
      `Partner outcome: a repeatable vignette narrative that moves from gallery inspiration to written quotation without diluting premium positioning.`
    ]
  };
  const lead = sceneBullets[slideIndex] || [];
  if (lead.length >= 4) return lead.slice(0, 5);
  return [
    ...lead,
    `${hook}`,
    `Differentiation in ${m}, finish discipline, and ${s} for ${t}.`,
    `Install fit, easy-clean story, sealing credibility — concrete answers for hesitant buyers.`,
    `${r}, warranty clarity, finish samples, and quotation support — partner-ready next steps that improve sell-through.`
  ];
}

function normalizePptOutline(data, category, fields, spine) {
  let slides = Array.isArray(data.ppt_outline) ? data.ppt_outline.slice(0, 10) : [];
  while (slides.length < 10) {
    slides.push({ slide_title: "", slide_bullets: [] });
  }

  const normalized = slides.map((slide, i) => {
    const spineRow = spine[i] || spine[spine.length - 1];
    const rawTitle = slide && slide.slide_title;
    const title = sanitizeSlideTitle(rawTitle, i, category, fields, spineRow);

    let bullets = Array.isArray(slide && slide.slide_bullets)
      ? slide.slide_bullets.filter((b) => b != null && str(b) !== "")
      : [];

    if (bullets.length < 4) {
      const fb =
        category.isBathroomLike && i === 9
          ? []
          : category.isBathroomLike
            ? bathroomAnchoredFallbackBullets(fields, spineRow, i)
            : inputAnchoredFallbackBullets(fields, spineRow);
      bullets = bullets.length ? [...bullets, ...fb].slice(0, 5) : fb;
    }

    return { slide_title: title, slide_bullets: bullets.slice(0, 5) };
  });
  if (category.isBathroomLike) {
    const desiredTitles = getPptTitles("bathroom_sanitary");
    const slide10 = bathroomSlide10CanonicalBullets(fields);
    return normalized.map((slide, i) => {
      if (i === 9) {
        return { slide_title: desiredTitles[9], slide_bullets: slide10 };
      }
      let bs = (slide.slide_bullets || [])
        .map((b, j) => finalizeBathroomBullet(b, i, j, fields))
        .filter(Boolean);
      if (bs.length < 4) {
        if (i === 4) bs = [...BATHROOM_SLIDE5_FALLBACK_BULLETS];
        else if (i === 7) bs = [...BATHROOM_SLIDE8_FALLBACK_BULLETS];
        else if (i === 8) bs = [...BATHROOM_SLIDE9_FALLBACK_BULLETS];
        else {
          const spineRow = spine[i] || spine[spine.length - 1];
          bs = bathroomAnchoredFallbackBullets(fields, spineRow, i).slice(0, 5);
        }
      }
      return {
        slide_title: desiredTitles[i],
        slide_bullets: bs.slice(0, 5)
      };
    });
  }
  return normalized.map((slide) => ({
    slide_title: applyCategoryOutputRules(slide.slide_title, category.id, fields),
    slide_bullets: (slide.slide_bullets || [])
      .map((b) => applyCategoryOutputRules(str(b), category.id, fields))
      .filter(Boolean)
      .slice(0, 5)
  }));
}

const generateUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "productImage", maxCount: 1 }
]);

app.post(
  "/api/generate",
  (req, res, next) => {
    generateUpload(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          return res.status(400).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message || "Upload failed" });
      }
      next();
    });
  },
  async (req, res) => {
    console.log("=== /api/generate called ===");
    console.log("content-type:", req.headers["content-type"]);
    console.log("req.body:", req.body);
    const filesBag = req.files && typeof req.files === "object" ? req.files : {};
    const uploadedFile =
      (filesBag.image && filesBag.image[0]) ||
      (filesBag.productImage && filesBag.productImage[0]) ||
      null;
    console.log("req.files (image fields):", {
      hasImageField: Boolean(filesBag.image && filesBag.image[0]),
      hasProductImageField: Boolean(filesBag.productImage && filesBag.productImage[0])
    });
    let inVideoPipeline = false;
    try {
      console.log(GENERATE_LOG, "req.body keys:", Object.keys(req.body || {}));
      console.log(GENERATE_LOG, "req.body (summarized):", summarizeBodyForLog(req.body));
      console.log(GENERATE_LOG, "image file uploaded:", Boolean(uploadedFile));
      if (uploadedFile) {
        console.log(GENERATE_LOG, "uploaded file:", {
          originalname: uploadedFile.originalname,
          filename: uploadedFile.filename,
          path: uploadedFile.path,
          mimetype: uploadedFile.mimetype,
          size: uploadedFile.size
        });
      }

      let verifiedImage = null;
      if (uploadedFile) {
        try {
          verifiedImage = await verifySavedUpload(uploadedFile);
          let diskPath = verifiedImage.absolutePath;
          try {
            diskPath = await fs.promises.realpath(verifiedImage.absolutePath);
          } catch (_) {
            /* keep absolutePath */
          }
          console.log(IMAGE_PIPELINE_LOG, "uploaded file path (on disk):", diskPath);
          console.log(IMAGE_PIPELINE_LOG, "saved image size (bytes):", verifiedImage.size);
        } catch (verifyErr) {
          console.error(
            IMAGE_PIPELINE_LOG,
            "could not verify saved file on disk:",
            verifyErr && verifyErr.message ? verifyErr.message : verifyErr
          );
          return res.status(500).json({
            error: "Image upload could not be saved. Check server disk permissions and try again."
          });
        }
      }

      const productType = str(req.body.productType);
      const material = str(req.body.material);
      const style = str(req.body.style);
      const priceRange = str(req.body.priceRange);
      const targetMarket = str(req.body.targetMarket);

      // A) Normalized request fields (classification + generation inputs)
      const fields = {
        productType,
        material,
        style,
        priceRange,
        targetMarket,
        hasImage: Boolean(uploadedFile)
      };

      console.log(GENERATE_LOG, "normalized input (prompt generation):", JSON.stringify(fields));
      const pipeline = pipelineFieldReport(req.body, uploadedFile);
      console.log(GENERATE_LOG, "pipeline verification (present = true):", pipeline);
      const missingPipeline = Object.entries(pipeline)
        .filter(([, ok]) => !ok)
        .map(([k]) => k);
      if (missingPipeline.length) {
        console.warn(
          GENERATE_LOG,
          "missing or empty pipeline inputs:",
          missingPipeline.join(", ")
        );
      }

      const absoluteImagePath = verifiedImage ? verifiedImage.absolutePath : null;
      // B) Structured classification (source of truth for category — dedicated module + logs)
      const structuredClassification = await classifyProductStructured(
        client,
        fields,
        uploadedFile,
        absoluteImagePath,
        GENERATE_LOG
      );
      logStructuredClassification(GENERATE_LOG, structuredClassification);

      // C) Category flags + deck / video blueprints
      const category = categoryFlagsFromClassification(structuredClassification);
      const spine = deckSpineFromBlueprint(category.id, fields);

      // D) LLM generation inside blueprint (titles locked server-side where fixed)
      const userTask = buildUserTask(fields, category, spine, structuredClassification);
      const prompt = userTask;
      console.log("prompt preview:", prompt.slice(0, 500));
      console.log(GENERATE_LOG, "user task / prompt preview:\n" + promptPreview(userTask));

      const userMessage = await buildUserMessage(userTask, uploadedFile, absoluteImagePath);

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          userMessage
        ],
        temperature: category.isIndustrialLike
          ? 0.55
          : structuredClassification.content_mode === "product_promo"
            ? 0.72
            : 0.62,
        response_format: { type: "json_object" }
      });

      const text = completion.choices[0].message.content || "";
      let data;

      try {
        data = parseModelJson(text);
        data.classification = structuredClassification;
      } catch (e) {
        console.error("JSON parse failed:", text.slice(0, 500));
        data = {
          classification: structuredClassification,
          product_overview: text,
          key_selling_points: [],
          technical_specifications: [],
          ppt_outline: [],
          cold_email: "",
          whatsapp_script: "",
          video_script: ""
        };
      }

      // E) Light post-process (safeguard) + normalize deck; video script from blueprint (not PPT readout)
      if (category.isBathroomLike) {
        data = enforceBathroomOutputShaping(data, fields);
      } else {
        data = enforceNonBathroomOutputShaping(data, category, fields);
      }

      data.ppt_outline = normalizePptOutline(data, category, fields, spine);

      data.video_script =
        category.id === "bathroom_sanitary"
          ? buildBathroomVideoSceneScript(fields, Boolean(verifiedImage))
          : buildVideoScriptFromBlueprint(category.id, fields);

      if (verifiedImage && uploadedFile) {
        const fname =
          uploadedFile.filename ||
          path.basename(verifiedImage.absolutePath) ||
          path.basename(uploadedFile.path || "");
        if (fname) {
          const relativeUrl = publicProductImageUrl(fname);
          const imageUrl = absolutePublicUploadUrl(req, relativeUrl);
          data.imageUrl = imageUrl;
          console.log(IMAGE_PIPELINE_LOG, "returned imageUrl:", imageUrl);
        } else {
          console.warn(
            IMAGE_PIPELINE_LOG,
            "upload verified on disk but no filename; cannot set imageUrl"
          );
        }
      }

      const renderId = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      inVideoPipeline = true;

      let remotionProductImageFile = null;
      if (verifiedImage && uploadedFile) {
        const imageBuf = await fs.promises.readFile(verifiedImage.absolutePath);
        const ext =
          path.extname(uploadedFile.filename || "") ||
          path.extname(verifiedImage.absolutePath || "") ||
          ".jpg";
        remotionProductImageFile = bufferToImageDataUrl(imageBuf, ext);
      }

      const renderInput = buildRemotionRenderInput(data, fields, {
        productImageFile: remotionProductImageFile
      });
      const videoFilename = `video-${renderId}.mp4`;
      const outputAbs = path.join(OUTPUT_DIR, videoFilename);
      const propsAbs = path.join(REMOTION_PROPS_DIR, `props-${renderId}.json`);

      console.log(REMOTION_LOG, "render input keys:", Object.keys(renderInput));
      await assertRemotionProjectPresent();
      await fs.promises.writeFile(propsAbs, JSON.stringify(renderInput), "utf8");
      console.log(REMOTION_LOG, "starting render →", outputAbs);
      await runRemotionCliRender(outputAbs, propsAbs);
      try {
        await fs.promises.unlink(propsAbs);
      } catch (_) {
        /* ignore */
      }

      const stOut = await fs.promises.stat(outputAbs);
      if (!stOut.isFile() || stOut.size < 1) {
        throw new Error("Remotion finished but output MP4 is missing or empty");
      }

      const videoPath = `/generated-videos/${videoFilename}`;
      data.videoUrl = absolutePublicUploadUrl(req, videoPath);
      console.log(REMOTION_LOG, "videoUrl:", data.videoUrl);

      console.log("response keys:", Object.keys(data));
      res.json(data);
    } catch (err) {
      const m = err && err.message ? String(err.message) : String(err);
      const videoFailed =
        inVideoPipeline ||
        (err && err.name === "RemotionRenderError") ||
        /remotion/i.test(m) ||
        m.includes("dependencies not installed") ||
        m.includes("Remotion project missing") ||
        m.includes("output MP4 is missing");

      if (videoFailed) {
        console.error(GENERATE_LOG, "Video rendering failed — full error object:", err);
        console.error(
          GENERATE_LOG,
          "Video rendering failed — inspected:",
          util.inspect(err, { depth: 8, maxStringLength: 100000 })
        );
        console.error(GENERATE_LOG, "Video rendering failed — stack:\n", err && err.stack);

        const isDev = process.env.NODE_ENV !== "production";
        const body = {
          error: m,
          ...(isDev && err && err.stack ? { stack: err.stack } : {}),
          ...(typeof err.stderr === "string" && err.stderr.length ? { stderr: err.stderr } : {}),
          ...(typeof err.stdout === "string" && err.stdout.length ? { stdout: err.stdout } : {}),
          ...(typeof err.exitCode === "number" ? { exitCode: err.exitCode } : {})
        };
        return res.status(500).json(body);
      }

      console.error(err);
      res.status(500).json({
        error: "AI generation failed"
      });
    }
  }
);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "demo.html"));
});

app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
  console.log(IMAGE_PIPELINE_LOG, "UPLOAD_DIR (static /uploads):", path.resolve(UPLOAD_DIR));
});
