// Builds message buttons (role buttons + link buttons) from a simple JSON format:
//   { "label": "Verify", "emoji": "✅", "style": "Success", "role": "Member", "mode": "add" }
//   { "label": "Play Balloon Pump", "url": "https://www.roblox.com/games/..." }
// Role buttons are handled by the bot in bot.js (custom id "mc:role:<mode>:<roleId>").
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { fill, norm, enumValue } = require('./util');

const MODES = ['toggle', 'add', 'remove'];

function buildRows(buttons, guild, warn = () => {}) {
  if (!Array.isArray(buttons) || !buttons.length) return [];
  const built = [];
  for (const b of buttons) {
    const btn = new ButtonBuilder();
    if (b.label) btn.setLabel(fill(String(b.label), guild).slice(0, 80));
    if (b.emoji) btn.setEmoji(b.emoji);
    if (b.url) {
      const url = fill(b.url, guild);
      if (!/^https?:\/\//.test(url)) {
        warn(`Button "${b.label}" skipped: no valid URL (set it in .env or edit the template)`);
        continue;
      }
      btn.setStyle(ButtonStyle.Link).setURL(url);
    } else if (b.role) {
      const role =
        guild.roles.cache.get(b.role) || guild.roles.cache.find((r) => norm(r.name) === norm(b.role));
      if (!role) {
        warn(`Button "${b.label}" skipped: role "${b.role}" not found`);
        continue;
      }
      const mode = MODES.includes(b.mode) ? b.mode : 'toggle';
      btn
        .setCustomId(`mc:role:${mode}:${role.id}`)
        .setStyle(enumValue(ButtonStyle, b.style || 'Secondary'));
    } else {
      warn(`Button "${b.label}" skipped: needs a "role" or a "url"`);
      continue;
    }
    if (!b.label && !b.emoji) btn.setLabel('Button');
    built.push(btn);
  }
  const rows = [];
  for (let i = 0; i < built.length && rows.length < 5; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(built.slice(i, i + 5)));
  }
  return rows;
}

module.exports = { buildRows };
