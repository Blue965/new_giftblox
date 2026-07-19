const { EmbedBuilder } = require('discord.js');
const db = require('../database/db.js');

module.exports = {
  name: 'daily',
  description: 'Réclamer ta récompense quotidienne',
  cooldown: 86400,
  async execute(interaction) {
    const result = db.claimDaily(interaction.user.id);
    if (!result) return interaction.reply({ content: '⏳ Tu as déjà réclamé aujourd\'hui ! Reviens demain.', ephemeral: true });
    db.addXP(interaction.user.id, 10);
    db.checkAndUnlockBadges(interaction.user.id);
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('🎉 Récompense quotidienne')
      .setDescription(`+ **${result.reward}** points`)
      .addFields({ name: '🔥 Streak', value: `${result.streak} jours`, inline: true })
      .setFooter({ text: 'GiftBlox' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
};
