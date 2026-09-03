// store.js
// In-memory store for generated landing pages, keyed by generation ID.
//
// PRODUCTION NOTE: this is a Map, same caveat as the Telegram bot's session
// state — it resets on restart and won't work across multiple server
// instances. Swap for Redis or a database table before scaling beyond a
// single Render instance. Given each entry holds a full HTML page, also
// consider an expiry/cleanup job so this doesn't grow unbounded — see
// pruneOldGenerations() below, called on an interval from index.js.

const generations = new Map();

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * @param {string} id
 * @param {object} data - { businessDescription, fullHtml, previewHtml, paid, stripeSessionId }
 */
function create(id, data) {
  generations.set(id, { ...data, paid: false, createdAt: Date.now() });
}

function get(id) {
  return generations.get(id) || null;
}

function markPaid(id, stripeSessionId) {
  const entry = generations.get(id);
  if (!entry) return null;
  entry.paid = true;
  entry.stripeSessionId = stripeSessionId;
  return entry;
}

function setStripeSession(id, stripeSessionId) {
  const entry = generations.get(id);
  if (!entry) return null;
  entry.stripeSessionId = stripeSessionId;
  return entry;
}

/** Finds a generation by its Stripe checkout session ID (used on the success page fallback check). */
function findBySessionId(stripeSessionId) {
  for (const [id, entry] of generations.entries()) {
    if (entry.stripeSessionId === stripeSessionId) return { id, entry };
  }
  return null;
}

function pruneOldGenerations() {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [id, entry] of generations.entries()) {
    if (entry.createdAt < cutoff) generations.delete(id);
  }
}

module.exports = { create, get, markPaid, setStripeSession, findBySessionId, pruneOldGenerations };
