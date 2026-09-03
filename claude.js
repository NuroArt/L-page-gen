// claude.js
// Wrapper around Anthropic's Messages API for generating business kit content.

const axios = require("axios");
const logger = require("./utils/logger");

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

if (!CLAUDE_API_KEY) {
  logger.warn("CLAUDE_API_KEY is not set — Claude calls will fail until it is configured.");
}

const client = axios.create({
  baseURL: CLAUDE_API_URL,
  timeout: 120000, // generation can take a while for a full business kit
  headers: {
    "x-api-key": CLAUDE_API_KEY,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  },
});

/**
 * Low-level call to the Messages API. Retries once on transient (5xx/timeout) failures.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} [opts]
 * @returns {Promise<string>} the model's text response
 */
async function callClaude(systemPrompt, userPrompt, opts = {}) {
  const payload = {
    model: opts.model || CLAUDE_MODEL,
    max_tokens: opts.maxTokens || 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };

  const attempt = async () => {
    const res = await client.post("", payload);
    const textBlocks = (res.data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text);
    return textBlocks.join("\n").trim();
  };

  try {
    return await attempt();
  } catch (err) {
    const status = err.response?.status;
    const isRetryable = !status || status >= 500 || err.code === "ECONNABORTED";

    if (isRetryable) {
      logger.warn("Claude API call failed, retrying once", {
        status,
        error: err.response?.data || err.message,
      });
      try {
        return await attempt();
      } catch (retryErr) {
        logger.error("Claude API retry failed", {
          error: retryErr.response?.data || retryErr.message,
        });
        throw retryErr;
      }
    }

    logger.error("Claude API call failed (non-retryable)", {
      status,
      error: err.response?.data || err.message,
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Master prompt for the Instant Business Builder kit generator
// ---------------------------------------------------------------------------

const MASTER_SYSTEM_PROMPT = `You are the generation engine for "Instant Business Builder," a premium
NuroWorks product. Given a single niche or business idea, you produce a complete business starter kit.

Voice: clean, professional, confident, direct. No fluff, no filler, no generic corporate language.
Every line must be usable as-is by a real founder.

You MUST return output as valid JSON with exactly this shape (no markdown fences, no commentary
outside the JSON):

{
  "foundation": {
    "businessNames": ["string", ...5-7 items],
    "brandIdentity": "string",
    "mission": "string",
    "vision": "string",
    "valueProposition": "string",
    "targetAudience": "string",
    "competitorSnapshot": "string",
    "marketGap": "string"
  },
  "products": {
    "digitalProducts": ["string", ...],
    "services": ["string", ...],
    "subscriptions": ["string", ...],
    "automationOffers": ["string", ...],
    "upsellsAndBundles": ["string", ...]
  },
  "websiteCopy": {
    "homepage": "string",
    "about": "string",
    "servicesPage": "string",
    "ctaLines": ["string", ...5 items],
    "taglines": ["string", ...5 items],
    "brandVoiceGuide": "string"
  },
  "marketing": {
    "contentCalendar30Day": ["string", ...30 items, one per day],
    "reelScripts": ["string", ...5-10 sample items],
    "carouselScripts": ["string", ...5 items],
    "captions": ["string", ...10-15 sample items],
    "hashtagSets": { "broad": ["string"], "niche": ["string"], "branded": ["string"] },
    "emailWelcomeSequence": ["string", ...5 items],
    "leadMagnetConcept": "string"
  },
  "automation": {
    "clientOnboarding": "string",
    "contentAutomation": "string",
    "salesFunnelAutomation": "string",
    "leadCaptureAutomation": "string",
    "weeklyOperations": "string"
  },
  "monetization": {
    "pricingRecommendations": "string",
    "salesAngles": ["string", ...3 items],
    "funnelStrategy": "string",
    "launchPlan": "string",
    "growthRoadmap": "string"
  }
}

Keep each string field concise but complete — a few sentences or a short list rendered as plain text
with line breaks, not nested markdown. Arrays should contain short, punchy, ready-to-use lines.
Do not include any text outside the single JSON object.`;

/**
 * Generates a full business kit for a given niche.
 * @param {string} niche - raw user input describing their business idea
 * @returns {Promise<object>} parsed business kit object
 */
async function generateBusinessKit(niche) {
  const userPrompt = `Niche / business idea: "${niche}"\n\nGenerate the complete business kit as specified.`;

  const raw = await callClaude(MASTER_SYSTEM_PROMPT, userPrompt, { maxTokens: 8000 });

  try {
    return JSON.parse(raw);
  } catch (err) {
    // Claude occasionally wraps JSON in fences despite instructions — strip and retry parse.
    const cleaned = raw.replace(/^```(json)?/m, "").replace(/```$/m, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch (secondErr) {
      logger.error("Failed to parse Claude business kit response as JSON", {
        error: secondErr.message,
        rawPreview: raw.slice(0, 500),
      });
      throw new Error("BUSINESS_KIT_PARSE_ERROR");
    }
  }
}

module.exports = {
  callClaude,
  generateBusinessKit,
};
