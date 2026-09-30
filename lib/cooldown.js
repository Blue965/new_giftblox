/**
 * Cooldowns par utilisateur + par commande.
 * Nettoyage automatique pour éviter la fuite mémoire.
 */
const hits = new Map();

// Purge toutes les 10 minutes
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of hits) if (ts <= now) hits.delete(key);
}, 10 * 60 * 1000);
sweeper.unref?.();

function keyFor(userId, name) {
  return `${userId}:${name}`;
}

/** Secondes restantes, 0 si la commande est disponible. */
function remaining(userId, name) {
  const ts = hits.get(keyFor(userId, name));
  if (!ts) return 0;
  const left = Math.ceil((ts - Date.now()) / 1000);
  return left > 0 ? left : 0;
}

/** Enregistre une utilisation. Retourne les secondes restantes après coup. */
function hit(userId, name, seconds) {
  hits.set(keyFor(userId, name), Date.now() + seconds * 1000);
  return seconds;
}

function reset(userId, name) {
  hits.delete(keyFor(userId, name));
}

module.exports = { remaining, hit, reset };