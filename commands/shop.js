const { EmbedBuilder } = require('discord.js');
const db = require('../database/db.js');

module.exports = {
  name: 'shop',
  description: 'Afficher la boutique',
  async execute(interaction) {
    const items = db.getShopItems();
    if (items.length === 0) return interaction.reply({ content: 'Boutique vide pour le moment.', ephemeral: true });
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('🛒 Boutique GiftBlox')
      .setDescription(items.map((item, i) => `${i + 1}. **${item.name}** — ${item.price.toLocaleString()} pts ${item.stock > 0 ? '(stock: ' + item.stock + ')' : '(illimité)'}`).join('\n'))
      .setFooter({ text: 'Utilise /buy <ID> pour acheter. ' + items.length + ' articles disponibles.' });
    await interaction.reply({ embeds: [embed] });
  }
};
