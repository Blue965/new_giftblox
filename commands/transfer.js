const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

const MIN = 1;
const MAX = 1000000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Envoyer des points à un autre membre')
    .addUserOption((o) => o.setName('membre').setDescription('Membre qui recevra les points').setRequired(true))
    .addIntegerOption((o) => o
      .setName('montant')
      .setDescription('Nombre de points à envoyer')
      .setMinValue(MIN)
      .setMaxValue(MAX)
      .setRequired(true)),

  cooldown: 10,

  async execute(interaction) {
    const target = interaction.options.getUser('membre');
    const amount = interaction.options.getInteger('montant');

    if (target.id === interaction.user.id) {
      return ui.fail(interaction, 'Tu ne peux pas t\'envoyer des points à toi-même.');
    }
    if (target.bot) {
      return ui.fail(interaction, 'Ce membre est un bot, il ne peut pas recevoir de points.');
    }

    const sender = db.getOrCreateUser(interaction.user.id, interaction.user.username);

    if (sender.points < amount) {
      return ui.fail(
        interaction,
        `Tu n'as que **${ui.fmt(sender.points)} points** alors que tu veux en envoyer **${ui.fmt(amount)}**.`,
        'Réclame ta récompense avec /daily'
      );
    }

    db.addPoints(interaction.user.id, -amount, `Transfert vers ${target.username}`);
    // La ligne doit exister avant l'UPDATE, sinon les points sont perdus
    db.getOrCreateUser(target.id, target.username);
    db.addPoints(target.id, amount, `Transfert de ${interaction.user.username}`);
    db.createNotification(target.id, `+${amount} points`, `${interaction.user.username} t'a envoyé des points.`, 'reward');

    await interaction.reply({
      embeds: [ui.ok({
        title: `${ui.EMOJI.arrow} Transfert envoyé`,
        description: [
          `**-${ui.fmt(amount)}** points`,
          `**+${ui.fmt(amount)}** points pour **${target.username}**`,
        ].join('\n'),
        thumb: ui.avatar(target),
      })],
    });
  },
};