const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

const RARITY_EMOJI = {
  common: '⚪', rare: '🔵', epic: '🟣', legendary: '🟡', mythic: '🔴',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('Voir tes succès et leur progression')
    .addSubcommand((s) => s.setName('list')
      .setDescription('Tous tes succès')
      .addStringOption((o) => o
        .setName('filtre')
        .setDescription('N\'afficher qu\'une catégorie')
        .addChoices(
          { name: 'Tous', value: 'all' },
          { name: 'Débloqués', value: 'unlocked' },
          { name: 'En cours', value: 'progress' },
        )
        .setRequired(false)))
    .addSubcommand((s) => s.setName('check').setDescription('Vérifier si de nouveaux succès sont débloqués')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'check') {
      const before = db.getUserAchievements(interaction.user.id).filter((a) => a.unlocked).length;
      db.checkAndUnlockAchievements(interaction.user.id);
      const after = db.getUserAchievements(interaction.user.id).filter((a) => a.unlocked).length;
      const gained = after - before;

      if (gained <= 0) {
        return interaction.reply({
          embeds: [ui.info({
            title: 'Vérification terminée',
            description: 'Aucun nouveau succès pour le moment.',
            fields: [{ name: 'Succès débloqués', value: `**${after}**`, inline: true }],
          })],
          ephemeral: true,
        });
      }

      return interaction.reply({
        embeds: [ui.ok({
          title: `${ui.EMOJI.trophy} ${gained} nouveau(x) succès !`,
          description: 'Continue comme ça pour débloquer tous les succès.',
          fields: [{ name: 'Total débloqués', value: `**${after}**`, inline: true }],
          thumb: ui.avatar(interaction.user),
        })],
      });
    }

    let achievements = db.getUserAchievements(interaction.user.id);
    const filter = interaction.options.getString('filtre') || 'all';

    if (filter === 'unlocked') achievements = achievements.filter((a) => a.unlocked);
    else if (filter === 'progress') achievements = achievements.filter((a) => !a.unlocked);

    const total = db.getUserAchievements(interaction.user.id).length;
    const unlocked = db.getUserAchievements(interaction.user.id).filter((a) => a.unlocked).length;

    if (!achievements.length) {
      return ui.fail(interaction, 'Aucun succès dans cette catégorie.');
    }

    const lines = achievements.slice(0, 10).map((a) => {
      const emoji = RARITY_EMOJI[a.rarity] || '⚪';
      if (a.unlocked) {
        return `${emoji} ✅ **${a.name}**\n${a.description}\n*Bonus : +${ui.fmt(a.reward_points)} pts · +${ui.fmt(a.reward_xp)} XP*`;
      }
      const pct = Math.min(100, Math.round(((a.progress || 0) / a.requirement_value) * 100));
      return `${emoji} 🔒 **${a.name}**\n${a.description}\n${ui.bar(a.progress || 0, a.requirement_value)}\n`
        + `${ui.fmt(a.progress || 0)} / ${ui.fmt(a.requirement_value)} ${a.requirement_type} (**${pct}%**)`;
    });

    return interaction.reply({
      embeds: [ui.embed({
        title: `${ui.EMOJI.trophy} Succès`,
        description: lines.join('\n\n'),
        color: ui.C.warning,
        fields: [{
          name: 'Progression',
          value: `${ui.bar(unlocked, total || 1)}\n**${unlocked}** / **${total}** débloqués`,
        }],
        thumb: ui.avatar(interaction.user),
        footer: 'Débloque tout avec /achievements check',
      })],
      ephemeral: true,
    });
  },
};