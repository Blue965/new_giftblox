const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db.js');
const ui = require('../lib/ui.js');

const EMOJI_TYPE = {
  role: '🎭', badge: '🏅', custom: '✨', boost: '🚀', nitro: '💜',
};
const emojiFor = (t) => EMOJI_TYPE[String(t || '').toLowerCase()] || ui.EMOJI.gift;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Voir la boutique et les articles disponibles'),

  async execute(interaction) {
    const items = db.getShopItems();

    if (!items.length) {
      return interaction.reply({ embeds: [ui.warn({
        title: `${ui.EMOJI.gift} Boutique`,
        description: 'La boutique est vide pour le moment. Reviens plus tard !',
      })] });
    }

    const me = db.getOrCreateUser(interaction.user.id, interaction.user.username);

    const fields = items.map((item) => {
      const unlimited = !item.stock || item.stock < 0;
      const stock = unlimited
        ? '∞ illimité'
        : `\`${Math.max(0, item.stock - db.getItemSold(item.id))}/${item.stock}\` restants`;
      const affordable = me.points >= item.price ? '✅' : '❌';

      return {
        name: `${emojiFor(item.type)} ${item.name} — ${ui.fmt(item.price)} pts ${affordable}`,
        value: [
          item.description || '_Pas de description._',
          '',
          `**Code :** \`${item.id}\``,
          `**Stock :** ${stock}`,
        ].join('\n'),
      };
    });

    await interaction.reply({
      embeds: [ui.embed({
        title: `${ui.EMOJI.gift} Boutique GiftBlox`,
        description: `Tu as **${ui.fmt(me.points)} points**. ✅ tu peux acheter · ❌ trop cher.`,
        fields: fields.slice(0, 25),
        color: ui.C.pink,
        footer: 'Achète avec /buy code:<id> — un article par commande',
      })],
    });
  },
};