require('dotenv/config');
const {
  Client, GatewayIntentBits, REST, Routes,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('./database/db.js');
const cooldown = require('./lib/cooldown.js');
const ui = require('./lib/ui.js');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN manquant dans .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// ── Chargement des commandes ────────────────────────────────────────────────
// Chaque module exporte { data: SlashCommandBuilder, execute, cooldown? }.
// Plus de if (cmd.name === ...) ici : la commande décrit elle-même ses options.
const commands = [];
const commandsMap = new Map();

const COMMANDS_DIR = path.join(__dirname, 'commands');
const files = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.js') && !f.startsWith('_'));

for (const file of files) {
  const mod = require(path.join(COMMANDS_DIR, file));

  if (!mod.data || !mod.execute) {
    console.warn(`⚠️  ${file} ignoré : data/execute manquant`);
    continue;
  }

  commandsMap.set(mod.data.name, mod);
  commands.push(mod.data.toJSON());
  console.log(`  • /${mod.data.name}${mod.cooldown ? ` (cooldown ${mod.cooldown}s)` : ''}`);
}

// ── Menu /help ──────────────────────────────────────────────────────────────
// Les catégories vivent dans commands/help.js : une seule source de vérité.
const helpCmd = commandsMap.get('help');

if (!helpCmd) {
  console.error('❌ commands/help.js est obligatoire (menu d\'aide)');
  process.exit(1);
}

// ── Enregistrement des commandes sur Discord ───────────────────────────────
client.once('ready', async () => {
  console.log(`\n✅ Connecté en tant que ${client.user.tag}`);
  console.log(`📦 ${commands.length} commandes chargées\n`);

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const route = GUILD_ID
      ? Routes.applicationGuildCommands(client.user.id, GUILD_ID)
      : Routes.applicationCommands(client.user.id);

    const data = await rest.put(route, { body: commands });
    console.log(`✅ ${data.length} commandes enregistrées ${GUILD_ID ? `(serveur ${GUILD_ID}, instantané)` : '(global, jusqu\'à 1h)'}`);
  } catch (e) {
    console.error('❌ Erreur enregistrement des commandes:', e.message);
  }
});

client.once('error', (e) => console.error('❌ Erreur client:', e.message));
client.once('shardDisconnect', () => console.warn('⚠️  Déconnecté du gateway'));

// ── Routeur d'interactions ─────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  // Menu /help
  if (interaction.isStringSelectMenu() && interaction.customId === 'help_menu') {
    await interaction.update({
      embeds: [helpCmd.embedFor(interaction.values[0])],
      components: helpCmd.components(),
    });
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const cmd = commandsMap.get(interaction.commandName);
  if (!cmd) return;

  // Cooldown déclaré par la commande
  if (cmd.cooldown) {
    const left = cooldown.remaining(interaction.user.id, cmd.data.name);
    if (left > 0) {
      return ui.fail(
        interaction,
        `Patiente encore **${ui.duration(left)}** avant de réutiliser cette commande.`,
        `Cooldown : ${ui.duration(cmd.cooldown)}`
      );
    }
  }

  try {
    await cmd.execute(interaction);

    if (cmd.cooldown) cooldown.hit(interaction.user.id, cmd.data.name, cmd.cooldown);
  } catch (e) {
    console.error(`❌ /${interaction.commandName}:`, e.stack || e.message);

    const payload = {
      embeds: [ui.err({
        title: '❌ Erreur',
        description: 'Une erreur est survenue pendant l\'exécution de la commande.',
        footer: process.env.NODE_ENV === 'production' ? undefined : String(e.message).slice(0, 180),
      })],
    };

    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply({ ...payload, ephemeral: true });
    } catch {
      /* le message a expiré, on ignore */
    }
  }
});

async function start() {
  await db.init();
  await client.login(TOKEN);
}

process.on('unhandledRejection', (e) => console.error('❌ Promesse rejetée:', e));

module.exports = { client, commands, commandsMap, start };

// Lancer seulement en exécution directe (start.vbs) : permet les tests
if (require.main === module) start();