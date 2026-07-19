const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../database/db.js');

module.exports = {
  name: 'help',
  description: 'Menu d\'aide avec catégories',
  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_menu')
        .setPlaceholder('Choisis une catégorie')
        .addOptions(
          { label: '📖 Général', value: 'general', description: 'Commandes générales' },
          { label: '💰 Économie', value: 'economy', description: 'Points, boutique, etc' },
          { label: '🎮 Fun', value: 'fun', description: 'Commandes divertissantes' },
          { label: '⚙️ Admin', value: 'admin', description: 'Commandes pour admins' },
        )
    );
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('📖 Aide GiftBlox')
      .setDescription('Sélectionne une catégorie dans le menu ci-dessous.')
      .setFooter({ text: 'GiftBlox' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], components: [row] });
  }
};
