const { EmbedBuilder } = require('discord.js');
const db = require('../database/db.js');

module.exports = {
  name: 'invites',
  description: 'Voir ton code de parrainage',
  async execute(interaction) {
    const stats = db.getReferralStats(interaction.user.id);
    const code = db.getReferralCode(interaction.user.id);
    let desc = code ? `**Code:** \`${code.code}\`\n**Utilisé:** ${stats.used || 0} fois` : 'Pas de code. Fais `/daily` pour en générer un.';
    if (!code) desc += '\n\n👥 Invite des amis avec ton code personnalisé et gagne 100 points par filleul !';
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('👥 Parrainage')
      .setDescription(desc)
      .setFooter({ text: 'GiftBlox' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
};
