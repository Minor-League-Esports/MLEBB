# MLEBB

Discord bot for Minor League Esports — role/nickname sync, tracker lookups, and season intent forms.

## Setup

```bash
npm install
```

Create a `.env` file in the project root (gitignored, never commit it):

```bash
# Discord bot token (Discord Developer Portal -> your app -> Bot -> Token)
TOKEN=your_discord_bot_token

# Digital Ocean managed Postgres connection string
# (Databases -> your cluster -> Connection Details -> Connection string)
# IMPORTANT: the cluster's default connection string points at `defaultdb`, which does NOT
# have the `mledb` schema this bot queries - use `sprocket_main` as the database name instead.
connstring=postgresql://user:password@host:port/sprocket_main?sslmode=require

# Optional: only needed if SSL hostname verification fails against the DO cluster
DB_SERVERNAME=your-db-servername.db.ondigitalocean.com
```

The bot verifies its DB connection against `ca-certificate.crt` (DigiCert Global Root CA,
committed in this repo) — Digital Ocean's managed Postgres requires SSL.

### Discord application setup

The bot needs these **Privileged Gateway Intents** enabled (Developer Portal -> your app ->
Bot -> Privileged Gateway Intents):
- Server Members Intent
- Message Content Intent

When inviting the bot to a server (OAuth2 -> URL Generator), use **Guild Install** with the
`bot` scope and at minimum: View Channels, Send Messages, Read Message History, Add Reactions,
Manage Roles, Manage Nicknames, Embed Links.

## Running

```bash
npm start   # compiles TypeScript and runs dist/index.js
npm run dev # runs src/index.ts directly with live reload
```

## Commands

All commands below (except `bb.ping`) are gated to a specific admin Discord user ID and/or a
specific role in the main MLE server — see `src/index.ts`.

- `bb.ping` — ungated health check, replies "pong". No DB or permission requirements; use this
  to confirm the bot is online and receiving messages.
- `bb.help` — ungated, posts this command list (with parameters) so any user can see what's
  available.
- `bb.list` — read-only: reports which role/nickname changes would be made, without applying them.
- `bb.fix` — same as `bb.list`, but actually applies the role/nickname changes.
- `bb.lookup <tracker or ballchasing URL>` — resolves a player's linked platform accounts.
- `bb.if` — DMs the season intent form to every active player in the database.
- `bb.nif` — posts the season intent form to a specific channel.
