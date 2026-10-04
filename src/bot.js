// Discord client: login (with a fallback if privileged intents are not enabled),
// role buttons, welcome / goodbye messages, auto-roles and a server log channel.
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  MessageFlags,
  ActivityType,
} = require('discord.js');
const log = require('./logger');
const store = require('./store');
const { enumValue } = require('./util');

const PRIVILEGED = [GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.MessageContent];
const ALL_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildExpressions,
  GatewayIntentBits.GuildIntegrations,
  GatewayIntentBits.GuildWebhooks,
  GatewayIntentBits.GuildInvites,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.GuildScheduledEvents,
  GatewayIntentBits.AutoModerationConfiguration,
  GatewayIntentBits.AutoModerationExecution,
  GatewayIntentBits.DirectMessages,
  ...PRIVILEGED,
];

const state = { client: null, privileged: true, error: null };

function makeClient(intents) {
  const client = new Client({
    intents,
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User, Partials.Reaction],
  });
  wire(client);
  return client;
}

async function start() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    state.error = 'DISCORD_TOKEN is missing from .env';
    log.error(state.error);
    return null;
  }
  try {
    state.client = makeClient(ALL_INTENTS);
    await state.client.login(token);
  } catch (e) {
    if (/disallowed intents/i.test(e.message)) {
      log.warn('Privileged intents are not enabled in the Developer Portal. Starting with limited intents.');
      log.warn('Fix: discord.com/developers → your app → Bot → enable SERVER MEMBERS, PRESENCE and MESSAGE CONTENT intents, then restart.');
      state.privileged = false;
      state.client.destroy();
      state.client = makeClient(ALL_INTENTS.filter((i) => !PRIVILEGED.includes(i)));
      try {
        await state.client.login(token);
      } catch (e2) {
        state.error = e2.message;
        log.error('Login failed:', e2.message);
      }
    } else {
      state.error = e.message;
      log.error('Login failed:', e.message, '— check DISCORD_TOKEN in .env');
    }
  }
  return state.client;
}

function fillWelcome(text, member) {
  return String(text || '')
    .replace(/\{user\}/g, `<@${member.id}>`)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{tag\}/g, member.user.tag)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{count\}/g, String(member.guild.memberCount));
}

async function sendLog(guild, embed) {
  const id = store.guild(guild.id).logChannelId;
  if (!id) return;
  const ch = guild.channels.cache.get(id);
  if (ch?.isTextBased()) await ch.send({ embeds: [embed] }).catch(() => {});
}

function applyPresence(client) {
  const p = store.get().presence;
  if (!p) return;
  try {
    client.user.setPresence({
      status: p.status || 'online',
      activities: p.text ? [{ name: p.text, type: enumValue(ActivityType, p.type || 'Playing'), url: p.url || undefined, state: p.type === 'Custom' ? p.text : undefined }] : [],
    });
  } catch (e) {
    log.warn('Could not set presence:', e.message);
  }
}

function wire(client) {
  client.once(Events.ClientReady, (c) => {
    state.error = null;
    log.ok(`Logged in as ${c.user.tag} — in ${c.guilds.cache.size} server(s)`);
    if (!process.env.CLIENT_ID) process.env.CLIENT_ID = c.user.id;
    applyPresence(c);
  });
  client.on(Events.Error, (e) => log.error('Discord client error:', e.message));
  client.on(Events.Warn, (m) => log.warn(m));
  client.on(Events.GuildCreate, (g) => log.ok(`Joined server ${g.name} (${g.id})`));
  client.on(Events.GuildDelete, (g) => log.warn(`Removed from server ${g.name ?? g.id}`));

  // Custom slash commands configured in the panel (Bot Settings → Custom commands).
  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isChatInputCommand() || !i.inGuild()) return;
    const cmd = (store.guild(i.guildId).customCommands || []).find((c) => c.name === i.commandName);
    if (!cmd) return;
    const text = String(cmd.response || '')
      .replace(/\{user\}/g, `<@${i.user.id}>`)
      .replace(/\{username\}/g, i.user.username)
      .replace(/\{server\}/g, i.guild.name);
    const payload = cmd.embed
      ? { embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(cmd.title || null).setDescription(text || '\u200b')] }
      : { content: text || '\u200b' };
    if (cmd.ephemeral) payload.flags = MessageFlags.Ephemeral;
    await i.reply(payload).catch((e) => log.warn(`/${cmd.name} reply failed: ${e.message}`));
  });

  // Role buttons: custom id "mc:role:<toggle|add|remove>:<roleId>"
  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isButton() || !i.customId.startsWith('mc:role:') || !i.inGuild()) return;
    const [, , mode, roleId] = i.customId.split(':');
    try {
      const member = await i.guild.members.fetch(i.user.id);
      const role = i.guild.roles.cache.get(roleId);
      if (!role) return i.reply({ content: 'That role no longer exists.', flags: MessageFlags.Ephemeral });
      const has = member.roles.cache.has(roleId);
      let msg;
      if ((mode === 'toggle' && has) || mode === 'remove') {
        if (has) await member.roles.remove(role, 'Role button');
        msg = `Removed **${role.name}**.`;
      } else {
        if (!has) await member.roles.add(role, 'Role button');
        msg = mode === 'add' && has ? `You already have **${role.name}**.` : `You now have **${role.name}**!`;
      }
      await i.reply({ content: msg, flags: MessageFlags.Ephemeral });
    } catch (e) {
      log.error(`Role button failed in ${i.guild.name}:`, e.message);
      const content = 'I could not change that role. Ask a staff member to move my role above it.';
      if (!i.replied) await i.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    const cfg = store.guild(member.guild.id);
    for (const id of cfg.autoRoles || []) {
      await member.roles.add(id, 'Auto-role').catch((e) => log.warn(`Auto-role failed: ${e.message}`));
    }
    const w = cfg.welcome;
    if (w?.enabled && w.channelId) {
      const ch = member.guild.channels.cache.get(w.channelId);
      if (ch?.isTextBased()) {
        const text = fillWelcome(w.message, member);
        const payload = w.embed
          ? {
              content: `<@${member.id}>`,
              embeds: [
                new EmbedBuilder()
                  .setColor(w.color ? parseInt(String(w.color).replace('#', ''), 16) : 0x5865f2)
                  .setTitle(fillWelcome(w.title || 'Welcome!', member))
                  .setDescription(text)
                  .setThumbnail(member.user.displayAvatarURL()),
              ],
            }
          : { content: text };
        await ch.send(payload).catch((e) => log.warn(`Welcome message failed: ${e.message}`));
      }
    }
    sendLog(member.guild, new EmbedBuilder().setColor(0x57f287).setTitle('Member joined').setDescription(`<@${member.id}> (${member.user.tag})`).setTimestamp());
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    const g = store.guild(member.guild.id).goodbye;
    if (g?.enabled && g.channelId) {
      const ch = member.guild.channels.cache.get(g.channelId);
      if (ch?.isTextBased()) await ch.send({ content: fillWelcome(g.message, member), allowedMentions: { parse: [] } }).catch(() => {});
    }
    sendLog(member.guild, new EmbedBuilder().setColor(0xed4245).setTitle('Member left').setDescription(`${member.user?.tag ?? member.id}`).setTimestamp());
  });

  client.on(Events.MessageDelete, (m) => {
    if (!m.guild || m.author?.bot) return;
    sendLog(m.guild, new EmbedBuilder().setColor(0xfee75c).setTitle('Message deleted')
      .setDescription(`In <#${m.channelId}> by ${m.author ? `<@${m.author.id}>` : 'unknown'}\n${(m.content || '*(no text cached)*').slice(0, 3800)}`).setTimestamp());
  });

  client.on(Events.MessageUpdate, (a, b) => {
    if (!b.guild || b.author?.bot || a.content === b.content || a.content == null) return;
    sendLog(b.guild, new EmbedBuilder().setColor(0x5865f2).setTitle('Message edited')
      .setDescription(`In <#${b.channelId}> by <@${b.author?.id}> — [jump](${b.url})\n**Before:** ${a.content.slice(0, 1800)}\n**After:** ${(b.content || '').slice(0, 1800)}`).setTimestamp());
  });

  client.on(Events.GuildBanAdd, (ban) =>
    sendLog(ban.guild, new EmbedBuilder().setColor(0xed4245).setTitle('Member banned').setDescription(`${ban.user.tag} (${ban.user.id})`).setTimestamp()));
  client.on(Events.GuildBanRemove, (ban) =>
    sendLog(ban.guild, new EmbedBuilder().setColor(0x57f287).setTitle('Member unbanned').setDescription(`${ban.user.tag} (${ban.user.id})`).setTimestamp()));
}

module.exports = { start, state, applyPresence, sendLog };
