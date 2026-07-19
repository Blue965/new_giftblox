const { EmbedBuilder } = require('discord.js');
const db = require('../database/db.js');

module.exports = {
  name: 'redeem',
  description: 'Utiliser un code de parrainage',
  async execute(interaction) {
    const code = interaction.options.getString('code').toUpperCase();
    const result = db.useReferralCode(code, interaction.user.id);
    if (!result) return interaction.reply({ content: '❌ Code invalide ou déjà utilisé.', ephemeral: true });
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('🎉 Code utilisé !')
      .setDescription(`Tu as reçu **50** points et le parrain a reçu **100** points.`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: 'GiftBlox' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
};
