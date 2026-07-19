const { EmbedBuilder } = require('discord.js');
const db = require('../database/db.js');

module.exports = {
  name: 'transfer',
  description: 'Transférer des points à un autre utilisateur',
  async execute(interaction) {
    await interaction.deferReply();
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    if (amount <= 0) return interaction.editReply('Montant invalide.');
    const sender = db.getOrCreateUser(interaction.user.id, interaction.user.username);
    if (sender.points < amount) return interaction.editReply('Tu n\'as pas assez de points.');
    db.addPoints(interaction.user.id, -amount, `Transfert à ${target.username}`);
    db.addPoints(target.id, amount, `Transfert de ${interaction.user.username}`);
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('📤 Transfert')
      .setDescription(`${interaction.user.username} a envoyé **${amount}** points à ${target.username}`)
      .setFooter({ text: 'GiftBlox' })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  }
};
