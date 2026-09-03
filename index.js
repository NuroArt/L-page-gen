// index.js
// Express server for Instant Landing Page: generates a landing page via
// Claude, shows a locked preview, takes payment via Stripe, and serves the
// full HTML file for download once payment is confirmed.

require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const logger = require("./utils/logger");
const store = require("./store");
const claude = require("./claude");
const pageBuilder = require("./pageBuilder");
const stripeService = require("./stripe");

const app = express();
const PORT = process.env.PORT || 3000;
const UNLOCK_PRICE_LABEL = process.env.UNLOCK_PRICE_LABEL || "$19";

// ---------------------------------------------------------------------------
// Stripe webhook route MUST come before express.json() and must use the raw
// body — Stripe's signature verification needs the exact, unparsed bytes.
// ---------------------------------------------------------------------------
app.post("/webhook/stripe", express.raw({ type: "application/json" }), (req, res) => {
  let event;

  try {
    event = stripeService.constructWebhookEvent(req.body, req.headers["stripe-signature"]);
  } catch (err) {
    logger.error("Stripe webhook signature verification failed", { error: err.message });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const generationId = session.metadata?.generationId;

    if (generationId) {
      const entry = store.markPaid(generationId, session.id);
      if (entry) {
        logger.info("Marked generation as paid via webhook", { generationId });
      } else {
        logger.warn("Webhook confirmed payment for unknown generation id", { generationId });
      }
    } else {
      logger.warn("checkout.session.completed had no generationId in metadata", { sessionId: session.id });
    }
  }

  res.json({ received: true });
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// POST /api/generate — generates a new landing page from a business description
// ---------------------------------------------------------------------------
app.post("/api/generate", async (req, res) => {
  const businessDescription = (req.body?.businessDescription || "").trim();

  if (businessDescription.length < 10) {
    return res.status(400).json({ error: "Tell me a bit more about the business (at least a sentence)." });
  }

  try {
    const fullHtmlRaw = await claude.generateLandingPage(businessDescription);
    const parts = claude.splitLandingPageHtml(fullHtmlRaw);

    const generationId = crypto.randomUUID();

    const fullHtml = pageBuilder.buildFullDocument(parts);
    const previewHtml = pageBuilder.buildPreviewDocument({
      ...parts,
      unlockPriceLabel: UNLOCK_PRICE_LABEL,
      generationId,
    });

    store.create(generationId, { businessDescription, fullHtml, previewHtml });

    logger.info("Generated landing page", { generationId });
    res.json({ generationId, previewHtml });
  } catch (err) {
    if (err.message === "LANDING_PAGE_MARKERS_MISSING") {
      logger.error("Claude response missing required section markers", { error: err.message });
      return res.status(502).json({ error: "Generation didn't come back in the right format. Please try again." });
    }
    logger.error("Landing page generation failed", { error: err.response?.data || err.message });
    res.status(500).json({ error: "Something went wrong generating your page. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/preview/:id — re-fetch a preview (e.g. after returning from a
// cancelled checkout) without regenerating
// ---------------------------------------------------------------------------
app.get("/api/preview/:id", (req, res) => {
  const entry = store.get(req.params.id);
  if (!entry) return res.status(404).json({ error: "Generation not found. It may have expired — try generating again." });
  res.json({ generationId: req.params.id, previewHtml: entry.previewHtml });
});

// ---------------------------------------------------------------------------
// POST /api/checkout — creates a Stripe Checkout Session for a generation
// ---------------------------------------------------------------------------
app.post("/api/checkout", async (req, res) => {
  const { generationId } = req.body || {};
  const entry = store.get(generationId);

  if (!entry) {
    return res.status(404).json({ error: "Generation not found. It may have expired — try generating again." });
  }

  try {
    const publicUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    const session = await stripeService.createCheckoutSession(generationId, publicUrl);
    store.setStripeSession(generationId, session.id);
    res.json({ url: session.url });
  } catch (err) {
    logger.error("Failed to create Stripe checkout session", { error: err.message });
    res.status(500).json({ error: "Something went wrong starting checkout. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/verify/:sessionId — immediate confirmation check on return from
// Stripe, in case the webhook hasn't arrived yet. Always double-checks
// directly against Stripe rather than trusting the client-supplied id alone.
// ---------------------------------------------------------------------------
app.get("/api/verify/:sessionId", async (req, res) => {
  try {
    const session = await stripeService.retrieveSession(req.params.sessionId);
    const generationId = session.metadata?.generationId;

    if (session.payment_status === "paid" && generationId) {
      store.markPaid(generationId, session.id);
      return res.json({ paid: true, generationId });
    }

    res.json({ paid: false, generationId: generationId || null });
  } catch (err) {
    logger.error("Failed to verify Stripe session", { error: err.message });
    res.status(500).json({ error: "Couldn't verify payment status. Please refresh in a moment." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/download/:id — serves the full HTML file, only if paid
// ---------------------------------------------------------------------------
app.get("/api/download/:id", (req, res) => {
  const entry = store.get(req.params.id);

  if (!entry) {
    return res.status(404).json({ error: "Generation not found. It may have expired." });
  }

  if (!entry.paid) {
    return res.status(402).json({ error: "This page hasn't been unlocked yet." });
  }

  res.setHeader("Content-Type", "text/html");
  res.setHeader("Content-Disposition", "attachment; filename=\"landing-page.html\"");
  res.send(entry.fullHtml);
});

// Health check
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

// Prune expired in-memory generations every hour.
setInterval(() => store.pruneOldGenerations(), 60 * 60 * 1000);

app.listen(PORT, () => {
  logger.info(`Instant Landing Page listening on port ${PORT}`);
});

process.on("unhandledRejection", (reason) => logger.error("Unhandled promise rejection", { reason }));
process.on("uncaughtException", (err) => logger.error("Uncaught exception", { error: err.message, stack: err.stack }));
