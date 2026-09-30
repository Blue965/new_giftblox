const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Statistiques globales du serveur'),

  async execute(interaction) {
    const stats = db.getGlobalStats();
    const top = db.getLeaderboard(3);

    const podium = top.map((u, i) => {
      const medal = ['🥇', '🥈', '🥉'][i];
      return `${medal} **${u.username}** — ${ui.fmt(u.points)} pts (Nv.${u.level})`;
    }).join('\n') || '_Personne pour le moment._';

    await interaction.reply({
      embeds: [ui.embed({
        title: `${ui.EMOJI.chart} Statistiques GiftBlox`,
        description: 'Vue d\'ensemble de l\'activité sur le serveur.',
        fields: [
          { name: `${ui.EMOJI.users} Membres enregistrés`, value: `**${ui.fmt(stats.totalUsers)}**`, inline: true },
          { name: `${ui.EMOJI.fire} Actifs aujourd'hui`, value: `**${ui.fmt(stats.activeToday)}**`, inline: true },
          { name: `${ui.EMOJI.coin} Points en circulation`, value: `**${ui.fmt(stats.totalPoints)}**`, inline: true },
          { name: `${ui.EMOJI.gift} Articles en boutique`, value: `**${ui.fmt(db.getShopItems().length)}**`, inline: true },
          { name: `${ui.EMOJI.ticket} Tickets ouverts`, value: `**${ui.fmt(stats.ticketsOpen)}**`, inline: true },
          { name: `${ui.EMOJI.up} Serveur actif depuis`, value: `**${stats.serverAge}**`, inline: true },
          { name: `${ui.EMOJI.trophy} Top 3`, value: podium },
        ],
        color: ui.C.info,
        footer: 'Tape /leaderboard pour le classement complet',
      })],
    });
  },
};