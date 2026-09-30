const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Ton code de parrainage et tes statistiques'),

  async execute(interaction) {
    db.getOrCreateUser(interaction.user.id, interaction.user.username);

    const ref = db.generateReferralCode(interaction.user.id);
    const stats = db.getReferralStats(interaction.user.id);

    const earned = stats.count * 100;
    const bonus = stats.count * 50;

    await interaction.reply({
      embeds: [ui.embed({
        title: `${ui.EMOJI.users} Ton code de parrainage`,
        description: [
          'Partage ce code à tes amis :',
          '',
          `\`\`\`${ref.code}\`\`\``,
          '',
          `Ils gagnent **+50 points**, toi **+100 points** par parrainage validé.`,
        ].join('\n'),
        fields: [
          { name: `${ui.EMOJI.bolt} Parrainages`, value: `**${stats.count}**`, inline: true },
          { name: `${ui.EMOJI.coin} Gagné via parrainage`, value: `**${ui.fmt(earned)}** pts`, inline: true },
          { name: `${ui.EMOJI.gift} Bonus versés à tes filleuls`, value: `**${ui.fmt(bonus)}** pts`, inline: true },
        ],
        color: ui.C.pink,
        footer: stats.firstReferred ? 'Continue comme ça 🔥' : 'Aucun parrainage pour le moment',
      })],
    });
  },
};