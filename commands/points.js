const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('points')
    .setDescription('Voir les points et le niveau de quelqu\'un')
    .addUserOption((o) => o.setName('membre').setDescription('Membre à regarder (toi par défaut)').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('membre') || interaction.user;
    const isSelf = target.id === interaction.user.id;

    const user = db.getOrCreateUser(target.id, target.username);
    const xpNeeded = user.level * 120;

    const e = ui.embed({
      title: `${ui.EMOJI.coin} Portefeuille${isSelf ? '' : ` de ${target.username}`}`,
      description: [
        `**${ui.fmt(user.points)}** points`,
        '',
        `${ui.bar(user.xp, xpNeeded)} **${ui.fmt(user.xp)}** / **${ui.fmt(xpNeeded)}** XP`,
      ].join('\n'),
      color: ui.C.primary,
      thumb: ui.avatar(target),
      fields: [
        { name: 'Niveau', value: `**${user.level}**`, inline: true },
        { name: 'Titre', value: `${ui.rankEmoji(user.level)} ${ui.rankName(user.level)}`, inline: true },
        { name: 'Streak', value: `${ui.EMOJI.fire} **${user.daily_streak}** jour(s)`, inline: true },
      ],
      footer: isSelf ? 'Utilise /profile pour le détail complet' : `Demandé par ${interaction.user.username}`,
    });

    await interaction.reply({
      embeds: [e],
      ephemeral: !isSelf,
    });
  },
};