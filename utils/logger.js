// utils/logger.js
// Minimal structured logger — same pattern used in the Telegram bot backend.

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function timestamp() {
  return new Date().toISOString();
}

function write(level, message, meta) {
  if (LEVELS[level] < CURRENT_LEVEL) return;

  const base = `[${timestamp()}] [${level.toUpperCase()}] ${message}`;

  if (meta !== undefined) {
    if (meta instanceof Error) {
      console.log(base, `\n${meta.stack || meta.message}`);
    } else {
      try {
        console.log(base, JSON.stringify(meta));
      } catch {
        console.log(base, meta);
      }
    }
  } else {
    console.log(base);
  }
}

module.exports = {
  debug: (msg, meta) => write("debug", msg, meta),
  info: (msg, meta) => write("info", msg, meta),
  warn: (msg, meta) => write("warn", msg, meta),
  error: (msg, meta) => write("error", msg, meta),
};
