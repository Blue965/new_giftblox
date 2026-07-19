const { EmbedBuilder } = require('discord.js');
const db = require('../database/db.js');

module.exports = {
  name: 'buy',
  description: 'Acheter un article de la boutique',
  async execute(interaction) {
    await interaction.deferReply();
    const itemId = interaction.options.getString('item');
    const result = db.buyItem(interaction.user.id, itemId);
    if (!result) return interaction.editReply('❌ Achat impossible. Vérifie tes points ou le stock.');
    db.addXP(interaction.user.id, 5);
    db.checkAndUnlockBadges(interaction.user.id);
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('✅ Achat réussi')
      .setDescription(`Tu as acheté **${result.name}** pour **${result.price.toLocaleString()}** points !`)
      .setFooter({ text: 'GiftBlox' })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }
};
