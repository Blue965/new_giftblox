const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Acheter un article de la boutique avec tes points')
    .addStringOption((o) => o
      .setName('code')
      .setDescription('Le code de l\'article (affiché par /shop)')
      .setRequired(true)),

  cooldown: 3,

  async execute(interaction) {
    const query = interaction.options.getString('code', true);

    // Accepte l'ID exact, le nom exact, ou une partie du nom
    const item = db.getShopItem(query);

    if (!item) {
      return ui.fail(
        interaction,
        `Aucun article ne correspond à **${query}**.`,
        'Vérifie la liste avec `/shop`'
      );
    }

    // La ligne doit exister avant le retrait de points
    const me = db.getOrCreateUser(interaction.user.id, interaction.user.username);

    if (me.points < item.price) {
      const missing = item.price - me.points;
      return ui.fail(
        interaction,
        `Tu as **${ui.fmt(me.points)}** points mais cet article coûte **${ui.fmt(item.price)}**.`,
        `Il te manque **${ui.fmt(missing)}** points — réclame ta récompense avec \`/daily\``
      );
    }

    const bought = db.buyItem(interaction.user.id, item.id);

    if (!bought) {
      return ui.fail(
        interaction,
        `**${item.name}** n'est plus disponible.`,
        'Stock épuisé ou article désactivé'
      );
    }

    const after = db.getOrCreateUser(interaction.user.id, interaction.user.username);
    db.createNotification(interaction.user.id, `Achat : ${item.name}`, `-${item.price} points`, 'purchase');

    await interaction.reply({
      embeds: [ui.ok({
        title: `${ui.EMOJI.gift} Achat confirmé`,
        description: [
          `Tu as acheté **${bought.name}** pour **${ui.fmt(bought.price)} points**.`,
          '',
          `**Solde restant :** ${ui.fmt(after.points)} points`,
        ].join('\n'),
        color: ui.C.pink,
        thumb: interaction.user.displayAvatarURL({ size: 256 }),
      })],
    });
  },
};