const { EmbedBuilder } = require('discord.js');
const db = require('../database/db.js');

module.exports = {
  name: 'points',
  description: 'Voir tes points et ton niveau',
  async execute(interaction) {
    const user = db.getOrCreateUser(interaction.user.id, interaction.user.username);
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
      .setTitle('💰 Portefeuille')
      .setDescription(`**${user.points.toLocaleString()}** points`)
      .addFields(
        { name: '⭐ Niveau', value: `${user.level}`, inline: true },
        { name: '📊 XP', value: `${user.xp} / ${user.level * 120}`, inline: true },
        { name: '🔥 Streak', value: `${user.daily_streak} jours`, inline: true }
      )
      .setFooter({ text: 'GiftBlox' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
};
