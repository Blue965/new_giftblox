const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

const ICONS = {
  info: 'ℹ️', success: '✅', warning: '⚠️', reward: '🎁',
  error: '❌', admin: '🛡️', quest: '🎯', achievement: '🏆',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('notifications')
    .setDescription('Voir ton centre de notifications')
    .addSubcommand((s) => s.setName('list').setDescription('Affiche tes notifications'))
    .addSubcommand((s) => s.setName('clear').setDescription('Marquer toutes tes notifications comme lues')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'clear') {
      db.markAllNotificationsRead(interaction.user.id);
      return interaction.reply({
        embeds: [ui.ok({
          title: 'Notifications lues',
          description: 'Toutes tes notifications sont marquées comme lues.',
        })],
        ephemeral: true,
      });
    }

    const notifications = db.getUserNotifications(interaction.user.id);
    if (!notifications.length) {
      return ui.fail(interaction, 'Tu n\'as aucune notification.', 'Tu serais prévenu ici de toute activité.');
    }

    const unread = notifications.filter((n) => !n.is_read).length;
    const lines = notifications.slice(0, 10).map((n) => {
      const flag = n.is_read ? '⚪' : '🔵';
      return `${flag} ${ICONS[n.type] || ICONS.info} **${n.title}**\n${n.message}`;
    });

    return interaction.reply({
      embeds: [ui.embed({
        title: `${ui.EMOJI.bolt} Centre de notifications`,
        description: lines.join('\n\n'),
        color: unread ? ui.C.pink : ui.C.neutral,
        footer: unread ? `${unread} non lue(s) sur ${notifications.length}` : 'Tout est lu',
      })],
      ephemeral: true,
    });
  },
};