/**
 * Category blueprints: fixed PPT titles and video-generation guidance.
 * Source of truth for deck structure after structured classification.
 */

const CATEGORIES = [
  "bathroom_sanitary",
  "building_materials",
  "industrial_iot_equipment",
  "consumer_hardware",
  "generic_b2b_product"
];

/** @type {Record<string, string[]>} */
const PPT_TITLES = {
  bathroom_sanitary: [
    "Category Demand Today",
    "Design Language",
    "Glass and Hardware Quality",
    "Sizes and Configurations",
    "Installation Fit",
    "Everyday Use Experience",
    "Sealing and Durability",
    "Showroom and Distributor Value",
    "Residential Application Example",
    "Samples, Quotes, and Next Steps"
  ],
  building_materials: [
    "Market Need and Use Case",
    "Material and Finish Profile",
    "Performance and Durability",
    "Dimensions and Specification Fit",
    "Installation Workflow",
    "Application Scenarios",
    "Lifecycle and Maintenance Value",
    "Distributor and Contractor Value",
    "Reference Project Example",
    "Samples, Specs, and RFQ Path"
  ],
  industrial_iot_equipment: [
    "Operational Pain Points",
    "Device Form Factor and Role",
    "Performance Envelope",
    "Installation and Interfaces",
    "Reliability and Maintenance",
    "Data / Connectivity / Integration",
    "Compliance and Standards",
    "Commercial Packaging and Delivery",
    "Deployment Example",
    "Demo, Pilot, and Quote Path"
  ],
  consumer_hardware: [
    "User Need",
    "Product Design",
    "Feature Highlights",
    "Setup and Ease of Use",
    "Compatibility and Ecosystem",
    "Everyday Performance",
    "Reliability and Ownership",
    "Packaging and Retail Value",
    "Buyer Scenario Example",
    "Purchase and Offer Path"
  ],
  generic_b2b_product: [
    "Situation and Buyer Context",
    "Product and Positioning",
    "Key Capabilities",
    "Implementation or Fit",
    "Proof and Credibility",
    "Commercial Terms",
    "Risk and Support",
    "Differentiation",
    "Example Use",
    "Next Steps"
  ]
};

/** Eight narrative beats for bathroom promo video (Remotion Main.tsx 8-scene flow with product image). */
const BATHROOM_VIDEO_SCENE_THEMES = [
  "Premium bathroom upgrade opening",
  "Frameless visual clarity",
  "Tempered glass quality",
  "Stainless steel hardware",
  "Installation-ready fit",
  "Easy-clean / leak-resistant confidence",
  "Showroom-ready presentation",
  "Quote, sample, and partner CTA"
];

/** Product-led on-screen headlines for bathroom video (not PPT slide titles). */
const BATHROOM_VIDEO_ONSCREEN_LINES = [
  "Premium Bathroom Upgrade",
  "Frameless Visual Clarity",
  "Tempered Glass Quality",
  "Stainless Steel Hardware",
  "Installation-Ready Fit",
  "Easy-Clean · Leak-Resistant Confidence",
  "Showroom-Ready Presentation",
  "Quote and Sample Available"
];

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Per-slide generation focus (feeds the model; titles for fixed-title categories are enforced server-side).
 * @param {string} categoryId
 * @param {{ productType: string, material: string, style: string, priceRange: string, targetMarket: string }} fields
 * @returns {{ focus: string }[]}
 */
function deckSpineFromBlueprint(categoryId, fields) {
  const f =
    fields != null && typeof fields === "object" && !Array.isArray(fields) ? fields : {};
  const p = str(f.productType) || "this offer";
  const m = str(f.material) || "specified build";
  const st = str(f.style) || "your positioning";
  const pr = str(f.priceRange) || "your commercial framing";
  const tm = str(f.targetMarket) || "your buyer";

  const titles = PPT_TITLES[categoryId] || PPT_TITLES.generic_b2b_product;

  const focusByCategory = {
    bathroom_sanitary: [
      `Category Demand Today: residential upgrade momentum, showroom conversion, premium positioning versus mid-market clutter, buyer expectations shaped by design media, and why ${pr} wins when the floor proves glass and hardware quality for ${tm}.`,
      `Design Language: frameless sightlines, clean geometry, visual openness, premium bathroom styling under gallery light, display appeal and photography consistency for ${p} in ${st}.`,
      `Glass and Hardware Quality: ${m}; tempered glass clarity, safety perception at the counter, stainless steel hardware finish discipline, corrosion resistance, tactile premium feel, buyer confidence they can repeat.`,
      `Sizes and Configurations: commercial value of flexible sizing, common residential layouts, opening styles, walk-in expectations, quote-ready configuration clarity, fewer revisions for ${tm}.`,
      `Installation Fit: mounting clarity, alignment tolerance, bathroom compatibility in dealer language, faster setup confidence for trusted crews, reduced showroom risk when gallery promise matches field fit for ${p}.`,
      `Everyday Use Experience: smooth opening and closing, easy-clean finish, daily touch on hardware, lasting appearance in humid use, recommendation potential after install.`,
      `Sealing and Durability: leak-resistant sealing, corrosion resistance, long-term finish retention, humid bathroom performance, warranty-backed confidence — premium residential tone, not industrial spec-speak.`,
      `Showroom and Distributor Value: display impact, perceived value, premium sell-through, inventory planning confidence, lead time clarity, stronger ${tm} positioning.`,
      `Residential Application Example: believable premium renovation, modern residential setting, realistic buyer outcome, showroom relevance, design-fit proof for ${p}.`,
      `Samples, Quotes, and Next Steps: intentional close — finish samples, quotation support, lead-time confirmation, showroom review, configuration confirmation, order path; persuasive partner language only.`
    ],
    building_materials: [
      `Market need and use case ${tm} faces that ${p} addresses.`,
      `Material and finish profile: ${m}, durability, finish options, consistency.`,
      `Performance and durability: structural suitability, environmental fit.`,
      `Dimensions, specifications, and how ${p} fits project documentation.`,
      `Installation workflow: efficiency, contractor usability, site readiness.`,
      `Application scenarios: project types and compatibility for ${tm}.`,
      `Lifecycle and maintenance value: long-term performance for ${p}.`,
      `Distributor and contractor value: logistics, packaging, supply continuity.`,
      `Reference project pattern for ${tm} using ${st}.`,
      `Samples, specifications, RFQ path, and quotation support.`
    ],
    industrial_iot_equipment: [
      `Operational pain points for ${tm}: downtime, variance, safety, yield (concrete, no bathroom vocabulary).`,
      `Device form factor and role of ${p}; ${m} in industrial context.`,
      `Performance envelope: ratings, throughput, accuracy, limits for ${p}.`,
      `Installation, interfaces, power, mounting, cabling for plant integration.`,
      `Reliability and maintenance: MTBF-style narrative, spares, service for ${tm}.`,
      `Data, connectivity, integration: protocols, edge/cloud only when relevant.`,
      `Compliance, standards, certifications for ${tm}.`,
      `Commercial packaging: SKUs, MOQ, warranty, lead time, regions; ${pr}.`,
      `Deployment example for ${tm} with ${st}.`,
      `Demo, pilot, and quote path appropriate for industrial buyers.`
    ],
    consumer_hardware: [
      `User need for ${tm} and why ${p} fits.`,
      `Product design and ${st}; materials including ${m}.`,
      `Feature highlights in plain language for ${p}.`,
      `Setup and ease of use: day-one experience.`,
      `Compatibility and ecosystem fit.`,
      `Everyday performance: realistic claims for ${p}.`,
      `Reliability and ownership for ${tm}.`,
      `Packaging, in-box contents, retail value.`,
      `Buyer scenario example for ${tm}.`,
      `Purchase path and offer framing at ${pr}.`
    ],
    generic_b2b_product: [
      `Situation for ${tm} that makes ${p} relevant.`,
      `Clear description of ${p} using ${m} and ${st}.`,
      `Key capabilities and differentiation.`,
      `Implementation, fit, or delivery considerations.`,
      `Proof points credible for ${tm}.`,
      `Commercial framing: ${pr}.`,
      `Risks, support, guarantees.`,
      `Comparison to alternatives.`,
      `Economics and workflow fit for ${tm}.`,
      `Concrete next step (sample, demo, RFQ).`
    ]
  };

  const focuses = focusByCategory[categoryId] || focusByCategory.generic_b2b_product;
  return titles.map((_, i) => ({
    focus: focuses[i] || focuses[focuses.length - 1] || `${p} — slide ${i + 1} for ${tm}.`
  }));
}

/**
 * @param {string} categoryId
 * @returns {boolean}
 */
function hasFixedPptTitles(categoryId) {
  return categoryId !== "generic_b2b_product";
}

/**
 * @param {string} categoryId
 * @returns {string[]}
 */
function getPptTitles(categoryId) {
  return [...(PPT_TITLES[categoryId] || PPT_TITLES.generic_b2b_product)];
}

/**
 * Eight beats for Remotion bathroom promo (opening → product story → CTA on product).
 * Shapes match Main.tsx consumption: premium short lines, not PPT readout.
 * @param {string} categoryId
 * @param {{ productType: string, material: string, style: string, priceRange: string, targetMarket: string }} fields
 * @returns {Array<{ label?: string, title: string, subtitle?: string, bullets?: string[] }>}
 */
function buildVideoBeatPlanForRemotion(categoryId, fields) {
  const p = str(fields.productType) || "This product";
  const m = str(fields.material) || "specified materials";
  const st = str(fields.style) || "your positioning";
  const pr = str(fields.priceRange) || "your commercial framing";
  const tm = str(fields.targetMarket) || "your buyers";

  const [H0, H1, H2, H3, H4, H5, H6, H7] = BATHROOM_VIDEO_ONSCREEN_LINES;

  if (categoryId === "bathroom_sanitary") {
    return [
      {
        title: H0,
        subtitle: `${p} · ${st}`
      },
      {
        title: H1,
        subtitle: "Unbroken sightlines and gallery-grade openness."
      },
      {
        title: H2,
        subtitle: `${m} — clarity buyers see at the counter.`
      },
      {
        title: H3,
        subtitle: "Corrosion-aware finishes with disciplined hardware feel."
      },
      {
        title: H4,
        subtitle: "Predictable mounting and alignment for trusted crews."
      },
      {
        title: H5,
        subtitle: "Confident sealing and smooth motion in humid daily use."
      },
      {
        title: H6,
        subtitle: `Display impact partners can merchandise for ${tm}.`
      },
      {
        title: H7,
        subtitle: "Written quotations, finish samples, and lead-time clarity.",
        footer: "Request quotation & sample"
      }
    ];
  }

  if (categoryId === "building_materials") {
    return [
      {
        label: "Project-ready materials",
        title: p,
        subtitle: `${st} for contractors and distributors serving ${tm}.`
      },
      {
        label: "Material profile",
        title: "Finish and specification depth",
        bullets: [`${m} consistency`, "Finish options that spec cleanly", "Batch-to-batch reliability"]
      },
      {
        label: "Site efficiency",
        title: "Installation workflow",
        bullets: ["Contractor-friendly handling", "Site-ready packaging", "Documentation that tracks on the job"]
      },
      {
        label: "Lifecycle value",
        title: "Durability in service",
        subtitle: `Performance and maintenance story anchored in ${m}.`,
        bullets: ["Structural suitability", "Long-term finish stability"]
      },
      {
        label: "Channel support",
        title: "Distributor and contractor value",
        subtitle: `${pr} — RFQ and specification support for ${tm}.`,
        footer: "Samples and specs on request"
      },
      {
        label: "Next steps",
        title: "Samples, specs, and RFQ path",
        subtitle: "Clear quotation support and supply continuity."
      }
    ];
  }

  if (categoryId === "industrial_iot_equipment") {
    return [
      {
        label: "Plant priorities",
        title: p,
        subtitle: `${st} — addressing uptime and integration needs for ${tm}.`
      },
      {
        label: "Device role",
        title: "Form factor and interfaces",
        bullets: [`${m} build`, "Mounting and cabling fit", "Environmental ratings where applicable"]
      },
      {
        label: "Performance",
        title: "Ratings and operating envelope",
        bullets: ["Throughput and accuracy context", "Installation and interface clarity"]
      },
      {
        label: "Reliability",
        title: "Maintenance and spares",
        subtitle: "Service posture and uptime considerations for operations teams.",
        bullets: ["Preventive maintenance access", "Spare-part strategy"]
      },
      {
        label: "Integration",
        title: "Data, connectivity, compliance",
        subtitle: `${pr} — integration and standards for ${tm}.`,
        footer: "Demo and pilot paths available"
      },
      {
        label: "Commercial path",
        title: "Demo, pilot, and quote",
        subtitle: "Scoped next steps for industrial buyers and integrators."
      }
    ];
  }

  if (categoryId === "consumer_hardware") {
    return [
      {
        label: "Designed for users",
        title: p,
        subtitle: `${st} — compelling day-one experience for ${tm}.`
      },
      {
        label: "Product craft",
        title: "Design and features",
        bullets: [`${m} and finish`, "Feature highlights in plain language", "Retail-ready presentation"]
      },
      {
        label: "Setup",
        title: "Ease of use",
        bullets: ["Quick setup path", "Clear in-box experience", "Intuitive daily operation"]
      },
      {
        label: "Everyday",
        title: "Performance you can feel",
        subtitle: "Realistic claims for everyday ownership.",
        bullets: ["Compatibility and ecosystem", "Reliable daily performance"]
      },
      {
        label: "Retail value",
        title: "Packaging and shelf appeal",
        subtitle: `${pr} — channel-friendly offer for ${tm}.`,
        footer: "Purchase path clarity"
      },
      {
        label: "Offer",
        title: "Purchase and support",
        subtitle: "Clear next step for buyers and partners."
      }
    ];
  }

  return [
    {
      label: "Buyer context",
      title: p,
      subtitle: `${st} — structured value for ${tm}.`
    },
    {
      label: "Capabilities",
      title: "What this delivers",
      bullets: [`Grounded in ${m}`, "Clear differentiation", "Fit for stated buyer workflows"]
    },
    {
      label: "Implementation",
      title: "Adoption and fit",
      bullets: ["Onboarding or deployment realism", "Support and risk posture"]
    },
    {
      label: "Proof",
      title: "Credibility",
      subtitle: `Commercial framing: ${pr}.`,
      bullets: ["Evidence buyers can verify", "Comparison to alternatives"]
    },
    {
      label: "Commercial",
      title: "Terms and next step",
      subtitle: `Actionable path for ${tm}.`,
      footer: "RFQ or sample"
    },
    {
      label: "Close",
      title: "Next steps",
      subtitle: "Concrete follow-up that respects buyer process."
    }
  ];
}

/**
 * Newline script for API payload / optional caption chips (not a PPT dump).
 */
function buildVideoScriptFromBlueprint(categoryId, fields) {
  const beats = buildVideoBeatPlanForRemotion(categoryId, fields);
  const lines = [];
  for (const b of beats) {
    const head = [b.label, b.title].filter(Boolean).join(" — ");
    if (b.subtitle) lines.push(`${head}: ${b.subtitle}`);
    else lines.push(head);
    if (Array.isArray(b.bullets) && b.bullets.length) {
      lines.push(...b.bullets.map((x) => `• ${x}`));
    }
    if (b.footer) lines.push(b.footer);
  }
  return lines.join("\n");
}

module.exports = {
  CATEGORIES,
  PPT_TITLES,
  BATHROOM_VIDEO_SCENE_THEMES,
  BATHROOM_VIDEO_ONSCREEN_LINES,
  deckSpineFromBlueprint,
  hasFixedPptTitles,
  getPptTitles,
  buildVideoBeatPlanForRemotion,
  buildVideoScriptFromBlueprint
};
