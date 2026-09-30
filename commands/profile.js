const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Ton profil complet : niveau, badges, historique')
    .addUserOption((o) => o.setName('membre').setDescription('Membre à regarder (toi par défaut)').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('membre') || interaction.user;
    const isSelf = target.id === interaction.user.id;

    const user = db.getOrCreateUser(target.id, target.username);
    // getUserBadges renvoie TOUS les badges avec un flag `unlocked`
    const badges = (db.getUserBadges(target.id) || []).filter((b) => b.unlocked);
    const transactions = db.getUserTransactions(target.id, 5);
    const quests = db.getUserQuests(target.id) || [];

    const done = quests.filter((q) => q.status === 'completed' || q.completed).length;
    const xpNeeded = user.level * 120;

    const fields = [
      { name: `${ui.EMOJI.star} Niveau`, value: `**${user.level}** — ${ui.rankName(user.level)}`, inline: true },
      { name: `${ui.EMOJI.coin} Points`, value: `**${ui.fmt(user.points)}**`, inline: true },
      { name: `${ui.EMOJI.fire} Streak`, value: `**${user.daily_streak}** jour(s)`, inline: true },
      { name: `${ui.EMOJI.bolt} Progression XP`, value: `${ui.bar(user.xp, xpNeeded)}\n**${ui.fmt(user.xp)}** / **${ui.fmt(xpNeeded)}** XP`, inline: false },
    ];

    if (badges.length) {
      fields.push({
        name: `🏅 Badges débloqués (${badges.length})`,
        value: badges.map((b) => `• **${b.name}**`).join('\n'),
      });
    } else {
      fields.push({
        name: '🏅 Badges',
        value: '_Aucun badge pour l\'instant — continue avec /daily et /leaderboard._',
      });
    }

    if (quests.length) {
      fields.push({
        name: `${ui.EMOJI.chart} Quêtes`,
        value: `**${done}** / ${quests.length} terminées`,
      });
    }

    if (transactions.length && isSelf) {
      fields.push({
        name: '🧾 Dernières activités',
        value: transactions
          .map((t) => `• \`${t.amount > 0 ? '+' : ''}${t.amount}\` ${t.description || t.type}`)
          .join('\n'),
      });
    }

    await interaction.reply({
      embeds: [ui.embed({
        title: `${ui.EMOJI.cube} Profil de ${target.username}`,
        description: isSelf
          ? 'Voici toutes tes stats GiftBlox.'
          : `Profil public de **${target.username}**.`,
        fields,
        thumb: ui.avatar(target),
        color: ui.C.primary,
        footer: isSelf ? 'Gagne des points avec /daily et /transfer' : `Demandé par ${interaction.user.username}`,
      })],
      ephemeral: !isSelf,
    });
  },
};