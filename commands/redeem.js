const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Utiliser le code de parrainage d\'un ami')
    .addStringOption((o) => o
      .setName('code')
      .setDescription('Le code reçu de ton ami')
      .setRequired(true)),

  cooldown: 5,

  async execute(interaction) {
    const code = interaction.options.getString('code', true).trim().toUpperCase();
    db.getOrCreateUser(interaction.user.id, interaction.user.username);

    const ref = db.useReferralCode(code, interaction.user.id);

    if (!ref) {
      return ui.fail(
        interaction,
        `Le code **${code}** est invalide ou déjà utilisé.`,
        'Vérifie le code auprès de ton ami avec `/invites`'
      );
    }

    const after = db.getOrCreateUser(interaction.user.id, interaction.user.username);

    await interaction.reply({
      embeds: [ui.ok({
        title: `${ui.EMOJI.gift} Code validé !`,
        description: [
          `Bienvenue ! Ton parrainage avec le code **${code}** est enregistré.`,
          '',
          `**+50 points** ajoutés à ton compte.`,
          `**Nouveau solde :** ${ui.fmt(after.points)} points`,
        ].join('\n'),
        color: ui.C.pink,
        footer: 'Continue avec /daily pour garder ta série',
      })],
    });
  },
};