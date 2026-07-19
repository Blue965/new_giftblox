const { EmbedBuilder } = require('discord.js');
const db = require('../database/db.js');

module.exports = {
  name: 'profile',
  description: 'Voir ton profil détaillé',
  async execute(interaction) {
    const userData = db.getOrCreateUser(interaction.user.id, interaction.user.username);
    const badges = db.getUserBadges(interaction.user.id);
    const transactions = db.getUserTransactions(interaction.user.id, 5);
    const unlocked = badges.filter(b => b.unlocked).length;
    const recent = transactions.map(t => `${t.type === 'earn' ? '🟢' : '🔴'} ${Math.abs(t.amount)} pts${t.description ? ' — ' + t.description : ''}`).join('\n') || 'Aucune activité';
    const xpForNext = userData.level * 120;
    const prog = ((userData.xp / xpForNext) * 100).toFixed(1);
    const progressBar = '█'.repeat(Math.round(prog / 10)) + '░'.repeat(10 - Math.round(prog / 10));

    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle(`Profil ${interaction.user.username}`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription(`Niveau ${userData.level} | ${userData.points.toLocaleString()} points`)
      .addFields(
        { name: '📊 Progression', value: `${progressBar} ${prog}%`, inline: false },
        { name: '💰 Points', value: `${userData.points.toLocaleString()}`, inline: true },
        { name: '⭐ Niveau', value: `${userData.level}`, inline: true },
        { name: '🔥 Streak', value: `${userData.daily_streak} jours`, inline: true },
        { name: '🏅 Badges', value: `${unlocked}/${badges.length}`, inline: true },
        { name: '📋 Tâches', value: `${userData.tasks_completed}`, inline: true },
        { name: '👥 Parrainages', value: `${userData.invite_count}`, inline: true },
        { name: '📌 Activité récente', value: recent || 'Aucune', inline: false }
      )
      .setFooter({ text: 'GiftBlox' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
};
