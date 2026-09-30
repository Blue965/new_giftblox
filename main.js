/**
 * Point d'entrée UNIQUE : bot Discord + API dans le même process.
 *
 * Pourquoi un seul process ?
 * sql.js garde la base SQLite EN MÉMOIRE et réécrit le fichier entier
 * (db.export()) à chaque écriture. Si le bot et l'API tournent dans deux
 * process différents, chacun a sa copie en mémoire : le dernier qui écrit
 * écrase tout ce que l'autre a fait depuis. Données perdues en continu.
 *
 * Un seul process = une seule copie en mémoire = aucune perte.
 */
require('dotenv/config');

const db = require('./database/db.js');
const api = require('./api.js');
const { client, commands } = require('./index.js');

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN manquant dans .env');
  process.exit(1);
}

async function main() {
  // 1. La base, une seule fois pour tout le process
  await db.init();
  console.log('💾 Base SQLite chargée');

  // 2. L'API + WebSocket
  await api.start({ initDb: false });

  // 3. Le bot Discord (clientReady enregistre les commandes slash)
  await client.login(TOKEN);

  console.log(`🎯 ${commands.length} commandes prêtes · API sur le port ${api.PORT}`);
}

process.on('unhandledRejection', (e) => console.error('❌ Promesse rejetée:', e));

process.on('SIGTERM', () => {
  console.log('👋 Arrêt (SIGTERM)');
  client.destroy();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 Arrêt (SIGINT)');
  client.destroy();
  process.exit(0);
});

main().catch((e) => {
  console.error('❌ Démarrage impossible:', e);
  process.exit(1);
});