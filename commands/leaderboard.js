const { EmbedBuilder } = require('discord.js');
const db = require('../database/db.js');

module.exports = {
  name: 'leaderboard',
  description: 'Affiche le classement des joueurs',
  async execute(interaction) {
    const top = db.getLeaderboard(15);
    const desc = top.map((u, i) => `${['🥇','🥈','🥉'][i] || '#' + (i + 1)} **${u.username}** — ${u.points.toLocaleString()} pts (niv. ${u.level})`).join('\n');
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('🏆 Classement GiftBlox')
      .setDescription(desc)
      .setFooter({ text: 'GiftBlox', iconURL: interaction.client.user.displayAvatarURL() })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
};
