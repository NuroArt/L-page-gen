// telegram.js
// Thin wrapper around the raw Telegram Bot API using axios. No bot framework.

const axios = require("axios");
const logger = require("./utils/logger");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const API_BASE = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

if (!TELEGRAM_TOKEN) {
  logger.warn("TELEGRAM_TOKEN is not set — Telegram calls will fail until it is configured.");
}

const client = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// Telegram hard-caps message length at 4096 characters (UTF-16 code units).
// We chunk a little under that to leave headroom for formatting artifacts.
const MAX_MESSAGE_LENGTH = 3800;

/**
 * Escapes text for Telegram MarkdownV2.
 * Only escapes the reserved characters that are NOT part of formatting we intend
 * (we build markdown ourselves in formatOutput.js, so this is for raw user-provided
 * strings that get interpolated into otherwise-safe templates).
 */
function escapeMarkdownV2(text = "") {
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

/**
 * Splits a long message into Telegram-safe chunks without breaking mid-line
 * where possible. Splits on double newlines first, then falls back to hard cuts.
 */
function chunkMessage(text, maxLength = MAX_MESSAGE_LENGTH) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf("\n\n", maxLength);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt <= 0) splitAt = maxLength;

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/**
 * Sends a single message to a chat, auto-chunking if needed.
 * @param {number|string} chatId
 * @param {string} text
 * @param {object} [options] - extra Telegram sendMessage params (reply_markup, etc.)
 */
async function sendMessage(chatId, text, options = {}) {
  const chunks = chunkMessage(text);
  const responses = [];

  for (const chunk of chunks) {
    try {
      const res = await client.post("/sendMessage", {
        chat_id: chatId,
        text: chunk,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
        ...options,
      });
      responses.push(res.data);
    } catch (err) {
      // MarkdownV2 parsing is strict — if formatting is malformed, retry as plain text
      // rather than losing the message entirely.
      logger.warn("MarkdownV2 send failed, retrying as plain text", {
        chatId,
        error: err.response?.data || err.message,
      });
      try {
        const res = await client.post("/sendMessage", {
          chat_id: chatId,
          text: chunk,
          disable_web_page_preview: true,
        });
        responses.push(res.data);
      } catch (fallbackErr) {
        logger.error("Telegram sendMessage failed (plain text fallback also failed)", {
          chatId,
          error: fallbackErr.response?.data || fallbackErr.message,
        });
        throw fallbackErr;
      }
    }
  }

  return responses;
}

/**
 * Sends a "typing" chat action so the user sees activity while Claude generates.
 */
async function sendTyping(chatId) {
  try {
    await client.post("/sendChatAction", { chat_id: chatId, action: "typing" });
  } catch (err) {
    logger.warn("sendChatAction failed", { chatId, error: err.response?.data || err.message });
  }
}

/**
 * Sends a message with inline keyboard buttons.
 * @param {number|string} chatId
 * @param {string} text
 * @param {Array<Array<{text: string, callback_data: string}>>} buttons
 */
async function sendMessageWithButtons(chatId, text, buttons) {
  return sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
}

/**
 * Registers the webhook URL with Telegram. Call once on startup (or via a setup script).
 */
async function setWebhook(publicUrl) {
  const url = `${publicUrl.replace(/\/$/, "")}/webhook`;
  const res = await client.post("/setWebhook", { url });
  logger.info("Webhook registration result", res.data);
  return res.data;
}

module.exports = {
  sendMessage,
  sendMessageWithButtons,
  sendTyping,
  setWebhook,
  escapeMarkdownV2,
  chunkMessage,
};
