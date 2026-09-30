/**
 * Régressions sur les bugs corrigés.
 * Lance avec : npm test
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// La base de test doit être isolée de giftblox.db
const TMP = path.join(os.tmpdir(), `giftblox_test_${process.pid}.db`);
process.env.DB_PATH = TMP;

const db = require('../database/db.js');

process.on('exit', () => { try { fs.unlinkSync(TMP); } catch {} });

/* ================================================================== */
/* 1. Le helper all() : régression de la première ligne perdue        */
/* ================================================================== */

test('all() retourne TOUTES les lignes, y compris la première', async () => {
  await db.init();

  for (let i = 1; i <= 7; i++) db.addPoints(`row${i}`, i * 100, `seed ${i}`);

  const board = db.getLeaderboard(10);
  assert.strictEqual(board.length, 7, 'les 7 membres doivent être retournés');
  assert.strictEqual(board[0].id, 'row7', 'le premier résultat ne doit pas être perdu');
  assert.deepStrictEqual(
    board.map(u => u.id),
    ['row7', 'row6', 'row5', 'row4', 'row3', 'row2', 'row1'],
    'ordre décroissant par points'
  );
});

test('getOrCreateUser est idempotent', () => {
  const u = db.getOrCreateUser('solo', 'solo');
  assert.strictEqual(u.id, 'solo');
  assert.strictEqual(u.username, 'solo');
  assert.strictEqual(db.getOrCreateUser('solo', 'solo').username, 'solo');
});

test('les tables de référence ne perdent plus de ligne', () => {
  const games = db.getMiniGames();
  assert.strictEqual(games.length, 4, 'les 4 mini-jeux doivent être présents');
  assert.ok(games.some(g => g.game_type === 'roulette'), 'Roulette doit exister');

  assert.strictEqual(db.getAchievements().length, 15, '15 succès');
  assert.strictEqual(db.getActiveQuests().length, 5, '5 quêtes');
  assert.strictEqual(db.getShopItems().length, 6, '6 articles');
  assert.strictEqual(db.getUserBadges('inexistant').length, 8, '8 badges');
});

test('getUserAchievements renvoie le premier succès', () => {
  const all = db.getUserAchievements('row1');
  assert.strictEqual(all.length, 15);
  assert.ok(all.every(a => 'unlocked' in a), 'chaque succès expose "unlocked"');
});

/* ================================================================== */
/* 2. Intégrité de l'économie                                          */
/* ================================================================== */

test('les jeux restent solvable : jamais de gain abusif', () => {
  for (const g of db.getMiniGames()) {
    const id = `jeu_${g.game_type}`;
    db.getOrCreateUser(id, 'test');
    db.setPoints(id, 10_000_000);
    const bet = g.min_bet;

    for (let i = 0; i < 250; i++) {
      const r = db.playMiniGame(id, g.id, bet);
      assert.ok(r, `${g.game_type} doit retourner un résultat`);
      assert.ok(['win', 'loss', 'push'].includes(r.outcome), `outcome invalide : ${r.outcome}`);
      assert.strictEqual(typeof r.result_amount, 'number', 'result_amount doit être numérique');
      assert.strictEqual(typeof r.hand, 'string', 'la main doit être décrite');
      if (r.outcome === 'loss') assert.strictEqual(r.result_amount, 0, 'une défaite ne paie rien');
      if (r.outcome === 'push') {
        // la mise est rendue : result_amount vaut exactement la mise et le net est 0
        assert.strictEqual(r.result_amount, bet, 'une égalité rend la mise');
        assert.strictEqual(r.profit, 0, 'une égalité ne doit rien faire gagner ni perdre');
      }
      if (r.outcome === 'win') assert.ok(r.result_amount <= bet * 2.5, 'gain plafonné');
    }
  }
});

test('playMiniGame respecte les limites de mise', () => {
  const g = db.getMiniGames().find(x => x.game_type === 'roulette');
  db.getOrCreateUser('limites', 'limites');
  db.setPoints('limites', 10_000_000);
  assert.strictEqual(db.playMiniGame('limites', g.id, g.min_bet - 1), null, 'mise trop basse refusée');
  assert.strictEqual(db.playMiniGame('limites', g.id, g.max_bet + 1), null, 'mise trop haute refusée');
  assert.ok(db.playMiniGame('limites', g.id, g.min_bet), 'mise valide acceptée');
});

test('blackjack respecte les règles de base', () => {
  const g = db.getMiniGames().find(x => x.game_type === 'blackjack');
  const id = 'bj_rules';
  db.getOrCreateUser(id, 'bj');
  db.setPoints(id, 10_000_000);

  for (let i = 0; i < 200; i++) {
    const r = db.playMiniGame(id, g.id, g.min_bet);
    const m = r.hand.match(/→ \*\*(\d+)\*\*/g) || [];
    const player = Number(m[0].replace(/\D/g, ''));
    const dealer = Number(m[1].replace(/\D/g, ''));
    if (player > 21) {
      assert.strictEqual(r.outcome, 'loss', 'un joueur qui bust perd, meme si le croupier bust aussi');
    } else if (dealer > 21) {
      assert.strictEqual(r.outcome, 'win', 'un croupier qui bust fait gagner');
    }
    if (player === dealer && player <= 21 && dealer <= 21) {
      assert.strictEqual(r.outcome, 'push', 'égalité ⇒ push');
    }
  }
});

/* ================================================================== */
/* 3. Fonctions analytiques (elles renvoyaient des zéros en dur)      */
/* ================================================================== */

test('getWeeklyStats / getMonthlyStats renvoient des chiffres réels', () => {
  const w = db.getWeeklyStats();
  const m = db.getMonthlyStats();
  for (const k of ['users', 'points', 'activity']) {
    assert.strictEqual(typeof w[k], 'number', `weekly.${k} numérique`);
    assert.ok(w[k] > 0, `weekly.${k} doit être > 0 (il y a des données)`);
    assert.ok(m[k] >= w[k], 'le mois englobe la semaine');
  }
});

test('getActivitySeries renvoie une série continue de la bonne taille', () => {
  const s = db.getActivitySeries(14);
  assert.strictEqual(s.labels.length, 14);
  assert.strictEqual(s.pointsGained.length, 14);
  assert.strictEqual(s.newUsers.length, 14);
  assert.strictEqual(s.activeUsers.length, 14);
  assert.ok(s.pointsGained.some(v => v > 0), 'des points ont été gagnés');
  assert.strictEqual(new Set(s.labels).size, 14, 'aucun jour dupliqué');
  for (const l of s.labels) assert.match(l, /^\d{4}-\d{2}-\d{2}$/);
});

test('getLevelDistribution renvoie des données', () => {
  const d = db.getLevelDistribution();
  assert.ok(d.labels.length > 0);
  assert.strictEqual(d.labels.length, d.data.length);
  assert.ok(d.data.every(v => typeof v === 'number'));
});

/* ================================================================== */
/* 4. Sécurité de l'API                                                */
/* ================================================================== */

test('les routes sensibles exigent un token', async () => {
  const { app } = require('../api.js');
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (p, o) => (await fetch(base + p, o)).status;

  for (const p of ['/api/daily/claim', '/api/buy', '/api/shop/purchase']) {
    assert.strictEqual(await call(p, { method: 'POST', body: '{}' }), 401, `${p} doit refuser`);
  }
  assert.strictEqual(await call('/api/admin/stats'), 401, 'admin/stats doit refuser');

  // un token bidon ne doit jamais passer
  assert.strictEqual(
    await call('/api/admin/stats', { headers: { Authorization: 'Bearer aaaabbbbccccdddd1111222233334444' } }),
    401,
    'un faux token doit être refusé'
  );

  // les lectures publiques restent ouvertes
  assert.strictEqual(await call('/api/health'), 200);
  assert.strictEqual(await call('/api/shop'), 200);
  assert.strictEqual(await call('/api/leaderboard'), 200);

  // un userId falsifié ne suffit plus à voler des points
  const r = await fetch(`${base}/api/daily/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalide' },
    body: JSON.stringify({ userId: 'pirate' }),
  });
  assert.strictEqual(r.status, 401);

server.closeAllConnections?.();
  await new Promise(r => server.close(r));
});

test('api.js ne déclare plus aucune route en double', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
  const found = [...src.matchAll(/app\.(get|post)\(\s*'([^']+)'/g)].map(m => `${m[1].toUpperCase()} ${m[2]}`);
  const dupes = found.filter((r, i) => found.indexOf(r) !== i);
  assert.deepStrictEqual([...new Set(dupes)], [], `routes dupliquées : ${dupes.join(', ')}`);
  assert.ok(found.length > 30, `${found.length} routes déclarées`);
});

/* ================================================================== */
/* 5. Anti-XSS                                                        */
/* ================================================================== */

test('esc() neutralise toute injection HTML', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'website', 'dashboard.js'), 'utf8');
  const esc = new Function(`${src.match(/function esc\(s\) \{[\s\S]*?\n\}/)[0]}; return esc;`)();

  const payloads = [
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    "javascript:alert('x')",
    "');alert(1);//",
    '<svg/onload=alert(1)>',
  ];
  for (const p of payloads) {
    const out = esc(p);
    assert.ok(!/[<>]/.test(out), `balise non échappée : ${p} → ${out}`);
    assert.ok(!out.includes('""'), `guillemet non échappé : ${out}`);
  }
  assert.strictEqual(esc(null), '', 'null géré');
  assert.strictEqual(esc(42), '42', 'nombre géré');
});

/* ================================================================== */
/* 6. Commandes Discord                                                */
/* ================================================================== */

test('les 18 commandes construisent un JSON valide', () => {
  const dir = path.join(__dirname, '..', 'commands');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  assert.strictEqual(files.length, 18, '18 commandes attendues');

  const names = new Set();
  for (const f of files) {
    const mod = require(path.join(dir, f));
    assert.ok(mod.data, `${f} exporte "data"`);
    assert.strictEqual(typeof mod.execute, 'function', `${f} exporte "execute"`);
    const json = mod.data.toJSON();
    assert.ok(json.name && json.description, `${f} a un nom et une description`);
    assert.ok(!names.has(json.name), `doublon de commande : ${json.name}`);
    names.add(json.name);
    assert.ok(json.name.length <= 32, `${f} : nom trop long pour Discord`);
    for (const opt of json.options || []) {
      if (opt.type === 1) {
        assert.ok(typeof opt.name === 'string' && opt.name.length >= 1, `${f} : nom de sous-commande invalide`);
        assert.ok(Array.isArray(opt.options), `${f}/${opt.name} : options manquantes`);
        for (const sub of opt.options) {
          assert.ok(sub.name && sub.description, `${f}/${opt.name} : sous-option incomplète`);
        }
      }
    }
  }

  for (const expected of ['quest', 'notifications', 'ticket', 'achievements', 'play', 'top']) {
    assert.ok(names.has(expected), `commande manquante : /${expected}`);
  }
});

test('le payload total reste sous la limite Discord (100)', () => {
  const dir = path.join(__dirname, '..', 'commands');
  const payload = fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .map(f => require(path.join(dir, f)).data.toJSON());
  assert.ok(payload.length <= 100, `${payload.length} commandes > 100 max`);
});

/* ================================================================== */
/* 7. Cohérence API ↔ dashboard                                       */
/* ================================================================== */

test('chaque endpoint appelé par le dashboard existe bien', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'website', 'dashboard.js'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');

  const called = new Set();
  for (const m of js.matchAll(/get\(\s*[`'"]([^`'"]+)/g)) called.add(m[1]);
  for (const m of js.matchAll(/post\(\s*[`'"]([^`'"]+)/g)) called.add(m[1]);

  const routes = new Set([...api.matchAll(/app\.(?:get|post)\(\s*'([^']+)'/g)].map(m => m[1]));

  const missing = [];
  for (const c of called) {
    // normalise ${...} en :param et préfixe /api (le helper du dashboard le fait)
    const route = ('/api' + c)
      .replace(/\$\{[^}]+\}/g, ':p')
      .split('?')[0]
      .replace(/\/+\$/, '/');
    const ok = [...routes].some(r => {
      const a = r.replace(/:[a-zA-Z]+/g, ':p').split('/');
      const b = route.split('/');
      return a.length === b.length && a.every((seg, i) => seg.startsWith(':') || seg === b[i]);
    });
    if (!ok) missing.push(c);
  }
  // le dashboard appelle des chemins relatifs : api() leur ajoute '/api'
  assert.deepStrictEqual(
    missing.filter(m => !/^\/api(\/|$)/.test(m)).map(m => m),
    [],
    `chemins hors API : ${missing.filter(m => !/^\/api(\/|$)/.test(m)).join(', ')}`
  );
  assert.deepStrictEqual(missing, [], `endpoints manquants dans api.js : ${missing.join(', ')}`);
});

test('le dashboard n\'injecte plus de userId dans le body', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'website', 'dashboard.js'), 'utf8');
  const bad = js.match(/post\([^)]*userId\s*:/g);
  assert.strictEqual(bad, null, `le dashboard ne doit plus envoyer userId : ${bad}`);
});
