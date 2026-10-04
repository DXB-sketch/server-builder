// The template engine: applies a JSON template to a guild (roles, categories,
// channels, permissions, server settings, Community, welcome screen, AutoMod,
// bot welcome config and pre-written messages), and exports a guild back into
// a template. Applying is idempotent: things that already exist (matched by
// name) are updated instead of duplicated, so you can re-run a template safely.
const {
  ChannelType,
  GuildFeature,
  GuildVerificationLevel,
  GuildExplicitContentFilter,
  GuildDefaultMessageNotifications,
  PermissionFlagsBits,
  AutoModerationRuleTriggerType,
  AutoModerationActionType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleEventType,
  ForumLayoutType,
  SortOrderType,
  GuildSystemChannelFlags,
} = require('discord.js');
const store = require('./store');
const { buildRows } = require('./components');
const {
  perms,
  permNames,
  channelType,
  CHANNEL_TYPE_NAMES,
  enumValue,
  enumName,
  color,
  hex,
  norm,
  fill,
  embed,
  toBufferish,
} = require('./util');

// Channel types that may need the Community feature, and what to fall back to.
const FALLBACK = {
  [ChannelType.GuildAnnouncement]: ChannelType.GuildText,
  [ChannelType.GuildStageVoice]: ChannelType.GuildVoice,
  [ChannelType.GuildForum]: ChannelType.GuildText,
  [ChannelType.GuildMedia]: ChannelType.GuildText,
};
const VOICE_TYPES = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
const MAX_BITRATE = [96000, 128000, 256000, 384000];

/**
 * Channel overwrites build on top of the category's: for a role listed in both,
 * the channel's allow/deny lists are added and win on conflicts.
 */
function mergePerms(parent = {}, child = {}) {
  const out = structuredClone(parent);
  for (const [name, o] of Object.entries(child || {})) {
    const p = out[name] || {};
    const allow = new Set([...(p.allow || []), ...(o.allow || [])]);
    const deny = new Set([...(p.deny || []), ...(o.deny || [])]);
    for (const a of o.allow || []) deny.delete(a);
    for (const d of o.deny || []) allow.delete(d);
    out[name] = { allow: [...allow], deny: [...deny] };
  }
  return out;
}

class Build {
  constructor(guild, template, opts, log) {
    this.guild = guild;
    this.t = template;
    this.opts = opts;
    this.log = log;
    this.stats = { created: 0, updated: 0, deleted: 0, failed: 0 };
    this.roles = new Map(); // norm(name) -> Role
    this.channels = new Map(); // norm(name) -> Channel (template channels)
    this.claimed = new Set();
    this.order = []; // [{ channel, parentId, position }]
    this.deferred = [];
  }

  warn(msg) {
    this.log.warn(msg);
  }

  async step(desc, fn, { quiet = false } = {}) {
    try {
      const r = await fn();
      if (!quiet) this.log.info(desc);
      return r ?? true;
    } catch (e) {
      this.stats.failed++;
      this.log.error(`${desc} — FAILED: ${e.message}`);
      return null;
    }
  }

  async run() {
    const g = this.guild;
    const started = Date.now();
    this.log.info(`━━ Building "${this.t.name}" into server "${g.name}" (${g.id}) ━━`);
    await g.fetch();
    await g.roles.fetch();
    await g.channels.fetch();
    this.me = await g.members.fetchMe();
    if (!this.me.permissions.has(PermissionFlagsBits.Administrator)) {
      this.warn('The bot does not have Administrator in this server. Some steps will fail — re-invite it with the invite link in the panel.');
    }

    if (this.opts.wipe) await this.wipe();
    await this.settings(false);
    await this.buildRoles();
    await this.buildChannels(false);
    await this.enableCommunity();
    await this.buildChannels(true);
    await this.orderChannels();
    await this.settings(true);
    await this.welcomeScreen();
    await this.automod();
    this.botConfig();
    if (this.opts.messages !== false) await this.messages();

    const s = this.stats;
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    this.log.ok(`━━ Done in ${secs}s — created ${s.created}, updated ${s.updated}, deleted ${s.deleted}, failed ${s.failed} ━━`);
    return s;
  }

  // ───────────────────────────── wipe ─────────────────────────────
  async wipe() {
    const g = this.guild;
    this.log.warn('Wipe enabled: deleting existing channels and roles…');
    if (g.features.includes(GuildFeature.Community)) {
      await this.step('Disabled Community (so rules/updates channels can be deleted)', () =>
        g.edit({ features: g.features.filter((f) => f !== GuildFeature.Community) }),
      );
    }
    for (const ch of [...g.channels.cache.values()]) {
      if (ch.isThread()) continue;
      const ok = await this.step(`Deleted channel #${ch.name}`, () => ch.delete('Server Builder wipe'), { quiet: true });
      if (ok) this.stats.deleted++;
    }
    for (const role of [...g.roles.cache.values()]) {
      if (role.id === g.id || role.managed || !role.editable) continue;
      const ok = await this.step(`Deleted role ${role.name}`, () => role.delete('Server Builder wipe'), { quiet: true });
      if (ok) this.stats.deleted++;
    }
    this.log.info(`Wipe finished (${this.stats.deleted} items deleted)`);
  }

  // ─────────────────────────── settings ───────────────────────────
  async settings(final) {
    const s = this.t.settings || {};
    const g = this.guild;
    const data = {};
    if (!final) {
      if (s.name) data.name = fill(s.name, g);
      if (s.description !== undefined) data.description = fill(s.description, g);
      if (s.preferredLocale) data.preferredLocale = s.preferredLocale;
      if (s.verificationLevel !== undefined) data.verificationLevel = enumValue(GuildVerificationLevel, s.verificationLevel);
      if (s.defaultMessageNotifications !== undefined)
        data.defaultMessageNotifications = enumValue(GuildDefaultMessageNotifications, s.defaultMessageNotifications);
      if (s.explicitContentFilter !== undefined)
        data.explicitContentFilter = enumValue(GuildExplicitContentFilter, s.explicitContentFilter);
      if (s.icon) data.icon = toBufferish(s.icon);
      if (s.banner) data.banner = toBufferish(s.banner);
      if (s.splash) data.splash = toBufferish(s.splash);
      if (s.premiumProgressBarEnabled !== undefined) data.premiumProgressBarEnabled = !!s.premiumProgressBarEnabled;
      if (!Object.keys(data).length) return;
      return this.step('Updated server name / description / safety settings', () => g.edit(data));
    }
    const ch = (name) => (name ? this.findChannel(name) : undefined);
    if (s.systemChannel !== undefined) data.systemChannel = ch(s.systemChannel) ?? null;
    if (s.systemChannelFlags) {
      data.systemChannelFlags = s.systemChannelFlags.reduce((a, f) => a | enumValue(GuildSystemChannelFlags, f), 0);
    }
    if (s.afkChannel !== undefined) data.afkChannel = ch(s.afkChannel) ?? null;
    if (s.afkTimeout !== undefined) data.afkTimeout = s.afkTimeout;
    if (g.features.includes(GuildFeature.Community)) {
      if (s.rulesChannel) data.rulesChannel = ch(s.rulesChannel) ?? undefined;
      if (s.publicUpdatesChannel) data.publicUpdatesChannel = ch(s.publicUpdatesChannel) ?? undefined;
      if (s.safetyAlertsChannel) data.safetyAlertsChannel = ch(s.safetyAlertsChannel) ?? undefined;
    }
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
    if (!Object.keys(data).length) return;
    return this.step('Linked system / AFK / rules / updates channels', () => g.edit(data));
  }

  // ───────────────────────────── roles ────────────────────────────
  async buildRoles() {
    const g = this.guild;
    const list = this.t.roles || [];
    this.log.info(`Roles: ${list.length} in template`);
    for (const r of list) {
      const data = {
        name: r.name,
        color: color(r.color) ?? 0,
        hoist: !!r.hoist,
        mentionable: !!r.mentionable,
        permissions: perms(r.permissions, (m) => this.warn(`Role ${r.name}: ${m}`)),
      };
      if (r.unicodeEmoji) data.unicodeEmoji = r.unicodeEmoji;
      if (r.icon) data.icon = toBufferish(r.icon);
      const existing = g.roles.cache.find((x) => norm(x.name) === norm(r.name) && !x.managed && x.id !== g.id);
      let role;
      if (existing) {
        if (!existing.editable) {
          this.warn(`Role "${r.name}" exists but is above the bot's highest role — skipped. Drag the bot's role to the top in Server Settings → Roles.`);
          role = existing;
        } else {
          role = await this.step(`Updated role ${r.name}`, () => existing.edit({ ...data, reason: 'Server Builder' }), { quiet: true });
          if (role) this.stats.updated++;
        }
      } else {
        role = await this.step(`Created role ${r.name}`, () => g.roles.create({ ...data, reason: 'Server Builder' }));
        if (role) this.stats.created++;
      }
      if (role) this.roles.set(norm(r.name), role);
    }

    if (this.t.everyone?.permissions) {
      await this.step('Set @everyone base permissions', () =>
        g.roles.everyone.setPermissions(perms(this.t.everyone.permissions, (m) => this.warn(`@everyone: ${m}`))),
      );
    }

    // Order: first role in the template = highest, placed just under the bot's own role.
    await g.roles.fetch();
    const top = this.me.roles.highest.position;
    const ordered = list.map((r) => this.roles.get(norm(r.name))).filter((r) => r && r.editable);
    if (ordered.length) {
      const positions = ordered.map((role, i) => ({ role: role.id, position: Math.max(1, top - 1 - i) }));
      await this.step('Ordered roles', () => g.roles.setPositions(positions));
    }
  }

  role(name) {
    if (name === '@everyone' || name === 'everyone') return this.guild.roles.everyone;
    return (
      this.roles.get(norm(name)) ||
      this.guild.roles.cache.get(name) ||
      this.guild.roles.cache.find((r) => norm(r.name) === norm(name))
    );
  }

  overwrites(obj) {
    const out = [];
    for (const [name, o] of Object.entries(obj || {})) {
      const target = name === '@bot' ? this.me : this.role(name);
      if (!target) {
        this.warn(`Permission overwrite for unknown role "${name}" skipped`);
        continue;
      }
      out.push({
        id: target.id,
        type: name === '@bot' ? 1 : 0,
        allow: perms(o.allow, (m) => this.warn(m)),
        deny: perms(o.deny, (m) => this.warn(m)),
      });
    }
    return out;
  }

  // ──────────────────────────── channels ──────────────────────────
  findChannel(name) {
    return (
      this.channels.get(norm(name)) ||
      this.guild.channels.cache.get(name) ||
      this.guild.channels.cache.find((c) => norm(c.name) === norm(name))
    );
  }

  hasCommunity() {
    return this.guild.features.includes(GuildFeature.Community);
  }

  async buildChannels(secondPass) {
    const cats = this.t.categories || [];
    if (!secondPass) this.log.info(`Channels: ${cats.length} categories in template`);
    let catPos = 0;
    // Uncategorised channels (top-level "channels" array) come first.
    if (this.t.channels?.length) {
      for (const [i, c] of this.t.channels.entries()) await this.channel(c, null, {}, i, secondPass);
    }
    for (const cat of cats) {
      let category = this.channels.get('category:' + norm(cat.name));
      const catPerms = cat.permissions || {};
      if (!secondPass) {
        category = await this.upsert(
          { name: cat.name, type: 'category', permissions: catPerms },
          null,
          {},
        );
        if (category) {
          this.channels.set('category:' + norm(cat.name), category);
          this.order.push({ channel: category.id, position: catPos++ });
        }
      }
      if (!category) continue;
      for (const [i, c] of (cat.channels || []).entries()) await this.channel(c, category, catPerms, i, secondPass);
    }
  }

  async channel(def, parent, parentPerms, index, secondPass) {
    const type = channelType(def.type);
    const special = FALLBACK[type] !== undefined;
    // Pass 1: everything that never needs Community. Pass 2: announcement/stage/forum/media.
    if (special !== secondPass) return;
    const ch = await this.upsert(def, parent, parentPerms);
    if (ch) {
      this.channels.set(norm(def.name), ch);
      this.order.push({ channel: ch.id, parent: parent?.id ?? null, position: index });
    }
  }

  channelData(def, type, parentPerms) {
    const g = this.guild;
    const merged = mergePerms(parentPerms, def.permissions);
    const data = {
      name: fill(def.name, g),
      type,
      permissionOverwrites: this.overwrites(merged),
      reason: 'Server Builder',
    };
    const voice = VOICE_TYPES.includes(type);
    if (type === ChannelType.GuildCategory) return data;
    if (!voice && def.topic !== undefined) data.topic = fill(def.topic, g).slice(0, type === ChannelType.GuildForum || type === ChannelType.GuildMedia ? 4096 : 1024);
    if (def.nsfw !== undefined) data.nsfw = !!def.nsfw;
    if (def.slowmode !== undefined) data.rateLimitPerUser = def.slowmode;
    if (voice) {
      if (def.bitrate) data.bitrate = Math.min(def.bitrate, MAX_BITRATE[g.premiumTier] ?? 96000);
      if (def.userLimit !== undefined) data.userLimit = def.userLimit;
      if (def.rtcRegion !== undefined) data.rtcRegion = def.rtcRegion;
    }
    if (def.autoArchive) data.defaultAutoArchiveDuration = def.autoArchive;
    if (type === ChannelType.GuildForum || type === ChannelType.GuildMedia) {
      if (def.tags) {
        data.availableTags = def.tags.slice(0, 20).map((t) =>
          typeof t === 'string'
            ? { name: t }
            : { name: t.name, moderated: !!t.moderated, emoji: t.emoji ? { id: null, name: t.emoji } : null },
        );
      }
      if (def.defaultReaction) data.defaultReactionEmoji = { id: null, name: def.defaultReaction };
      if (def.sortOrder) data.defaultSortOrder = enumValue(SortOrderType, def.sortOrder);
      if (def.layout && type === ChannelType.GuildForum) data.defaultForumLayout = enumValue(ForumLayoutType, def.layout);
      if (def.threadSlowmode !== undefined) data.defaultThreadRateLimitPerUser = def.threadSlowmode;
    }
    return data;
  }

  async upsert(def, parent, parentPerms) {
    const g = this.guild;
    let type = channelType(def.type);
    if (FALLBACK[type] !== undefined && !this.hasCommunity() && type !== ChannelType.GuildForum) {
      this.warn(`#${def.name}: ${CHANNEL_TYPE_NAMES[type]} channels need Community — creating as ${CHANNEL_TYPE_NAMES[FALLBACK[type]]} instead`);
      type = FALLBACK[type];
    }
    const label = type === ChannelType.GuildCategory ? `category ${def.name}` : `#${def.name}`;
    const parentId = parent?.id ?? null;
    const compatible = (c) => c.type === type || FALLBACK[type] === c.type || FALLBACK[c.type] === type;
    const candidates = g.channels.cache.filter(
      (c) => !c.isThread() && !this.claimed.has(c.id) && compatible(c) && norm(c.name) === norm(fill(def.name, g)),
    );
    const existing = candidates.find((c) => (c.parentId ?? null) === parentId) || candidates.first();
    const data = this.channelData(def, type, parentPerms);

    if (existing) {
      this.claimed.add(existing.id);
      const edit = { ...data, parent: parentId, lockPermissions: false };
      delete edit.type;
      if (existing.type !== type && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(existing.type) &&
          [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(type)) {
        edit.type = type; // text <-> announcement conversion is allowed
      }
      if (edit.availableTags && existing.availableTags) {
        // keep tag ids so existing posts keep their tags
        edit.availableTags = edit.availableTags.map((t) => ({ ...t, id: existing.availableTags.find((x) => x.name === t.name)?.id }));
      }
      if (type === ChannelType.GuildCategory) delete edit.parent;
      const ch = await this.step(`Updated ${label}`, () => existing.edit(edit), { quiet: true });
      if (ch) this.stats.updated++;
      return ch || existing;
    }

    const create = { ...data };
    if (parentId) create.parent = parentId;
    try {
      const ch = await g.channels.create(create);
      this.claimed.add(ch.id);
      this.stats.created++;
      this.log.info(`Created ${label}`);
      return ch;
    } catch (e) {
      const fb = FALLBACK[type];
      if (fb === undefined) {
        this.stats.failed++;
        this.log.error(`Create ${label} — FAILED: ${e.message}`);
        return null;
      }
      this.warn(`${label}: could not create as ${CHANNEL_TYPE_NAMES[type]} (${e.message}) — retrying as ${CHANNEL_TYPE_NAMES[fb]}`);
      return this.upsert({ ...def, type: fb }, parent, parentPerms);
    }
  }

  async orderChannels() {
    if (!this.order.length) return;
    await this.step('Ordered categories and channels', () =>
      this.guild.channels.setPositions(
        this.order.map((o) => (o.parent !== undefined ? { channel: o.channel, position: o.position, parent: o.parent, lockPermissions: false } : o)),
      ),
    );
  }

  // ─────────────────────────── community ──────────────────────────
  async enableCommunity() {
    const s = this.t.settings || {};
    const g = this.guild;
    if (!s.community || this.hasCommunity()) return;
    const rules = this.findChannel(s.rulesChannel || 'rules');
    const updates = this.findChannel(s.publicUpdatesChannel || 'mod-updates');
    if (!rules || !updates || rules.type !== ChannelType.GuildText || updates.type !== ChannelType.GuildText) {
      this.warn('Community not enabled: template needs text channels for settings.rulesChannel and settings.publicUpdatesChannel');
      return;
    }
    const level = Math.max(g.verificationLevel, GuildVerificationLevel.Low);
    await this.step('Enabled the Community feature (announcement, stage & forum channels, welcome screen)', async () => {
      await g.edit({
        features: [...new Set([...g.features, GuildFeature.Community])],
        verificationLevel: level,
        explicitContentFilter: GuildExplicitContentFilter.AllMembers,
        rulesChannel: rules,
        publicUpdatesChannel: updates,
      });
      await g.fetch();
    });
  }

  async welcomeScreen() {
    const w = this.t.welcomeScreen;
    if (!w || !this.hasCommunity()) return;
    const welcomeChannels = (w.channels || [])
      .map((c) => ({ channel: this.findChannel(c.channel)?.id, description: c.description, emoji: c.emoji }))
      .filter((c) => c.channel)
      .slice(0, 5);
    await this.step('Configured the welcome screen', () =>
      this.guild.editWelcomeScreen({ enabled: w.enabled !== false, description: fill(w.description || '', this.guild), welcomeChannels }),
    );
  }

  // ──────────────────────────── automod ───────────────────────────
  async automod() {
    const rules = this.t.automod || [];
    if (!rules.length) return;
    const g = this.guild;
    const existing = await g.autoModerationRules.fetch().catch(() => null);
    if (!existing) return this.warn('Could not read AutoMod rules (missing Manage Server?) — skipped');
    for (const r of rules) {
      const data = automodData(r, (n) => this.findChannel(n), (n) => this.role(n));
      const triggerType = data.triggerType;
      const found = existing.find((x) => x.name === r.name) || existing.find((x) => x.triggerType === triggerType && triggerType !== AutoModerationRuleTriggerType.Keyword);
      if (found) {
        delete data.triggerType;
        const ok = await this.step(`Updated AutoMod rule "${r.name}"`, () => found.edit(data));
        if (ok) this.stats.updated++;
      } else {
        const ok = await this.step(`Created AutoMod rule "${r.name}"`, () => g.autoModerationRules.create(data));
        if (ok) this.stats.created++;
      }
    }
  }

  // ─────────────────────── bot welcome config ─────────────────────
  botConfig() {
    const b = this.t.bot;
    if (!b) return;
    const g = this.guild;
    const cfg = store.guild(g.id);
    const patch = {};
    for (const k of ['welcome', 'goodbye']) {
      if (!b[k]) continue;
      patch[k] = { ...cfg[k], ...b[k], message: fill(b[k].message, g), channelId: this.findChannel(b[k].channel)?.id ?? null };
      delete patch[k].channel;
    }
    if (b.autoRoles) patch.autoRoles = b.autoRoles.map((n) => this.role(n)?.id).filter(Boolean);
    if (b.logChannel) patch.logChannelId = this.findChannel(b.logChannel)?.id ?? null;
    store.setGuild(g.id, patch);
    this.log.info('Saved bot settings (welcome / goodbye / auto-roles / log channel)');
  }

  // ─────────────────────────── messages ───────────────────────────
  async messages() {
    const list = this.t.messages || [];
    if (!list.length) return;
    const g = this.guild;
    const cfg = store.guild(g.id);
    cfg.templateMessages ??= {};
    for (const [i, m] of list.entries()) {
      const key = `${this.t.id || this.t.name}:${m.key || i}`;
      const ch = this.findChannel(m.channel);
      if (!ch || !ch.isTextBased?.()) {
        this.warn(`Message for #${m.channel} skipped: channel not found or not a text channel`);
        continue;
      }
      const payload = {
        content: m.content ? fill(m.content, g) : undefined,
        embeds: (m.embeds || []).map((e) => embed(e, g)),
        components: buildRows(m.buttons, g, (w) => this.warn(w)),
        allowedMentions: { parse: [] },
      };
      if (!payload.content) delete payload.content;
      const prevId = cfg.templateMessages[key];
      let prev = null;
      if (prevId) prev = await ch.messages.fetch(prevId).catch(() => null);
      if (prev) {
        const ok = await this.step(`Updated message in #${ch.name}`, () => prev.edit(payload));
        if (ok) this.stats.updated++;
      } else {
        const msg = await this.step(`Posted message in #${ch.name}`, () => ch.send(payload));
        if (msg) {
          this.stats.created++;
          cfg.templateMessages[key] = msg.id;
          if (m.pin) await msg.pin().catch(() => {});
          if (m.publish && ch.type === ChannelType.GuildAnnouncement) await msg.crosspost().catch(() => {});
        }
      }
    }
    store.setGuild(g.id, { templateMessages: cfg.templateMessages });
  }
}

/** Template-style AutoMod rule -> discord.js AutoModerationRuleCreateOptions. */
function automodData(r, findChannel, findRole) {
  const triggerType = enumValue(AutoModerationRuleTriggerType, r.trigger);
  const md = r.metadata || {};
  const T = AutoModerationRuleTriggerType;
  const triggerMetadata = {};
  // Only send the metadata that belongs to this trigger type.
  if (triggerType === T.Keyword || triggerType === T.MemberProfile) {
    triggerMetadata.keywordFilter = md.keywords || [];
    triggerMetadata.regexPatterns = md.regex || [];
    triggerMetadata.allowList = md.allow || [];
  } else if (triggerType === T.KeywordPreset) {
    triggerMetadata.presets = (md.presets || []).map((p) => enumValue(AutoModerationRuleKeywordPresetType, p));
    triggerMetadata.allowList = md.allow || [];
  } else if (triggerType === T.MentionSpam) {
    triggerMetadata.mentionTotalLimit = Number(md.mentionLimit) || 5;
    triggerMetadata.mentionRaidProtectionEnabled = !!md.raidProtection;
  }
  const actions = (r.actions?.length ? r.actions : [{ type: 'BlockMessage' }])
    .map((a) => {
      const metadata = {};
      if (a.message) metadata.customMessage = a.message;
      if (a.channel) metadata.channel = findChannel(a.channel);
      if (a.seconds) metadata.durationSeconds = a.seconds;
      return { type: enumValue(AutoModerationActionType, a.type), metadata };
    })
    .filter((a) => a.type !== AutoModerationActionType.SendAlertMessage || a.metadata.channel);
  return {
    name: r.name,
    eventType: enumValue(AutoModerationRuleEventType, r.event || (triggerType === T.MemberProfile ? 'MemberUpdate' : 'MessageSend')),
    triggerType,
    triggerMetadata,
    actions,
    enabled: r.enabled !== false,
    exemptRoles: (r.exemptRoles || []).map((n) => findRole(n)?.id).filter(Boolean),
    exemptChannels: (r.exemptChannels || []).map((n) => findChannel(n)?.id).filter(Boolean),
    reason: 'Server Builder',
  };
}

async function applyTemplate(guild, template, opts = {}, log) {
  return new Build(guild, template, opts, log).run();
}

// ───────────────────────────── export ─────────────────────────────
async function exportGuild(guild) {
  await guild.fetch();
  await guild.roles.fetch();
  await guild.channels.fetch();
  const roleName = (id) => (id === guild.id ? '@everyone' : guild.roles.cache.get(id)?.name);
  const ow = (ch) => {
    const out = {};
    for (const o of ch.permissionOverwrites.cache.values()) {
      if (o.type !== 0) continue;
      const name = roleName(o.id);
      if (!name) continue;
      const allow = permNames(o.allow.bitfield);
      const deny = permNames(o.deny.bitfield);
      if (!allow.length && !deny.length) continue;
      out[name] = {};
      if (allow.length) out[name].allow = allow;
      if (deny.length) out[name].deny = deny;
    }
    return out;
  };
  const chDef = (ch) => {
    const d = { name: ch.name, type: CHANNEL_TYPE_NAMES[ch.type] || 'text' };
    if (ch.topic) d.topic = ch.topic;
    if (ch.nsfw) d.nsfw = true;
    if (ch.rateLimitPerUser) d.slowmode = ch.rateLimitPerUser;
    if (ch.bitrate && ch.bitrate !== 64000) d.bitrate = ch.bitrate;
    if (ch.userLimit) d.userLimit = ch.userLimit;
    if (ch.availableTags?.length) d.tags = ch.availableTags.map((t) => ({ name: t.name, emoji: t.emoji?.name || undefined, moderated: t.moderated || undefined }));
    if (ch.defaultReactionEmoji?.name) d.defaultReaction = ch.defaultReactionEmoji.name;
    if (!ch.parent || !ch.permissionsLocked) {
      const p = ow(ch);
      if (Object.keys(p).length) d.permissions = p;
    }
    return d;
  };
  const sortCh = (a, b) =>
    (VOICE_TYPES.includes(a.type) ? 1 : 0) - (VOICE_TYPES.includes(b.type) ? 1 : 0) || a.rawPosition - b.rawPosition;
  const all = [...guild.channels.cache.values()].filter((c) => !c.isThread());
  const cats = all.filter((c) => c.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition);
  const automod = await guild.autoModerationRules.fetch().catch(() => null);
  const chName = (id) => guild.channels.cache.get(id)?.name;

  const t = {
    name: `${guild.name} (export)`,
    description: `Exported from ${guild.name} on ${new Date().toISOString().slice(0, 10)}`,
    settings: {
      name: guild.name,
      description: guild.description || undefined,
      verificationLevel: enumName(GuildVerificationLevel, guild.verificationLevel),
      defaultMessageNotifications: enumName(GuildDefaultMessageNotifications, guild.defaultMessageNotifications),
      explicitContentFilter: enumName(GuildExplicitContentFilter, guild.explicitContentFilter),
      preferredLocale: guild.preferredLocale,
      community: guild.features.includes(GuildFeature.Community),
      rulesChannel: chName(guild.rulesChannelId),
      publicUpdatesChannel: chName(guild.publicUpdatesChannelId),
      systemChannel: chName(guild.systemChannelId),
      afkChannel: chName(guild.afkChannelId),
      afkTimeout: guild.afkTimeout,
    },
    everyone: { permissions: permNames(guild.roles.everyone.permissions.bitfield) },
    roles: [...guild.roles.cache.values()]
      .filter((r) => r.id !== guild.id && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map((r) => {
        const d = { name: r.name, color: hex(r.color), permissions: permNames(r.permissions.bitfield) };
        if (r.hoist) d.hoist = true;
        if (r.mentionable) d.mentionable = true;
        if (r.unicodeEmoji) d.unicodeEmoji = r.unicodeEmoji;
        return d;
      }),
    channels: all.filter((c) => !c.parentId && c.type !== ChannelType.GuildCategory).sort(sortCh).map(chDef),
    categories: cats.map((cat) => {
      const d = { name: cat.name };
      const p = ow(cat);
      if (Object.keys(p).length) d.permissions = p;
      d.channels = all.filter((c) => c.parentId === cat.id).sort(sortCh).map(chDef);
      return d;
    }),
  };
  if (automod?.size) {
    t.automod = automod.map((r) => ({
      name: r.name,
      trigger: enumName(AutoModerationRuleTriggerType, r.triggerType),
      enabled: r.enabled,
      metadata: {
        keywords: r.triggerMetadata.keywordFilter?.length ? r.triggerMetadata.keywordFilter : undefined,
        regex: r.triggerMetadata.regexPatterns?.length ? r.triggerMetadata.regexPatterns : undefined,
        allow: r.triggerMetadata.allowList?.length ? r.triggerMetadata.allowList : undefined,
        presets: r.triggerMetadata.presets?.length ? r.triggerMetadata.presets.map((p) => enumName(AutoModerationRuleKeywordPresetType, p)) : undefined,
        mentionLimit: r.triggerMetadata.mentionTotalLimit || undefined,
      },
      actions: r.actions.map((a) => ({
        type: enumName(AutoModerationActionType, a.type),
        channel: a.metadata.channelId ? chName(a.metadata.channelId) : undefined,
        seconds: a.metadata.durationSeconds || undefined,
        message: a.metadata.customMessage || undefined,
      })),
      exemptRoles: r.exemptRoles.map((x) => x.name),
      exemptChannels: r.exemptChannels.map((x) => x.name),
    }));
  }
  if (!t.channels.length) delete t.channels;
  return JSON.parse(JSON.stringify(t)); // strip undefined
}

module.exports = { applyTemplate, exportGuild, automodData };
