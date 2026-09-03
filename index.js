// index.js
// Express server exposing the Telegram webhook endpoint and routing updates
// to command handlers. No bot framework — Telegram updates are parsed manually.

require("dotenv").config();

const express = require("express");
const logger = require("./utils/logger");
const telegram = require("./telegram");

const handleStart = require("./handlers/start");
const buildHandler = require("./handlers/build");
const handleHelp = require("./handlers/help");
const handleUpgrade = require("./handlers/upgrade");
const handleExamples = require("./handlers/examples");
const handleNiches = require("./handlers/niches");
const settingsHandler = require("./handlers/settings");
const handleSupport = require("./handlers/support");
const handleRestart = require("./handlers/restart");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Command routing table: command string -> async handler(chatId, args)
// ---------------------------------------------------------------------------
const COMMANDS = {
  "/start": (chatId) => handleStart(chatId),
  "/build": (chatId) => buildHandler.handleBuild(chatId),
  "/help": (chatId) => handleHelp(chatId),
  "/upgrade": (chatId) => handleUpgrade(chatId),
  "/examples": (chatId) => handleExamples(chatId),
  "/niches": (chatId) => handleNiches(chatId),
  "/settings": (chatId) => settingsHandler.handleSettings(chatId),
  "/support": (chatId) => handleSupport(chatId),
  "/restart": (chatId) => handleRestart(chatId),
};

/**
 * Extracts the base command from message text, stripping any @BotName suffix
 * Telegram appends in group chats (e.g. "/build@InstantBizBot" -> "/build").
 */
function parseCommand(text) {
  const match = text.match(/^(\/[a-zA-Z_]+)(@\S+)?/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Routes a plain text (non-command) message based on conversation state.
 */
async function routeTextMessage(chatId, text) {
  if (buildHandler.isAwaitingNiche(chatId)) {
    await buildHandler.handleNicheInput(chatId, text);
    return;
  }

  // No active flow expects free text — nudge the user toward a command.
  await telegram.sendMessage(
    chatId,
    "Not sure what you mean\\. Try /build to generate a business kit, or /help to see all commands\\."
  );
}

/**
 * Routes an incoming Telegram `message` update.
 */
async function routeMessage(message) {
  const chatId = message.chat?.id;
  const text = message.text;

  if (!chatId || typeof text !== "string") {
    logger.warn("Received message with no chat id or text, skipping", { message });
    return;
  }

  const command = text.startsWith("/") ? parseCommand(text) : null;

  if (command && COMMANDS[command]) {
    logger.info("Routing command", { chatId, command });
    await COMMANDS[command](chatId, text);
    return;
  }

  if (command && !COMMANDS[command]) {
    await telegram.sendMessage(
      chatId,
      "Unknown command\\. Try /help to see everything I can do\\."
    );
    return;
  }

  await routeTextMessage(chatId, text);
}

/**
 * Routes an incoming Telegram `callback_query` update (inline button presses).
 */
async function routeCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id;
  const data = callbackQuery.data || "";

  if (!chatId) {
    logger.warn("Received callback_query with no chat id, skipping", { callbackQuery });
    return;
  }

  logger.info("Routing callback_query", { chatId, data });

  if (data.startsWith("settings:")) {
    await settingsHandler.handleSettingsCallback(chatId, data);
    return;
  }

  if (data.startsWith("upgrade:")) {
    await telegram.sendMessage(
      chatId,
      `Got it — message /support to unlock the *${data.split(":")[1]}* add\\-on\\.`
    );
    return;
  }

  logger.warn("Unhandled callback_query data", { data });
}

// ---------------------------------------------------------------------------
// Webhook endpoint
// ---------------------------------------------------------------------------
app.post("/webhook", async (req, res) => {
  // Respond to Telegram immediately — processing happens async so Telegram
  // doesn't retry the update due to a slow Claude API call.
  res.sendStatus(200);

  const update = req.body;

  try {
    if (update.message) {
      await routeMessage(update.message);
    } else if (update.callback_query) {
      await routeCallbackQuery(update.callback_query);
    } else {
      logger.debug("Received unhandled update type", { update });
    }
  } catch (err) {
    logger.error("Unhandled error processing update", { error: err.message, stack: err.stack });

    const chatId =
      update.message?.chat?.id || update.callback_query?.message?.chat?.id;

    if (chatId) {
      try {
        await telegram.sendMessage(
          chatId,
          "Something went wrong on my end\\. Please try again, or use /support if it keeps happening\\."
        );
      } catch (sendErr) {
        logger.error("Failed to send error notice to user", { error: sendErr.message });
      }
    }
  }
});

// Simple health check for uptime monitoring / load balancer probes.
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  logger.info(`Instant Business Builder backend listening on port ${PORT}`);

  if (process.env.PUBLIC_URL) {
    telegram
      .setWebhook(process.env.PUBLIC_URL)
      .catch((err) => logger.error("Failed to register webhook on startup", { error: err.message }));
  } else {
    logger.warn("PUBLIC_URL not set — webhook was not auto-registered. Set it manually via Telegram's setWebhook API.");
  }
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason });
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
});
