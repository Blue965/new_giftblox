const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('Les meilleurs membres et les meilleurs parrains')
    .addSubcommand((s) => s.setName('points').setDescription('Classement par points')
      .addStringOption((o) => o
        .setName('categorie')
        .setDescription('Quel classement regarder ?')
        .addChoices(
          { name: 'Global', value: 'global' },
          { name: 'Moi', value: 'me' },
        )
        .setRequired(false)))
    .addSubcommand((s) => s.setName('parrainage').setDescription('Classement des meilleurs parrains'))
    .addSubcommand((s) => s.setName('niveaux').setDescription('Qui a le plus haut niveau ?')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'parrainage') {
      const top = db.getTopReferrers(10);
      if (!top.length) return ui.fail(interaction, 'Aucun parrainage enregistré pour le moment.');

      const lines = top.map((r, i) => `${ui.podium(i)} **${r.username}** — **${ui.fmt(r.count)}** parrainage(s)`);
      return interaction.reply({
        embeds: [ui.embed({
          title: `${ui.EMOJI.users} Top parrainage`,
          description: lines.join('\n'),
          color: ui.C.pink,
        })],
      });
    }

    if (sub === 'niveaux') {
      const top = db.getLeaderboard(10)
        .map((u) => ({ ...u, user: db.getOrCreateUser(u.id) }))
        .filter((u) => u.user)
        .sort((a, b) => b.user.level - a.user.level)
        .slice(0, 10);

      if (!top.length) return ui.fail(interaction, 'Aucun membre enregistré.');

      const lines = top.map((u, i) =>
        `${ui.podium(i)} **${u.username}** — ${ui.rankEmoji(u.user.level)} Niveau **${u.user.level}** (${ui.rankName(u.user.level)})`);

      return interaction.reply({
        embeds: [ui.embed({
          title: `${ui.EMOJI.crown} Top niveaux`,
          description: lines.join('\n'),
          color: ui.C.warning,
        })],
      });
    }

    const category = interaction.options.getString('categorie') || 'global';
    const top = db.getLeaderboard(10);

    if (!top.length) return ui.fail(interaction, 'Aucun membre enregistré.');

    if (category === 'me') {
      const me = db.getOrCreateUser(interaction.user.id, interaction.user.username);
      const rank = top.findIndex((u) => u.id === interaction.user.id) + 1;
      return interaction.reply({
        embeds: [ui.embed({
          title: `${ui.EMOJI.tag} Ta position`,
          description: rank
            ? `Tu es **${rank}${rank === 1 ? 'er' : 'e'}** sur **${db.getGlobalStats().totalUsers}** membres.`
            : `Tu n'es pas encore dans le top ${top.length}. Continue à gagner des points !`,
          color: ui.C.primary,
          fields: [
            { name: 'Points', value: `**${ui.fmt(me.points)}**`, inline: true },
            { name: 'Niveau', value: `**${me.level}** — ${ui.rankName(me.level)}`, inline: true },
          ],
          thumb: ui.avatar(interaction.user),
        })],
        ephemeral: true,
      });
    }

    const lines = top.map((u, i) =>
      `${ui.podium(i)} **${u.username}** — **${ui.fmt(u.points)}** pts${u.id === interaction.user.id ? ' *(toi)*' : ''}`);

    return interaction.reply({
      embeds: [ui.embed({
        title: `${ui.EMOJI.medal[0]} Classement général`,
        description: lines.join('\n'),
        color: ui.C.primary,
        footer: `${db.getGlobalStats().totalUsers} membres au total`,
      })],
    });
  },
};