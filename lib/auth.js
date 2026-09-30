/**
 * Authentification de l'API.
 *
 * Le dashboard s'authentifie via OAuth2 implicite Discord : il reçoit un
 * access_token et le stocke dans localStorage. Avant, cet token n'était
 * JAMAIS envoyé au backend, qui faisait confiance au userId fourni par le
 * client : n'importe qui pouvait forger un userId, voler des points ou lire
 * /api/admin/stats.
 *
 * On vérifie donc réellement le token auprès de Discord, avec un cache court
 * pour ne pas taper l'API Discord à chaque requête du dashboard.
 */
const OWNER_ID = process.env.OWNER_ID || '1527668994210005002';

const DISCORD_API = 'https://discord.com/api/v10';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const cache = new Map(); // token -> { user, at }
const inflight = new Map();

function pruneCache() {
  const now = Date.now();
  for (const [token, entry] of cache) {
    if (now - entry.at > CACHE_TTL) cache.delete(token);
  }
}
const sweeper = setInterval(pruneCache, CACHE_TTL);
sweeper.unref?.();

/**
 * Vérifie un access_token Discord.
 * @returns {Promise<{id:string,username:string,avatar:string,email:string}>}
 */
async function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.length < 20) {
    throw new Error('token manquant');
  }

  const cached = cache.get(token);
  if (cached) return cached.user;

  // Évite N appels simultanés pour le même token (le dashboard charge 12 pages en parallèle)
  if (inflight.has(token)) return inflight.get(token);

  const task = (async () => {
    const res = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Discord a refusé le token (${res.status})`);
    const user = await res.json();
    cache.set(token, { user, at: Date.now() });
    return user;
  })();

  inflight.set(token, task);
  try {
    return await task;
  } finally {
    inflight.delete(token);
  }
}

function extractToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  // Repli pour WebSocket et requêtes sans header
  if (req.query && typeof req.query.access_token === 'string') return req.query.access_token;
  return null;
}

/**
 * Middleware : exige un token Discord valide.
 * Renseigne req.user = { id, username, avatar, isOwner }.
 */
async function requireAuth(req, res, next) {
  try {
    const user = await verifyToken(extractToken(req));
    req.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      email: user.email,
      isOwner: user.id === OWNER_ID,
    };
    next();
  } catch (e) {
    res.status(401).json({
      success: false,
      message: 'Authentification Discord requise ou expirée.',
      code: 'UNAUTHORIZED',
      detail: process.env.NODE_ENV === 'production' ? undefined : e.message,
    });
  }
}

/** Réservé au propriétaire du bot. Utilise requireAuth en amont. */
function requireOwner(req, res, next) {
  if (!req.user || req.user.id !== OWNER_ID) {
    return res.status(403).json({
      success: false,
      message: 'Réservé au propriétaire du bot.',
      code: 'FORBIDDEN',
    });
  }
  next();
}

/**
 * Variante : si un token valide est présent on l'exploite, sinon on continue
 * en lecture seule. Permet aux routes publiques (classement, boutique) de
 * rester accessibles sans imposer une connexion à tout le monde.
 */
async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const user = await verifyToken(token);
    req.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      email: user.email,
      isOwner: user.id === OWNER_ID,
    };
  } catch {
    // token invalide : on reste anonyme, la route décidera
  }
  next();
}

function clearCache() {
  cache.clear();
}

module.exports = { requireAuth, requireOwner, optionalAuth, verifyToken, clearCache, OWNER_ID };