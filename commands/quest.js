const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quest')
    .setDescription('Voir tes quêtes et en valider une')
    .addSubcommand((s) => s.setName('list').setDescription('Liste tes quêtes avec leur progression'))
    .addSubcommand((s) => s.setName('complete')
      .setDescription('Valider une quête terminée et Claimer la récompense')
      .addStringOption((o) => o
        .setName('id')
        .setDescription('Identifiant de la quête (visible dans /quest list)')
        .setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const quests = db.getUserQuests(interaction.user.id);
      if (!quests.length) {
        return ui.fail(interaction, 'Aucune quête disponible pour le moment.');
      }

      const lines = quests.slice(0, 10).map((q) => {
        const pct = Math.min(100, Math.round(((q.progress || 0) / q.goal) * 100));
        const state = q.completed ? '✅' : pct >= 100 ? '🎁' : '⏳';
        return `**${state} ${q.title}**\n${ui.bar(q.progress || 0, q.goal)}\n`
          + `${ui.fmt(q.progress || 0)} / ${ui.fmt(q.goal)} · Récompense **+${ui.fmt(q.reward)}** ${q.reward_type}\n`
          + `\`${q.id}\``;
      });

      return interaction.reply({
        embeds: [ui.embed({
          title: `${ui.EMOJI.sparkle} Tes quêtes`,
          description: lines.join('\n\n'),
          color: ui.C.primary,
          footer: `${quests.length} quête(s) au total · valide avec /quest complete`,
        })],
        ephemeral: true,
      });
    }

    const questId = interaction.options.getString('id').trim();
    const known = db.getUserQuests(interaction.user.id).find((q) => q.id === questId);
    if (!known) {
      return ui.fail(interaction, 'Quête introuvable.', 'Utilise `/quest list` pour voir les identifiants.');
    }
    if (known.completed) {
      return ui.fail(interaction, 'Tu as déjà validé cette quête.');
    }

    const result = db.completeQuest(interaction.user.id, questId);
    if (!result) {
      return ui.fail(interaction, 'Impossible de valider cette quête.');
    }

    db.checkAndUnlockAchievements(interaction.user.id);
    const user = db.getOrCreateUser(interaction.user.id, interaction.user.username);

    return interaction.reply({
      embeds: [ui.ok({
        title: `${ui.EMOJI.trophy} Quête validée`,
        description: `**${known.title}** est terminée.`,
        fields: [
          { name: 'Récompense', value: `**+${ui.fmt(result.reward)}** ${result.type}`, inline: true },
          { name: 'Nouveau solde', value: `**${ui.fmt(user.points)}** points`, inline: true },
        ],
        thumb: ui.avatar(interaction.user),
      })],
    });
  },
};