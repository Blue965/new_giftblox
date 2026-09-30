/* GiftBlox — dashboard
 *
 * Deux règles structurantes :
 *  1. Le token Discord accompagne TOUTE requête /api (sinon l'API répond 401).
 *  2. Tout contenu venant du serveur est échappé avant insertion HTML.
 */
const OWNER_ID = '1527668994210005002';

const state = {
  user: {},
  charts: {},
  loaded: new Set(),
  season: null,
  ticketFilter: 'open',
  achFilter: 'all',
  shopFilter: 'all',
  memberPage: 1,
  openTicket: null,
};

/* ---------------------------------------------------------------- helpers */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const nf = n => Number(n || 0).toLocaleString('fr-FR');
const el = (id) => document.getElementById(id);

const ROW = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:2.5px solid #2b2440;border-radius:16px;background:#fdf6ec;box-shadow:0 3px 0 #2b2440;font-weight:700';
const EMPTY = 'empty';
const TILE = 'width:52px;height:52px;display:flex;align-items:center;justify-content:center;border-radius:16px;background:#ede4ff;border:2.5px solid #2b2440;box-shadow:0 3px 0 #2b2440;font-size:18px;color:#5b32c9;flex-shrink:0';

function avatarUrl(id, avatar) {
  return avatar
    ? `https://cdn.discordapp.com/avatars/${esc(id)}/${esc(avatar)}.png?size=256`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function emptyState(msg) {
  return `<div class="${EMPTY}">${esc(msg)}</div>`;
}

function toast(title, msg, icon = 'check', color = '#12a37c') {
  const t = el('toast');
  const ti = el('toastIcon');
  ti.style.background = color + '22';
  ti.style.color = color;
  ti.innerHTML = `<i class="fas fa-${esc(icon)}"></i>`;
  el('toastTitle').textContent = title;
  el('toastMsg').textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ------------------------------------------------------------------- API */

function token() {
  return localStorage.getItem('discord_token');
}

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token() || ''}`,
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('Réponse invalide du serveur');
  }

  if (res.status === 401) {
    localStorage.removeItem('discord_user');
    localStorage.removeItem('discord_token');
    window.location.href = 'index.html';
    throw new Error('Session expirée');
  }
  if (!res.ok && json.code !== 'RATE_LIMIT') {
    throw new Error(json.message || json.error || `Erreur ${res.status}`);
  }
  return json;
}

const get = (p) => api(p);
const post = (p, body) => api(p, { method: 'POST', body: body || {} });

/* ------------------------------------------------------------------ auth */

function checkAuth() {
  const raw = localStorage.getItem('discord_user');
  if (!raw || !token()) {
    window.location.href = 'index.html';
    return;
  }
  let user;
  try {
    user = JSON.parse(raw);
  } catch {
    window.location.href = 'index.html';
    return;
  }
  state.user = user;
  if (user.username) {
    $$('.discord-username').forEach(e => (e.textContent = user.username));
    el('welcomeName').textContent = user.username;
    el('profileName').textContent = user.username;
  }
  el('profileId').textContent = user.id;
  const av = avatarUrl(user.id, user.avatar);
  $$('.avatar-img').forEach(e => (e.src = av));
  el('profileAvatar').src = av;

  if (user.id === OWNER_ID) {
    el('adminLink').classList.remove('hidden');
    el('ticketsLink').classList.remove('hidden');
  }
}

/* ---------------------------------------------------------------- charts */

const CHART_FONT = { family: "'Nunito',sans-serif", weight: '700' };

function chartOpts(tickSize = 11, opts = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, ...opts.plugins },
    scales: {
      x: { grid: { display: false }, border: { color: '#2b2440' }, ticks: { color: '#8b83a3', font: { ...CHART_FONT, size: tickSize } } },
      y: { beginAtZero: true, grid: { color: 'rgba(43,36,64,.08)' }, border: { display: false }, ticks: { color: '#8b83a3', font: { ...CHART_FONT, size: tickSize } } },
    },
    ...opts.rest,
  };
}

function drawChart(id, config) {
  const canvas = el(id);
  if (!canvas) return;
  state.charts[id]?.destroy();
  state.charts[id] = new Chart(canvas.getContext('2d'), config);
}

const lineStyle = (color, fill) => ({
  borderColor: color,
  backgroundColor: fill,
  fill: true,
  tension: 0.4,
  pointRadius: 5,
  pointBackgroundColor: '#fff',
  pointBorderColor: '#2b2440',
  pointBorderWidth: 2.5,
  borderWidth: 3,
});

function shortDates(labels) {
  return labels.map(d => d.slice(5));
}

/* ------------------------------------------------------------------ home */

async function loadUser() {
  const j = await get(`/user/${state.user.id}`);
  if (!j.success) return;
  const d = j.data;
  state.user.points = d.points;

  ['#homePts', '#sbPts', '#shopPts', '#gamesPts'].forEach(s => {
    const e = $(s); if (e) e.textContent = nf(d.points);
  });
  ['#homeLvl', '#sbLvl', '#pfLvl'].forEach(s => {
    const e = $(s); if (e) e.textContent = d.level;
  });
  el('homeStreak').textContent = d.dailyStreak;
  el('homeTasks').textContent = d.tasksCompleted;

  const xpMax = d.level * 120;
  el('progBar').style.width = Math.min(100, (d.xp / xpMax) * 100).toFixed(1) + '%';
  el('progXp').textContent = d.xp;
  el('progXpMax').textContent = xpMax;

  const unlocked = (d.badges || []).filter(b => b.unlocked).length;
  el('badgeProgress').textContent = `${unlocked} / ${(d.badges || []).length}`;

  el('profileStats').innerHTML = `
    <div class="mini-stat"><div class="text-2xl font-black text-violet-deep">${nf(d.points)}</div><div class="text-[10px] font-extrabold uppercase label">pts</div></div>
    <div class="mini-stat"><div class="text-2xl font-black text-teal">${d.level}</div><div class="text-[10px] font-extrabold uppercase label">niveau</div></div>
    <div class="mini-stat"><div class="text-2xl font-black text-orange">${unlocked}</div><div class="text-[10px] font-extrabold uppercase label">badges</div></div>`;

  const recent = d.recentActivity || [];
  el('recentActivity').innerHTML = recent.length
    ? recent.map(a => `<div class="row-left"><span class="dot"></span><span class="muted">${esc(a.text || '')}</span><span class="row-date">${esc((a.date || '').slice(5, 10))}</span></div>`).join('')
    : emptyState('Aucune activité récente');

  // 7 derniers jours : stats globales réelles de l'API
  try {
    const s = await get('/analytics/series?days=7');
    const a = s.data.activity;
    drawChart('chartXP', {
      type: 'line',
      data: {
        labels: shortDates(a.labels),
        datasets: [{ label: 'Points gagnés', data: a.pointsGained, ...lineStyle('#7a4ff2', 'rgba(122,79,242,.15)') }],
      },
      options: chartOpts(10),
    });
  } catch { /* graphique non critique */ }

  const [purchases, tx] = await Promise.all([
    get(`/user/${state.user.id}/purchases`),
    get(`/user/${state.user.id}/transactions?limit=30`),
  ]);
  el('purchasesList').innerHTML = purchases.purchases?.length
    ? purchases.purchases.map(p => `<div style="${ROW}"><span>${esc(p.item_name)}</span><span class="neg">−${nf(p.price)} pts</span></div>`).join('')
    : emptyState('Aucun achat');

  el('transactionsList').innerHTML = tx.transactions?.length
    ? tx.transactions.map(t => `
        <div class="tx-row">
          <span class="muted">${esc(t.description || t.type)}</span>
          <span class="${t.amount > 0 ? 'pos' : 'neg'}">${t.amount > 0 ? '+' : ''}${nf(t.amount)}</span>
        </div>`).join('')
    : emptyState('Aucune transaction');

  // Streak visuel sur l'onglet Récompense
  const streak = d.dailyStreak || 0;
  el('dailyStreak').innerHTML = Array.from({ length: 14 }, (_, i) => {
    const on = i < streak;
    return `<div class="streak-day ${on ? 'on' : ''}"><i class="fas fa-fire"></i><span>J${i + 1}</span></div>`;
  }).join('');
  el('dailyEmoji').textContent = streak > 0 ? '🔥' : '🎁';
  el('btnDaily').disabled = false;
}

/* ------------------------------------------------------------ leaderboard */

async function loadLeaderboard() {
  const { success, data } = await get('/leaderboard?limit=25');
  if (!success || !data?.length) {
    el('leaderboardList').innerHTML = emptyState('Aucun membre pour le moment');
    el('podium').innerHTML = '';
    return;
  }

  const medal = ['🥇', '🥈', '🥉'];
  el('podium').innerHTML = data.slice(0, 3).map((x, i) => `
    <div class="podium-card rank-${i + 1}">
      <div class="medal">${medal[i]}</div>
      <div class="w-16 h-16 rounded-full overflow-hidden avatar-ring mx-auto mb-2"><img src="${avatarUrl(x.id, x.avatar)}" alt=""></div>
      <div class="font-extrabold truncate w-full text-center">${esc(x.username)}</div>
      <div class="font-black text-violet-deep">${nf(x.points)} <span class="text-[11px] muted">pts</span></div>
    </div>`).join('');

  el('leaderboardList').innerHTML = data.map((x, i) => {
    const me = x.id === state.user.id;
    return `<div style="${ROW};background:${me ? '#fff3d1' : '#fdf6ec'};${me ? 'border-width:3px' : ''}">
      <div style="display:flex;align-items:center;gap:14px">
        <span class="rank-badge">${i < 3 ? medal[i] : '#' + (i + 1)}</span>
        <span style="font-weight:800">${esc(x.username)}</span>
        ${me ? '<span class="tag-you">VOUS</span>' : ''}
      </div>
      <span class="font-black text-sm">${nf(x.points)} <span class="text-[11px] muted">pts</span></span>
    </div>`;
  }).join('');
}

/* ---------------------------------------------------------------- quests */

async function loadQuests() {
  const { success, quests } = await get('/quests');
  if (!success) return;

  const done = quests.filter(q => q.completed).length;
  const claimable = quests.filter(q => !q.completed && q.progress != null).length;
  el('questsSummary').innerHTML = `
    <div class="stat"><div class="text-[10px] font-extrabold uppercase label">Disponibles</div><div class="val">${quests.length}</div></div>
    <div class="stat"><div class="text-[10px] font-extrabold uppercase label">Terminées</div><div class="val">${done}</div></div>
    <div class="stat"><div class="text-[10px] font-extrabold uppercase label">En cours</div><div class="val">${claimable}</div></div>`;

  const icons = { target: 'fa-bullseye', gem: 'fa-gem', users: 'fa-users', flame: 'fa-fire', cart: 'fa-shopping-cart' };
  el('questsList').innerHTML = quests.length ? quests.map(q => {
    const pct = q.goal ? Math.min(100, Math.round(((q.progress || 0) / q.goal) * 100)) : 0;
    return `<div class="item">
      <div class="flex items-start gap-4 mb-4">
        <div style="${TILE}"><i class="fas ${icons[q.icon] || 'fa-star'}"></i></div>
        <div class="flex-1">
          <h3 class="font-bold leading-tight">${esc(q.title)}</h3>
          <p class="text-xs mt-1 muted font-bold">${esc(q.description || '')}</p>
        </div>
        <div class="text-right flex-shrink-0">
          <div class="font-black text-lg text-teal">+${nf(q.reward)}</div>
          <div class="text-[10px] font-extrabold muted">${esc(q.reward_type || 'points').toUpperCase()}</div>
        </div>
      </div>
      <div class="progress-track thin"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="flex justify-between text-[11px] font-bold muted mt-2">
        <span>${q.progress || 0} / ${nf(q.goal)}</span>
        <span>${pct}%</span>
      </div>
    </div>`;
  }).join('') : emptyState('Aucune quête disponible');
}

/* ------------------------------------------------------------------ shop */

async function loadShop() {
  const { success, items } = await get('/shop');
  if (!success) return;

  const cats = [...new Set(items.map(i => i.category || 'general'))];
  if (state.shopFilter === 'all' || !cats.includes(state.shopFilter)) state.shopFilter = 'all';
  el('shopFilters').innerHTML = [['all', 'Tout'], ...cats.map(c => [c, c])]
    .map(([v, l]) => `<button class="filter ${v === state.shopFilter ? 'on' : ''}" data-shop="${esc(v)}">${esc(l)}</button>`).join('');

  const icons = { role: 'fa-user-tag', code: 'fa-key', digital: 'fa-image', physical: 'fa-cube' };
  const list = items.filter(i => state.shopFilter === 'all' || (i.category || 'general') === state.shopFilter);

  el('shopList').innerHTML = list.length ? list.map(x => {
    const soldOut = x.stock === 0;
    return `<div class="item">
      <div class="flex items-start gap-4 mb-4">
        <div style="${TILE}"><i class="fas ${icons[x.type] || 'fa-gift'}"></i></div>
        <div class="flex-1">
          <h3 class="font-bold leading-tight">${esc(x.name)}</h3>
          <p class="text-xs mt-1 muted font-bold">${esc(x.description || '')}</p>
        </div>
      </div>
      <div class="flex items-center justify-between">
        <span class="font-black text-lg text-violet-deep">${nf(x.price)}<span class="text-[11px] font-bold ml-1 muted">pts</span></span>
        ${soldOut
          ? '<span class="tag-out">Rupture</span>'
          : `<button class="btn-mini" data-buy="${esc(x.id)}">Acheter</button>`}
      </div>
    </div>`;
  }).join('') : emptyState('Aucun article dans cette catégorie');
}

async function buyItem(id) {
  try {
    const j = await post('/buy', { itemId: id });
    if (j.success) {
      toast('Achat réussi', j.item.name, 'check', '#12a37c');
      await Promise.all([loadUser(), loadShop()]);
    } else {
      toast('Échec', j.error || 'Points insuffisants', 'times', '#d92d2d');
    }
  } catch (e) {
    toast('Échec', e.message, 'times', '#d92d2d');
  }
}

/* ----------------------------------------------------------------- games */

async function loadGames() {
  const [{ games }, { history }] = await Promise.all([
    get('/games'),
    get(`/user/${state.user.id}/games`),
  ]);

  const icons = { roulette: 'fa-dice-dotted', coinflip: 'fa-coins', dice: 'fa-dice', blackjack: 'fa-suit-diamond' };
  el('gamesList').innerHTML = (games || []).length ? games.map(g => `
    <div class="item">
      <div class="flex items-start gap-4 mb-4">
        <div style="${TILE}"><i class="fas ${icons[g.game_type] || 'fa-gamepad'}"></i></div>
        <div class="flex-1">
          <h3 class="font-bold leading-tight">${esc(g.name)}</h3>
          <p class="text-xs mt-1 muted font-bold">${esc(g.description || '')}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 mb-4">
        <input class="bet-input" type="number" min="${g.min_bet}" max="${g.max_bet}" value="${g.min_bet}" data-bet-for="${esc(g.id)}" aria-label="Mise">
        <span class="text-[11px] font-bold muted whitespace-nowrap">${nf(g.min_bet)} – ${nf(g.max_bet)}</span>
      </div>
      <button class="btn-p w-full" data-play="${esc(g.id)}"><i class="fas fa-play"></i>Jouer</button>
    </div>`).join('') : emptyState('Aucun jeu actif');

  el('gamesHistory').innerHTML = (history?.history || []).length
    ? history.history.map(h => `<div style="${ROW}">
        <span>${esc(h.game_name)} · ${nf(h.bet_amount)} pts</span>
        <span class="${h.outcome === 'win' ? 'pos' : 'neg'}">${h.outcome === 'win' ? '+' : ''}${nf(h.result_amount)}</span>
      </div>`).join('')
    : emptyState('Aucune partie jouée');
}

async function playGame(gameId) {
  const input = $(`[data-bet-for="${CSS.escape(gameId)}"]`);
  const bet = parseInt(input?.value || 0, 10);
  try {
    const j = await post(`/games/${gameId}/play`, { bet });
    if (!j.success) return toast('Refusé', j.error || 'Mise invalide', 'times', '#d92d2d');
    const r = j.result;
    toast(r.outcome === 'win' ? `+${nf(r.result_amount)} points` : `−${nf(r.bet_amount)} points`,
      r.outcome === 'win' ? 'Gagné ! 🎉' : 'Perdu…', r.outcome === 'win' ? 'trophy' : 'frown', r.outcome === 'win' ? '#12a37c' : '#d92d2d');
    await Promise.all([loadUser(), loadGames()]);
  } catch (e) {
    toast('Erreur', e.message, 'times', '#d92d2d');
  }
}

/* ------------------------------------------------------------- daily */

async function claimDaily() {
  const btn = el('btnDaily');
  btn.disabled = true;
  try {
    const j = await post('/daily/claim');
    if (j.success) {
      toast(`+${nf(j.reward)} points`, `Streak : ${j.streak} jours 🔥`, 'check', '#12a37c');
      el('dailyResult').innerHTML = `<div class="alert-ok"><i class="fas fa-check-circle"></i> +${nf(j.reward)} points ajoutés</div>`;
      await loadUser();
    } else {
      toast('Déjà réclamé', 'Reviens demain !', 'clock', '#e06a12');
      el('dailyResult').innerHTML = `<div class="alert-warn"><i class="fas fa-clock"></i> Tu as déjà récupéré ta récompense aujourd'hui</div>`;
    }
  } catch (e) {
    toast('Erreur', e.message, 'times', '#d92d2d');
  } finally {
    btn.disabled = false;
  }
}

/* ---------------------------------------------------------------- badges */

async function loadBadges() {
  const { success, data } = await get(`/user/${state.user.id}/badges`);
  if (!success) return;
  const bs = data.all || [];
  const unlocked = bs.filter(b => b.unlocked).length;
  el('badgeProgress').textContent = `${unlocked} / ${bs.length}`;

  const cell = (b, on) => `
    <div class="badge-cell ${on ? 'on' : ''}" title="${esc(b.name)}">
      <i class="fas ${on ? 'fa-' + esc(b.icon) : 'fa-lock'}"></i>
      <span>${esc(b.name)}</span>
    </div>`;
  el('badgesList').innerHTML = bs.length ? bs.map(b => cell(b, b.unlocked)).join('') : emptyState('Aucun badge');

  el('profileBadges').innerHTML = bs.filter(b => b.unlocked).slice(0, 8)
    .map(b => `<span class="tag"><i class="fas fa-${esc(b.icon)} text-violet-deep"></i> ${esc(b.name)}</span>`).join('')
    || '<span class="muted text-xs font-bold">Aucun badge débloqué</span>';
}

/* ---------------------------------------------------------- achievements */

async function loadAchievements() {
  const { success, achievements } = await get('/achievements');
  if (!success) return;

  const unlocked = achievements.filter(a => a.unlocked).length;
  el('achProgress').textContent = `${unlocked} / ${achievements.length}`;
  el('achBar').style.width = (achievements.length ? (unlocked / achievements.length) * 100 : 0).toFixed(1) + '%';

  const rarities = [...new Set(achievements.map(a => a.rarity || 'common'))];
  el('achFilters').innerHTML = [['all', 'Tous'], ...rarities.map(r => [r, r])]
    .map(([v, l]) => `<button class="filter ${v === state.achFilter ? 'on' : ''}" data-ach="${esc(v)}">${esc(l)}</button>`).join('');

  const icons = { star: 'fa-star', trophy: 'fa-trophy', gem: 'fa-gem', fire: 'fa-fire', crown: 'fa-crown', bolt: 'fa-bolt' };
  const list = achievements.filter(a => state.achFilter === 'all' || (a.rarity || 'common') === state.achFilter);

  el('achList').innerHTML = list.length ? list.map(a => {
    const pct = a.requirement_value ? Math.min(100, Math.round((a.progress / a.requirement_value) * 100)) : (a.unlocked ? 100 : 0);
    return `<div class="item rarity-${esc(a.rarity || 'common')} ${a.unlocked ? 'unlocked' : ''}">
      <div class="flex items-start gap-4 mb-4">
        <div style="${TILE}"><i class="fas ${a.unlocked ? (icons[a.icon] || 'fa-star') : 'fa-lock'}"></i></div>
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <h3 class="font-bold leading-tight">${esc(a.name)}</h3>
            <span class="rarity-tag">${esc(a.rarity || 'common')}</span>
          </div>
          <p class="text-xs mt-1 muted font-bold">${esc(a.description || '')}</p>
        </div>
      </div>
      <div class="progress-track thin"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="flex justify-between items-center text-[11px] font-bold mt-2">
        <span class="muted">${nf(a.progress || 0)} / ${nf(a.requirement_value)} ${esc(a.requirement_type || '')}</span>
        <span class="text-teal">+${nf(a.reward_points || 0)} pts${a.reward_xp ? ` · +${nf(a.reward_xp)} XP` : ''}</span>
      </div>
    </div>`;
  }).join('') : emptyState('Aucun succès dans cette catégorie');
}

/* -------------------------------------------------------------- referrals */

async function loadReferrals() {
  const { success, code, stats } = await get(`/referral/${state.user.id}`);
  const codeEl = el('refCode');

  if (code) {
    codeEl.textContent = code.code;
    el('refCount').textContent = nf(stats?.count || 0);
  } else {
    codeEl.textContent = 'Générer';
    codeEl.dataset.generate = '1';
  }
  el('refStats').innerHTML = `
    <div class="mini-stat"><div class="text-xl font-black text-violet-deep">${nf(stats?.count || 0)}</div><div class="text-[10px] font-extrabold uppercase label">parrainages</div></div>
    <div class="mini-stat"><div class="text-xl font-black text-teal">${nf(stats?.pointsEarned || stats?.rewards || 0)}</div><div class="text-[10px] font-extrabold uppercase label">points gagnés</div></div>`;

  const { data } = await get('/referral/top');
  el('topReferrers').innerHTML = data?.length
    ? data.map((r, i) => `<div style="${ROW}"><span>${i + 1}. ${esc(r.username)}</span><span class="text-xs font-extrabold text-violet-deep">${nf(r.count)} parrainages</span></div>`).join('')
    : emptyState('Aucun parrain pour le moment');
}

/* ---------------------------------------------------------------- seasons */

async function loadSeasons() {
  const [{ active, seasons }, current] = await Promise.all([get('/seasons'), get('/seasons/current')]);
  state.season = current.season;

  if (!current.season) {
    el('seasonBanner').innerHTML = `<div class="card"><div class="empty">Aucune saison en cours</div></div>`;
    el('seasonRewards').innerHTML = '';
  } else {
    const s = current.season;
    const now = Date.now();
    const start = new Date(s.start_date.replace(' ', 'T')).getTime();
    const end = new Date(s.end_date.replace(' ', 'T')).getTime();
    const total = Math.max(1, end - start);
    const pct = Math.max(0, Math.min(100, ((now - start) / total) * 100));

    el('seasonBanner').innerHTML = `
      <div class="card season-hero">
        <div class="flex items-center gap-4 mb-4">
          <div class="stat-ico" style="background:#ffc93c;width:56px;height:56px;font-size:22px"><i class="fas fa-crown text-ink"></i></div>
          <div>
            <div class="text-[10px] font-extrabold uppercase label">Saison en cours</div>
            <div class="text-2xl font-black">${esc(s.name)}</div>
          </div>
          <span class="chip chip-lg ml-auto"><i class="fas fa-bolt text-orange"></i> ×${s.multiplier}</span>
        </div>
        <p class="muted font-bold mb-4">${esc(s.description || '')}</p>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="flex justify-between text-xs font-bold muted mt-2">
          <span>Début ${esc(s.start_date.slice(0, 10))}</span>
          <span>Fin ${esc(s.end_date.slice(0, 10))}</span>
        </div>
      </div>`;

    el('seasonRewards').innerHTML = `
      <div class="card">
        <h2 class="card-title mb-5">Grille de récompenses</h2>
        <div class="grid md:grid-cols-3 gap-4">
          ${(current.rewards || []).map(r => `
            <div class="mini-stat text-center">
              <div class="text-[10px] font-extrabold uppercase label">Top ${r.rank}</div>
              <div class="text-xl font-black text-violet-deep">${nf(r.reward_value)} <span class="text-[11px] muted">${esc(r.reward_type)}</span></div>
            </div>`).join('') || '<div class="empty col-span-3">Aucune récompense configurée</div>'}
        </div>
      </div>`;
  }

  el('seasonBoard').innerHTML = current.leaderboard?.length
    ? current.leaderboard.map((x, i) => `<div style="${ROW};background:${x.id === state.user.id ? '#fff3d1' : '#fdf6ec'}">
        <span class="rank-badge">#${i + 1}</span>
        <span style="font-weight:800;flex:1">${esc(x.username)}</span>
        <span class="font-black text-violet-deep">${nf(x.season_points)} pts</span>
      </div>`).join('')
    : emptyState('Aucun point gagné sur cette saison');

  el('seasonList').innerHTML = (seasons || []).map(s => `
    <div class="item">
      <div class="flex items-center justify-between mb-2">
        <span class="font-bold">${esc(s.name)}</span>
        ${s.active ? '<span class="tag">Active</span>' : ''}
      </div>
      <p class="text-xs muted font-bold">${esc(s.start_date.slice(0, 10))} → ${esc(s.end_date.slice(0, 10))}</p>
    </div>`).join('') || emptyState('Aucune saison');
}

/* ---------------------------------------------------------------- members */

async function loadMembers() {
  const q = el('memberSearch').value.trim();
  const page = state.memberPage;
  const j = await get(`/users?page=${page}&limit=24&q=${encodeURIComponent(q)}`);
  const rows = j.data || [];

  el('memberList').innerHTML = rows.length ? rows.map(m => `
    <div class="item flex items-center gap-4">
      <div class="w-14 h-14 rounded-full overflow-hidden avatar-ring flex-shrink-0">
        <img src="${avatarUrl(m.id, m.avatar)}" alt="">
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-bold truncate">${esc(m.username)} ${m.is_banned ? '<span class="tag-out">Banni</span>' : ''}</div>
        <div class="text-xs muted font-bold">${nf(m.points)} pts · Nv. ${m.level}${m.daily_streak ? ` · 🔥 ${m.daily_streak}` : ''}</div>
      </div>
      <span class="text-[11px] font-bold muted">${esc((m.created_at || '').slice(0, 10))}</span>
    </div>`).join('') : emptyState('Aucun membre trouvé');

  const p = j.pagination || { page: 1, totalPages: 1 };
  el('memberPager').innerHTML = p.totalPages > 1 ? `
    <button class="btn-ghost" data-page="${p.page - 1}" ${p.page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
    <span class="muted font-bold text-sm">Page ${p.page} / ${p.totalPages}</span>
    <button class="btn-ghost" data-page="${p.page + 1}" ${p.page >= p.totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>` : '';
}

/* ---------------------------------------------------------- notifications */

async function loadNotifications() {
  const { success, notifications, unread } = await get(`/notifications/${state.user.id}`);
  if (!success) return;

  const badge = el('notifBadge');
  const dot = el('notifDot');
  badge.classList.toggle('hidden', !unread);
  dot.classList.toggle('hidden', !unread);
  badge.textContent = unread;
  dot.textContent = unread > 9 ? '9+' : unread;

  const icons = { info: 'fa-circle-info', success: 'fa-circle-check', warning: 'fa-triangle-exclamation', reward: 'fa-gift', error: 'fa-circle-xmark' };
  const colors = { info: '#5b32c9', success: '#12a37c', warning: '#e06a12', reward: '#ff5c9d', error: '#d92d2d' };

  el('notifList').innerHTML = (notifications || []).length ? notifications.map(n => `
    <div class="notif ${n.is_read ? 'read' : ''}" style="--nc:${colors[n.type] || colors.info}">
      <div class="notif-ico"><i class="fas ${icons[n.type] || icons.info}"></i></div>
      <div class="flex-1 min-w-0">
        <div class="font-extrabold text-sm">${esc(n.title)}</div>
        <p class="text-xs font-bold muted mt-0.5">${esc(n.message)}</p>
        <div class="text-[10px] font-bold muted mt-1">${esc(n.created_at)}</div>
      </div>
      ${n.is_read ? '' : '<span class="unread-dot"></span>'}
    </div>`).join('') : emptyState('Aucune notification');

  el('btnReadAll').disabled = !unread;
}

async function markAllRead() {
  try {
    await post(`/notifications/${state.user.id}/read`, { all: true });
    await loadNotifications();
    toast('Notifications lues', null, 'check', '#12a37c');
  } catch (e) {
    toast('Erreur', e.message, 'times', '#d92d2d');
  }
}

/* ------------------------------------------------------------------- IA */

function appendChat(html) {
  const box = el('chatMessages');
  box.insertAdjacentHTML('beforeend', html);
  box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
  const inp = el('chatInput');
  const msg = inp.value.trim();
  if (!msg) return;

  const av = avatarUrl(state.user.id, state.user.avatar);
  appendChat(`<div style="display:flex;align-items:flex-start;gap:10px;justify-content:flex-end">
    <div class="bubble-me">${esc(msg)}</div>
    <div class="w-9 h-9 rounded-full overflow-hidden avatar-ring flex-shrink-0"><img src="${av}" alt=""></div>
  </div>`);
  inp.value = '';
  el('btnSend').disabled = true;
  appendChat(`<div id="aiPending"><div class="bubble-ai muted">GiftBot est en train de répondre…</div></div>`);

  try {
    const j = await post('/ia/chat', { message: msg });
    el('aiPending')?.remove();
    appendChat(`<div style="display:flex;align-items:flex-start;gap:10px">
      <div class="w-9 h-9 rounded-xl flex items-center justify-center avatar-ring flex-shrink-0"><i class="fas fa-robot text-violet-deep text-xs"></i></div>
      <div style="max-width:80%">
        <div class="font-extrabold text-xs mb-1 text-violet-deep">GiftBot IA</div>
        <div class="bubble-ai">${esc(j.reply || 'Pas de réponse.')}</div>
      </div>
    </div>`);
  } catch (e) {
    el('aiPending')?.remove();
    appendChat(`<div class="bubble-ai">${esc(e.message)}</div>`);
  } finally {
    el('btnSend').disabled = false;
  }
}

/* --------------------------------------------------------------- tickets */

async function loadSupport() {
  const j = await get(`/tickets?userId=${state.user.id}`);
  if (!j.success) return;
  const STATUS = { open: ['#23c99a', 'OUVERT'], in_progress: ['#ffc93c', 'EN COURS'], closed: ['#ded8ea', 'FERMÉ'], resolved: ['#3fa9f5', 'RÉSOLU'] };

  el('myTickets').innerHTML = j.tickets?.length ? j.tickets.map(t => {
    const st = STATUS[t.status] || ['#ded8ea', String(t.status).toUpperCase()];
    return `<div class="notif" data-ticket="${esc(t.id)}" style="cursor:pointer">
      <div class="notif-ico" style="background:${st[0]}"><i class="fas fa-ticket"></i></div>
      <div class="flex-1 min-w-0">
        <div class="font-extrabold text-sm truncate">${esc(t.subject)}</div>
        <div class="text-[10px] font-bold muted mt-0.5">${esc(t.created_at)}</div>
      </div>
      <span class="tag">${st[1]}</span>
    </div>`;
  }).join('') : emptyState('Aucun ticket');

  // Un ticket est consultable en lançant la session admin.
  el('myTickets').querySelectorAll('[data-ticket]').forEach(n => {
    n.onclick = () => {
      state.openTicket = n.dataset.ticket;
      selectTab('tickets');
    };
  });
}

async function createTicket() {
  const subject = el('tSubject').value.trim();
  const message = el('tMessage').value.trim();
  if (!subject || !message) return toast('Erreur', 'Remplis tous les champs', 'times', '#d92d2d');
  try {
    const j = await post('/tickets', { subject, message, category: el('tCat').value });
    if (j.success) {
      toast('Ticket créé', 'Notre équipe va te répondre', 'check', '#12a37c');
      el('tSubject').value = '';
      el('tMessage').value = '';
      loadSupport();
    }
  } catch (e) {
    toast('Erreur', e.message, 'times', '#d92d2d');
  }
}

async function loadTickets() {
  el('ticketFilters').innerHTML = ['open', 'in_progress', 'resolved', 'closed', 'all']
    .map(v => `<button class="filter ${v === state.ticketFilter ? 'on' : ''}" data-ticket-filter="${v}">${v === 'all' ? 'Tous' : v.replace('_', ' ')}</button>`).join('');

  try {
    const j = await get('/tickets/admin');
    const all = j.tickets || [];
    const list = state.ticketFilter === 'all' ? all : all.filter(t => t.status === state.ticketFilter);

    el('ticketQueue').innerHTML = list.length ? list.map(t => `
      <div class="notif ${t.id === state.openTicket ? 'on' : ''}" data-open="${esc(t.id)}" style="cursor:pointer">
        <div class="flex-1 min-w-0">
          <div class="font-extrabold text-xs truncate">${esc(t.subject)}</div>
          <div class="text-[10px] font-bold muted">${esc(t.created_at)}</div>
        </div>
      </div>`).join('') : emptyState('Aucun ticket');

    el('ticketQueue').querySelectorAll('[data-open]').forEach(n => {
      n.onclick = () => { state.openTicket = n.dataset.open; loadTickets(); };
    });

    if (state.openTicket) await renderTicket(state.openTicket, all);
  } catch (e) {
    el('ticketQueue').innerHTML = emptyState(e.message);
  }
}

async function renderTicket(id, all) {
  const t = all.find(x => x.id === id);
  if (!t) return;
  const { messages } = await get(`/tickets/${id}/messages`);

  el('ticketDetail').innerHTML = `
    <div class="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 class="card-title">${esc(t.subject)}</h2>
        <div class="text-xs muted font-bold mt-1">${esc(t.created_at)} · ${esc(t.category || 'general')}</div>
      </div>
      <div class="flex gap-2">
        <select id="ticketStatus" class="px-3 py-2 text-xs">
          ${['open', 'in_progress', 'resolved', 'closed'].map(s => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
        </select>
        <button class="btn-mini" data-save-status>OK</button>
      </div>
    </div>
    <div class="chat-scroll space-y-3 mb-4" style="max-height:280px">
      ${(messages || []).map(m => `
        <div style="display:flex;${m.is_admin ? 'justify-content:flex-end' : ''}">
          <div class="${m.is_admin ? 'bubble-me' : 'bubble-ai'}">${esc(m.content)}</div>
        </div>`).join('') || emptyState('Aucun message')}
    </div>
    <div class="flex gap-3">
      <input id="ticketReply" class="flex-1 px-4 py-3 text-sm" placeholder="Répondre…" maxlength="2000">
      <button class="btn-p" data-reply><i class="fas fa-paper-plane"></i>Répondre</button>
    </div>`;

  el('ticketDetail').querySelector('[data-save-status]').onclick = async () => {
    try {
      await post(`/tickets/${id}/status`, { status: el('ticketStatus').value });
      toast('Statut mis à jour', null, 'check', '#12a37c');
      loadTickets();
    } catch (e) {
      toast('Erreur', e.message, 'times', '#d92d2d');
    }
  };

  el('ticketDetail').querySelector('[data-reply]').onclick = async () => {
    const content = el('ticketReply').value.trim();
    if (!content) return;
    try {
      await post(`/tickets/${id}/messages`, { content });
      loadTickets();
    } catch (e) {
      toast('Erreur', e.message, 'times', '#d92d2d');
    }
  };
}

/* -------------------------------------------------------------- analytics */

async function loadAnalytics() {
  const [stats, { data }] = await Promise.all([get('/global-stats'), get('/analytics/series?days=14')]);
  if (!stats.success) return;

  el('anStats').innerHTML = `
    <div class="stat"><div class="text-[10px] font-extrabold uppercase label">Membres</div><div class="val">${nf(stats.totalUsers)}</div></div>
    <div class="stat"><div class="text-[10px] font-extrabold uppercase label">Actifs aujourd'hui</div><div class="val">${nf(stats.activeToday)}</div></div>
    <div class="stat"><div class="text-[10px] font-extrabold uppercase label">Transactions</div><div class="val">${nf(stats.totalTransactions)}</div></div>
    <div class="stat"><div class="text-[10px] font-extrabold uppercase label">Tickets ouverts</div><div class="val">${nf(stats.ticketsOpen)}</div></div>`;

  const a = data.activity;
  el('sumGained').textContent = nf(a.pointsGained.reduce((s, v) => s + v, 0));
  el('sumSpent').textContent = nf(a.pointsSpent.reduce((s, v) => s + v, 0));

  drawChart('chartPoints', {
    type: 'bar',
    data: {
      labels: shortDates(a.labels),
      datasets: [
        { label: 'Gagnés', data: a.pointsGained, backgroundColor: '#7a4ff2', borderColor: '#2b2440', borderWidth: 2, borderRadius: 8 },
        { label: 'Dépensés', data: a.pointsSpent, backgroundColor: '#ff5c9d', borderColor: '#2b2440', borderWidth: 2, borderRadius: 8 },
      ],
    },
    options: chartOpts(9, { plugins: { legend: { display: true, labels: { font: CHART_FONT, boxWidth: 12 } } } }),
  });

  drawChart('chartUsers', {
    type: 'line',
    data: { labels: shortDates(a.labels), datasets: [{ label: 'Nouveaux', data: a.newUsers, ...lineStyle('#12a37c', 'rgba(18,163,124,.15)') }] },
    options: chartOpts(9),
  });

  drawChart('chartActive', {
    type: 'line',
    data: { labels: shortDates(a.labels), datasets: [{ label: 'Actifs', data: a.activeUsers, ...lineStyle('#e06a12', 'rgba(224,106,18,.15)') }] },
    options: chartOpts(9),
  });

  drawChart('chartLvls', {
    type: 'doughnut',
    data: {
      labels: data.levels.labels,
      datasets: [{
        data: data.levels.data,
        backgroundColor: ['#7a4ff2', '#9a72ff', '#ff5c9d', '#ff8a3d', '#ffc93c', '#23c99a'],
        borderColor: '#2b2440', borderWidth: 2,
      }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: CHART_FONT, boxWidth: 12 } } } },
  });

  drawChart('chartTypes', {
    type: 'doughnut',
    data: {
      labels: data.types.labels,
      datasets: [{ data: data.types.data, backgroundColor: ['#7a4ff2', '#ff5c9d', '#23c99a', '#ffc93c', '#1c7fc7'], borderColor: '#2b2440', borderWidth: 2 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: CHART_FONT, boxWidth: 12 } } } },
  });
}

/* ----------------------------------------------------------------- admin */

async function loadAdmin() {
  if (state.user.id !== OWNER_ID) return;
  const j = await get('/admin/stats');
  if (!j.success) return;

  el('adStats').innerHTML = `
    <div class="stat"><div class="text-[10px] font-extrabold uppercase label">Membres</div><div class="val">${nf(j.totalUsers)}</div></div>
    <div class="stat"><div class="text-[10px] font-extrabold uppercase label">Points totaux</div><div class="val">${nf(j.totalPoints)}</div></div>
    <div class="stat"><div class="text-[10px] font-extrabold uppercase label">Transactions</div><div class="val">${nf(j.totalTransactions)}</div></div>
    <div class="stat"><div class="text-[10px] font-extrabold uppercase label">Tickets ouverts</div><div class="val">${nf(j.ticketsOpen)}</div></div>`;

  el('adTopUsers').innerHTML = (j.topUsers || []).map((x, i) =>
    `<div style="${ROW}"><span>${i + 1}. ${esc(x.username)}</span><span class="font-black text-sm text-violet-deep">${nf(x.points)} pts</span></div>`).join('')
    || emptyState('Aucun membre');

  el('adRecentTx').innerHTML = (j.recentTransactions || []).map(t => `
    <div class="tx-row">
      <span class="muted truncate">${esc(t.description || t.type)} <b class="text-ink">· ${esc(t.username || '')}</b></span>
      <span class="${t.amount > 0 ? 'pos' : 'neg'}">${t.amount > 0 ? '+' : ''}${nf(t.amount)}</span>
    </div>`).join('') || emptyState('Aucune transaction');

  const g = j.games || {};
  el('adGames').innerHTML = `
    <div class="mini-stat"><div class="text-xl font-black text-violet-deep">${nf(g.wagered)}</div><div class="text-[10px] font-extrabold uppercase label">Misé total</div></div>
    <div class="mini-stat"><div class="text-xl font-black text-teal">${nf(g.sessions)}</div><div class="text-[10px] font-extrabold uppercase label">Parties</div></div>
    <div class="mini-stat"><div class="text-xl font-black text-orange">${g.winRate}%</div><div class="text-[10px] font-extrabold uppercase label">Taux de victoire</div></div>
    <div class="mini-stat"><div class="text-xl font-black text-ink">${nf(g.losses)}</div><div class="text-[10px] font-extrabold uppercase label">Défaites</div></div>`;
}

/* ------------------------------------------------------- navigation lazy */

const LOADERS = {
  home: loadUser,
  quests: loadQuests,
  daily: loadUser,
  games: loadGames,
  shop: loadShop,
  invites: loadReferrals,
  rewards: loadBadges,
  achievements: loadAchievements,
  vault: loadUser,
  seasons: loadSeasons,
  leaderboard: loadLeaderboard,
  members: loadMembers,
  notifications: loadNotifications,
  profile: loadUser,
  support: loadSupport,
  tickets: loadTickets,
  analytics: loadAnalytics,
  admin: loadAdmin,
};

async function selectTab(tab) {
  $$('.tc').forEach(e => e.classList.remove('active'));
  const section = el('tab-' + tab);
  if (!section) return;
  section.classList.add('active');

  $$('.sb-item').forEach(e => e.classList.toggle('active', e.dataset.tab === tab));
  $$('.mn-btn').forEach(e => e.classList.toggle('active', e.dataset.tab === tab));
  window.scrollTo({ top: 0 });

  const loader = LOADERS[tab];
  if (!loader) return;
  try {
    // Un seul chargement par onglet, sauf ceux qui dépendent de l'état global.
    const always = ['home', 'vault', 'profile', 'daily'].includes(tab);
    if (!state.loaded.has(tab) || always) {
      await loader();
      state.loaded.add(tab);
    }
  } catch (e) {
    if (e.message !== 'Session expirée') console.error(`[tab ${tab}]`, e.message);
  }
  if (window.innerWidth < 900) toggleSidebar(false);
}

function toggleSidebar(force) {
  const open = force ?? !el('sidebar').classList.contains('open');
  el('sidebar').classList.toggle('open', open);
  el('overlay').classList.toggle('show', open);
}

/* ------------------------------------------------------------- websocket */

function connectWs() {
  if (!token()) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?access_token=${encodeURIComponent(token())}`);
  const dot = el('wsDot');

  ws.onopen = () => dot.classList.add('on');
  ws.onclose = () => {
    dot.classList.remove('on');
    setTimeout(connectWs, 10000);
  };
  ws.onerror = () => ws.close();
  ws.onmessage = (e) => {
    const { type, data } = JSON.parse(e.data);
    if (type === 'leaderboard_update') {
      state.loaded.delete('leaderboard');
      if (el('tab-leaderboard').classList.contains('active')) loadLeaderboard();
    }
    if (type === 'connected') toast('Temps réel actif', 'Classement en direct', 'bolt', '#12a37c');
  };
}

/* ------------------------------------------------------------------ init */

function buildMobileNav() {
  const MOBILE = { home: ['Accueil', 'fa-home'], games: ['Mini-jeux', 'fa-dice'], shop: ['Boutique', 'fa-store'], quests: ['Quêtes', 'fa-tasks'], leaderboard: ['Classement', 'fa-ranking-star'] };
  const nav = el('mn');
  Object.entries(MOBILE).forEach(([tab, [label, icon]]) => {
    const btn = document.createElement('button');
    btn.className = 'mn-btn' + (tab === 'home' ? ' active' : '');
    btn.dataset.tab = tab;
    btn.innerHTML = `<i class="fas ${icon}"></i><span>${label}</span>`;
    btn.onclick = () => selectTab(tab);
    nav.appendChild(btn);
  });
}

function bindEvents() {
  // Navigation sidebar + boutons data-tab (y compris dans le top bar mobile)
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-tab]');
    if (nav) return selectTab(nav.dataset.tab);
    if (e.target.closest('[data-action="logout"]')) return logout();
    const buy = e.target.closest('[data-buy]');
    if (buy) return buyItem(buy.dataset.buy);
    const play = e.target.closest('[data-play]');
    if (play) return playGame(play.dataset.play);
    const ach = e.target.closest('[data-ach]');
    if (ach) { state.achFilter = ach.dataset.ach; return loadAchievements(); }
    const shopF = e.target.closest('[data-shop]');
    if (shopF) { state.shopFilter = shopF.dataset.shop; return loadShop(); }
    const tf = e.target.closest('[data-ticket-filter]');
    if (tf) { state.ticketFilter = tf.dataset.ticketFilter; return loadTickets(); }
    const pg = e.target.closest('[data-page]');
    if (pg && !pg.disabled) { state.memberPage = +pg.dataset.page; return loadMembers(); }
  });

  el('burger').onclick = () => toggleSidebar();
  el('overlay').onclick = () => toggleSidebar(false);
  el('btnRefresh').onclick = () => { state.loaded.clear(); selectTab('home'); };
  el('btnDaily').onclick = claimDaily;
  el('btnReadAll').onclick = markAllRead;
  el('btnTicket').onclick = createTicket;
  el('btnMemberSearch').onclick = () => { state.memberPage = 1; loadMembers(); };
  el('btnSend').onclick = sendMessage;
  el('chatInput').onkeydown = e => { if (e.key === 'Enter') sendMessage(); };
  el('memberSearch').onkeydown = e => { if (e.key === 'Enter') { state.memberPage = 1; loadMembers(); } };
  el('refCode').onclick = async () => {
    if (!el('refCode').dataset.generate) return navigator.clipboard?.writeText(el('refCode').textContent).then(() => toast('Code copié', null, 'copy', '#5b32c9'));
    try {
      await post('/referral/generate');
      loadReferrals();
    } catch (e) {
      toast('Erreur', e.message, 'times', '#d92d2d');
    }
  };
}

function logout() {
  localStorage.removeItem('discord_user');
  localStorage.removeItem('discord_token');
  window.location.href = 'index.html';
}

checkAuth();
buildMobileNav();
bindEvents();
connectWs();
selectTab('home');