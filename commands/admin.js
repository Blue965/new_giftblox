const { EmbedBuilder } = require('discord.js');
const db = require('../database/db.js');

module.exports = {
  name: 'admin',
  description: 'Commandes administrateur',
  async execute(interaction) {
    if (interaction.user.id !== '1527668994210005002') {
      return interaction.reply({ content: '⛔ Accès refusé. Tu n\'es pas le propriétaire.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount') || interaction.options.getInteger('level');

    if (sub === 'addpoints') {
      db.addPoints(target.id, amount, 'Admin: ajout de points');
      const embed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle('✅ Points ajoutés')
        .setDescription(`${amount} points ajoutés à ${target.username}`)
        .setFooter({ text: 'GiftBlox Admin' })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } else if (sub === 'removepoints') {
      db.addPoints(target.id, -amount, 'Admin: retrait de points');
      const embed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle('🔴 Points retirés')
        .setDescription(`${amount} points retirés à ${target.username}`)
        .setFooter({ text: 'GiftBlox Admin' })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } else if (sub === 'setlevel') {
      const user = db.getOrCreateUser(target.id, target.username);
      await interaction.reply({ content: `✅ Niveau de ${target.username} modifié.` });
    } else if (sub === 'givexp') {
      const updated = db.addXP(target.id, amount);
      if (!updated) return interaction.reply({ content: '❌ Erreur.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle('⚡ XP donné')
        .setDescription(`${amount} XP donnés à ${target.username} (maintenant niv. ${updated.level})`)
        .setFooter({ text: 'GiftBlox Admin' })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }
  }
};
