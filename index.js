require('dotenv/config');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('./database/db.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages] });
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1513281082626281472';
const GUILD_ID = process.env.GUILD_ID;

// Load commands from folder
const commands = [];
const commandsMap = {};
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const cmd = require(`./commands/${file}`);
  commandsMap[cmd.name] = cmd;

  const builder = new SlashCommandBuilder()
    .setName(cmd.name)
    .setDescription(cmd.description);

  // Add options based on command
  if (cmd.name === 'transfer') {
    builder.addUserOption(o => o.setName('user').setDescription('Destinataire').setRequired(true));
    builder.addIntegerOption(o => o.setName('amount').setDescription('Montant').setRequired(true));
  }
  if (cmd.name === 'redeem') {
    builder.addStringOption(o => o.setName('code').setDescription('Code de parrainage').setRequired(true));
  }
  if (cmd.name === 'buy') {
    builder.addStringOption(o => o.setName('item').setDescription('ID de l\'article').setRequired(true));
  }
  if (cmd.name === 'admin') {
    builder.setDefaultMemberPermissions('8');
    builder.addSubcommand(s => s.setName('addpoints').setDescription('Ajouter des points').addUserOption(o => o.setName('user').setRequired(true)).addIntegerOption(o => o.setName('amount').setRequired(true)));
    builder.addSubcommand(s => s.setName('removepoints').setDescription('Retirer des points').addUserOption(o => o.setName('user').setRequired(true)).addIntegerOption(o => o.setName('amount').setRequired(true)));
    builder.addSubcommand(s => s.setName('setlevel').setDescription('Changer niveau').addUserOption(o => o.setName('user').setRequired(true)).addIntegerOption(o => o.setName('level').setRequired(true)));
    builder.addSubcommand(s => s.setName('givexp').setDescription('Donner XP').addUserOption(o => o.setName('user').setRequired(true)).addIntegerOption(o => o.setName('amount').setRequired(true)));
  }

  commands.push(builder);
}

client.once('ready', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  console.log(`📦 ${commands.length} commandes chargées`);
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    if (GUILD_ID) await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    else await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commandes enregistrées sur Discord');
  } catch (e) { console.error('❌ Erreur commandes:', e.message); }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const cmd = commandsMap[interaction.commandName];
  if (!cmd) return;

  db.getOrCreateUser(interaction.user.id, interaction.user.username);

  try {
    await cmd.execute(interaction);
  } catch (e) {
    console.error(`❌ Erreur /${interaction.commandName}:`, e.message);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: '❌ Une erreur est survenue.' });
      } else {
        await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true });
      }
    } catch (ex) { /* ignore */ }
  }
});

async function start() {
  await db.init();
  client.login(TOKEN);
}

start();
