// claude.js
// Wrapper around Anthropic's Messages API for generating a full, self-contained
// landing page (single HTML file, inline CSS, no external dependencies).

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
  timeout: 180000,
  headers: {
    "x-api-key": CLAUDE_API_KEY,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  },
});

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
      logger.warn("Claude API call failed, retrying once", { status, error: err.response?.data || err.message });
      try {
        return await attempt();
      } catch (retryErr) {
        logger.error("Claude API retry failed", { error: retryErr.response?.data || retryErr.message });
        throw retryErr;
      }
    }

    logger.error("Claude API call failed (non-retryable)", { status, error: err.response?.data || err.message });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Landing page generation prompt
//
// The model is required to wrap the hero section and "the rest of the page"
// in specific HTML comment markers. The backend splits on these markers to
// build a free preview (hero only) versus the full paid page — see
// splitLandingPageHtml() below. This is what makes the paywall possible:
// only the hero ever gets shown before payment.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You generate complete, ready-to-publish landing pages as a single self-contained
HTML file for "Instant Landing Page" (a NuroWorks product).

Requirements:
- Output ONE complete HTML document: <!DOCTYPE html> through </html>.
- All CSS must be inline in a single <style> tag in the <head>. No external stylesheets, fonts, images,
  or JavaScript files. Use a web-safe font stack or a Google Fonts @import if needed.
- No placeholder images from external URLs — use CSS-only visual elements (gradients, shapes, color
  blocks) instead of <img> tags, since no real images exist yet.
- Design should look premium and modern: clean typography, good whitespace, a clear visual hierarchy,
  mobile-responsive (use relative units and a simple media query for small screens).
- Copy must be written specifically for the business description given — no generic filler.

Structure, in order, each wrapped in the exact HTML comment markers shown (these markers are required
and must appear exactly as written, on their own line, so they can be parsed programmatically):

<!-- HERO_START -->
(hero section: headline, subheadline, primary CTA button — this is the ONLY section shown in the free
preview, so it must be strong enough to stand alone and create desire to see the rest)
<!-- HERO_END -->

<!-- REST_START -->
(everything else: 3 value proposition blocks, a social proof / testimonial section using realistic but
clearly fictional example quotes, a "how it works" or features section, a final CTA section, and a
simple footer)
<!-- REST_END -->

Return ONLY the HTML document. No commentary before or after it, no markdown code fences.`;

async function generateLandingPage(businessDescription) {
  const userPrompt = `Business description: "${businessDescription}"\n\nGenerate the complete landing page as specified.`;
  const raw = await callClaude(SYSTEM_PROMPT, userPrompt, { maxTokens: 8000 });

  // Strip stray markdown fences if the model adds them despite instructions.
  return raw.replace(/^```(html)?/m, "").replace(/```$/m, "").trim();
}

/**
 * Splits a generated landing page into { headHtml, heroHtml, restHtml } using
 * the required comment markers. Throws if the markers are missing or
 * malformed, so callers can retry generation rather than silently leaking
 * an unmarked (and therefore unsplittable) page.
 */
function splitLandingPageHtml(fullHtml) {
  const heroMatch = fullHtml.match(/<!--\s*HERO_START\s*-->([\s\S]*?)<!--\s*HERO_END\s*-->/);
  const restMatch = fullHtml.match(/<!--\s*REST_START\s*-->([\s\S]*?)<!--\s*REST_END\s*-->/);
  const headMatch = fullHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const htmlTagMatch = fullHtml.match(/<html[^>]*>/i);

  if (!heroMatch || !restMatch || !headMatch) {
    throw new Error("LANDING_PAGE_MARKERS_MISSING");
  }

  return {
    htmlOpenTag: htmlTagMatch ? htmlTagMatch[0] : "<html lang=\"en\">",
    headInner: headMatch[1],
    heroHtml: heroMatch[1].trim(),
    restHtml: restMatch[1].trim(),
  };
}

module.exports = { generateLandingPage, splitLandingPageHtml };
