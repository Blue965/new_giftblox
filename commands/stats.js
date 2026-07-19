const { EmbedBuilder } = require('discord.js');
const db = require('../database/db.js');

module.exports = {
  name: 'stats',
  description: 'Statistiques du serveur',
  async execute(interaction) {
    const gs = db.getGlobalStats();
    const top = db.getLeaderboard(5);
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('📊 Statistiques')
      .addFields(
        { name: '👥 Total membres', value: `${gs.totalUsers}`, inline: true },
        { name: '💰 Total points', value: `${gs.totalPoints.toLocaleString()}`, inline: true },
        { name: '📋 Transactions', value: `${gs.totalTransactions.toLocaleString()}`, inline: true },
        { name: '🎫 Tickets ouverts', value: `${gs.ticketsOpen}`, inline: true },
        { name: '🏆 Top 5', value: top.map((u, i) => `${i + 1}. ${u.username} — ${u.points.toLocaleString()} pts`).join('\n') || 'Aucun' }
      )
      .setFooter({ text: 'GiftBlox' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
};
