const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Surchargeable via DB_PATH pour les tests / une instance jetable
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'giftblox.db');
const OWNER_ID = '1527668994210005002';

let db;

function save() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function uid() {
  return Math.random().toString(36).substr(2, 15) + Date.now().toString(36);
}

async function init() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    // Fix WAL compatibility
    try { db.run("PRAGMA journal_mode=MEMORY"); } catch(e) {}
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT DEFAULT 'Inconnu',
      discriminator TEXT DEFAULT '0',
      avatar TEXT,
      email TEXT,
      points INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      xp INTEGER DEFAULT 0,
      tasks_completed INTEGER DEFAULT 0,
      daily_streak INTEGER DEFAULT 0,
      last_daily TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      invite_count INTEGER DEFAULT 0,
      referred_by TEXT,
      is_banned INTEGER DEFAULT 0,
      role TEXT DEFAULT 'member'
    );
  `);
  db.run(`CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY, code TEXT UNIQUE, referrer_id TEXT NOT NULL, referred_id TEXT,
    used_count INTEGER DEFAULT 0, rewards_given INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (referrer_id) REFERENCES users(id), FOREIGN KEY (referred_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL,
    description TEXT, created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, item_id TEXT, item_name TEXT NOT NULL,
    item_type TEXT NOT NULL, price INTEGER NOT NULL, status TEXT DEFAULT 'completed',
    metadata TEXT, created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL,
    status TEXT DEFAULT 'open', priority TEXT DEFAULT 'medium', category TEXT DEFAULT 'general',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    resolved_at TEXT, admin_notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS ticket_messages (
    id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, user_id TEXT NOT NULL,
    content TEXT NOT NULL, is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id), FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS badges (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    icon TEXT DEFAULT 'trophy', color TEXT DEFAULT 'purple'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS user_badges (
    user_id TEXT NOT NULL, badge_id TEXT NOT NULL,
    unlocked_at TEXT DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (user_id, badge_id),
    FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (badge_id) REFERENCES badges(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
    type TEXT DEFAULT 'info', is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS quests (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, type TEXT NOT NULL,
    goal INTEGER NOT NULL, reward INTEGER NOT NULL, reward_type TEXT DEFAULT 'points',
    icon TEXT DEFAULT 'target', active INTEGER DEFAULT 1, starts_at TEXT, ends_at TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS user_quests (
    user_id TEXT NOT NULL, quest_id TEXT NOT NULL, progress INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0, claimed INTEGER DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now','localtime')), completed_at TEXT,
    PRIMARY KEY (user_id, quest_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS shop_items (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, price INTEGER NOT NULL,
    type TEXT NOT NULL, stock INTEGER DEFAULT -1, image_url TEXT, metadata TEXT,
    active INTEGER DEFAULT 1, category TEXT DEFAULT 'general',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS weekly_activity (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, week_start TEXT NOT NULL,
    points INTEGER DEFAULT 0, xp INTEGER DEFAULT 0, tasks_done INTEGER DEFAULT 0,
    UNIQUE(user_id, week_start),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  
  // New tables for enhanced features
  db.run(`CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, 
    requirement_type TEXT NOT NULL, requirement_value INTEGER NOT NULL,
    reward_points INTEGER DEFAULT 0, reward_xp INTEGER DEFAULT 0,
    icon TEXT DEFAULT 'star', rarity TEXT DEFAULT 'common',
    active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS user_achievements (
    user_id TEXT NOT NULL, achievement_id TEXT NOT NULL,
    progress INTEGER DEFAULT 0, completed INTEGER DEFAULT 0,
    unlocked_at TEXT, notified INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, achievement_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (achievement_id) REFERENCES achievements(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS seasons (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL,
    multiplier REAL DEFAULT 1.0, active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS season_rewards (
    id TEXT PRIMARY KEY, season_id TEXT NOT NULL, rank INTEGER NOT NULL,
    reward_type TEXT NOT NULL, reward_value INTEGER NOT NULL,
    FOREIGN KEY (season_id) REFERENCES seasons(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS mini_games (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    game_type TEXT NOT NULL, min_bet INTEGER DEFAULT 10, max_bet INTEGER DEFAULT 1000,
    house_edge REAL DEFAULT 0.05, active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, game_id TEXT NOT NULL,
    bet_amount INTEGER NOT NULL, result_amount INTEGER NOT NULL,
    outcome TEXT NOT NULL, played_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (game_id) REFERENCES mini_games(id)
  )`);

  // Seed badges
  let count = db.exec("SELECT COUNT(*) as c FROM badges");
  if (!count.length || !count[0].values[0][0]) {
    const badges = [
      ['Premiers Pas', 'Complète ta première tâche', 'trophy', 'bronze'],
      ['Collectionneur', 'Accumule 500 points', 'gem', 'green'],
      ['Légende', 'Atteins le niveau 10', 'crown', 'gold'],
      ['Sociable', 'Parraine 5 personnes', 'users', 'blue'],
      ['Assidu', 'Streak de 7 jours', 'flame', 'orange'],
      ['Dévoué', 'Complète 50 quêtes', 'star', 'purple'],
      ['Millionnaire', 'Atteins 1M de points', 'diamond', 'red'],
      ['Vétéran', 'Atteins le niveau 50', 'shield', 'dark'],
    ];
    const stmt = db.prepare("INSERT INTO badges (id, name, description, icon, color) VALUES (?, ?, ?, ?, ?)");
    for (const b of badges) stmt.run([uid(), b[0], b[1], b[2], b[3]]);
  }
  
  // Seed achievements
  let achCount = db.exec("SELECT COUNT(*) as c FROM achievements");
  if (!achCount.length || !achCount[0].values[0][0]) {
    const achievements = [
      ['Débutant', 'Gagne 100 points', 'points', 100, 50, 10, 'star', 'common'],
      ['Apprenti', 'Gagne 1000 points', 'points', 1000, 100, 25, 'star', 'common'],
      ['Expert', 'Gagne 10000 points', 'points', 10000, 500, 100, 'star', 'rare'],
      ['Maître', 'Gagne 100000 points', 'points', 100000, 2000, 500, 'crown', 'legendary'],
      ['Niveau 5', 'Atteins le niveau 5', 'level', 5, 200, 50, 'arrow-up', 'common'],
      ['Niveau 25', 'Atteins le niveau 25', 'level', 25, 1000, 250, 'arrow-up', 'rare'],
      ['Niveau 50', 'Atteins le niveau 50', 'level', 50, 5000, 1000, 'arrow-up', 'legendary'],
      ['Streak 3', '3 jours de streak', 'streak', 3, 100, 20, 'flame', 'common'],
      ['Streak 14', '14 jours de streak', 'streak', 14, 500, 100, 'flame', 'rare'],
      ['Streak 30', '30 jours de streak', 'streak', 30, 2000, 500, 'fire', 'legendary'],
      ['Parrain 1', 'Parraine 1 personne', 'referrals', 1, 100, 25, 'user-plus', 'common'],
      ['Parrain 10', 'Parraine 10 personnes', 'referrals', 10, 1000, 250, 'users', 'rare'],
      ['Parrain 50', 'Parraine 50 personnes', 'referrals', 50, 5000, 1000, 'users', 'legendary'],
      ['Quêtes 10', 'Complète 10 quêtes', 'quests', 10, 200, 50, 'tasks', 'common'],
      ['Quêtes 100', 'Complète 100 quêtes', 'quests', 100, 2000, 500, 'tasks', 'rare'],
    ];
    const stmt = db.prepare("INSERT INTO achievements (id, name, description, requirement_type, requirement_value, reward_points, reward_xp, icon, rarity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const a of achievements) stmt.run([uid(), a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7]]);
  }
  
  // Seed mini games
  let gameCount = db.exec("SELECT COUNT(*) as c FROM mini_games");
  if (!gameCount.length || !gameCount[0].values[0][0]) {
    const games = [
      ['Roulette', 'Tourne la roulette et gagne gros !', 'roulette', 10, 1000, 0.05],
      ['Pile ou Face', '50% de chance de doubler ta mise', 'coinflip', 5, 500, 0.02],
      ['Dés', 'Lance les dés et teste ta chance', 'dice', 10, 500, 0.08],
      ['Blackjack', 'Le classique du casino', 'blackjack', 25, 2000, 0.03],
    ];
    const stmt = db.prepare("INSERT INTO mini_games (id, name, description, game_type, min_bet, max_bet, house_edge) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const g of games) stmt.run([uid(), g[0], g[1], g[2], g[3], g[4], g[5]]);
  }

  // Seed shop items
  let shopCount = db.exec("SELECT COUNT(*) as c FROM shop_items");
  if (!shopCount.length || !shopCount[0].values[0][0]) {
    const items = [
      ['Rôle VIP', 'Rôle exclusif sur le serveur', 5000, 'role', -1],
      ['100 Robux', 'Crédit Roblox', 150, 'code', 50],
      ['Rôle Premium', 'Rôle premium avec perks', 15000, 'role', -1],
      ['Carte Steam 5€', 'Code Steam', 3000, 'code', 10],
      ['Badge Exclusif', 'Badge unique sur ton profil', 2000, 'digital', -1],
      ['Nitro Boost 1 mois', 'Discord Nitro', 25000, 'code', 5],
    ];
    const stmt = db.prepare("INSERT INTO shop_items (id, name, description, price, type, stock) VALUES (?, ?, ?, ?, ?, ?)");
    for (const i of items) stmt.run([uid(), i[0], i[1], i[2], i[3], i[4]]);
  }

  // Seed quests
  let questCount = db.exec("SELECT COUNT(*) as c FROM quests");
  if (!questCount.length || !questCount[0].values[0][0]) {
    const quests = [
      ['Premier Pas', 'Gagne 100 points', 'daily', 100, 50, 'points', 'target'],
      ['Collecteur', 'Gagne 500 points', 'weekly', 500, 200, 'points', 'gem'],
      ['Social', 'Parraine 1 ami', 'weekly', 1, 300, 'points', 'users'],
      ['Dévoué', 'Streak de 3 jours', 'daily', 3, 100, 'points', 'flame'],
      ['Dépensier', 'Dépense 1000 points', 'weekly', 1000, 250, 'points', 'cart'],
    ];
    const stmt = db.prepare("INSERT INTO quests (id, title, description, type, goal, reward, reward_type, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const q of quests) stmt.run([uid(), q[0], q[1], q[2], q[3], q[4], q[5], q[6]]);
  }

  save();
}

function query(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('WITH')) {
      const rows = stmt.getAsObject(params);
      stmt.free();
      return rows;
    }
    stmt.run(params);
    stmt.free();
    save();
    return null;
  } catch (e) {
    console.error('DB error:', sql, params, e.message);
    return null;
  }
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = stmt.getAsObject(params);
  // getAsObject returns one row; need to iterate
  let results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results.length ? results : (rows && rows.id ? [rows] : []);
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
  // Nombre de lignes réellement modifiées (0 si ignoré par INSERT OR IGNORE, etc.)
  return db.getRowsModified();
}

function getOrCreateUser(id, username) {
  let user = get("SELECT * FROM users WHERE id = ?", [id]);
  if (!user) {
    run("INSERT INTO users (id, username, role) VALUES (?, ?, ?)", [id, username || 'Inconnu', id === OWNER_ID ? 'admin' : 'member']);
    user = get("SELECT * FROM users WHERE id = ?", [id]);
  } else if (username && user.username === 'Inconnu') {
    run("UPDATE users SET username = ?, updated_at = datetime('now','localtime') WHERE id = ?", [username, id]);
    user.username = username;
  }
  return user;
}

function addPoints(userId, amount, desc) {
  run("UPDATE users SET points = points + ?, updated_at = datetime('now','localtime') WHERE id = ?", [amount, userId]);
  run("INSERT INTO transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)", [uid(), userId, amount > 0 ? 'earn' : 'spend', amount, desc || `${Math.abs(amount)} points`]);
  return get("SELECT * FROM users WHERE id = ?", [userId]);
}

function setPoints(userId, amount) {
  run("UPDATE users SET points = ?, updated_at = datetime('now','localtime') WHERE id = ?", [amount, userId]);
  return get("SELECT * FROM users WHERE id = ?", [userId]);
}

function addXP(userId, amount) {
  let user = get("SELECT * FROM users WHERE id = ?", [userId]);
  if (!user) return null;
  let newXP = user.xp + amount;
  let newLevel = user.level;
  while (newXP >= newLevel * 120) {
    newXP -= newLevel * 120;
    newLevel++;
  }
  run("UPDATE users SET xp = ?, level = ?, updated_at = datetime('now','localtime') WHERE id = ?", [newXP, newLevel, userId]);
  return get("SELECT * FROM users WHERE id = ?", [userId]);
}

function getLeaderboard(limit = 10) {
  return all("SELECT id, username, points, level FROM users ORDER BY points DESC LIMIT ?", [limit]);
}

function getGlobalStats() {
  let totalUsers = get("SELECT COUNT(*) as c FROM users").c;
  let totalPoints = get("SELECT COALESCE(SUM(points),0) as s FROM users").s;
  let totalTx = get("SELECT COUNT(*) as c FROM transactions").c;
  let ticketsOpen = get("SELECT COUNT(*) as c FROM tickets WHERE status IN ('open','in_progress')").c;
  let activeToday = get("SELECT COUNT(DISTINCT user_id) as c FROM transactions WHERE date(created_at) = date('now','localtime')").c;

  let oldest = get("SELECT MIN(created_at) as d FROM users").d;
  let serverAge = 'Moins d\'un jour';
  if (oldest) {
    let days = Math.floor((Date.now() - new Date(oldest.replace(' ', 'T')).getTime()) / 86400000);
    if (days > 0) serverAge = `${days} jour${days > 1 ? 's' : ''}`;
    else serverAge = 'Moins d\'un jour';
  }

  return { totalUsers, activeToday, totalPoints, totalTransactions: totalTx, ticketsOpen, serverAge };
}

function createTicket(userId, subject, message, category) {
  let id = uid();
  run("INSERT INTO tickets (id, user_id, subject, message, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))", [id, userId, subject, message, category || 'general']);
  return get("SELECT * FROM tickets WHERE id = ?", [id]);
}

function getUserTickets(userId) {
  return all("SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC", [userId]);
}

function getAllTickets() {
  return all("SELECT t.*, u.username FROM tickets t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC");
}

function updateTicketStatus(ticketId, status, notes) {
  let resolved = status === 'resolved' ? new Date().toISOString() : null;
  run("UPDATE tickets SET status = ?, admin_notes = ?, resolved_at = ?, updated_at = datetime('now','localtime') WHERE id = ?", [status, notes || null, resolved, ticketId]);
  return get("SELECT * FROM tickets WHERE id = ?", [ticketId]);
}

function addTicketMessage(ticketId, userId, content, isAdmin) {
  run("INSERT INTO ticket_messages (id, ticket_id, user_id, content, is_admin) VALUES (?, ?, ?, ?, ?)", [uid(), ticketId, userId, content, isAdmin ? 1 : 0]);
  run("UPDATE tickets SET updated_at = datetime('now','localtime') WHERE id = ?", [ticketId]);
  return { id: uid(), content, is_admin: isAdmin ? 1 : 0 };
}

function getTicketMessages(ticketId) {
  return all("SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC", [ticketId]);
}

function generateReferralCode(userId) {
  // Un seul code par utilisateur
  let own = get("SELECT * FROM referrals WHERE referrer_id = ? LIMIT 1", [userId]);
  if (own) return own;

  let code = Math.random().toString(36).slice(2, 10).toUpperCase();
  while (get("SELECT id FROM referrals WHERE code = ?", [code])) {
    code = Math.random().toString(36).slice(2, 10).toUpperCase();
  }

  let id = uid();
  run("INSERT INTO referrals (id, code, referrer_id) VALUES (?, ?, ?)", [id, code, userId]);
  return get("SELECT * FROM referrals WHERE id = ?", [id]);
}

function getReferralCode(userId) {
  return get("SELECT * FROM referrals WHERE referrer_id = ?", [userId]);
}

function useReferralCode(code, referredId) {
  let ref = get("SELECT * FROM referrals WHERE code = ?", [code]);
  if (!ref) return null;
  if (ref.referred_id) return null;
  if (ref.referrer_id === referredId) return null;
  // Les deux comptes doivent exister avant les UPDATE de points
  getOrCreateUser(ref.referrer_id);
  getOrCreateUser(referredId);
  run("UPDATE referrals SET referred_id = ?, used_count = used_count + 1 WHERE id = ?", [referredId, ref.id]);
  addPoints(ref.referrer_id, 100, 'Parrainage de ' + referredId);
  addPoints(referredId, 50, 'Utilisation du code ' + code);
  return get("SELECT * FROM referrals WHERE id = ?", [ref.id]);
}

function getReferralStats(userId) {
  // Un code par utilisateur : `used_count` est le vrai nombre de parrainages réussis
  let r = get("SELECT COALESCE(SUM(used_count),0) as used, COUNT(referred_id) as stored FROM referrals WHERE referrer_id = ?", [userId]);
  return { count: r.used, used: r.used, firstReferred: r.stored > 0 };
}

function getTopReferrers(limit = 10) {
  return all("SELECT r.referrer_id as id, u.username, SUM(r.used_count) as count FROM referrals r LEFT JOIN users u ON r.referrer_id = u.id GROUP BY r.referrer_id ORDER BY count DESC LIMIT ?", [limit]);
}

function getUserBadges(userId) {
  let allb = all("SELECT * FROM badges");
  let unlockedSet = new Set(all("SELECT badge_id FROM user_badges WHERE user_id = ?", [userId]).map(r => r.badge_id));
  return allb.map(b => ({ ...b, unlocked: unlockedSet.has(b.id) }));
}

function checkAndUnlockBadges(userId) {
  let user = get("SELECT * FROM users WHERE id = ?", [userId]);
  if (!user) return [];

  let allBadges = all("SELECT * FROM badges");
  let unlockedSet = new Set(all("SELECT badge_id FROM user_badges WHERE user_id = ?", [userId]).map(r => r.badge_id));
  let newlyUnlocked = [];

  for (let badge of allBadges) {
    if (unlockedSet.has(badge.id)) continue;
    let shouldUnlock = false;
    if (badge.name === 'Premiers Pas' && user.tasks_completed >= 1) shouldUnlock = true;
    if (badge.name === 'Collectionneur' && user.points >= 500) shouldUnlock = true;
    if (badge.name === 'Légende' && user.level >= 10) shouldUnlock = true;
    if (badge.name === 'Sociable' && user.invite_count >= 5) shouldUnlock = true;
    if (badge.name === 'Assidu' && user.daily_streak >= 7) shouldUnlock = true;
    if (badge.name === 'Dévoué' && user.tasks_completed >= 50) shouldUnlock = true;
    if (badge.name === 'Millionnaire' && user.points >= 1000000) shouldUnlock = true;
    if (badge.name === 'Vétéran' && user.level >= 50) shouldUnlock = true;

    if (shouldUnlock) {
      const added = run("INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)", [userId, badge.id]);
      if (added) {
        createNotification(userId, 'Badge débloqué : ' + badge.name, badge.description || '', 'reward');
        newlyUnlocked.push(badge);
      }
    }
  }

  return newlyUnlocked;
}

function getUserNotifications(userId) {
  return all("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", [userId]);
}

function createNotification(userId, title, message, type) {
  let id = uid();
  run("INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)", [id, userId, title, message, type || 'info']);
  return { id };
}

// Achievement functions
function getAchievements() {
  return all("SELECT * FROM achievements WHERE active = 1");
}

function getUserAchievements(userId) {
  let allAch = all("SELECT * FROM achievements WHERE active = 1");
  let userAch = all("SELECT * FROM user_achievements WHERE user_id = ?", [userId]);
  let userAchMap = new Map(userAch.map(a => [a.achievement_id, a]));
  return allAch.map(a => ({ ...a, ...userAchMap.get(a.id), unlocked: userAchMap.has(a.id) }));
}

function checkAndUnlockAchievements(userId) {
  let user = get("SELECT * FROM users WHERE id = ?", [userId]);
  if (!user) return;
  
  let achievements = all("SELECT * FROM achievements WHERE active = 1");
  let userAch = all("SELECT achievement_id FROM user_achievements WHERE user_id = ?", [userId]);
  let unlockedSet = new Set(userAch.map(a => a.achievement_id));
  
  for (let ach of achievements) {
    if (unlockedSet.has(ach.id)) continue;
    
    let progress = 0;
    let shouldUnlock = false;
    
    switch (ach.requirement_type) {
      case 'points':
        progress = user.points;
        shouldUnlock = progress >= ach.requirement_value;
        break;
      case 'level':
        progress = user.level;
        shouldUnlock = progress >= ach.requirement_value;
        break;
      case 'streak':
        progress = user.daily_streak;
        shouldUnlock = progress >= ach.requirement_value;
        break;
      case 'referrals':
        progress = user.invite_count;
        shouldUnlock = progress >= ach.requirement_value;
        break;
      case 'quests':
        progress = user.tasks_completed;
        shouldUnlock = progress >= ach.requirement_value;
        break;
    }
    
    // Update progress
    run("INSERT OR REPLACE INTO user_achievements (user_id, achievement_id, progress) VALUES (?, ?, ?)", 
        [userId, ach.id, progress]);
    
    if (shouldUnlock) {
      run("INSERT OR REPLACE INTO user_achievements (user_id, achievement_id, progress, completed, unlocked_at) VALUES (?, ?, ?, 1, datetime('now','localtime'))", 
          [userId, ach.id, progress]);
      
      // Give rewards
      if (ach.reward_points > 0) addPoints(userId, ach.reward_points, 'Achievement: ' + ach.name);
      if (ach.reward_xp > 0) addXP(userId, ach.reward_xp);
      
      createNotification(userId, '🏆 Achievement Unlocked!', ach.name + ': ' + ach.description, 'achievement');
    }
  }
}

// Mini games functions
function getMiniGames() {
  return all("SELECT * FROM mini_games WHERE active = 1");
}

function playMiniGame(userId, gameId, betAmount) {
  let user = get("SELECT * FROM users WHERE id = ?", [userId]);
  let game = get("SELECT * FROM mini_games WHERE id = ?", [gameId]);
  
  if (!user || !game) return null;
  if (betAmount < game.min_bet || betAmount > game.max_bet) return null;
  if (user.points < betAmount) return null;
  
  let resultAmount = 0;
  let outcome = 'loss';
  
  // Simple game logic based on type
  switch (game.game_type) {
    case 'coinflip':
      if (Math.random() < 0.5 - game.house_edge) {
        resultAmount = betAmount * 2;
        outcome = 'win';
      }
      break;
    case 'roulette':
      const rouletteNum = Math.floor(Math.random() * 37);
      if (rouletteNum === 0) {
        // Zero - house wins
      } else if (rouletteNum % 2 === 0) {
        resultAmount = Math.floor(betAmount * (1 + (1 - game.house_edge)));
        outcome = 'win';
      }
      break;
    case 'dice':
      const dice1 = Math.floor(Math.random() * 6) + 1;
      const dice2 = Math.floor(Math.random() * 6) + 1;
      if (dice1 + dice2 > 7) {
        resultAmount = Math.floor(betAmount * (1 + (1 - game.house_edge)));
        outcome = 'win';
      }
      break;
    default:
      // Random chance
      if (Math.random() < 0.45) {
        resultAmount = Math.floor(betAmount * 2);
        outcome = 'win';
      }
  }
  
  // Deduct bet
  addPoints(userId, -betAmount, 'Game bet: ' + game.name);
  
  // Add winnings
  if (resultAmount > 0) {
    addPoints(userId, resultAmount, 'Game win: ' + game.name);
  }
  
  // Record session
  let sessionId = uid();
  run("INSERT INTO game_sessions (id, user_id, game_id, bet_amount, result_amount, outcome) VALUES (?, ?, ?, ?, ?, ?)", 
      [sessionId, userId, gameId, betAmount, resultAmount, outcome]);
  
  return { sessionId, outcome, resultAmount, profit: resultAmount - betAmount };
}

function getUserGameHistory(userId, limit = 20) {
  return all(`
    SELECT gs.*, mg.name as game_name 
    FROM game_sessions gs 
    JOIN mini_games mg ON gs.game_id = mg.id 
    WHERE gs.user_id = ? 
    ORDER BY gs.played_at DESC 
    LIMIT ?
  `, [userId, limit]);
}

// Additional helper functions
function searchUsers(query, limit = 20) {
  return all("SELECT * FROM users WHERE username LIKE ? LIMIT ?", ['%' + query + '%', limit]);
}

function getWeeklyStats() {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  return {
    users: 0, // Simplified for now
    points: 0,
    activity: 0
  };
}

function getMonthlyStats() {
  const monthStart = new Date();
  monthStart.setMonth(monthStart.getMonth() - 1);
  return {
    users: 0, // Simplified for now
    points: 0,
    activity: 0
  };
}

function getActiveQuests() {
  return all("SELECT * FROM quests WHERE active = 1");
}

function getUserQuests(userId) {
  return all(`
    SELECT q.*, uq.progress, uq.completed, uq.claimed 
    FROM quests q 
    LEFT JOIN user_quests uq ON q.id = uq.quest_id AND uq.user_id = ? 
    WHERE q.active = 1
  `, [userId]);
}

function completeQuest(userId, questId) {
  const quest = get("SELECT * FROM quests WHERE id = ?", [questId]);
  if (!quest) return null;
  
  run("INSERT OR REPLACE INTO user_quests (user_id, quest_id, progress, completed, completed_at) VALUES (?, ?, ?, 1, datetime('now','localtime'))", 
      [userId, questId, quest.goal]);
  
  if (quest.reward_type === 'points') {
    addPoints(userId, quest.reward, 'Quest: ' + quest.title);
  } else if (quest.reward_type === 'xp') {
    addXP(userId, quest.reward);
  }
  
  return { success: true, reward: quest.reward, type: quest.reward_type };
}

function purchaseItem(userId, itemId) {
  return buyItem(userId, itemId);
}

function markNotificationRead(notifId) {
  run("UPDATE notifications SET is_read = 1 WHERE id = ?", [notifId]);
}

function markAllNotificationsRead(userId) {
  run("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [userId]);
}

function getWeeklyActivity(userId) {
  let now = new Date();
  let weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  let ws = weekStart.toISOString();
  let act = get("SELECT * FROM weekly_activity WHERE user_id = ? AND week_start = ?", [userId, ws]);
  if (!act) {
    run("INSERT INTO weekly_activity (id, user_id, week_start) VALUES (?, ?, ?)", [uid(), userId, ws]);
    act = get("SELECT * FROM weekly_activity WHERE user_id = ? AND week_start = ?", [userId, ws]);
  }
  return act;
}

function updateWeeklyActivity(userId, points, xp, tasks) {
  let now = new Date();
  let weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  let ws = weekStart.toISOString();
  let act = get("SELECT * FROM weekly_activity WHERE user_id = ? AND week_start = ?", [userId, ws]);
  if (!act) {
    run("INSERT INTO weekly_activity (id, user_id, week_start, points, xp, tasks_done) VALUES (?, ?, ?, ?, ?, ?)", [uid(), userId, ws, points, xp, tasks || 0]);
  } else {
    run("UPDATE weekly_activity SET points = points + ?, xp = xp + ?, tasks_done = tasks_done + ? WHERE id = ?", [points, xp, tasks || 0, act.id]);
  }
}

function getUserTransactions(userId, limit = 20) {
  return all("SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", [userId, limit]);
}

function getUserPurchases(userId) {
  return all("SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC", [userId]);
}

function getShopItems() {
  return all("SELECT * FROM shop_items WHERE active = 1 ORDER BY created_at DESC");
}

/** Cherche un article par ID exact, ou par nom (insensible à la casse). */
function getShopItem(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  return get("SELECT * FROM shop_items WHERE id = ? AND active = 1", [q])
    || get("SELECT * FROM shop_items WHERE lower(name) = lower(?) AND active = 1", [q])
    || get("SELECT * FROM shop_items WHERE lower(name) LIKE lower(?) AND active = 1 ORDER BY created_at DESC", [`%${q}%`]);
}

/** Nombre d'exemplaires déjà vendus d'un article (null = stock illimité). */
function getItemSold(itemId) {
  return get("SELECT COUNT(*) as c FROM purchases WHERE item_id = ? AND status = 'completed'", [itemId]).c;
}

/** Force un niveau + recalcule l'XP cohérent avec la formule (niv * 120). */
function setLevel(userId, level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  let xp = get("SELECT COALESCE(SUM(points),0) as s FROM users WHERE id = ?", [userId]).s;
  // On garde un XP dans la tranche du niveau pour ne pas repartir de 0
  xp = xp % (lv * 120);
  run("UPDATE users SET level = ?, xp = ?, updated_at = datetime('now','localtime') WHERE id = ?", [lv, xp, userId]);
  return get("SELECT * FROM users WHERE id = ?", [userId]);
}

function buyItem(userId, itemId) {
  let item = get("SELECT * FROM shop_items WHERE id = ? AND active = 1", [itemId]);
  if (!item) return null;
  let user = get("SELECT * FROM users WHERE id = ?", [userId]);
  if (!user) return null;
  if (user.points < item.price) return null;
  // stock négatif ou nul = illimité ; sinon c'est un quota réel
  if (item.stock != null && item.stock >= 0) {
    let sold = get("SELECT COUNT(*) as c FROM purchases WHERE item_id = ? AND status = 'completed'", [itemId]).c;
    if (sold >= item.stock) return null;
  }
  run("UPDATE users SET points = points - ?, updated_at = datetime('now','localtime') WHERE id = ?", [item.price, userId]);
  run("INSERT INTO transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)", [uid(), userId, 'purchase', -item.price, 'Achat: ' + item.name]);
  run("INSERT INTO purchases (id, user_id, item_id, item_name, item_type, price) VALUES (?, ?, ?, ?, ?, ?)", [uid(), userId, item.id, item.name, item.type, item.price]);
  return item;
}

function claimDaily(userId) {
  let user = get("SELECT * FROM users WHERE id = ?", [userId]);
  if (!user) return null;
  let now = new Date();
  let last = user.last_daily ? new Date(user.last_daily) : null;
  let streak = user.daily_streak || 0;
  if (last) {
    let diff = (now - last) / (1000 * 60 * 60 * 24);
    if (diff < 1) return null;
    if (diff >= 2) streak = 0;
  }
  streak++;
  if (streak > 30) streak = 30;
  let reward = 100 + (streak - 1) * 25;
  run("UPDATE users SET points = points + ?, daily_streak = ?, last_daily = ?, updated_at = datetime('now','localtime') WHERE id = ?", [reward, streak, now.toISOString(), userId]);
  run("INSERT INTO transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)", [uid(), userId, 'daily', reward, 'Daily récompense (streak: ' + streak + ')']);
  return { reward, streak };
}

function getQuests() {
  return all("SELECT * FROM quests WHERE active = 1");
}

function getRecentActivity(userId, limit = 10) {
  return all(`SELECT * FROM (
    SELECT created_at as date, type || ' ' || COALESCE(description,'') as text, type FROM transactions WHERE user_id = ?
    UNION ALL
    SELECT created_at, 'Notification: ' || title, 'notification' FROM notifications WHERE user_id = ?
  ) ORDER BY date DESC LIMIT ?`, [userId, userId, limit]);
}

module.exports = {
  init, getOrCreateUser, addPoints, setPoints, addXP, getLeaderboard,
  getGlobalStats, createTicket, getUserTickets, getAllTickets,
  updateTicketStatus, addTicketMessage, getTicketMessages,
  generateReferralCode, getReferralCode, useReferralCode,
  getReferralStats, getTopReferrers,
  getUserBadges, checkAndUnlockBadges,
  getUserNotifications, createNotification, markNotificationRead, markAllNotificationsRead,
  getWeeklyActivity, updateWeeklyActivity,
  getUserTransactions, getUserPurchases, getShopItems, buyItem,
  getShopItem, getItemSold, setLevel,
  claimDaily, getQuests, getRecentActivity, uid,
  // New functions
  getAchievements, getUserAchievements, checkAndUnlockAchievements,
  getMiniGames, playMiniGame, getUserGameHistory,
  searchUsers, getWeeklyStats, getMonthlyStats, getActiveQuests,
  getUserQuests, completeQuest, purchaseItem
};
