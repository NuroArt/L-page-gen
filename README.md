# Instant Business Builder — Backend

Telegram bot backend for **Instant Business Builder** (NuroWorks). Node.js + Express, manual Telegram Bot API calls (no framework), Claude API for generation.

## File Structure

```
index.js                    Express server, webhook endpoint, command router
telegram.js                 Telegram Bot API wrapper (axios, manual HTTP calls)
claude.js                   Claude (Anthropic Messages API) wrapper + master prompt
handlers/
  start.js                  /start
  build.js                  /build — niche flow + kit generation + delivery
  help.js                   /help
  upgrade.js                /upgrade
  examples.js                /examples
  niches.js                  /niches
  settings.js                /settings
  support.js                  /support
  restart.js                  /restart
utils/
  formatOutput.js            Converts kit JSON into Telegram MarkdownV2 messages
  logger.js                  Minimal structured logger
.env                         Config (tokens, keys, port)
package.json
```

## Setup

```bash
npm install
cp .env.example .env   # if you keep a separate example file — otherwise edit .env directly
```

Fill in `.env`:

```
TELEGRAM_TOKEN=<from @BotFather>
CLAUDE_API_KEY=<from Anthropic Console>
CLAUDE_MODEL=claude-sonnet-4-5
PORT=3000
PUBLIC_URL=https://your-domain.example.com
```

## Run

```bash
npm start
```

On startup, if `PUBLIC_URL` is set, the server automatically registers `${PUBLIC_URL}/webhook` with Telegram via `setWebhook`. If you're developing locally without a public URL, use a tunnel (ngrok, Cloudflare Tunnel, etc.) and set `PUBLIC_URL` to the tunnel address, or call Telegram's `setWebhook` manually.

## How It Works

1. Telegram sends updates to `POST /webhook`.
2. `index.js` parses the update manually (no Telegraf/node-telegram-bot-api) and routes by command or conversation state.
3. `/build` puts the chat into an "awaiting niche" state (tracked in-memory in `handlers/build.js`).
4. The next free-text message from that chat is treated as the niche, sent to Claude via `claude.js` with a master prompt that requests a strict JSON business-kit schema.
5. `utils/formatOutput.js` converts the JSON into six MarkdownV2-formatted messages (one per module: Foundation, Products, Website Copy, Marketing, Automation, Monetization).
6. `telegram.js` sends each message, auto-chunking anything over Telegram's 4096-character limit and falling back to plain text if MarkdownV2 parsing fails.

## Notes on Production Hardening

- **Session state** (`sessionState` in `handlers/build.js`, `userSettings` in `handlers/settings.js`) is in-memory `Map`s. Swap for Redis or a database table before running multiple backend instances or before relying on state surviving a restart.
- **Rate limiting**: add per-`chatId` throttling in `index.js` before calling Claude, to prevent a single user from spamming expensive generations.
- **Webhook security**: consider validating Telegram's `X-Telegram-Bot-Api-Secret-Token` header (set via `setWebhook`'s `secret_token` param) to confirm requests genuinely come from Telegram.
- **Payment/entitlement enforcement**: `/upgrade` currently only messages the user to contact support. Wire it to a real payment provider (Stripe, etc.) and gate add-on delivery on confirmed payment before shipping to production.
