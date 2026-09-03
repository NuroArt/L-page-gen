// stripe.js
// Thin wrapper around the Stripe SDK for creating a one-time checkout session
// and verifying webhook signatures.

const Stripe = require("stripe");
const logger = require("./utils/logger");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const UNLOCK_PRICE_CENTS = parseInt(process.env.UNLOCK_PRICE_CENTS || "1900", 10);

if (!STRIPE_SECRET_KEY) {
  logger.warn("STRIPE_SECRET_KEY is not set — checkout will fail until it is configured.");
}
if (!STRIPE_WEBHOOK_SECRET) {
  logger.warn("STRIPE_WEBHOOK_SECRET is not set — webhook verification will fail until it is configured.");
}

const stripe = Stripe(STRIPE_SECRET_KEY || "sk_test_placeholder");

/**
 * Creates a one-time Checkout Session for unlocking a specific generated
 * landing page. The generation id travels in both the success/cancel URLs
 * and in session metadata, so it's recoverable from either the redirect or
 * the webhook event.
 * @param {string} generationId
 * @param {string} publicUrl - e.g. https://your-service.onrender.com
 */
async function createCheckoutSession(generationId, publicUrl) {
  const base = publicUrl.replace(/\/$/, "");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Instant Landing Page — Full Unlock",
            description: "Full generated landing page, downloadable as a single HTML file.",
          },
          unit_amount: UNLOCK_PRICE_CENTS,
        },
        quantity: 1,
      },
    ],
    metadata: { generationId },
    success_url: `${base}/success.html?generationId=${encodeURIComponent(generationId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/preview.html?generationId=${encodeURIComponent(generationId)}`,
  });

  return session;
}

/** Retrieves a Checkout Session directly from Stripe — used as an immediate
 * confirmation check on the success page, since the webhook may not have
 * arrived yet by the time the browser redirects back. */
async function retrieveSession(sessionId) {
  return stripe.checkout.sessions.retrieve(sessionId);
}

/**
 * Verifies and parses a webhook event from the raw request body + signature
 * header. Must be called with the RAW (unparsed) body — see index.js, which
 * uses express.raw() specifically for the webhook route.
 */
function constructWebhookEvent(rawBody, signatureHeader) {
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET);
}

module.exports = { createCheckoutSession, retrieveSession, constructWebhookEvent, UNLOCK_PRICE_CENTS };
