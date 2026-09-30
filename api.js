require('dotenv/config');
const express = require('express');
const cors = require('cors');
const path = require('path');
const Groq = require('groq-sdk');
const db = require('./database/db.js');
const http = require('http');
const WebSocket = require('ws');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireOwner, optionalAuth, verifyToken, OWNER_ID } = require('./lib/auth.js');

const app = express();
const server = http.createServer(app);
const PORT = process.env.API_PORT || 3001;
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const json = (res, body, status = 200) => res.status(status).json(body);

// --- Rate limiting -------------------------------------------------------
// Un refresh du dashboard déclenche ~14 appels. L'ancien plafond de 100/15min
// cassait le site au bout de 7 refreshs : on sépare les lecture publiques
// (généreuses), les écritures et les endpoints sensibles (stricts).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: { success: false, message: 'Trop de requêtes, réessayez dans quelques minutes.', code: 'RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { success: false, message: 'Trop d\'actions, ralentissez un peu.', code: 'RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Trop de requêtes sur cet endpoint.', code: 'RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(express.json({ limit: '256kb' }));
// Limiteur uniquement sur /api : les fichiers statiques ne doivent pas le consommer.
app.use('/api', apiLimiter);
app.use(express.static(path.join(__dirname, 'website')));

// Helper : l'id Discord vient TOUJOURS du token vérifié, jamais du body/query.
const selfId = (req) => req.user.id;

app.get('/api/health', (_, res) =>
  json(res, { success: true, status: 'ok', timestamp: new Date().toISOString() }));

// =========================== UTILISATEUR ===========================

// Profil complet de l'utilisateur authentifié.
app.get('/api/user/:userId', optionalAuth, (req, res) => {
  // Un token valide ne peut consulter que son propre profil.
  if (req.user && req.user.id !== req.params.userId) {
    return json(res, { success: false, message: 'Accès refusé.' }, 403);
  }
  const user = db.getOrCreateUser(req.params.userId);
  const weekly = db.getWeeklyActivity(req.params.userId);
  json(res, {
    success: true,
    data: {
      userId: user.id,
      username: user.username,
      points: user.points,
      level: user.level,
      xp: user.xp,
      tasksCompleted: user.tasks_completed,
      dailyStreak: user.daily_streak,
      inviteCount: user.invite_count,
      role: user.role,
      isAdmin: user.id === OWNER_ID,
      weeklyActivity: { points: weekly ? [weekly.points] : [], xp: weekly ? [weekly.xp] : [] },
      recentActivity: db.getRecentActivity(req.params.userId, 5),
      badges: db.getUserBadges(req.params.userId),
    },
  });
});

// =========================== NOTIFICATIONS ===========================

app.get('/api/notifications/:userId', requireAuth, (req, res) => {
  if (req.params.userId !== selfId(req)) {
    return json(res, { success: false, message: 'Accès refusé.' }, 403);
  }
  json(res, {
    success: true,
    notifications: db.getUserNotifications(req.params.userId),
    unread: db.countUnreadNotifications(req.params.userId),
  });
});

app.post('/api/notifications/:userId/read', requireAuth, writeLimiter, (req, res) => {
  if (req.params.userId !== selfId(req)) {
    return json(res, { success: false, message: 'Accès refusé.' }, 403);
  }
  const { id, all } = req.body || {};
  if (all) db.markAllNotificationsRead(req.params.userId);
  else if (id) db.markNotificationRead(id);
  json(res, { success: true, unread: db.countUnreadNotifications(req.params.userId) });
});

// =========================== CLASSEMENT ===========================

app.get('/api/leaderboard', optionalAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const data = db.getLeaderboard(limit);
  json(res, { success: true, data, count: data.length });
});

app.get('/api/leaderboard/advanced', optionalAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
  const offset = (page - 1) * limit;
  const allUsers = db.getLeaderboard(100);
  const total = allUsers.length;
  json(res, {
    success: true,
    data: allUsers.slice(offset, offset + limit),
    pagination: {
      page, limit, total,
      totalPages: Math.ceil(total / limit),
      hasNext: offset + limit < total,
      hasPrev: page > 1,
    },
  });
});

// =========================== MEMBRES ===========================

app.get('/api/users/search', optionalAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return json(res, { success: true, data: [], count: 0 });
  const users = db.searchUsersDetailed(q, 20);
  json(res, { success: true, data: users, count: users.length });
});

// Liste paginée des membres (page « Recherche de membres »).
app.get('/api/users', optionalAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
  const search = String(req.query.q || '').trim();
  const { rows, total } = db.listUsers({ limit, offset: (page - 1) * limit, search });
  json(res, {
    success: true,
    data: rows,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

app.get('/api/user/:userId/transactions', optionalAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const transactions = db.getUserTransactions(req.params.userId, limit);
  json(res, { success: true, transactions, data: transactions, count: transactions.length });
});

app.get('/api/user/:userId/purchases', optionalAuth, (req, res) => {
  json(res, { success: true, purchases: db.getUserPurchases(req.params.userId) });
});

app.get('/api/user/:userId/badges', optionalAuth, (req, res) => {
  const badges = db.getUserBadges(req.params.userId);
  const unlocked = badges.filter(b => b.unlocked);
  json(res, {
    success: true,
    data: { all: badges, unlocked, progress: { unlocked: unlocked.length, total: badges.length } },
  });
});

// =========================== BOUTIQUE ===========================

app.get('/api/shop', (_, res) => json(res, { success: true, items: db.getShopItems() }));

app.get('/api/shop/items', (_, res) => {
  const items = db.getShopItems();
  json(res, { success: true, items, data: items, count: items.length });
});

app.post('/api/shop/purchase', requireAuth, strictLimiter, (req, res) => {
  const { itemId } = req.body || {};
  if (!itemId) return json(res, { success: false, error: 'Article manquant' }, 400);
  const result = db.purchaseItem(selfId(req), itemId);
  if (!result) return json(res, { success: false, error: 'Achat impossible' }, 400);
  json(res, { success: true, data: result, item: result });
});

// Alias historique consommé par le dashboard.
app.post('/api/buy', requireAuth, strictLimiter, (req, res) => {
  const { itemId } = req.body || {};
  if (!itemId) return json(res, { success: false, error: 'Article manquant' }, 400);
  const result = db.buyItem(selfId(req), itemId);
  if (!result) return json(res, { success: false, error: 'Achat impossible' }, 400);
  json(res, { success: true, item: result, data: result });
});

// =========================== QUÊTES ===========================

app.get('/api/quests', optionalAuth, (req, res) => {
  const quests = req.user ? db.getUserQuests(req.user.id) : db.getActiveQuests();
  json(res, { success: true, quests, data: quests, count: quests.length });
});

app.get('/api/user/:userId/quests', optionalAuth, (req, res) => {
  const quests = db.getUserQuests(req.params.userId);
  json(res, { success: true, quests, data: quests, count: quests.length });
});

app.post('/api/quest/:questId/complete', requireAuth, writeLimiter, (req, res) => {
  const result = db.completeQuest(selfId(req), req.params.questId);
  if (!result) return json(res, { success: false, error: 'Quête introuvable' }, 404);
  json(res, { success: true, data: result });
});

// =========================== ANALYTICS ===========================

const growth = (current, previous) =>
  !previous ? 0 : +(((current - previous) / Math.abs(previous)) * 100).toFixed(2);

app.get('/api/analytics/global', optionalAuth, (_, res) => {
  const weekly = db.getWeeklyStats();
  const monthly = db.getMonthlyStats();
  json(res, {
    success: true,
    data: {
      current: db.getGlobalStats(),
      weekly,
      monthly,
      trends: {
        usersGrowth: growth(weekly.users, monthly.users),
        pointsGrowth: growth(weekly.points, monthly.points),
        activityGrowth: growth(weekly.activity, monthly.activity),
      },
    },
  });
});

// Données réelles des graphiques (remplace lesPlaceholder codés en dur).
app.get('/api/analytics/series', optionalAuth, (req, res) => {
  const days = parseInt(req.query.days) || 14;
  json(res, {
    success: true,
    data: {
      activity: db.getActivitySeries(days),
      levels: db.getLevelDistribution(),
      types: db.getTransactionTypeBreakdown(),
      games: db.getGameStats(),
    },
  });
});

app.get('/api/global-stats', optionalAuth, (_, res) =>
  json(res, { success: true, ...db.getGlobalStats() }));

// =========================== ACHIEVEMENTS ===========================

app.get('/api/achievements', optionalAuth, (req, res) => {
  const achievements = req.user
    ? db.getUserAchievements(req.user.id)
    : db.getAchievements();
  json(res, { success: true, achievements, data: achievements, count: achievements.length });
});

app.get('/api/user/:userId/achievements', optionalAuth, (req, res) => {
  const achievements = db.getUserAchievements(req.params.userId);
  const unlocked = achievements.filter(a => a.unlocked);
  json(res, {
    success: true,
    achievements,
    data: achievements,
    progress: { unlocked: unlocked.length, total: achievements.length },
  });
});

// =========================== MINI-JEUX ===========================

app.get('/api/games', optionalAuth, (req, res) => {
  const games = db.getMiniGames();
  json(res, { success: true, games, data: games, count: games.length });
});

app.get('/api/user/:userId/games', optionalAuth, (req, res) => {
  json(res, { success: true, history: db.getUserGameHistory(req.params.userId, 25) });
});

app.post('/api/games/:gameId/play', requireAuth, strictLimiter, (req, res) => {
  const bet = parseInt(req.body?.bet) || 0;
  if (!bet || bet < 0) return json(res, { success: false, error: 'Mise invalide' }, 400);
  const result = db.playMiniGame(selfId(req), req.params.gameId, bet);
  if (!result) return json(res, { success: false, error: 'Jeu indisponible ou mise invalide' }, 400);
  const user = db.getOrCreateUser(selfId(req));
  json(res, { success: true, result, points: user.points });
});

// =========================== SAISONS ===========================

app.get('/api/seasons', (_, res) => {
  const seasons = db.getSeasons();
  json(res, { success: true, seasons, active: db.getActiveSeason() });
});

app.get('/api/seasons/current', (_, res) => {
  const active = db.getActiveSeason();
  json(res, {
    success: true,
    season: active,
    rewards: active ? db.getSeasonRewards(active.id) : [],
    leaderboard: db.getSeasonLeaderboard(active, 25),
  });
});

// =========================== TICKETS ===========================

// Chaque ticket est privé : soit c'est le demandeur (token + userId cohérent),
// soit c'est le propriétaire. Aucune liste globale n'est exposed ici — la vue
// complète passe par /api/tickets/admin, protégé par requireOwner.
app.get('/api/tickets', requireAuth, (req, res) => {
  const wanted = req.query.userId;
  if (wanted && wanted !== selfId(req)) {
    return json(res, { success: false, message: 'Accès refusé.' }, 403);
  }
  if (req.user?.isOwner && !wanted) {
    return json(res, { success: true, tickets: db.getAllTickets() });
  }
  json(res, { success: true, tickets: db.getUserTickets(selfId(req)) });
});

// Vue admin : tous les tickets.
app.get('/api/tickets/admin', requireAuth, requireOwner, (_, res) =>
  json(res, { success: true, tickets: db.getAllTickets() }));

app.post('/api/tickets', requireAuth, writeLimiter, (req, res) => {
  const { subject, message, category } = req.body || {};
  if (!subject || !message) {
    return json(res, { success: false, message: 'Sujet et message requis.' }, 400);
  }
  const ticket = db.createTicket(selfId(req), subject, message, category);
  json(res, { success: true, ticket });
});

// Les messages ne sont lisibles que par l'auteur du ticket ou le propriétaire.
app.get('/api/tickets/:id/messages', requireAuth, (req, res) => {
  const ticket = (db.getAllTickets() || []).find(t => t.id === req.params.id);
  if (!ticket) return json(res, { success: false, message: 'Ticket introuvable.' }, 404);
  if (!req.user?.isOwner && ticket.user_id !== selfId(req)) {
    return json(res, { success: false, message: 'Accès refusé.' }, 403);
  }
  json(res, { success: true, messages: db.getTicketMessages(req.params.id) });
});

app.post('/api/tickets/:id/messages', requireAuth, writeLimiter, (req, res) => {
  const content = String(req.body?.content || '').trim();
  if (!content) return json(res, { success: false, message: 'Message vide.' }, 400);
  const ticket = (db.getAllTickets() || []).find(t => t.id === req.params.id);
  if (!ticket) return json(res, { success: false, message: 'Ticket introuvable.' }, 404);
  if (!req.user?.isOwner && ticket.user_id !== selfId(req)) {
    return json(res, { success: false, message: 'Accès refusé.' }, 403);
  }
  const msg = db.addTicketMessage(req.params.id, selfId(req), content, req.user.isOwner);
  json(res, { success: true, message: msg });
});

app.post('/api/tickets/:id/status', requireAuth, requireOwner, (req, res) => {
  const status = String(req.body?.status || '').trim();
  if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
    return json(res, { success: false, message: 'Statut invalide.' }, 400);
  }
  const ticket = db.updateTicketStatus(req.params.id, status, req.body?.notes);
  json(res, { success: true, ticket });
});

// =========================== PARRAINAGE ===========================
// /top DOIT être déclaré avant /:userId : sinon Express fait matcher
// « top » comme un userId et renvoie une réponse vide.

app.get('/api/referral/top', (_, res) =>
  json(res, { success: true, data: db.getTopReferrers(10) }));

app.get('/api/referral/:userId', optionalAuth, (req, res) => {
  json(res, {
    success: true,
    code: db.getReferralCode(req.params.userId),
    stats: db.getReferralStats(req.params.userId),
  });
});

app.post('/api/referral/generate', requireAuth, (req, res) =>
  json(res, { success: true, code: db.generateReferralCode(selfId(req)) }));

app.post('/api/referral/use', requireAuth, writeLimiter, (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!code) return json(res, { success: false, message: 'Code manquant' }, 400);
  const result = db.useReferralCode(code, selfId(req));
  if (!result) return json(res, { success: false, message: 'Code invalide' }, 400);
  json(res, { success: true, result });
});

// =========================== DAILY ===========================

app.post('/api/daily/claim', requireAuth, strictLimiter, (req, res) => {
  const result = db.claimDaily(selfId(req));
  if (!result) return json(res, { success: false, error: 'Déjà réclamé aujourd\'hui' });
  json(res, { success: true, reward: result.reward, streak: result.streak });
});

// =========================== IA ===========================

app.post('/api/ia/chat', requireAuth, strictLimiter, async (req, res) => {
  const message = String(req.body?.message || '').slice(0, 1000).trim();
  if (!message) return json(res, { reply: 'Dis-moi quelque chose !' });
  if (!groq) return json(res, { reply: 'IA désactivée (clé API manquante).' });

  const user = db.getOrCreateUser(selfId(req));
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: "Tu es GiftBot, assistant du serveur GiftBlox. Sympa, français, emojis. "
            + `L'utilisateur a ${user.points} points, niveau ${user.level}.`,
        },
        { role: 'user', content: message },
      ],
      model: 'llama-3.3-70b-versatile',
    });
    json(res, { reply: completion.choices[0]?.message?.content || 'Pas de réponse.' });
  } catch (e) {
    console.error('Erreur Groq:', e.message);
    json(res, { reply: 'Désolé, une erreur est survenue.' });
  }
});

// =========================== ADMIN ===========================

app.get('/api/admin/stats', requireAuth, requireOwner, (_, res) => {
  const series = db.getActivitySeries(14);
  json(res, {
    success: true,
    ...db.getGlobalStats(),
    weekly: db.getWeeklyStats(),
    topUsers: db.getLeaderboard(5),
    recentTransactions: db.getGlobalTransactions(10),
    openTickets: db.getAllTickets().filter(t => t.status === 'open' || t.status === 'in_progress'),
    games: db.getGameStats(),
    series,
  });
});

// =========================== WEBSOCKET ===========================

const wss = new WebSocket.Server({ server, path: '/ws' });
const clients = new Map();

wss.on('connection', async (ws, req) => {
  // Le token arrive en query string (le header n'est pas disponible en WS
  // navigateur) et DOIT être vérifié : on ne fait plus confiance au userId.
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('access_token');

  try {
    const user = await verifyToken(token);
    ws.userId = user.id;
    clients.set(user.id, ws);
    ws.send(JSON.stringify({ type: 'connected', data: { userId: user.id, timestamp: new Date().toISOString() } }));
  } catch {
    ws.send(JSON.stringify({ type: 'error', data: { message: 'Authentification requise' } }));
    return ws.close(4001, 'unauthorized');
  }

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      }
    } catch (e) {
      console.error('WebSocket message error:', e.message);
    }
  });

  ws.on('close', () => {
    if (ws.userId && clients.get(ws.userId) === ws) {
      clients.delete(ws.userId);
      console.log(`WebSocket déconnecté: ${ws.userId}`);
    }
  });

  ws.on('error', (e) => console.error('WebSocket error:', e.message));
});

function broadcastToUser(userId, type, data) {
  const client = clients.get(userId);
  if (client?.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
  }
}

function broadcastToAll(type, data) {
  const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(payload); });
}

// Le classement est mis à jour toutes les 30 s pour tous les clients connectés.
setInterval(() => {
  if (wss.clients.size) broadcastToAll('leaderboard_update', db.getLeaderboard(10));
}, 30000).unref?.();

// =========================== ERREURS & SPA ===========================

app.use('/api', (req, res) =>
  json(res, { success: false, message: 'Endpoint introuvable.', code: 'NOT_FOUND' }, 404));

// Wrapper d'erreur : évite qu'une exception ne fasse tomber le process.
app.use((err, req, res, next) => {
  console.error('Erreur API:', err.message);
  if (res.headersSent) return next(err);
  json(res, { success: false, message: 'Erreur interne du serveur.', code: 'INTERNAL' }, 500);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'website', 'dashboard.html'));
});

async function start({ initDb = true } = {}) {
  // Un seul appel à db.init() dans tout le process (cf. main.js) :
  // sql.js garde la base EN MÉMOIRE et la réécrit entièrement à chaque save().
  // Deux process avec deux copies mémoire = perte de données.
  if (initDb) await db.init();
  server.listen(PORT, () => console.log(`API sur http://localhost:${PORT} (WebSocket + auth)`));
}

module.exports = { app, server, start, PORT };

if (require.main === module) start();