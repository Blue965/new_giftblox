const { SlashCommandBuilder, ChannelType } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

const STATUS = {
  open: '🟢 Ouvert',
  in_progress: '🟡 En cours',
  resolved: '🔵 Résolu',
  closed: '⚪ Fermé',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gérer tes tickets de support')
    .addSubcommand((s) => s.setName('create')
      .setDescription('Ouvrir un ticket de support')
      .addStringOption((o) => o.setName('sujet').setDescription('Résume ton problème').setMaxLength(120).setRequired(true))
      .addStringOption((o) => o.setName('message').setDescription('Détaille ton problème').setMaxLength(1500).setRequired(true))
      .addStringOption((o) => o
        .setName('categorie')
        .setDescription('Catégorie du ticket')
        .addChoices(
          { name: 'Général', value: 'general' },
          { name: 'Support', value: 'support' },
          { name: 'Facturation', value: 'billing' },
          { name: 'Bug', value: 'bug' },
          { name: 'Suggestion', value: 'feature' },
        )
        .setRequired(false)))
    .addSubcommand((s) => s.setName('list').setDescription('Voir tes tickets'))
    .addSubcommand((s) => s.setName('close')
      .setDescription('Fermer un de tes tickets')
      .addStringOption((o) => o.setName('id').setDescription('Identifiant du ticket').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const subject = interaction.options.getString('sujet');
      const message = interaction.options.getString('message');
      const category = interaction.options.getString('categorie') || 'general';

      const ticket = db.createTicket(interaction.user.id, subject, message, category);
      const ticketId = ticket.id;

      // Un salon dédié par ticket, si le bot a la permission.
      let channel = null;
      if (interaction.guild) {
        try {
          channel = await interaction.guild.channels.create({
            name: `ticket-${ticketId.slice(0, 6)}`,
            type: ChannelType.GuildText,
            topic: `Ticket de ${interaction.user.username} (${ticketId})`,
            reason: `Support ticket ${ticketId}`,
          });
        } catch {
          channel = null; // pas de permission : on reste en MP
        }
      }

      db.createNotification(
        interaction.user.id,
        'Ticket ouvert',
        `Ton ticket « ${subject} » a bien été enregistré.`,
        'success'
      );

      return interaction.reply({
        embeds: [ui.ok({
          title: `${ui.EMOJI.ticket} Ticket créé`,
          description: `Ton ticket a été transmis à l'équipe.`,
          fields: [
            { name: 'Identifiant', value: `\`${ticketId}\``, inline: true },
            { name: 'Catégorie', value: category, inline: true },
            ...(channel ? [{ name: 'Salon', value: `<#${channel.id}>`, inline: true }] : []),
          ],
          footer: 'Conserve cet identifiant pour fermer le ticket',
        })],
      });
    }

    if (sub === 'close') {
      const id = interaction.options.getString('id').trim();
      const mine = db.getUserTickets(interaction.user.id);
      const ticket = mine.find((t) => t.id === id);
      if (!ticket) return ui.fail(interaction, 'Ticket introuvable dans tes tickets.');
      if (ticket.status === 'closed') return ui.fail(interaction, 'Ce ticket est déjà fermé.');

      db.updateTicketStatus(id, 'closed', `Fermé par ${interaction.user.username}`);

      return interaction.reply({
        embeds: [ui.ok({
          title: 'Ticket fermé',
          description: `Le ticket « ${ticket.subject} » est désormais fermé.`,
        })],
        ephemeral: true,
      });
    }

    const tickets = db.getUserTickets(interaction.user.id);
    if (!tickets.length) {
      return ui.fail(interaction, 'Tu n\'as aucun ticket.', 'Ouvre-en un avec `/ticket create`.');
    }

    const lines = tickets.slice(0, 15).map((t) => {
      const preview = (t.message || '').replace(/\s+/g, ' ').slice(0, 70);
      return `${STATUS[t.status] || '⚪'} **${t.subject}**\n*${preview}…*\n\`${t.id}\` · ${t.created_at}`;
    });

    return interaction.reply({
      embeds: [ui.embed({
        title: `${ui.EMOJI.ticket} Tes tickets`,
        description: lines.join('\n\n'),
        color: ui.C.info,
        footer: `${tickets.length} ticket(s) · ferme avec /ticket close`,
      })],
      ephemeral: true,
    });
  },
};