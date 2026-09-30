const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

const COOLDOWN_MS = 5 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Jouer aux mini-jeux et miser des points')
    .addStringOption((o) => o
      .setName('jeu')
      .setDescription('Le jeu auquel tu veux jouer')
      .setRequired(true)
      .addChoices(
        { name: 'Roulette', value: 'roulette' },
        { name: 'Pile ou Face', value: 'coinflip' },
        { name: 'Dés', value: 'dice' },
        { name: 'Blackjack', value: 'blackjack' },
      ))
    .addIntegerOption((o) => o
      .setName('mise')
      .setDescription('Montant misé en points')
      .setMinValue(5)
      .setMaxValue(100000)
      .setRequired(true)),

  async execute(interaction) {
    const gameKey = interaction.options.getString('jeu');
    const bet = interaction.options.getInteger('mise');

    const user = db.getOrCreateUser(interaction.user.id, interaction.user.username);
    if (user.points < bet) {
      return ui.fail(
        interaction,
        `Tu n'as que **${ui.fmt(user.points)}** points.`,
        `Il te faut ${ui.fmt(bet)} points pour cette mise.`
      );
    }

    const games = db.getMiniGames();
    const game = games.find((g) => g.game_type === gameKey);
    if (!game) {
      return ui.fail(interaction, 'Ce jeu n\'est pas disponible.', `Jeux actifs : ${games.map((g) => g.name).join(', ')}`);
    }
    if (bet < game.min_bet || bet > game.max_bet) {
      return ui.fail(
        interaction,
        `Mise hors limites pour **${game.name}**.`,
        `Mise autorisée : ${ui.fmt(game.min_bet)} – ${ui.fmt(game.max_bet)} points.`
      );
    }

    const result = db.playMiniGame(interaction.user.id, game.id, bet);
    if (!result) {
      return ui.fail(interaction, 'La partie n\'a pas pu être lancée.');
    }

    const won = result.outcome === 'win';
    const push = result.outcome === 'push';
    const after = db.getOrCreateUser(interaction.user.id);

    const net = result.result_amount - bet;
    const sign = net > 0 ? '+' : '';

    const embed = push ? ui.info : won ? ui.ok : ui.err;
    const title = push
      ? `${ui.EMOJI.cube} ${game.name} — Égalité`
      : won
        ? `${ui.EMOJI.sparkle} ${game.name} — Victoire !`
        : `${ui.EMOJI.bolt} ${game.name} — Perdu`;

    return interaction.reply({
      embeds: [embed({
        title,
        description: (result.hand || (won ? 'Tu as gagné !' : 'Perdu cette fois.'))
          + (push ? '\n\n*Mise rendue.*' : ''),
        fields: [
          { name: 'Mise', value: `−${ui.fmt(bet)}`, inline: true },
          { name: push ? 'Rendu' : 'Gagné', value: `+${ui.fmt(result.result_amount)}`, inline: true },
          { name: 'Solde', value: `**${ui.fmt(after.points)}**`, inline: true },
        ],
        thumb: ui.avatar(interaction.user),
        footer: push ? null : `Net : ${sign}${ui.fmt(net)} points`,
      })],
    });
  },
};