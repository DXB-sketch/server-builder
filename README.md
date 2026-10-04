# MONOLITH CREATIONS — Server Builder

A Discord bot that runs on your own computer, with a web control panel. Put your bot token and two server IDs in `.env`, open the panel and click **Build**. It sets up:

- **MONOLITH CREATIONS**, the community server
- **Balloon Pump**, the game server

Each build creates the roles, categories, channels, permissions, forums, Community settings, welcome screen, AutoMod rules and starter messages (rules, verify button, ping-role buttons, FAQ…). After that, the panel can manage nearly everything a bot is allowed to do in a server.

![panel](https://img.shields.io/badge/panel-localhost:3000-8b5cf6) ![node](https://img.shields.io/badge/node-%3E%3D18.17-green)

---

## 1. One-time setup (about 10 minutes)

### a) Install Node.js
Download the **LTS** version from <https://nodejs.org> and install it.

### b) Create the bot
1. Go to <https://discord.com/developers/applications>, click **New Application** and name it (e.g. `MONOLITH Builder`).
2. Open **Bot** in the left menu:
   - Click **Reset Token**, copy the token and keep it secret.
   - Under **Privileged Gateway Intents**, turn **ON** all three: *Presence*, *Server Members* and *Message Content*. Save.
3. The **Application ID** on the **General Information** page is your `CLIENT_ID`. It's optional; the bot fills it in on its own.

### c) Make the two servers
Bots can no longer create servers themselves, so make two empty servers in Discord (**+ → Create My Own**). Then copy their IDs:
- Discord → **User Settings → Advanced → Developer Mode ON**
- Right-click each server icon → **Copy Server ID**

### d) Fill in `.env`
Copy `.env.example` to `.env` (on Windows, `start.bat` does this for you) and fill it in:

```env
DISCORD_TOKEN=your-bot-token
COMMUNITY_GUILD_ID=id-of-the-MONOLITH-CREATIONS-server
GAME_GUILD_ID=id-of-the-Balloon-Pump-server

# optional — used by buttons in the starter messages
ROBLOX_GROUP_URL=https://www.roblox.com/groups/...
BALLOON_PUMP_URL=https://www.roblox.com/games/...
COMMUNITY_DISCORD_INVITE=https://discord.gg/...
GAME_DISCORD_INVITE=https://discord.gg/...
```

### e) Start it
- **Windows:** double-click `start.bat`
- **Mac / Linux:** `./start.sh`
- **Or anywhere:** `npm install`, then `npm start`

The control panel opens at **<http://localhost:3000>**.

### f) Invite the bot and build
1. On the panel **Dashboard**, click **➕ Invite bot to a server**. Invite it to **both** servers. The link asks for Administrator.
2. In each server, open **Server Settings → Roles** and **drag the bot's role to the very top**. Without this, the bot can't manage roles placed above it.
3. Back on the Dashboard, click **🚀 Build server** on each template card. You can follow the progress live.

> You can run a build as many times as you like. Things that already exist (matched by name) are **updated**, not duplicated, so you can edit a template and build again. Tick **Wipe the server first** only when you want a clean slate. It deletes every channel and role first.

---

## 2. What gets built

Both servers use the same model. `@everyone` can only see the **welcome / rules / verify / faq** channels. Clicking the **✅ Verify** button gives the member role and unlocks the rest of the server. Staff and dev areas are private.

### MONOLITH CREATIONS (community)
| Category | Channels |
|---|---|
| 📌 START HERE | welcome, rules, verify, get-roles, faq |
| 📢 ANNOUNCEMENTS | announcements 📢, game-updates 📢, sneak-peeks, events 📢, giveaways |
| 🎮 OUR GAMES | our-games, balloon-pump-chat |
| 💬 COMMUNITY | general, introductions, roblox-chat, media, memes, off-topic, bot-commands |
| 🛠️ CREATIONS | creations (forum, gallery), dev-help (forum) |
| 💡 FEEDBACK & SUPPORT | suggestions (forum), support-info, help (forum) |
| 🔊 VOICE | Community Stage 🎤, General, Gaming 1/2, Music, AFK |
| 🧑‍💻 DEV TEAM *(dev roles only)* | dev-announcements, dev-chat, dev-progress, dev-resources, Dev Meeting |
| 🛡️ STAFF *(staff only)* | staff-announcements, staff-chat, staff-commands, mod-log, mod-updates, Staff Meeting |

**Roles:** Founder, Executive, Head Moderator, Moderator, Trial Moderator, Community Manager, Lead Developer, Developer, Builder, Scripter, Modeler, UI Designer, Animator, Content Creator, Partner, Beta Tester, VIP, Member, plus 5 self-assignable ping roles.

### Balloon Pump (game)
| Category | Channels |
|---|---|
| 🎈 WELCOME | welcome, rules, verify, get-roles, faq |
| 📣 NEWS | announcements 📢, update-log 📢, codes 📢, sneak-peeks, events 📢, giveaways |
| 🎈 BALLOON PUMP | general, tips-and-strategies, high-scores, screenshots-and-clips, fan-art, off-topic, bot-commands |
| 💡 FEEDBACK | bug-reports (forum with Gameplay / UI / Mobile / Fixed… tags), suggestions (forum), feedback |
| 🆘 SUPPORT | how-to-get-help, help (forum: Purchase Issue, Lost Progress, Report Exploiter, Appeal…) |
| 🔊 VOICE | Game Events 🎤, Pump Lounge, Squad 1/2, AFK |
| 🧪 TESTING *(QA Testers)* | tester-info, test-builds, tester-chat, tester-bugs, Testing VC |
| 🛡️ STAFF *(staff only)* | staff-chat, staff-commands, exploit-reports, mod-log, mod-updates, Staff VC |

**Roles:** Founder, Developer, Head Moderator, Moderator, Trial Moderator, QA Tester, Content Creator, 🏆 Pump Legend, 💎 VIP, 🎈 Early Supporter, Player, plus 5 ping roles (Updates, **Codes**, Events, Giveaways, Sneak Peeks).

**Both servers also get:**
- **Community** turned on, which allows announcement channels, stages, forums and a welcome screen.
- **AutoMod rules:** slurs and sexual content, scam / "free Robux" links (with a 10-minute timeout), Discord invite links, mention spam and spam. Alerts go to #mod-log.
- **Bot features:** welcome messages, a log channel (joins, leaves, deleted/edited messages, bans) and the role buttons.

---

## 3. The control panel

| Page | What you can do |
|---|---|
| 🚀 **Dashboard** | Setup checklist, invite link, one-click builds |
| 📐 **Templates** | Preview, edit (JSON editor with checks), copy, download and apply templates. **Export any existing server as a template** (useful as a backup) |
| ⚙️ **Server Settings** | Name, description, icon, banner, splash, verification, notifications, content filter, Community on/off, system/rules/updates/AFK channels, welcome screen, widget, leave server |
| 🎭 **Roles** | Create, edit, delete and reorder roles. Colour, hoist, mentionable, emoji/icon, every permission. Mass-add or remove a role |
| #️⃣ **Channels** | Create, edit, delete, clone, move and sync every channel type. Topic, slowmode, NSFW, bitrate, user limit, forum tags. A full per-role permission editor (allow / inherit / deny). Lock/unlock, permanent invite, stage start/stop |
| 💬 **Messages & Embeds** | Embed builder with live preview, role buttons and link buttons, attachments, forum posts, pin, publish, silent. Edit, delete, pin, react, start a thread or open any message. Purge |
| 🧵 **Threads & Forums** | Create threads; rename, lock, archive and delete threads and forum posts |
| 👥 **Members** | Search; nickname, roles, timeout, kick, ban, voice mute/deafen/move/disconnect, DM |
| 🔨 **Bans & Prune** | Ban list, unban, ban by user ID (works on people who aren't in the server), prune inactive members |
| 🛡️ **AutoMod** | Create and edit keyword, preset, spam, mention-spam and member-profile rules: actions, exemptions, alert channel |
| 📜 **Audit Log** | Browse and filter the server's audit log |
| 📅 **Events** | Create, start, end, cancel and delete scheduled events (voice, stage or external, e.g. "Balloon Pump on Roblox") |
| 😀 **Emojis & Stickers** | Upload, rename and delete; restrict emojis to certain roles |
| 🔗 **Invites** / 🪝 **Webhooks** | Create and revoke invites; create webhooks, copy their URLs and send through them |
| 🤖 **Bot Settings** | Status and activity, username and avatar, welcome/goodbye messages, auto-roles, log channel, **custom slash commands** (e.g. `/codes`, `/play`) |
| 🧪 **Raw API** | Send **any** Discord API request as the bot, with ready-made snippets (onboarding, soundboard, vanity URL, slash commands…). Anything a bot can do but that has no button above can be done here |
| 🖥️ **Console** | Live log of everything the bot does |

Some things are limited to the **server owner** by Discord, so no bot can do them: transferring ownership, deleting the server, requiring 2FA for moderators, server Discovery and vanity URLs.

---

## 4. Editing templates

Templates are plain JSON in `templates/`. Edit them in the panel (**Templates** page) or in any text editor, then run `npm run check` to catch mistakes. The panel also checks a template every time you save it or build it.

```jsonc
{
  "name": "My Template",
  "guildEnv": "GAME_GUILD_ID",          // which .env server ID the Dashboard uses by default
  "settings": {
    "name": "Balloon Pump", "description": "…",
    "verificationLevel": "Medium",       // None / Low / Medium / High / VeryHigh
    "defaultMessageNotifications": "OnlyMentions",
    "explicitContentFilter": "AllMembers",
    "community": true, "rulesChannel": "rules", "publicUpdatesChannel": "mod-updates",
    "systemChannel": "mod-log", "afkChannel": "💤 AFK", "afkTimeout": 900
  },
  "everyone": { "permissions": ["ReadMessageHistory", "SendMessages", "Connect"] },
  "roles": [                              // highest role first
    { "name": "Founder", "color": "#F1C40F", "hoist": true, "permissions": ["Administrator"] },
    { "name": "Player", "color": "#B9BBBE", "permissions": ["ViewChannel"] }
  ],
  "categories": [
    {
      "name": "🎈 WELCOME",
      "permissions": { "@everyone": { "allow": ["ViewChannel"], "deny": ["SendMessages"] } },
      "channels": [
        { "name": "rules", "topic": "Read me" },
        { "name": "codes", "type": "announcement" },
        { "name": "bug-reports", "type": "forum", "tags": [{ "name": "Fixed", "emoji": "✅", "moderated": true }], "defaultReaction": "👀" },
        { "name": "🔊 Lounge", "type": "voice", "userLimit": 10 },
        { "name": "staff-only", "permissions": { "@everyone": { "deny": ["ViewChannel"] }, "Moderator": { "allow": ["ViewChannel"] } } }
      ]
    }
  ],
  "messages": [
    { "key": "verify", "channel": "verify",
      "embeds": [{ "title": "Verify", "description": "Read {{channel:rules}} then click below", "color": "#57F287" }],
      "buttons": [
        { "label": "Verify", "emoji": "✅", "style": "Success", "role": "Player", "mode": "add" },
        { "label": "Play", "url": "{{env.BALLOON_PUMP_URL}}" }
      ] }
  ],
  "automod": [ { "name": "Scams", "trigger": "Keyword", "metadata": { "keywords": ["free robux"] },
                 "actions": [{ "type": "BlockMessage" }, { "type": "SendAlertMessage", "channel": "mod-log" }] } ],
  "welcomeScreen": { "description": "…", "channels": [{ "channel": "rules", "description": "Read the rules", "emoji": "📜" }] },
  "bot": { "welcome": { "enabled": true, "channel": "welcome", "message": "Welcome {user}!" }, "autoRoles": [], "logChannel": "mod-log" }
}
```

- **Channel types:** `text`, `voice`, `category`, `announcement`, `stage`, `forum`, `media`.
- **Permissions** use Discord's names: `ViewChannel`, `SendMessages`, `ManageMessages`, `Administrator`… The panel's Roles page lists all of them, or use `"ALL"`.
- **Channel permissions add on top of the category's.** List only what's different.
- **Placeholders** in any text: `{{channel:rules}}`, `{{role:Moderator}}`, `{{server}}`, `{{env.ANY_ENV_VAR}}`.
- **Role buttons:** `mode` is `toggle` (the default), `add` or `remove`. They keep working after restarts as long as the bot is running.
- **Starter messages** remember which message they posted, so rebuilding edits the existing message instead of posting a new one.

---

## 5. Safety

- Your token stays in `.env` on your computer. `.env` is in `.gitignore`, so never commit it or send it to anyone.
- The panel only listens on `127.0.0.1` (your computer). To open it from another device, set `PANEL_HOST=0.0.0.0` **and** a `PANEL_PASSWORD`.
- Dangerous actions (wipe, delete, ban, prune, leave) always ask for confirmation.

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| "Privileged intents are not enabled" | Developer Portal → Bot → turn on the 3 intents, then click Reconnect on the Bot Settings page |
| `Missing Permissions` (code 50013) | Drag the bot's role to the top of the role list, and make sure it has Administrator |
| A role "is above the bot's highest role — skipped" | Same as above |
| Announcement / stage channels became normal text / voice | Community couldn't be turned on. Check the server's rules and updates channels, then build again |
| Buttons in starter messages are missing | Fill in the matching link (`BALLOON_PUMP_URL`, …) in `.env`, restart and build again |
| Panel won't open | Port 3000 is busy. Set `PANEL_PORT=3001` in `.env` |

## Project layout

```
src/index.js          entry point (loads .env, starts panel + bot)
src/bot.js            Discord client, role buttons, welcome/goodbye, logs, custom commands
src/builder.js        template engine (apply + export)
src/validate.js       template checker (npm run check)
src/panel/server.js   local web server, auth, live log stream
src/panel/api.js      every panel action → Discord
public/               the control panel (plain HTML/CSS/JS, no build step)
templates/            monolith-community.json, balloon-pump.json
data/config.json      runtime settings saved by the panel (created automatically)
```
