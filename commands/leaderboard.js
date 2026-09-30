const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

const PER_PAGE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Le classement des membres les plus riches en points')
    .addIntegerOption((o) => o
      .setName('page')
      .setDescription('Page du classement')
      .setMinValue(1)
      .setRequired(false)),

  async execute(interaction) {
    const rows = db.getLeaderboard(100);

    if (!rows.length) {
      return interaction.reply({ embeds: [ui.warn({
        title: `${ui.EMOJI.trophy} Classement`,
        description: 'Aucun membre n\'a encore de points. Réclame ta récompense avec `/daily` !',
      })] });
    }

    const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    const page = Math.min(Math.max(1, interaction.options.getInteger('page') || 1), pages);
    const slice = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const medal = ['🥇', '🥈', '🥉'];
    const lines = slice.map((u, i) => {
      const place = (page - 1) * PER_PAGE + i;
      const tag = place < 3 ? medal[place] : `**#${place + 1}**`;
      return `${tag} **${u.username}**\n${ui.bar(Math.min(1, (u.points / (rows[0].points || 1))), 1, 10)} **${ui.fmt(u.points)}** pts · Nv.${u.level} ${ui.rankEmoji(u.level)}`;
    });

    const meIdx = rows.findIndex((u) => u.id === interaction.user.id);

    const fields = [{ name: `Classement — page ${page}/${pages}`, value: lines.join('\n\n') }];

    if (meIdx !== -1) {
      const rank = meIdx + 1;
      fields.push({
        name: `${ui.EMOJI.tag} Ta position`,
        value: `**#${rank}** sur **${rows.length}** membres · **${ui.fmt(rows[meIdx].points)}** points`,
      });
    }

    await interaction.reply({
      embeds: [ui.embed({
        title: `${ui.EMOJI.trophy} Top membres`,
        description: pages > 1 ? `Page **${page}** sur **${pages}** — utilise \`/leaderboard page:${page + 1}\`` : 'Voici le classement complet.',
        fields,
        color: ui.C.warning,
      })],
    });
  },
};