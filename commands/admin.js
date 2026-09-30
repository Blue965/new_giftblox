const {
  SlashCommandBuilder, PermissionFlagsBits,
} = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

const OWNER_ID = process.env.OWNER_ID || '1527668994210005002';

function isAdmin(interaction) {
  return interaction.user.id === OWNER_ID
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Commandes d\'administration du bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s
      .setName('addpoints')
      .setDescription('Créditer des points à un membre')
      .addUserOption((o) => o.setName('membre').setDescription('Membre ciblé').setRequired(true))
      .addIntegerOption((o) => o
        .setName('montant').setDescription('Points à ajouter')
        .setMinValue(1).setMaxValue(1000000).setRequired(true))
      .addStringOption((o) => o.setName('raison').setDescription('Motif (optionnel)').setRequired(false)))
    .addSubcommand((s) => s
      .setName('removepoints')
      .setDescription('Retirer des points à un membre')
      .addUserOption((o) => o.setName('membre').setDescription('Membre ciblé').setRequired(true))
      .addIntegerOption((o) => o
        .setName('montant').setDescription('Points à retirer')
        .setMinValue(1).setMaxValue(1000000).setRequired(true))
      .addStringOption((o) => o.setName('raison').setDescription('Motif (optionnel)').setRequired(false)))
    .addSubcommand((s) => s
      .setName('givexp')
      .setDescription('Donner de l\'XP à un membre')
      .addUserOption((o) => o.setName('membre').setDescription('Membre ciblé').setRequired(true))
      .addIntegerOption((o) => o
        .setName('montant').setDescription('XP à donner')
        .setMinValue(1).setMaxValue(1000000).setRequired(true)))
    .addSubcommand((s) => s
      .setName('setlevel')
      .setDescription('Forcer le niveau d\'un membre')
      .addUserOption((o) => o.setName('membre').setDescription('Membre ciblé').setRequired(true))
      .addIntegerOption((o) => o
        .setName('niveau').setDescription('Niveau à appliquer (1 = zéro)')
        .setMinValue(1).setMaxValue(9999).setRequired(true))),

  async execute(interaction) {
    if (!isAdmin(interaction)) {
      return ui.fail(interaction, 'Tu n\'as pas la permission d\'utiliser cette commande.');
    }

    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('membre');
    const reason = interaction.options.getString('raison') || 'Aucune raison donnée';

    // Seul le propriétaire du bot peut modifier son propre compte
if (target.id === OWNER_ID && interaction.user.id !== OWNER_ID) {
      return ui.fail(interaction, 'Tu ne peux pas modifier le compte du propriétaire du bot.');
    }

    // Créer le compte si le membre n'existe pas encore en base
    const before = db.getOrCreateUser(target.id, target.username);

    let after;
    let line;

    switch (sub) {
      case 'addpoints': {
        const amount = interaction.options.getInteger('montant');
        after = db.addPoints(target.id, amount, `Admin ${interaction.user.username} : +${amount} (${reason})`);
        line = `**+${ui.fmt(amount)}** points`;
        break;
      }
      case 'removepoints': {
        const amount = Math.min(interaction.options.getInteger('montant'), before.points);
        if (amount <= 0) {
          return ui.fail(interaction, `${target.username} n'a aucun point à retirer.`);
        }
        after = db.addPoints(target.id, -amount, `Admin ${interaction.user.username} : -${amount} (${reason})`);
        line = `**-${ui.fmt(amount)}** points`;
        break;
      }
      case 'givexp': {
        const amount = interaction.options.getInteger('montant');
        after = db.addXP(target.id, amount);
        line = `**+${ui.fmt(amount)}** XP`;
        break;
      }
      case 'setlevel': {
        const level = interaction.options.getInteger('niveau');
        after = db.setLevel(target.id, level);
        line = `niveau forcé à **${level}**`;
        break;
      }
      default:
        return ui.fail(interaction, `Sous-commande inconnue : ${sub}`);
    }

    db.createNotification(target.id, `Action admin : ${sub}`, line, 'admin');

    await interaction.reply({
      embeds: [ui.ok({
        title: `${ui.EMOJI.crown} Action admin appliquée`,
        description: [
          `**${target.username}** — ${line}`,
          `**Motif :** ${reason}`,
        ].join('\n'),
        fields: [
          { name: 'Points', value: `${ui.fmt(before.points)} ${ui.EMOJI.arrow} **${ui.fmt(after.points)}**`, inline: true },
          { name: 'Niveau', value: `${before.level} ${ui.EMOJI.arrow} **${after.level}** ${ui.rankEmoji(after.level)}`, inline: true },
          { name: 'XP', value: `${ui.fmt(before.xp)} ${ui.EMOJI.arrow} **${ui.fmt(after.xp)}**`, inline: true },
        ],
        thumb: ui.avatar(target),
        footer: `Exécuté par ${interaction.user.username}`,
      })],
      ephemeral: true,
    });
  },
};