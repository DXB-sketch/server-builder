// JSON API used by the control panel. Every route maps to a Discord feature;
// /api/raw gives direct access to any Discord REST endpoint for anything else.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const {
  ChannelType,
  PermissionFlagsBits,
  GuildFeature,
  GuildVerificationLevel,
  GuildDefaultMessageNotifications,
  GuildExplicitContentFilter,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  AuditLogEvent,
  ActivityType,
  OverwriteType,
  SortOrderType,
  ForumLayoutType,
  GuildSystemChannelFlags,
  AutoModerationRuleTriggerType,
  AutoModerationActionType,
  AutoModerationRuleKeywordPresetType,
  StageInstancePrivacyLevel,
  OAuth2Scopes,
} = require('discord.js');
const bot = require('../bot');
const store = require('../store');
const log = require('../logger');
const { applyTemplate, exportGuild, automodData } = require('../builder');
const { validateTemplate } = require('../validate');
const { buildRows } = require('../components');
const { PERMISSION_NAMES, perms, permNames, channelType, CHANNEL_TYPE_NAMES, enumValue, enumName, color, hex, norm, embed, toBufferish } = require('../util');

const router = express.Router();
const TEMPLATE_DIR = path.join(__dirname, '..', '..', 'templates');

// ───────────────────────────── helpers ─────────────────────────────
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
function client() {
  const c = bot.state.client;
  if (!c?.isReady()) throw httpError(503, bot.state.error ? `Bot is offline: ${bot.state.error}` : 'Bot is not connected yet');
  return c;
}
function guild(req) {
  const g = client().guilds.cache.get(req.params.gid);
  if (!g) throw httpError(404, 'The bot is not in that server (or the ID is wrong). Use the invite link on the Dashboard.');
  return g;
}
async function channel(req) {
  const g = guild(req);
  const ch = g.channels.cache.get(req.params.cid) || (await g.channels.fetch(req.params.cid).catch(() => null));
  if (!ch) throw httpError(404, 'Channel not found');
  return ch;
}
function clean(obj) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined || obj[k] === '') delete obj[k];
  return obj;
}
const reason = (req) => req.body?.reason || 'Server Builder panel';
const ok = (res, extra = {}) => res.json({ ok: true, ...extra });
const img = (v) => (v === null ? null : v ? toBufferish(v) : undefined);

const ser = {
  role: (r) => ({
    id: r.id,
    name: r.name,
    color: hex(r.color),
    hoist: r.hoist,
    mentionable: r.mentionable,
    managed: r.managed,
    editable: r.editable,
    position: r.position,
    permissions: permNames(r.permissions.bitfield),
    members: r.members.size,
    unicodeEmoji: r.unicodeEmoji,
    icon: r.iconURL(),
    everyone: r.id === r.guild.id,
  }),
  channel: (c) => ({
    id: c.id,
    name: c.name,
    type: CHANNEL_TYPE_NAMES[c.type] ?? String(c.type),
    typeId: c.type,
    parentId: c.parentId ?? null,
    position: c.rawPosition ?? c.position ?? 0,
    topic: c.topic ?? null,
    nsfw: !!c.nsfw,
    slowmode: c.rateLimitPerUser ?? 0,
    bitrate: c.bitrate,
    userLimit: c.userLimit,
    rtcRegion: c.rtcRegion,
    synced: c.parent ? !!c.permissionsLocked : null,
    tags: c.availableTags?.map((t) => ({ id: t.id, name: t.name, emoji: t.emoji?.name ?? null, moderated: t.moderated })),
    defaultReaction: c.defaultReactionEmoji?.name ?? null,
    archived: c.archived,
    locked: c.locked,
    overwrites: c.permissionOverwrites
      ? [...c.permissionOverwrites.cache.values()].map((o) => ({
          id: o.id,
          type: o.type,
          name: o.type === OverwriteType.Role ? (o.id === c.guild.id ? '@everyone' : c.guild.roles.cache.get(o.id)?.name ?? o.id) : c.guild.members.cache.get(o.id)?.user.tag ?? o.id,
          allow: permNames(o.allow.bitfield),
          deny: permNames(o.deny.bitfield),
        }))
      : [],
  }),
  member: (m) => ({
    id: m.id,
    tag: m.user.tag,
    username: m.user.username,
    displayName: m.displayName,
    nick: m.nickname,
    bot: m.user.bot,
    avatar: m.displayAvatarURL({ size: 64 }),
    roles: m.roles.cache.filter((r) => r.id !== m.guild.id).sort((a, b) => b.position - a.position).map((r) => r.id),
    joinedAt: m.joinedAt,
    createdAt: m.user.createdAt,
    timeoutUntil: m.communicationDisabledUntil,
    voice: m.voice?.channelId ? { channelId: m.voice.channelId, mute: m.voice.serverMute, deaf: m.voice.serverDeaf } : null,
    owner: m.id === m.guild.ownerId,
    status: m.presence?.status ?? null,
    manageable: m.manageable,
  }),
  message: (m) => ({
    id: m.id,
    author: m.author ? { id: m.author.id, tag: m.author.tag, bot: m.author.bot, avatar: m.author.displayAvatarURL({ size: 64 }) } : null,
    webhookId: m.webhookId,
    content: m.content,
    embeds: m.embeds.map((e) => e.toJSON()),
    components: m.components.map((c) => c.toJSON()),
    attachments: m.attachments.map((a) => ({ name: a.name, url: a.url })),
    pinned: m.pinned,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    reactions: m.reactions.cache.map((r) => ({ emoji: r.emoji.toString(), count: r.count })),
    url: m.url,
    mine: m.author?.id === m.client.user.id,
  }),
};

/** Turn panel overwrite rows [{id, type, allow:[], deny:[]}] into discord.js overwrites. */
function overwritesFromBody(list) {
  return (list || []).map((o) => ({
    id: o.id,
    type: o.type ?? OverwriteType.Role,
    allow: perms(o.allow),
    deny: perms(o.deny),
  }));
}

/** Panel channel form -> discord.js channel options. */
function channelOptions(b, g, forCreate) {
  const d = clean({
    name: b.name,
    topic: b.topic,
    nsfw: b.nsfw,
    rateLimitPerUser: b.slowmode != null ? Number(b.slowmode) : undefined,
    bitrate: b.bitrate ? Number(b.bitrate) : undefined,
    userLimit: b.userLimit != null && b.userLimit !== '' ? Number(b.userLimit) : undefined,
    rtcRegion: b.rtcRegion,
    defaultAutoArchiveDuration: b.autoArchive ? Number(b.autoArchive) : undefined,
    defaultThreadRateLimitPerUser: b.threadSlowmode != null && b.threadSlowmode !== '' ? Number(b.threadSlowmode) : undefined,
  });
  if (b.topic === '') d.topic = null;
  if (b.parentId !== undefined) d.parent = b.parentId || null;
  if (forCreate) d.type = channelType(b.type || 'text');
  else if (b.type) d.type = channelType(b.type);
  if (b.overwrites) d.permissionOverwrites = overwritesFromBody(b.overwrites);
  if (b.tags) d.availableTags = b.tags.map((t) => clean({ id: t.id, name: t.name, moderated: !!t.moderated, emoji: t.emoji ? { id: null, name: t.emoji } : null }));
  if (b.defaultReaction !== undefined) d.defaultReactionEmoji = b.defaultReaction ? { id: null, name: b.defaultReaction } : null;
  if (b.sortOrder) d.defaultSortOrder = enumValue(SortOrderType, b.sortOrder);
  if (b.layout) d.defaultForumLayout = enumValue(ForumLayoutType, b.layout);
  if (b.archived !== undefined) d.archived = !!b.archived;
  if (b.locked !== undefined) d.locked = !!b.locked;
  if (b.lockPermissions !== undefined) d.lockPermissions = !!b.lockPermissions;
  d.reason = b.reason || 'Server Builder panel';
  return d;
}

/** Panel message form -> discord.js message payload. */
function messagePayload(b, g) {
  const p = {};
  if (b.content !== undefined) p.content = b.content || '';
  if (b.embeds) p.embeds = b.embeds.filter((e) => e && Object.keys(e).length).map((e) => embed(e, g));
  if (b.buttons) p.components = buildRows(b.buttons, g, (w) => log.warn(w));
  if (b.tts) p.tts = true;
  if (b.files?.length) p.files = b.files.map((f) => ({ attachment: toBufferish(f.data), name: f.name }));
  if (b.silent) p.flags = 4096;
  p.allowedMentions = b.allowMentions ? { parse: ['users', 'roles', 'everyone'] } : { parse: ['users'] };
  return p;
}

// ───────────────────────────── status ──────────────────────────────
function inviteUrl(c) {
  const id = c?.user?.id || process.env.CLIENT_ID;
  if (!id) return null;
  return `https://discord.com/oauth2/authorize?client_id=${id}&permissions=${PermissionFlagsBits.Administrator}&scope=${OAuth2Scopes.Bot}%20${OAuth2Scopes.ApplicationsCommands}&integration_type=0`;
}

router.get('/status', (req, res) => {
  const c = bot.state.client;
  const ready = !!c?.isReady();
  res.json({
    ready,
    error: bot.state.error,
    privilegedIntents: bot.state.privileged,
    user: ready ? { id: c.user.id, tag: c.user.tag, username: c.user.username, avatar: c.user.displayAvatarURL({ size: 128 }) } : null,
    ping: ready ? c.ws.ping : null,
    uptime: ready ? c.uptime : null,
    invite: inviteUrl(c),
    env: {
      COMMUNITY_GUILD_ID: process.env.COMMUNITY_GUILD_ID || null,
      GAME_GUILD_ID: process.env.GAME_GUILD_ID || null,
    },
    guilds: ready
      ? c.guilds.cache.map((g) => ({
          id: g.id,
          name: g.name,
          icon: g.iconURL({ size: 64 }),
          members: g.memberCount,
          owner: g.ownerId === c.user.id,
          admin: g.members.me?.permissions.has(PermissionFlagsBits.Administrator) ?? false,
        }))
      : [],
    presence: store.get().presence || null,
    building: building ? building.name : null,
  });
});

router.get('/meta', (req, res) => {
  const names = (e) => Object.keys(e).filter((k) => isNaN(Number(k)));
  res.json({
    permissions: PERMISSION_NAMES,
    channelTypes: ['text', 'voice', 'category', 'announcement', 'stage', 'forum', 'media'],
    verificationLevel: names(GuildVerificationLevel),
    defaultMessageNotifications: names(GuildDefaultMessageNotifications),
    explicitContentFilter: names(GuildExplicitContentFilter),
    systemChannelFlags: names(GuildSystemChannelFlags),
    activityTypes: names(ActivityType),
    auditLogEvents: names(AuditLogEvent),
    automodTriggers: names(AutoModerationRuleTriggerType),
    automodActions: names(AutoModerationActionType),
    automodPresets: names(AutoModerationRuleKeywordPresetType),
    buttonStyles: ['Primary', 'Secondary', 'Success', 'Danger'],
    eventEntityTypes: names(GuildScheduledEventEntityType),
    features: names(GuildFeature).map((k) => GuildFeature[k]),
  });
});

// ─────────────────────────────── bot ───────────────────────────────
router.post('/bot/presence', (req, res) => {
  const c = client();
  const { status, type, text, url } = req.body;
  store.get().presence = { status, type, text, url };
  store.save();
  bot.applyPresence(c);
  ok(res);
});

router.patch('/bot/profile', async (req, res) => {
  const c = client();
  const { username, avatar, banner } = req.body;
  if (username) await c.user.setUsername(username);
  if (avatar !== undefined) await c.user.setAvatar(img(avatar));
  if (banner !== undefined) await c.user.setBanner(img(banner));
  ok(res);
});

router.post('/bot/reconnect', async (req, res) => {
  bot.state.client?.destroy();
  await bot.start();
  ok(res, { ready: !!bot.state.client?.isReady() });
});

// ──────────────────────────── templates ────────────────────────────
const safeId = (id) => {
  if (!/^[a-z0-9_-]+$/i.test(id)) throw httpError(400, 'Template id may only contain letters, numbers, - and _');
  return id;
};
function readTemplate(id) {
  const f = path.join(TEMPLATE_DIR, `${safeId(id)}.json`);
  if (!fs.existsSync(f)) throw httpError(404, `Template ${id} not found`);
  const t = JSON.parse(fs.readFileSync(f, 'utf8'));
  t.id = id;
  return t;
}

let building = null;

router.get('/templates', (req, res) => {
  fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
  const list = fs
    .readdirSync(TEMPLATE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const id = f.slice(0, -5);
      try {
        const t = readTemplate(id);
        const channels = (t.categories || []).reduce((n, c) => n + (c.channels?.length || 0), t.channels?.length || 0);
        return {
          id,
          name: t.name,
          description: t.description,
          guildEnv: t.guildEnv || null,
          guildId: t.guildEnv ? process.env[t.guildEnv] || null : null,
          accent: t.accent || null,
          issues: (({ errors, warnings }) => ({ errors: errors.length, warnings: warnings.length }))(validateTemplate(t)),
          counts: { roles: t.roles?.length || 0, categories: t.categories?.length || 0, channels, messages: t.messages?.length || 0, automod: t.automod?.length || 0 },
        };
      } catch (e) {
        return { id, name: id, error: e.message };
      }
    });
  res.json(list);
});

router.get('/templates/:id', (req, res) => res.json(readTemplate(req.params.id)));
router.get('/templates/:id/validate', (req, res) => res.json(validateTemplate(readTemplate(req.params.id))));

router.put('/templates/:id', (req, res) => {
  const t = req.body;
  if (!t || typeof t !== 'object' || !t.name) throw httpError(400, 'Template must be a JSON object with a "name"');
  delete t.id;
  fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEMPLATE_DIR, `${safeId(req.params.id)}.json`), JSON.stringify(t, null, 2) + '\n');
  log.info(`Template "${t.name}" saved (${req.params.id}.json)`);
  ok(res, validateTemplate(t));
});

router.delete('/templates/:id', (req, res) => {
  fs.rmSync(path.join(TEMPLATE_DIR, `${safeId(req.params.id)}.json`), { force: true });
  ok(res);
});

router.post('/templates/:id/apply', (req, res) => {
  const c = client();
  if (building) throw httpError(409, `Already building "${building.name}" — wait for it to finish`);
  const t = readTemplate(req.params.id);
  const gid = req.body.guildId || (t.guildEnv && process.env[t.guildEnv]);
  if (!gid) throw httpError(400, `No server selected. Put the ID in .env as ${t.guildEnv || 'a guild id'} or pick one.`);
  const g = c.guilds.cache.get(gid);
  if (!g) throw httpError(404, `The bot is not in server ${gid}. Invite it first using the invite link on the Dashboard.`);
  const check = validateTemplate(t);
  if (check.errors.length) throw httpError(400, `Template has ${check.errors.length} error(s) — fix them first:\n• ${check.errors.slice(0, 8).join('\n• ')}`);
  check.warnings.forEach((w) => log.warn(`Template: ${w}`));
  building = { name: t.name, guildId: gid };
  applyTemplate(g, t, { wipe: !!req.body.wipe, messages: req.body.messages !== false }, log)
    .catch((e) => log.error(`Build crashed: ${e.stack || e.message}`))
    .finally(() => {
      building = null;
    });
  ok(res, { started: true, guild: g.name });
});

// ───────────────────────────── guilds ──────────────────────────────
router.get('/guilds/:gid', async (req, res) => {
  const g = guild(req);
  await g.fetch();
  res.json({
    id: g.id,
    name: g.name,
    description: g.description,
    icon: g.iconURL({ size: 256 }),
    banner: g.bannerURL({ size: 512 }),
    splash: g.splashURL({ size: 512 }),
    ownerId: g.ownerId,
    memberCount: g.memberCount,
    premiumTier: g.premiumTier,
    premiumSubscriptionCount: g.premiumSubscriptionCount,
    features: g.features,
    community: g.features.includes(GuildFeature.Community),
    verificationLevel: enumName(GuildVerificationLevel, g.verificationLevel),
    defaultMessageNotifications: enumName(GuildDefaultMessageNotifications, g.defaultMessageNotifications),
    explicitContentFilter: enumName(GuildExplicitContentFilter, g.explicitContentFilter),
    mfaLevel: g.mfaLevel,
    nsfwLevel: g.nsfwLevel,
    preferredLocale: g.preferredLocale,
    afkChannelId: g.afkChannelId,
    afkTimeout: g.afkTimeout,
    systemChannelId: g.systemChannelId,
    systemChannelFlags: g.systemChannelFlags.toArray(),
    rulesChannelId: g.rulesChannelId,
    publicUpdatesChannelId: g.publicUpdatesChannelId,
    safetyAlertsChannelId: g.safetyAlertsChannelId,
    premiumProgressBarEnabled: g.premiumProgressBarEnabled,
    vanityURLCode: g.vanityURLCode,
    createdAt: g.createdAt,
    counts: {
      channels: g.channels.cache.filter((c) => !c.isThread()).size,
      roles: g.roles.cache.size,
      emojis: g.emojis.cache.size,
      stickers: g.stickers.cache.size,
    },
  });
});

router.patch('/guilds/:gid', async (req, res) => {
  const g = guild(req);
  const b = req.body;
  const d = clean({
    name: b.name,
    description: b.description,
    preferredLocale: b.preferredLocale,
    afkTimeout: b.afkTimeout != null ? Number(b.afkTimeout) : undefined,
    verificationLevel: b.verificationLevel != null ? enumValue(GuildVerificationLevel, b.verificationLevel) : undefined,
    defaultMessageNotifications: b.defaultMessageNotifications != null ? enumValue(GuildDefaultMessageNotifications, b.defaultMessageNotifications) : undefined,
    explicitContentFilter: b.explicitContentFilter != null ? enumValue(GuildExplicitContentFilter, b.explicitContentFilter) : undefined,
  });
  for (const k of ['afkChannel', 'systemChannel', 'rulesChannel', 'publicUpdatesChannel', 'safetyAlertsChannel']) {
    if (b[k] !== undefined) d[k] = b[k] || null;
  }
  for (const k of ['icon', 'banner', 'splash', 'discoverySplash']) if (b[k] !== undefined) d[k] = img(b[k]);
  if (b.description === '') d.description = null;
  if (b.premiumProgressBarEnabled !== undefined) d.premiumProgressBarEnabled = !!b.premiumProgressBarEnabled;
  if (b.systemChannelFlags) d.systemChannelFlags = b.systemChannelFlags.reduce((a, f) => a | enumValue(GuildSystemChannelFlags, f), 0);
  if (b.community !== undefined) {
    const has = g.features.includes(GuildFeature.Community);
    if (b.community && !has) {
      d.features = [...g.features, GuildFeature.Community];
      d.explicitContentFilter = GuildExplicitContentFilter.AllMembers;
      if (g.verificationLevel < GuildVerificationLevel.Low && d.verificationLevel == null) d.verificationLevel = GuildVerificationLevel.Low;
    }
    if (!b.community && has) d.features = g.features.filter((f) => f !== GuildFeature.Community);
  }
  d.reason = reason(req);
  await g.edit(d);
  log.info(`Updated server settings for ${g.name}`);
  ok(res);
});

router.post('/guilds/:gid/leave', async (req, res) => {
  const g = guild(req);
  await g.leave();
  log.warn(`Left server ${g.name}`);
  ok(res);
});

router.get('/guilds/:gid/export', async (req, res) => res.json(await exportGuild(guild(req))));

router.get('/guilds/:gid/botconfig', (req, res) => res.json(store.guild(guild(req).id)));
router.put('/guilds/:gid/botconfig', (req, res) => {
  const g = guild(req);
  const allowed = ['welcome', 'goodbye', 'autoRoles', 'logChannelId', 'customCommands'];
  const patch = {};
  for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
  res.json(store.setGuild(g.id, patch));
});

router.post('/guilds/:gid/commands/sync', async (req, res) => {
  const g = guild(req);
  const cmds = (store.guild(g.id).customCommands || []).map((c) => ({
    name: String(c.name).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32),
    description: (c.description || 'Custom command').slice(0, 100),
  }));
  await g.commands.set(cmds);
  log.ok(`Registered ${cmds.length} slash command(s) in ${g.name}`);
  ok(res, { count: cmds.length });
});
router.get('/guilds/:gid/commands', async (req, res) => {
  const cmds = await guild(req).commands.fetch();
  res.json(cmds.map((c) => ({ id: c.id, name: c.name, description: c.description })));
});

router.get('/guilds/:gid/welcome-screen', async (req, res) => {
  const w = await guild(req).fetchWelcomeScreen();
  res.json({
    enabled: w.enabled,
    description: w.description,
    channels: w.welcomeChannels.map((c) => ({ channel: c.channelId, description: c.description, emoji: c.emoji?.name ?? null })),
  });
});
router.patch('/guilds/:gid/welcome-screen', async (req, res) => {
  const g = guild(req);
  await g.editWelcomeScreen({
    enabled: !!req.body.enabled,
    description: req.body.description || '',
    welcomeChannels: (req.body.channels || []).filter((c) => c.channel).map((c) => clean({ channel: c.channel, description: c.description, emoji: c.emoji || undefined })),
  });
  ok(res);
});

router.get('/guilds/:gid/widget', async (req, res) => {
  const w = await guild(req).fetchWidgetSettings();
  res.json({ enabled: w.enabled, channelId: w.channel?.id ?? null });
});
router.patch('/guilds/:gid/widget', async (req, res) => {
  await guild(req).setWidgetSettings({ enabled: !!req.body.enabled, channel: req.body.channelId || null });
  ok(res);
});

// ────────────────────────────── roles ──────────────────────────────
function roleOptions(b) {
  const d = clean({ name: b.name, unicodeEmoji: b.unicodeEmoji });
  if (b.color !== undefined) d.color = color(b.color) ?? 0;
  if (b.hoist !== undefined) d.hoist = !!b.hoist;
  if (b.mentionable !== undefined) d.mentionable = !!b.mentionable;
  if (b.permissions !== undefined) d.permissions = perms(b.permissions);
  if (b.icon !== undefined) d.icon = img(b.icon);
  if (b.unicodeEmoji === '') d.unicodeEmoji = null;
  d.reason = b.reason || 'Server Builder panel';
  return d;
}

router.get('/guilds/:gid/roles', async (req, res) => {
  const g = guild(req);
  await g.roles.fetch();
  res.json(g.roles.cache.sort((a, b) => b.position - a.position).map(ser.role));
});
router.post('/guilds/:gid/roles', async (req, res) => {
  const r = await guild(req).roles.create(roleOptions(req.body));
  log.info(`Created role ${r.name}`);
  res.json(ser.role(r));
});
router.patch('/guilds/:gid/roles/:rid', async (req, res) => {
  const g = guild(req);
  const role = g.roles.cache.get(req.params.rid);
  if (!role) throw httpError(404, 'Role not found');
  const r = await role.edit(roleOptions(req.body));
  log.info(`Updated role ${r.name}`);
  res.json(ser.role(r));
});
router.delete('/guilds/:gid/roles/:rid', async (req, res) => {
  const role = guild(req).roles.cache.get(req.params.rid);
  if (!role) throw httpError(404, 'Role not found');
  await role.delete(reason(req));
  log.info(`Deleted role ${role.name}`);
  ok(res);
});
router.post('/guilds/:gid/roles/order', async (req, res) => {
  const g = guild(req);
  const ids = req.body.ids || []; // top → bottom
  const n = ids.length;
  await g.roles.setPositions(ids.map((id, i) => ({ role: id, position: n - i })));
  ok(res);
});
router.post('/guilds/:gid/roles/:rid/mass', async (req, res) => {
  const g = guild(req);
  const role = g.roles.cache.get(req.params.rid);
  if (!role) throw httpError(404, 'Role not found');
  const members = await g.members.fetch();
  const who = req.body.target || 'humans';
  const add = req.body.action !== 'remove';
  let n = 0;
  for (const m of members.values()) {
    if (who === 'humans' && m.user.bot) continue;
    if (who === 'bots' && !m.user.bot) continue;
    if (add === m.roles.cache.has(role.id)) continue;
    await (add ? m.roles.add(role, reason(req)) : m.roles.remove(role, reason(req))).then(() => n++).catch(() => {});
  }
  log.info(`${add ? 'Added' : 'Removed'} ${role.name} ${add ? 'to' : 'from'} ${n} member(s)`);
  ok(res, { count: n });
});

// ───────────────────────────── channels ────────────────────────────
router.get('/guilds/:gid/channels', async (req, res) => {
  const g = guild(req);
  await g.channels.fetch();
  res.json(g.channels.cache.filter((c) => !c.isThread()).sort((a, b) => a.rawPosition - b.rawPosition).map(ser.channel));
});
router.post('/guilds/:gid/channels', async (req, res) => {
  const g = guild(req);
  const ch = await g.channels.create(channelOptions(req.body, g, true));
  log.info(`Created channel #${ch.name}`);
  res.json(ser.channel(ch));
});
router.patch('/guilds/:gid/channels/:cid', async (req, res) => {
  const g = guild(req);
  const ch = await channel(req);
  const updated = await ch.edit(channelOptions(req.body, g, false));
  log.info(`Updated channel #${updated.name}`);
  res.json(ser.channel(updated));
});
router.delete('/guilds/:gid/channels/:cid', async (req, res) => {
  const ch = await channel(req);
  await ch.delete(reason(req));
  log.info(`Deleted channel #${ch.name}`);
  ok(res);
});
router.post('/guilds/:gid/channels/:cid/clone', async (req, res) => {
  const ch = await channel(req);
  const c = await ch.clone({ name: req.body.name || ch.name, reason: reason(req) });
  log.info(`Cloned #${ch.name}`);
  res.json(ser.channel(c));
});
router.post('/guilds/:gid/channels/:cid/sync', async (req, res) => {
  const ch = await channel(req);
  await ch.lockPermissions();
  ok(res);
});
router.post('/guilds/:gid/channels/order', async (req, res) => {
  const g = guild(req);
  await g.channels.setPositions(
    (req.body.items || []).map((i) => clean({ channel: i.id, position: i.position, parent: i.parent === undefined ? undefined : i.parent, lockPermissions: false })),
  );
  ok(res);
});
router.post('/guilds/:gid/channels/:cid/lockdown', async (req, res) => {
  const g = guild(req);
  const ch = await channel(req);
  const lock = req.body.lock !== false;
  await ch.permissionOverwrites.edit(g.roles.everyone, { SendMessages: lock ? false : null, SendMessagesInThreads: lock ? false : null, CreatePublicThreads: lock ? false : null, AddReactions: lock ? false : null, Connect: ch.isVoiceBased() ? (lock ? false : null) : undefined }, { reason: reason(req) });
  log.info(`${lock ? 'Locked' : 'Unlocked'} #${ch.name}`);
  ok(res);
});

// ───────────────────────────── messages ────────────────────────────
router.get('/guilds/:gid/channels/:cid/messages', async (req, res) => {
  const ch = await channel(req);
  if (!ch.messages) throw httpError(400, 'That channel has no messages');
  const msgs = await ch.messages.fetch(clean({ limit: Math.min(Number(req.query.limit) || 50, 100), before: req.query.before }));
  res.json(msgs.map(ser.message));
});
router.get('/guilds/:gid/channels/:cid/pins', async (req, res) => {
  const ch = await channel(req);
  const pins = await ch.messages.fetchPinned();
  res.json((pins.items ? pins.items.map((p) => p.message) : [...pins.values()]).map(ser.message));
});
router.post('/guilds/:gid/channels/:cid/messages', async (req, res) => {
  const g = guild(req);
  const ch = await channel(req);
  if (ch.type === ChannelType.GuildForum || ch.type === ChannelType.GuildMedia) {
    const thread = await ch.threads.create({ name: req.body.threadName || 'New post', message: messagePayload(req.body, g), appliedTags: req.body.appliedTags || [] });
    log.info(`Created forum post "${thread.name}" in #${ch.name}`);
    return res.json({ ok: true, threadId: thread.id });
  }
  if (!ch.isTextBased()) throw httpError(400, 'Not a text channel');
  const m = await ch.send(messagePayload(req.body, g));
  if (req.body.pin) await m.pin().catch(() => {});
  if (req.body.publish && ch.type === ChannelType.GuildAnnouncement) await m.crosspost().catch((e) => log.warn(`Publish failed: ${e.message}`));
  log.info(`Sent message in #${ch.name}`);
  res.json(ser.message(m));
});
async function message(req) {
  const ch = await channel(req);
  const m = await ch.messages.fetch(req.params.mid).catch(() => null);
  if (!m) throw httpError(404, 'Message not found');
  return m;
}
router.patch('/guilds/:gid/channels/:cid/messages/:mid', async (req, res) => {
  const m = await message(req);
  const p = messagePayload(req.body, guild(req));
  delete p.tts;
  res.json(ser.message(await m.edit(p)));
});
router.delete('/guilds/:gid/channels/:cid/messages/:mid', async (req, res) => {
  await (await message(req)).delete();
  ok(res);
});
router.post('/guilds/:gid/channels/:cid/messages/:mid/pin', async (req, res) => {
  const m = await message(req);
  await (req.body.pinned === false ? m.unpin() : m.pin());
  ok(res);
});
router.post('/guilds/:gid/channels/:cid/messages/:mid/react', async (req, res) => {
  await (await message(req)).react(req.body.emoji);
  ok(res);
});
router.delete('/guilds/:gid/channels/:cid/messages/:mid/reactions', async (req, res) => {
  await (await message(req)).reactions.removeAll();
  ok(res);
});
router.post('/guilds/:gid/channels/:cid/messages/:mid/crosspost', async (req, res) => {
  await (await message(req)).crosspost();
  ok(res);
});
router.post('/guilds/:gid/channels/:cid/messages/:mid/thread', async (req, res) => {
  const t = await (await message(req)).startThread({ name: req.body.name || 'Thread' });
  ok(res, { threadId: t.id });
});
router.post('/guilds/:gid/channels/:cid/purge', async (req, res) => {
  const ch = await channel(req);
  let left = Math.min(Number(req.body.count) || 10, 1000);
  let total = 0;
  while (left > 0) {
    let msgs = await ch.messages.fetch({ limit: Math.min(left, 100) });
    if (!msgs.size) break;
    if (req.body.userId) msgs = msgs.filter((m) => m.author?.id === req.body.userId);
    if (req.body.bots) msgs = msgs.filter((m) => m.author?.bot);
    const deleted = await ch.bulkDelete(msgs, true);
    total += deleted.size;
    left -= 100;
    if (deleted.size === 0) break;
  }
  log.info(`Purged ${total} message(s) in #${ch.name} (messages older than 14 days can't be bulk-deleted)`);
  ok(res, { count: total });
});

// ───────────────────────────── threads ─────────────────────────────
router.get('/guilds/:gid/threads', async (req, res) => {
  const g = guild(req);
  const { threads } = await g.channels.fetchActiveThreads();
  res.json(threads.map((t) => ({ ...ser.channel(t), parentName: t.parent?.name, memberCount: t.memberCount, messageCount: t.messageCount })));
});
router.post('/guilds/:gid/channels/:cid/threads', async (req, res) => {
  const ch = await channel(req);
  const opts = { name: req.body.name || 'New thread', reason: reason(req) };
  if (req.body.private) opts.type = ChannelType.PrivateThread;
  if (req.body.autoArchive) opts.autoArchiveDuration = Number(req.body.autoArchive);
  const t = await ch.threads.create(opts);
  ok(res, { threadId: t.id });
});

// ───────────────────────────── stage ───────────────────────────────
router.post('/guilds/:gid/channels/:cid/stage', async (req, res) => {
  const ch = await channel(req);
  await ch.createStageInstance({ topic: req.body.topic || 'Live now', privacyLevel: StageInstancePrivacyLevel.GuildOnly, sendStartNotification: !!req.body.notify });
  ok(res);
});
router.delete('/guilds/:gid/channels/:cid/stage', async (req, res) => {
  const ch = await channel(req);
  await ch.stageInstance?.delete();
  ok(res);
});

// ───────────────────────────── members ─────────────────────────────
async function member(req) {
  const m = await guild(req).members.fetch(req.params.uid).catch(() => null);
  if (!m) throw httpError(404, 'Member not found');
  return m;
}
router.get('/guilds/:gid/members', async (req, res) => {
  const g = guild(req);
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  let list;
  if (req.query.query) list = await g.members.search({ query: req.query.query, limit });
  else {
    try {
      list = await g.members.fetch({ limit, time: 15000 });
    } catch {
      list = g.members.cache; // GuildMembers intent disabled
    }
  }
  res.json({ total: g.memberCount, members: [...list.values()].slice(0, limit).map(ser.member) });
});
router.get('/guilds/:gid/members/:uid', async (req, res) => res.json(ser.member(await member(req))));
router.patch('/guilds/:gid/members/:uid', async (req, res) => {
  const m = await member(req);
  const b = req.body;
  const d = {};
  if (b.nick !== undefined) d.nick = b.nick || null;
  if (b.roles) d.roles = [...new Set([...b.roles, ...m.roles.cache.filter((r) => r.managed).map((r) => r.id)])]; // keep booster/bot roles
  if (b.timeoutMinutes !== undefined)
    d.communicationDisabledUntil = b.timeoutMinutes ? new Date(Date.now() + Number(b.timeoutMinutes) * 60000) : null;
  if (m.voice?.channelId) {
    if (b.mute !== undefined) d.mute = !!b.mute;
    if (b.deaf !== undefined) d.deaf = !!b.deaf;
    if (b.moveTo !== undefined) d.channel = b.moveTo || null;
  }
  d.reason = reason(req);
  const updated = await m.edit(d);
  log.info(`Updated member ${m.user.tag}`);
  res.json(ser.member(updated));
});
router.post('/guilds/:gid/members/:uid/roles/:rid', async (req, res) => {
  await (await member(req)).roles.add(req.params.rid, reason(req));
  ok(res);
});
router.delete('/guilds/:gid/members/:uid/roles/:rid', async (req, res) => {
  await (await member(req)).roles.remove(req.params.rid, reason(req));
  ok(res);
});
router.post('/guilds/:gid/members/:uid/kick', async (req, res) => {
  const m = await member(req);
  await m.kick(reason(req));
  log.warn(`Kicked ${m.user.tag}`);
  ok(res);
});
router.post('/guilds/:gid/members/:uid/dm', async (req, res) => {
  const m = await member(req);
  await m.send(messagePayload(req.body, guild(req)));
  ok(res);
});
router.get('/guilds/:gid/bans', async (req, res) => {
  const bans = await guild(req).bans.fetch();
  res.json(bans.map((b) => ({ id: b.user.id, tag: b.user.tag, avatar: b.user.displayAvatarURL({ size: 64 }), reason: b.reason })));
});
router.post('/guilds/:gid/bans', async (req, res) => {
  const g = guild(req);
  await g.bans.create(req.body.userId, { reason: reason(req), deleteMessageSeconds: Number(req.body.deleteMessageSeconds) || 0 });
  log.warn(`Banned ${req.body.userId}`);
  ok(res);
});
router.delete('/guilds/:gid/bans/:uid', async (req, res) => {
  await guild(req).bans.remove(req.params.uid, reason(req));
  log.info(`Unbanned ${req.params.uid}`);
  ok(res);
});
router.post('/guilds/:gid/prune', async (req, res) => {
  const g = guild(req);
  const opts = { days: Number(req.body.days) || 30, roles: req.body.roles || [], reason: reason(req) };
  const n = req.body.dry ? await g.members.prune({ ...opts, dry: true }) : await g.members.prune({ ...opts, count: true });
  if (!req.body.dry) log.warn(`Pruned ${n} inactive member(s)`);
  ok(res, { count: n });
});

// ───────────────────────────── invites ─────────────────────────────
router.get('/guilds/:gid/invites', async (req, res) => {
  const inv = await guild(req).invites.fetch();
  res.json(inv.map((i) => ({ code: i.code, url: i.url, channel: i.channel?.name, channelId: i.channelId, inviter: i.inviter?.tag, uses: i.uses, maxUses: i.maxUses, maxAge: i.maxAge, temporary: i.temporary, expiresAt: i.expiresAt })));
});
router.post('/guilds/:gid/channels/:cid/invites', async (req, res) => {
  const ch = await channel(req);
  const i = await ch.createInvite({ maxAge: Number(req.body.maxAge ?? 0), maxUses: Number(req.body.maxUses ?? 0), temporary: !!req.body.temporary, unique: true, reason: reason(req) });
  log.info(`Created invite ${i.url}`);
  ok(res, { url: i.url, code: i.code });
});
router.delete('/guilds/:gid/invites/:code', async (req, res) => {
  await guild(req).invites.delete(req.params.code, reason(req));
  ok(res);
});

// ───────────────────────────── webhooks ────────────────────────────
router.get('/guilds/:gid/webhooks', async (req, res) => {
  const hooks = await guild(req).fetchWebhooks();
  res.json(hooks.map((w) => ({ id: w.id, name: w.name, avatar: w.avatarURL(), channelId: w.channelId, url: w.token ? w.url : null, owner: w.owner?.tag ?? null, type: w.type })));
});
router.post('/guilds/:gid/channels/:cid/webhooks', async (req, res) => {
  const ch = await channel(req);
  const w = await ch.createWebhook({ name: req.body.name || 'Webhook', avatar: img(req.body.avatar), reason: reason(req) });
  ok(res, { id: w.id, url: w.url });
});
async function webhook(req) {
  const hooks = await guild(req).fetchWebhooks();
  const w = hooks.get(req.params.wid);
  if (!w) throw httpError(404, 'Webhook not found');
  return w;
}
router.patch('/guilds/:gid/webhooks/:wid', async (req, res) => {
  const w = await webhook(req);
  await w.edit(clean({ name: req.body.name, avatar: img(req.body.avatar), channel: req.body.channelId, reason: reason(req) }));
  ok(res);
});
router.delete('/guilds/:gid/webhooks/:wid', async (req, res) => {
  await (await webhook(req)).delete(reason(req));
  ok(res);
});
router.post('/guilds/:gid/webhooks/:wid/send', async (req, res) => {
  const w = await webhook(req);
  if (!w.token) throw httpError(400, 'This webhook was not created by the bot, so it cannot send with it');
  const p = messagePayload(req.body, guild(req));
  delete p.components;
  await w.send({ ...p, username: req.body.username || undefined, avatarURL: req.body.avatarURL || undefined });
  ok(res);
});

// ───────────────────────── emojis & stickers ───────────────────────
router.get('/guilds/:gid/emojis', async (req, res) => {
  const em = await guild(req).emojis.fetch();
  res.json(em.map((e) => ({ id: e.id, name: e.name, url: e.imageURL(), animated: e.animated, roles: e.roles.cache.map((r) => r.id), managed: e.managed })));
});
router.post('/guilds/:gid/emojis', async (req, res) => {
  const e = await guild(req).emojis.create({ attachment: toBufferish(req.body.image), name: req.body.name, roles: req.body.roles?.length ? req.body.roles : undefined, reason: reason(req) });
  log.info(`Created emoji :${e.name}:`);
  ok(res, { id: e.id });
});
router.patch('/guilds/:gid/emojis/:eid', async (req, res) => {
  const e = await guild(req).emojis.fetch(req.params.eid);
  await e.edit(clean({ name: req.body.name, roles: req.body.roles, reason: reason(req) }));
  ok(res);
});
router.delete('/guilds/:gid/emojis/:eid', async (req, res) => {
  await guild(req).emojis.delete(req.params.eid, reason(req));
  ok(res);
});
router.get('/guilds/:gid/stickers', async (req, res) => {
  const st = await guild(req).stickers.fetch();
  res.json(st.map((s) => ({ id: s.id, name: s.name, description: s.description, tags: s.tags, url: s.url })));
});
router.post('/guilds/:gid/stickers', async (req, res) => {
  const s = await guild(req).stickers.create({ file: { attachment: toBufferish(req.body.file), name: req.body.fileName || 'sticker.png' }, name: req.body.name, tags: req.body.tags || '⭐', description: req.body.description || '', reason: reason(req) });
  log.info(`Created sticker ${s.name}`);
  ok(res, { id: s.id });
});
router.patch('/guilds/:gid/stickers/:sid', async (req, res) => {
  const s = await guild(req).stickers.fetch(req.params.sid);
  await s.edit(clean({ name: req.body.name, description: req.body.description, tags: req.body.tags, reason: reason(req) }));
  ok(res);
});
router.delete('/guilds/:gid/stickers/:sid', async (req, res) => {
  await guild(req).stickers.delete(req.params.sid, reason(req));
  ok(res);
});

// ───────────────────────── scheduled events ────────────────────────
router.get('/guilds/:gid/events', async (req, res) => {
  const ev = await guild(req).scheduledEvents.fetch({ withUserCount: true });
  res.json(ev.map((e) => ({ id: e.id, name: e.name, description: e.description, start: e.scheduledStartAt, end: e.scheduledEndAt, status: enumName(GuildScheduledEventStatus, e.status), entityType: enumName(GuildScheduledEventEntityType, e.entityType), channelId: e.channelId, location: e.entityMetadata?.location ?? null, userCount: e.userCount, url: e.url, image: e.coverImageURL?.() ?? null })));
});
function eventOptions(b) {
  const d = clean({ name: b.name, description: b.description, scheduledStartTime: b.start ? new Date(b.start) : undefined, scheduledEndTime: b.end ? new Date(b.end) : undefined, image: img(b.image), reason: b.reason || 'Server Builder panel' });
  if (b.entityType) {
    d.entityType = enumValue(GuildScheduledEventEntityType, b.entityType);
    if (d.entityType === GuildScheduledEventEntityType.External) {
      d.entityMetadata = { location: b.location || 'Roblox' };
      d.channel = null;
    } else d.channel = b.channelId;
  }
  if (b.status) d.status = enumValue(GuildScheduledEventStatus, b.status);
  return d;
}
router.post('/guilds/:gid/events', async (req, res) => {
  const e = await guild(req).scheduledEvents.create({ privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly, ...eventOptions(req.body) });
  log.info(`Created event ${e.name}`);
  ok(res, { id: e.id, url: e.url });
});
router.patch('/guilds/:gid/events/:eid', async (req, res) => {
  const e = await guild(req).scheduledEvents.fetch(req.params.eid);
  await e.edit(eventOptions(req.body));
  ok(res);
});
router.delete('/guilds/:gid/events/:eid', async (req, res) => {
  await guild(req).scheduledEvents.delete(req.params.eid);
  ok(res);
});

// ───────────────────────────── automod ─────────────────────────────
router.get('/guilds/:gid/automod', async (req, res) => {
  const g = guild(req);
  const rules = await g.autoModerationRules.fetch();
  res.json(
    rules.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      trigger: enumName(AutoModerationRuleTriggerType, r.triggerType),
      metadata: {
        keywords: r.triggerMetadata.keywordFilter,
        regex: r.triggerMetadata.regexPatterns,
        allow: r.triggerMetadata.allowList,
        presets: r.triggerMetadata.presets?.map((p) => enumName(AutoModerationRuleKeywordPresetType, p)),
        mentionLimit: r.triggerMetadata.mentionTotalLimit,
        raidProtection: r.triggerMetadata.mentionRaidProtectionEnabled,
      },
      actions: r.actions.map((a) => ({ type: enumName(AutoModerationActionType, a.type), channel: a.metadata.channelId, seconds: a.metadata.durationSeconds, message: a.metadata.customMessage })),
      exemptRoles: r.exemptRoles.map((x) => x.id),
      exemptChannels: r.exemptChannels.map((x) => x.id),
    })),
  );
});
const amResolvers = (g) => [
  (n) => g.channels.cache.get(n) || g.channels.cache.find((c) => norm(c.name) === norm(n)),
  (n) => g.roles.cache.get(n) || g.roles.cache.find((r) => norm(r.name) === norm(n)),
];
router.post('/guilds/:gid/automod', async (req, res) => {
  const g = guild(req);
  const r = await g.autoModerationRules.create(automodData(req.body, ...amResolvers(g)));
  log.info(`Created AutoMod rule ${r.name}`);
  ok(res, { id: r.id });
});
router.patch('/guilds/:gid/automod/:id', async (req, res) => {
  const g = guild(req);
  const rule = await g.autoModerationRules.fetch(req.params.id);
  const d = automodData(req.body, ...amResolvers(g));
  delete d.triggerType;
  await rule.edit(d);
  ok(res);
});
router.delete('/guilds/:gid/automod/:id', async (req, res) => {
  await guild(req).autoModerationRules.delete(req.params.id);
  ok(res);
});

// ──────────────────────────── audit log ────────────────────────────
router.get('/guilds/:gid/audit', async (req, res) => {
  const g = guild(req);
  const opts = { limit: Math.min(Number(req.query.limit) || 50, 100) };
  if (req.query.type) opts.type = enumValue(AuditLogEvent, req.query.type);
  if (req.query.user) opts.user = req.query.user;
  const logs = await g.fetchAuditLogs(opts);
  res.json(
    logs.entries.map((e) => ({
      id: e.id,
      action: enumName(AuditLogEvent, e.action),
      executor: e.executor?.tag ?? e.executorId,
      target: e.target?.tag ?? e.target?.name ?? e.targetId ?? null,
      reason: e.reason,
      changes: e.changes,
      createdAt: e.createdAt,
    })),
  );
});

// ─────────────────────────── raw REST API ──────────────────────────
// Direct access to ANY Discord API endpoint (https://discord.com/developers/docs).
router.post('/raw', async (req, res) => {
  const c = client();
  const method = String(req.body.method || 'GET').toLowerCase();
  if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) throw httpError(400, 'Bad method');
  let route = String(req.body.route || '').trim();
  if (route.startsWith('https://')) route = route.replace(/^https:\/\/discord\.com\/api(\/v\d+)?/, '');
  if (!route.startsWith('/')) route = '/' + route;
  const opts = {};
  if (req.body.body !== undefined && req.body.body !== null && method !== 'get') opts.body = req.body.body;
  if (req.body.query) opts.query = new URLSearchParams(req.body.query);
  if (req.body.reason) opts.reason = req.body.reason;
  log.info(`Raw API: ${method.toUpperCase()} ${route}`);
  const result = await c.rest[method](route, opts);
  res.json({ ok: true, result: result ?? null });
});

module.exports = router;
