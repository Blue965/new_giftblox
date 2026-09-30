const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

const MAX_STREAK = 30;
// Même formule que db.claimDaily : 100 + (streak - 1) * 25
const rewardFor = (streak) => 100 + (Math.min(MAX_STREAK, streak) - 1) * 25;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Réclamer ta récompense quotidienne'),

  // 24h : le vrai garde-fou reste db.claimDaily, celui-ci évite juste le spam
  cooldown: 86400,

  async execute(interaction) {
    const result = db.claimDaily(interaction.user.id);

    if (!result) {
      return ui.fail(
        interaction,
        'Tu as déjà récupéré ta récompense aujourd\'hui.',
        'Reviens demain pour garder ta série.'
      );
    }

    db.addXP(interaction.user.id, 10);
    db.updateWeeklyActivity(interaction.user.id, result.reward, 10, 0);

    const unlocked = db.checkAndUnlockBadges(interaction.user.id) || [];
    const user = db.getOrCreateUser(interaction.user.id, interaction.user.username);

    const e = ui.ok({
      title: `${ui.EMOJI.gift} Récompense quotidienne`,
      description: [
        `Tu as reçu **+${ui.fmt(result.reward)} points** !`,
        result.streak > 1 ? `\n${ui.EMOJI.fire} Série en cours : **${result.streak}** jours d'affilée.` : '',
      ].join(''),
      fields: [
        { name: `${ui.EMOJI.bolt} Prochaine récompense`, value: `+${ui.fmt(rewardFor(result.streak + 1))} points`, inline: true },
        { name: `${ui.EMOJI.star} Niveau`, value: `**${user.level}** — ${ui.rankName(user.level)}`, inline: true },
        { name: `${ui.EMOJI.crown} Record de série`, value: result.streak >= MAX_STREAK ? '**Maximum atteint !**' : `${result.streak} / ${MAX_STREAK} jours`, inline: true },
      ],
    });

    if (unlocked.length) {
      e.addFields({
        name: '🏅 Badge débloqué !',
        value: unlocked.map((b) => `• **${b.name}**`).join('\n'),
      });
    }

    await interaction.reply({ embeds: [e] });
  },
};