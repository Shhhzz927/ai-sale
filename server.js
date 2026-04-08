/**
 * Local render API for Remotion (MyComp → MP4).
 *
 * - Serves `public/` at the site root so `/renders/...` URLs work in the browser and in headless Chrome during render.
 * - POST /api/render-video — JSON body matches `CompositionProps` (see types/constants.ts). Optional `jobId` chooses the output filename.
 * - multipart: form field `payload` (JSON string) + optional file field `productImage` (saved under public/renders/uploads/).
 *
 * Start: npm run server
 * Env: PORT (default 3001), PUBLIC_SERVER_URL (optional absolute base for videoUrl when behind a proxy)
 */

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { promisify } = require("util");
const { execFile } = require("child_process");

const express = require("express");
const cors = require("cors");
const multer = require("multer");

try {
  require("dotenv").config();
} catch {
  // ignore
}

const execFileAsync = promisify(execFile);

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const RENDERS_DIR = path.join(PUBLIC_DIR, "renders");
const UPLOADS_DIR = path.join(RENDERS_DIR, "uploads");
const TMP_DIR = path.join(ROOT, ".render-tmp");

function ensureDirs() {
  for (const d of [PUBLIC_DIR, RENDERS_DIR, UPLOADS_DIR, TMP_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function getRemotionBin() {
  const win = process.platform === "win32";
  const name = win ? "remotion.cmd" : "remotion";
  return path.join(ROOT, "node_modules", ".bin", name);
}

function absolutePublicUrl(req, relativePath) {
  const base =
    process.env.PUBLIC_SERVER_URL?.replace(/\/$/, "") ||
    `${req.protocol}://${req.get("host")}`;
  const rel = relativePath.replace(/^\//, "");
  return `${base}/${rel}`;
}

/**
 * @param {Record<string, unknown>} inputProps
 * @param {string} outputAbs
 */
async function renderMp4WithCli(inputProps, outputAbs) {
  const propsFile = path.join(TMP_DIR, `props-${randomUUID()}.json`);
  fs.writeFileSync(propsFile, JSON.stringify(inputProps), "utf8");
  const entryPoint = path.join("src", "remotion", "index.ts");
  const bin = getRemotionBin();

  if (!fs.existsSync(bin)) {
    throw new Error(
      "Remotion CLI not found under node_modules/.bin. Run npm install in the project root.",
    );
  }

  try {
    await execFileAsync(
      bin,
      [
        "render",
        entryPoint,
        "MyComp",
        outputAbs,
        "--props",
        propsFile,
        "--codec",
        "h264",
        "--overwrite",
      ],
      {
        cwd: ROOT,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  } finally {
    try {
      fs.unlinkSync(propsFile);
    } catch {
      // ignore
    }
  }
}

function normalizePayloadBody(req) {
  if (req.is("multipart/form-data")) {
    const raw = req.body?.payload;
    if (!raw || typeof raw !== "string") {
      throw new Error('Multipart requests must include a "payload" field (JSON string).');
    }
    return JSON.parse(raw);
  }
  return req.body;
}

function attachUploadedImage(req, payload) {
  if (!req.file) {
    return;
  }
  const ext = path.extname(req.file.originalname || "") || ".png";
  const safe = `${randomUUID()}${ext}`;
  const dest = path.join(UPLOADS_DIR, safe);
  fs.renameSync(req.file.path, dest);
  const uploadedUrl = absolutePublicUrl(req, `renders/uploads/${safe}`);
  payload.productImageFile = uploadedUrl;
  payload.imageUrl = uploadedUrl;
}

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 20 * 1024 * 1024 },
});

ensureDirs();

const app = express();
app.use(
  cors({
    origin: true,
  }),
);
app.use(express.json({ limit: "4mb" }));
app.use(express.static(PUBLIC_DIR));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/api/render-video",
  upload.single("productImage"),
  async (req, res) => {
    try {
      const payload = normalizePayloadBody(req);
      attachUploadedImage(req, payload);

      if (
        payload.imageUrl &&
        typeof payload.imageUrl === "string" &&
        payload.imageUrl.startsWith("/")
      ) {
        const absolute = absolutePublicUrl(
          req,
          payload.imageUrl.replace(/^\//, ""),
        );
        payload.imageUrl = absolute;
        if (!payload.productImageFile) {
          payload.productImageFile = absolute;
        }
      }

      const jobId =
        typeof payload.jobId === "string" && payload.jobId.trim()
          ? payload.jobId.trim().replace(/[^a-zA-Z0-9-_]/g, "_")
          : randomUUID();

      const inputProps = { ...payload };
      delete inputProps.jobId;

      const outName = `${jobId}.mp4`;
      const outputAbs = path.join(RENDERS_DIR, outName);

      await renderMp4WithCli(inputProps, outputAbs);

      const videoUrl = absolutePublicUrl(req, `renders/${outName}`);
      res.json({
        ok: true,
        jobId,
        videoUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[render-video]", message);
      res.status(500).json({ ok: false, error: message });
    }
  },
);

const port = Number(process.env.PORT || 3001, 10);
app.listen(port, () => {
  console.log(`Render server listening on http://localhost:${port}`);
  console.log(`POST JSON or multipart to http://localhost:${port}/api/render-video`);
});
