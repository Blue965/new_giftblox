const {
  SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder,
} = require('discord.js');
const ui = require('../lib/ui.js');

const CATEGORIES = {
  general: {
    emoji: '📖',
    label: 'Général',
    blurb: 'Consulter ton profil et l\'état du serveur.',
    commands: [
      ['/profile', 'Ton profil complet : niveau, badges, historique'],
      ['/points', 'Ton portefeuille de points, version rapide'],
      ['/stats', 'Statistiques globales du serveur'],
      ['/help', 'Ce menu d\'aide'],
    ],
  },
  economie: {
    emoji: '🪙',
    label: 'Économie',
    blurb: 'Gagner, dépenser et faire grandir ton portefeuille.',
    commands: [
      ['/daily', 'Récompense quotidienne — le streak paie plus'],
      ['/shop', 'Voir la boutique et les codes disponibles'],
      ['/buy', 'Acheter un article avec tes points'],
      ['/transfer', 'Envoyer des points à un autre membre'],
      ['/redeem', 'Utiliser le code de parrainage d\'un ami'],
      ['/invites', 'Ton code de parrainage et tes statistiques'],
    ],
  },
  fun: {
    emoji: '🎮',
    label: 'Fun',
    blurb: 'Classement et compétition entre membres.',
    commands: [
      ['/leaderboard', 'Le top des membres les plus riches'],
    ],
  },
  admin: {
    emoji: '👑',
    label: 'Admin',
    blurb: 'Réservé au propriétaire du bot.',
    commands: [
      ['/admin addpoints', 'Créditer des points à un membre'],
      ['/admin removepoints', 'Retirer des points à un membre'],
      ['/admin setlevel', 'Forcer le niveau d\'un membre'],
      ['/admin givexp', 'Donner de l\'XP à un membre'],
    ],
  },
};

function embedFor(key) {
  const c = CATEGORIES[key] || CATEGORIES.general;
  return ui.embed({
    title: `${c.emoji} Aide — ${c.label}`,
    description: [c.blurb, '', ...c.commands.map(([n, d]) => `\`${n}\`\n${d}`)].join('\n'),
    color: ui.C.primary,
    footer: 'GiftBlox · 100% gratuit · utilise le menu pour changer de catégorie',
  });
}

function components() {
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_menu')
      .setPlaceholder('📚 Choisis une catégorie')
      .addOptions(Object.entries(CATEGORIES).map(([value, c]) => ({
        label: c.label,
        value,
        emoji: c.emoji,
        description: c.blurb,
      })))
  )];
}

module.exports = {
  // Exportés pour index.js : le handler du menu vit au même endroit que son contenu
  CATEGORIES,
  embedFor,
  components,

  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Liste des commandes et catégories disponibles'),

  async execute(interaction) {
    await interaction.reply({ embeds: [embedFor('general')], components: components() });
  },
};