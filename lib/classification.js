/**
 * Structured classification — source of truth for category, audience, and content mode.
 * Image evidence is weighted heavily when present (see system prompt).
 */

const fs = require("fs");
const { CATEGORIES } = require("./blueprints");

const SIGNALS = {
  industrial_iot: [
    /\b(iot|iiot|sensor|sensors|actuator|plc|scada|oem|industrial|factory|plant\b|machine|machinery|equipment|enclosure|motor|pump|valve|cnc|fabrication|hvac|compressor|robot|robotics|automation|telemetry|edge\s+gateway|gateway\b|field\s+device|controller\b|vfd|drives?\b|instrumentation|weighing|conveyor|lathe|mill\b|tooling|rtu|modbus|profinet|ethercat|opc\s?ua)\b/i,
    /\b(ip\s*rating|ingress|atex|iec\s*62443|ul\s*listed|nec\b|machinery\s+directive)\b/i
  ],
  bathroom_sanitary: [
    /\b(bathroom|shower|shower\s*room|sanitary|sanitaryware|vanity|basin|sink|faucet|tapware|toilet|wc\b|bidet|bathtub|tub|drain|floor\s*drain|shower\s*door|shower\s*screen|partition|mirror\s*cabinet|waterproof|anti-?slip|anti-?mildew|limescale)\b/i,
    /\b(ceramic|porcelain|tempered\s+glass|304\s*stainless|316\s*stainless|pvd|chrome|matte\s+black|brushed\s+nickel)\b/i
  ],
  building_materials: [
    /\b(building\s+materials?|construction|architectural|home\s+hardware|door\s+hardware|window\s+hardware|hinge|lockset|tile|panel|board|insulation|sealant|adhesive|roofing|cladding|flooring|drywall|gypsum|mortar|grout|aggregate|pipe\s+fitting)\b/i,
    /\b(contractor|installer|distributor|dealer|project\s+spec|site\s+delivery|wholesale)\b/i
  ],
  consumer_hardware: [
    /\b(consumer\s+hardware|small\s+appliance|appliance|smart\s+home|gadget|wearable|portable|cordless|bluetooth|wifi|usb-c|battery|charging|kitchen\s+appliance|vacuum|air\s+purifier|humidifier|coffee\s+maker|blender|rice\s+cooker|fan|heater)\b/i,
    /\b(unboxing|packaging|giftable|retail\s+box|app\s+control|voice\s+assistant)\b/i
  ],
  physical_material: [
    /\b(aluminum|aluminium|steel|stainless|leather|wood|bamboo|ceramic|porcelain|glass|tempered|plastic|abs|pc\b|pvc|pp\b|pe\b|fabric|cotton|linen|silicone|rubber|titanium|brass|copper|carbon\s+fiber|composite|die-?cast|forged|injection\s+mold)\b/i
  ]
};

const AUDIENCE_VALUES = new Set([
  "distributor_showroom",
  "contractor_builder",
  "industrial_buyer",
  "retail_buyer",
  "generic_b2b_buyer"
]);

const CONTENT_MODE_VALUES = new Set(["sales_presentation", "product_promo"]);

const CONFIDENCE_VALUES = new Set(["low", "medium", "high"]);

/** Generic B2B words that must not beat clear image evidence. */
const VAGUE_PRODUCT_TYPE_RES = [
  /^(?:b2b|b\s*to\s*b)\s+product$/i,
  /^(?:our\s+)?(?:new\s+)?(?:product|solution|offering|hardware|system|line|range)$/i,
  /^(?:industrial\s+)?(?:hardware|equipment|device|product)$/i,
  /\b(?:enterprise|commercial)\s+(?:solution|product|hardware)\b/i
];

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

function parseModelJson(text) {
  const cleaned = String(text || "")
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  return JSON.parse(cleaned);
}

function scoreCategoryBlob(blob) {
  const scores = {
    industrial_iot: 0,
    bathroom_sanitary: 0,
    building_materials: 0,
    consumer_hardware: 0,
    physical_hint: 0
  };
  for (const re of SIGNALS.industrial_iot) {
    if (re.test(blob)) scores.industrial_iot += 2;
  }
  for (const re of SIGNALS.bathroom_sanitary) {
    if (re.test(blob)) scores.bathroom_sanitary += 2;
  }
  for (const re of SIGNALS.building_materials) {
    if (re.test(blob)) scores.building_materials += 2;
  }
  for (const re of SIGNALS.consumer_hardware) {
    if (re.test(blob)) scores.consumer_hardware += 2;
  }
  for (const re of SIGNALS.physical_material) {
    if (re.test(blob)) scores.physical_hint += 2;
  }
  return scores;
}

/**
 * True when productType (and short text blob) is too generic to override image classification.
 * @param {{ productType: string, material?: string, style?: string }} fields
 */
function isVagueProductDescriptor(fields) {
  const p = str(fields && fields.productType);
  if (!p) return true;
  if (p.length <= 64 && VAGUE_PRODUCT_TYPE_RES.some((re) => re.test(p.trim()))) {
    return true;
  }
  const blob = [p, str(fields && fields.material), str(fields && fields.style)]
    .join(" ")
    .toLowerCase();
  const hasSpecific =
    /\b(shower|enclosure|vanity|sink|faucet|toilet|basin|tile|panel|door|plc|sensor|gateway|modbus|appliance|router|camera)\b/i.test(
      blob
    );
  return !hasSpecific && p.split(/\s+/).length <= 4;
}

function pickCategoryFromScores(s) {
  if (s.industrial_iot >= 2 || (s.industrial_iot >= 1 && s.physical_hint >= 2)) {
    return { product_category: "industrial_iot_equipment", confidence: "medium", reason: "Text signals match industrial / IoT equipment." };
  }
  if (s.bathroom_sanitary >= 2) {
    return { product_category: "bathroom_sanitary", confidence: "medium", reason: "Text signals match bathroom / sanitary category." };
  }
  if (s.building_materials >= 2) {
    return { product_category: "building_materials", confidence: "medium", reason: "Text signals match building materials / construction trade." };
  }
  if (s.consumer_hardware >= 2) {
    return { product_category: "consumer_hardware", confidence: "medium", reason: "Text signals match consumer hardware / appliances." };
  }
  if (s.physical_hint >= 2) {
    return {
      product_category: "building_materials",
      confidence: "low",
      reason: "Ambiguous physical product; defaulting to building-materials-style narrative from material hints."
    };
  }
  return {
    product_category: "generic_b2b_product",
    confidence: "low",
    reason: "Insufficient category signals; using generic B2B product narrative."
  };
}

function inferAudienceFromFields(categoryId, targetMarket) {
  const t = str(targetMarket).toLowerCase();
  if (categoryId === "bathroom_sanitary") return "distributor_showroom";
  if (categoryId === "building_materials") {
    if (/\b(contractor|builder|install)/i.test(t)) return "contractor_builder";
    return "contractor_builder";
  }
  if (categoryId === "industrial_iot_equipment") return "industrial_buyer";
  if (categoryId === "consumer_hardware") return "retail_buyer";
  return "generic_b2b_buyer";
}

function inferContentMode(categoryId, audience) {
  if (categoryId === "industrial_iot_equipment" || audience === "industrial_buyer") return "sales_presentation";
  if (categoryId === "consumer_hardware") return "product_promo";
  if (categoryId === "bathroom_sanitary") return "product_promo";
  return "sales_presentation";
}

/**
 * @param {{ product_category: string, confidence?: string, reason?: string }} partial
 * @param {{ productType: string, material: string, style: string, priceRange: string, targetMarket: string }} fields
 * @returns {{ product_category: string, audience_type: string, content_mode: string, confidence: string, reason: string }}
 */
function normalizeClassification(partial, fields) {
  let product_category = str(partial.product_category);
  if (!CATEGORIES.includes(product_category)) {
    product_category = "generic_b2b_product";
  }
  let audience_type = str(partial.audience_type);
  if (!AUDIENCE_VALUES.has(audience_type)) {
    audience_type = inferAudienceFromFields(product_category, fields.targetMarket);
  }
  let content_mode = str(partial.content_mode);
  if (!CONTENT_MODE_VALUES.has(content_mode)) {
    content_mode = inferContentMode(product_category, audience_type);
  }
  let confidence = str(partial.confidence).toLowerCase();
  if (!CONFIDENCE_VALUES.has(confidence)) confidence = "medium";
  const reason = str(partial.reason) || "Classified from inputs.";
  return { product_category, audience_type, content_mode, confidence, reason };
}

/**
 * @param {{ product_category: string, audience_type: string, content_mode: string, confidence: string, reason: string }} classification
 */
function categoryFlagsFromClassification(classification) {
  const id = classification.product_category;
  const labels = {
    bathroom_sanitary: "Bathroom products / shower room / sanitary ware",
    building_materials: "Home hardware / building materials",
    industrial_iot_equipment: "Industrial equipment / IoT device",
    consumer_hardware: "Consumer hardware / small appliances",
    generic_b2b_product: "Generic B2B product fallback"
  };
  return {
    id,
    label: labels[id] || labels.generic_b2b_product,
    classification,
    isIndustrialLike: id === "industrial_iot_equipment",
    isBathroomLike: id === "bathroom_sanitary",
    isBuildingLike: id === "building_materials",
    isConsumerHardwareLike: id === "consumer_hardware"
  };
}

const CLASSIFIER_SYSTEM = `You classify B2B physical products for sales deck and promo video generation.

Output ONLY a JSON object with exactly these keys:
- product_category: one of bathroom_sanitary | building_materials | industrial_iot_equipment | consumer_hardware | generic_b2b_product
- audience_type: one of distributor_showroom | contractor_builder | industrial_buyer | retail_buyer | generic_b2b_buyer
- content_mode: sales_presentation | product_promo
- confidence: low | medium | high
- reason: one short sentence

Rules:
1) If a product image is attached, it has STRONGER weight than vague productType text. Generic business words ("solution", "hardware", "product", "system", "B2B") must NOT override clear visual evidence (e.g. shower enclosure, vanity, sink → bathroom_sanitary; PLC, sensor rack, industrial enclosure → industrial_iot_equipment; panels, doors, architectural hardware → building_materials; retail appliance or smart home device → consumer_hardware).
2) Use generic_b2b_product only when category is genuinely ambiguous after considering both image and text.
3) Choose audience_type from targetMarket and category (showroom/dealer → distributor_showroom; contractors → contractor_builder; factory/plant → industrial_buyer; retail/consumer channel → retail_buyer).
4) industrial buyers → content_mode sales_presentation; bathroom showroom / consumer retail → product_promo unless targetMarket clearly asks for a formal tender deck.`;

const VISION_CLASSIFIER_SYSTEM = `You classify a single product photograph for B2B sales content.

Reply with ONLY JSON:
{"product_category":"bathroom_sanitary|building_materials|industrial_iot_equipment|consumer_hardware|generic_b2b_product","confidence":"low|medium|high","visual_evidence":"one short phrase"}

Rules:
- Shower enclosure, shower door/screen, vanity, sink, faucet, toilet, bidet, bathtub, bathroom mirror cabinet → bathroom_sanitary
- Wall/floor panels, doors, windows, hinges, cladding, insulation, construction hardware, tile systems → building_materials
- Factory equipment, sensors, PLCs, industrial enclosures, control gear, plant machinery → industrial_iot_equipment
- Home appliances, smart home gadgets, consumer electronics packaging → consumer_hardware
- generic_b2b_product only if the object type is truly unclear`;

/**
 * Image-led classification; used to override vague text or wrong text-only model output.
 * @param {import("openai").OpenAI} client
 * @param {string} absolutePath
 * @param {import("multer").File} fileMeta
 * @param {string} logPrefix
 */
async function classifyProductFromImage(client, absolutePath, fileMeta, logPrefix) {
  if (!client || !absolutePath || !fileMeta) {
    return null;
  }
  try {
    const buf = await fs.promises.readFile(absolutePath);
    const mime = fileMeta.mimetype || "image/jpeg";
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: VISION_CLASSIFIER_SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Classify this product image for sales deck generation."
            },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      temperature: 0,
      response_format: { type: "json_object" }
    });
    const raw = completion.choices[0].message.content || "{}";
    const parsed = parseModelJson(raw);
    let product_category = str(parsed.product_category);
    if (!CATEGORIES.includes(product_category)) product_category = "generic_b2b_product";
    let confidence = str(parsed.confidence).toLowerCase();
    if (!CONFIDENCE_VALUES.has(confidence)) confidence = "medium";
    const visual_evidence = str(parsed.visual_evidence) || "Visual inspection.";
    return { product_category, confidence, visual_evidence };
  } catch (err) {
    console.warn(
      logPrefix,
      "vision-only classification failed:",
      err && err.message ? err.message : err
    );
    return null;
  }
}

/**
 * Merge text+model classification with vision when image is present.
 * @param {{ product_category: string, audience_type: string, content_mode: string, confidence: string, reason: string }} textSide
 * @param {{ product_category: string, confidence: string, visual_evidence: string } | null} visionSide
 * @param {{ product_category: string, confidence: string, reason: string }} textHeuristic
 * @param {boolean} vagueText
 */
function mergeClassificationWithImagePriority(textSide, visionSide, textHeuristic, vagueText) {
  if (!visionSide || visionSide.product_category === "generic_b2b_product") {
    return textSide;
  }
  const vCat = visionSide.product_category;
  const vConf = visionSide.confidence;
  const strongVision = vConf === "high" || vConf === "medium";
  if (!strongVision) return textSide;

  const textCat = textSide.product_category;
  const heurCat = textHeuristic.product_category;

  const visionOverridesText =
    vagueText ||
    textCat === "generic_b2b_product" ||
    (textCat === "industrial_iot_equipment" &&
      vCat === "bathroom_sanitary" &&
      (vagueText || heurCat === "bathroom_sanitary" || heurCat === "generic_b2b_product"));

  const visionAlignsHeuristic = heurCat === vCat && heurCat !== "generic_b2b_product";

  if (visionOverridesText || visionAlignsHeuristic) {
    if (vCat !== textCat) {
      return {
        ...textSide,
        product_category: vCat,
        audience_type: "",
        content_mode: "",
        confidence: vConf === "high" ? "high" : "medium",
        reason: `Image evidence prioritized (${visionSide.visual_evidence}). Prior text classification was ${textCat}.`
      };
    }
  }

  if (vCat !== textCat && vConf === "high" && vagueText) {
    return {
      ...textSide,
      product_category: vCat,
      audience_type: "",
      content_mode: "",
      confidence: "high",
      reason: `High-confidence image classification (${visionSide.visual_evidence}) overrides vague product text.`
    };
  }

  return textSide;
}

/**
 * @param {string} logPrefix e.g. "[/api/generate]"
 * @param {{ product_category: string, audience_type: string, content_mode: string, confidence: string, reason: string }} c
 */
function logStructuredClassification(logPrefix, c) {
  console.log(
    logPrefix,
    "[classification]",
    `product_category=${c.product_category}`,
    `audience_type=${c.audience_type}`,
    `content_mode=${c.content_mode}`,
    `confidence=${c.confidence}`,
    `reason=${JSON.stringify(c.reason || "")}`
  );
}

/**
 * @param {import("openai").OpenAI} client
 * @param {{ productType: string, material: string, style: string, priceRange: string, targetMarket: string, hasImage: boolean }} fields
 * @param {import("multer").File | null} fileMeta
 * @param {string | null} absolutePath
 * @param {string} logPrefix
 * @returns {Promise<{ product_category: string, audience_type: string, content_mode: string, confidence: string, reason: string }>}
 */
async function classifyProductStructured(client, fields, fileMeta, absolutePath, logPrefix) {
  const textSummary = [
    `productType: ${str(fields.productType) || "(empty)"}`,
    `material: ${str(fields.material) || "(empty)"}`,
    `style: ${str(fields.style) || "(empty)"}`,
    `priceRange: ${str(fields.priceRange) || "(empty)"}`,
    `targetMarket: ${str(fields.targetMarket) || "(empty)"}`
  ].join("\n");

  const blob = [fields.productType, fields.material, fields.style, fields.priceRange, fields.targetMarket]
    .map((x) => str(x).toLowerCase())
    .join(" \n ");
  const scores = scoreCategoryBlob(blob);
  const heuristic = pickCategoryFromScores(scores);
  const vagueText = isVagueProductDescriptor(fields);

  let visionSide = null;
  if (client && fields.hasImage && absolutePath && fileMeta) {
    visionSide = await classifyProductFromImage(client, absolutePath, fileMeta, logPrefix);
    if (visionSide) {
      console.log(
        logPrefix,
        "[vision classification]",
        `product_category=${visionSide.product_category}`,
        `confidence=${visionSide.confidence}`,
        `visual_evidence=${JSON.stringify(visionSide.visual_evidence)}`
      );
    }
  }

  if (!client) {
    const base = normalizeClassification(heuristic, fields);
    const merged = mergeClassificationWithImagePriority(base, visionSide, heuristic, vagueText);
    return normalizeClassification(merged, fields);
  }

  try {
    /** @type {import("openai").OpenAI.Chat.Completions.ChatCompletionMessageParam[]} */
    const userParts = [
      {
        type: "text",
        text: `${textSummary}\n\nClassify for content generation. Prefer image evidence over vague text when an image is provided.`
      }
    ];

    if (absolutePath && fileMeta && fields.hasImage) {
      const buf = await fs.promises.readFile(absolutePath);
      const mime = fileMeta.mimetype || "image/jpeg";
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      userParts.push({
        type: "image_url",
        image_url: { url: dataUrl }
      });
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM },
        { role: "user", content: userParts }
      ],
      temperature: 0,
      response_format: { type: "json_object" }
    });

    const raw = completion.choices[0].message.content || "{}";
    const parsed = parseModelJson(raw);
    let normalized = normalizeClassification(parsed, fields);

    // If model said generic with high image signal in text scores, prefer heuristic when heuristic is specific
    if (
      normalized.product_category === "generic_b2b_product" &&
      heuristic.product_category !== "generic_b2b_product" &&
      scores.bathroom_sanitary + scores.industrial_iot + scores.building_materials + scores.consumer_hardware >=
        2
    ) {
      normalized = normalizeClassification(
        {
          ...heuristic,
          audience_type: parsed.audience_type,
          content_mode: parsed.content_mode,
          reason: `${heuristic.reason} (adjusted: structured model was generic but text signals were specific.)`
        },
        fields
      );
    }

    const merged = mergeClassificationWithImagePriority(
      normalized,
      visionSide,
      heuristic,
      vagueText
    );
    return normalizeClassification(merged, fields);
  } catch (err) {
    console.warn(logPrefix, "structured classification failed, using heuristic:", err && err.message ? err.message : err);
    const base = normalizeClassification(heuristic, fields);
    const merged = mergeClassificationWithImagePriority(base, visionSide, heuristic, vagueText);
    return normalizeClassification(merged, fields);
  }
}

module.exports = {
  classifyProductStructured,
  classifyProductFromImage,
  categoryFlagsFromClassification,
  normalizeClassification,
  scoreCategoryBlob,
  pickCategoryFromScores,
  logStructuredClassification,
  isVagueProductDescriptor,
  mergeClassificationWithImagePriority,
  SIGNALS
};
