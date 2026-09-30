const { EmbedBuilder } = require('discord.js');

// Couleurs de la marque (miroir des tokens CSS de giftblox.css)
const C = {
  primary: 0x8b5cf6,
  success: 0x23c99a,
  danger: 0xff4d4d,
  warning: 0xffc93c,
  info: 0x3fa9f5,
  pink: 0xff5c9d,
  neutral: 0x5b5273,
};

const EMOJI = {
  coin: '🪙', gift: '🎁', fire: '🔥', trophy: '🏆', star: '⭐',
  bolt: '⚡', chart: '📊', ticket: '🎫', robot: '🤖', crown: '👑',
  arrow: '➜', lock: '🔒', sparkle: '✨', users: '👥', tag: '🏷️',
  up: '📈', key: '🔑', cube: '🧊', image: '🖼️',
  medal: ['🥇', '🥈', '🥉'],
};

// Titres de niveau, du plus faible au plus fort
const RANKS = [
  [1, 'Novice'], [5, 'Apprenti'], [10, 'Débutant'], [20, 'Intermédiaire'],
  [35, 'Confirmé'], [50, 'Expert'], [75, 'Maître'], [100, 'Grand Maître'], [150, 'Légende'],
];

function rankName(level) {
  let name = RANKS[0][1];
  for (const [min, label] of RANKS) if (level >= min) name = label;
  return name;
}

function rankEmoji(level) {
  if (level >= 100) return '👑';
  if (level >= 50) return '💎';
  if (level >= 25) return '🏅';
  if (level >= 10) return '⭐';
  return '🌱';
}

/**
 * Embed GiftBlox standardisé.
 * Toujours footer + timestamp => coherence sur toutes les commandes.
 */
function embed({ title, description, color = C.primary, fields = [], footer, thumb, url, author }) {
  const e = new EmbedBuilder()
    .setColor(color)
    .setDescription(description)
    .setTimestamp();

  if (title) e.setTitle(title);
  if (author) e.setAuthor(author);
  if (thumb) e.setThumbnail(thumb);
  if (url) e.setURL(url);
  if (fields.length) e.addFields(fields);

  e.setFooter({ text: footer || 'GiftBlox · 100% gratuit' });
  return e;
}

const ok = (o) => embed({ ...o, color: C.success });
const err = (o) => embed({ ...o, color: C.danger });
const warn = (o) => embed({ ...o, color: C.warning });
const info = (o) => embed({ ...o, color: C.info });

/** Réponse d'erreur éphémère, formatée comme le reste. */
function fail(interaction, message, hint) {
  return interaction.reply({
    embeds: [err({ title: '❌ Impossible', description: hint ? `${message}\n*${hint}*` : message })],
    ephemeral: true,
  });
}

/** Barre de progression en blocs Discord (1 argument, aucun alignement à gérer). */
function bar(current, max, size = 12) {
  const maxV = Number(max) || 1;
  const ratio = Math.max(0, Math.min(1, Number(current || 0) / maxV));
  const filled = Math.round(ratio * size);
  return '`█'.repeat(filled) + '░'.repeat(size - filled) + '`';
}

function podium(i) {
  return i < 3 ? EMOJI.medal[i] : `**#${i + 1}**`;
}

function fmt(n) {
  return Number(n || 0).toLocaleString('fr-FR');
}

/** 9000 => "2h 30min", 86400 => "24h" */
function duration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}j ${h}h`;
  if (h) return `${h}h ${m}min`;
  if (m) return `${m}min ${s % 60}s`;
  return `${s}s`;
}

function avatar(user) {
  // Une miniature ne doit jamais faire echouer la commande
  try {
    return user?.displayAvatarURL?.({ size: 256 });
  } catch {
    return undefined;
  }
}

module.exports = {
  C, EMOJI, embed, ok, err, warn, info, fail,
  bar, podium, fmt, duration, avatar, rankName, rankEmoji,
};