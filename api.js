require('dotenv/config');
const express = require('express');
const cors = require('cors');
const path = require('path');
const Groq = require('groq-sdk');
const db = require('./database/db.js');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.API_PORT || 3001;
const OWNER_ID = '1527668994210005002';
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// Rate limiting middleware
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Trop de requêtes, veuillez réessayer plus tard.',
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Stricter limit for sensitive endpoints
  message: 'Trop de requêtes sur cet endpoint, veuillez réessayer plus tard.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(limiter);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'website')));

// Health
app.get('/api/health', (_, res) => res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() }));

// User
app.get('/api/user/:userId', (req, res) => {
  let user = db.getOrCreateUser(req.params.userId);
  let weekly = db.getWeeklyActivity(req.params.userId);
  let badges = db.getUserBadges(req.params.userId);
  let recent = db.getRecentActivity(req.params.userId, 5);
  res.json({ success: true, data: {
    userId: user.id, username: user.username, points: user.points, level: user.level, xp: user.xp,
    tasksCompleted: user.tasks_completed, dailyStreak: user.daily_streak, inviteCount: user.invite_count,
    role: user.role, isAdmin: user.id === OWNER_ID,
    weeklyActivity: { points: weekly ? [weekly.points] : [], xp: weekly ? [weekly.xp] : [] },
    recentActivity: recent, badges
  }});
});

// Notifications
app.get('/api/notifications/:userId', (req, res) => {
  res.json({ success: true, notifications: db.getUserNotifications(req.params.userId) });
});

app.post('/api/notifications/:userId/read', (req, res) => {
  let { id, all } = req.body;
  if (all) db.markAllNotificationsRead(req.params.userId);
  else if (id) db.markNotificationRead(id);
  res.json({ success: true });
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  let limit = Math.min(parseInt(req.query.limit) || 10, 50);
  let data = db.getLeaderboard(limit);
  res.json({ success: true, data, count: data.length });
});

// Advanced leaderboard with pagination
app.get('/api/leaderboard/advanced', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const offset = (page - 1) * limit;
  
  let allUsers = db.getLeaderboard(100);
  const total = allUsers.length;
  const paginated = allUsers.slice(offset, offset + limit);
  
  res.json({ 
    success: true, 
    data: paginated, 
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: offset + limit < total,
      hasPrev: page > 1
    }
  });
});

// User search
app.get('/api/users/search', (req, res) => {
  const query = req.query.q || '';
  if (query.length < 2) return res.json({ success: true, data: [] });
  
  const users = db.searchUsers(query, 20);
  res.json({ success: true, data: users, count: users.length });
});

// User transactions
app.get('/api/user/:userId/transactions', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const transactions = db.getUserTransactions(req.params.userId, limit);
  res.json({ success: true, data: transactions, count: transactions.length });
});

// User achievements/badges
app.get('/api/user/:userId/badges', (req, res) => {
  const badges = db.getUserBadges(req.params.userId);
  const unlocked = badges.filter(b => b.unlocked);
  res.json({ 
    success: true, 
    data: { 
      all: badges, 
      unlocked, 
      progress: { unlocked: unlocked.length, total: badges.length } 
    } 
  });
});

// Shop items
app.get('/api/shop/items', (req, res) => {
  const items = db.getShopItems();
  res.json({ success: true, data: items, count: items.length });
});

// Purchase item
app.post('/api/shop/purchase', strictLimiter, (req, res) => {
  const { userId, itemId } = req.body;
  if (!userId || !itemId) return res.status(400).json({ success: false, error: 'Missing parameters' });
  
  const result = db.purchaseItem(userId, itemId);
  if (!result) return res.status(400).json({ success: false, error: 'Purchase failed' });
  
  res.json({ success: true, data: result });
});

// Quests
app.get('/api/quests', (req, res) => {
  const quests = db.getActiveQuests();
  res.json({ success: true, data: quests, count: quests.length });
});

app.get('/api/user/:userId/quests', (req, res) => {
  const quests = db.getUserQuests(req.params.userId);
  res.json({ success: true, data: quests, count: quests.length });
});

// Complete quest
app.post('/api/quest/:questId/complete', strictLimiter, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });
  
  const result = db.completeQuest(userId, req.params.questId);
  if (!result) return res.status(400).json({ success: false, error: 'Quest completion failed' });
  
  res.json({ success: true, data: result });
});

// Analytics
app.get('/api/analytics/global', (req, res) => {
  const stats = db.getGlobalStats();
  const weekly = db.getWeeklyStats();
  const monthly = db.getMonthlyStats();
  
  res.json({ 
    success: true, 
    data: { 
      current: stats, 
      weekly, 
      monthly,
      trends: {
        usersGrowth: calculateGrowth(weekly.users, monthly.users),
        pointsGrowth: calculateGrowth(weekly.points, monthly.points),
        activityGrowth: calculateGrowth(weekly.activity, monthly.activity)
      }
    } 
  });
});

function calculateGrowth(weekly, monthly) {
  if (!monthly || monthly === 0) return 0;
  return ((weekly - monthly) / Math.abs(monthly) * 100).toFixed(2);
}

// Global stats
app.get('/api/global-stats', (req, res) => {
  res.json({ success: true, ...db.getGlobalStats() });
});

// WebSocket Server for real-time updates
const wss = new WebSocket.Server({ server, path: '/ws' });

const clients = new Map(); // Store connected clients by userId

wss.on('connection', (ws, req) => {
  const userId = req.url.split('userId=')[1];
  
  if (userId) {
    clients.set(userId, ws);
    console.log(`WebSocket client connected: ${userId}`);
    
    // Send initial data
    ws.send(JSON.stringify({
      type: 'connected',
      data: { userId, timestamp: new Date().toISOString() }
    }));
  }
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'subscribe':
          // Subscribe to specific updates
          ws.subscriptions = data.channels || [];
          ws.send(JSON.stringify({ type: 'subscribed', channels: ws.subscriptions }));
          break;
          
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    if (userId) {
      clients.delete(userId);
      console.log(`WebSocket client disconnected: ${userId}`);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Broadcast function to send updates to specific users
function broadcastToUser(userId, type, data) {
  const client = clients.get(userId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
  }
}

// Broadcast to all connected clients
function broadcastToAll(type, data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
    }
  });
}

// Periodic leaderboard updates (every 30 seconds)
setInterval(() => {
  const leaderboard = db.getLeaderboard(10);
  broadcastToAll('leaderboard_update', leaderboard);
}, 30000);

// Tickets
app.get('/api/tickets', (req, res) => {
  if (req.query.userId) res.json({ success: true, tickets: db.getUserTickets(req.query.userId) });
  else res.json({ success: true, tickets: db.getAllTickets() });
});

app.post('/api/tickets', (req, res) => {
  let { userId, subject, message, category } = req.body;
  let ticket = db.createTicket(userId, subject, message, category);
  res.json({ success: true, ticket });
});

app.post('/api/tickets/:id/status', (req, res) => {
  let ticket = db.updateTicketStatus(req.params.id, req.body.status, req.body.notes);
  res.json({ success: true, ticket });
});

app.get('/api/tickets/:id/messages', (req, res) => {
  res.json({ success: true, messages: db.getTicketMessages(req.params.id) });
});

app.post('/api/tickets/:id/messages', (req, res) => {
  let msg = db.addTicketMessage(req.params.id, req.body.userId, req.body.content, req.body.isAdmin || false);
  res.json({ success: true, message: msg });
});

// Referrals
app.get('/api/referral/:userId', (req, res) => {
  let code = db.getReferralCode(req.params.userId);
  let stats = db.getReferralStats(req.params.userId);
  res.json({ success: true, code, stats });
});

app.post('/api/referral/generate', (req, res) => {
  let code = db.generateReferralCode(req.body.userId);
  res.json({ success: true, code });
});

app.post('/api/referral/use', (req, res) => {
  let result = db.useReferralCode(req.body.code, req.body.userId);
  res.json({ success: true, result });
});

app.get('/api/referral/top', (req, res) => {
  res.json({ success: true, data: db.getTopReferrers(10) });
});

// Shop
app.get('/api/shop', (_, res) => {
  res.json({ success: true, items: db.getShopItems() });
});

app.post('/api/buy', (req, res) => {
  let result = db.buyItem(req.body.userId, req.body.itemId);
  if (!result) return res.json({ success: false, error: 'Achat impossible' });
  res.json({ success: true, item: result });
});

// Transactions
app.get('/api/user/:userId/transactions', (req, res) => {
  res.json({ success: true, transactions: db.getUserTransactions(req.params.userId) });
});

app.get('/api/user/:userId/purchases', (req, res) => {
  res.json({ success: true, purchases: db.getUserPurchases(req.params.userId) });
});

// Quests
app.get('/api/quests', (req, res) => {
  res.json({ success: true, quests: db.getQuests() });
});

// Daily
app.post('/api/daily/claim', (req, res) => {
  let result = db.claimDaily(req.body.userId);
  if (!result) return res.json({ success: false, error: 'Déjà réclamé aujourd\'hui' });
  res.json({ success: true, reward: result.reward, streak: result.streak });
});

// IA
app.post('/api/ia/chat', async (req, res) => {
  if (!groq) return res.json({ reply: 'IA désactivée (clé API manquante).' });
  let { message, discordId } = req.body;
  let user = discordId ? db.getOrCreateUser(discordId) : null;
  try {
    let completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'Tu es GiftBot, assistant du serveur GiftBlox. Tu es sympa, utilise des emojis, réponds en français. ' + (user ? 'L\'utilisateur a ' + user.points + ' points, niveau ' + user.level + '.' : '') },
        { role: 'user', content: message }
      ],
      model: 'llama-3.3-70b-versatile',
    });
    res.json({ reply: completion.choices[0]?.message?.content || 'Pas de réponse.' });
  } catch (e) {
    console.error('Erreur Groq:', e);
    res.json({ reply: 'Désolé, une erreur est survenue.' });
  }
});

// Admin stats
app.get('/api/admin/stats', (req, res) => {
  let gs = db.getGlobalStats();
  let topUsers = db.getLeaderboard(5);
  let recentTx = [];
  try { recentTx = db.getUserTransactions('all', 10); } catch(e) {}
  res.json({ success: true, ...gs, topUsers, recentTransactions: recentTx });
});

// Catch-all SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'website', 'dashboard.html'));
});

async function start() {
  await db.init();
  server.listen(PORT, () => console.log(`API sur http://localhost:${PORT} avec WebSocket support`));
}

start();
