// «Время перемен» — интерфейс прототипа по макетам docs/mockups.html
(function () {
'use strict';
const $ = s => document.querySelector(s);
const app = $('#app'), layer = $('#layer');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const store = {get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно — игра работает без него */ } }};
let E, L, D, speed = 1, prevSpeed = 1, timer = null, waiting = false, shownYear = 0, warnedYear = 0;
const prefs = store.get('vp-prefs', {soft: false});
// имя бота и короткое имя Mini App из BotFather — для ссылки «Поделиться»
const TG_BOT = '', TG_APP = '';
const MONTH_MS = 4000;  // 1× — 48 секунд на год

// ---------- Telegram Mini App: вне Telegram всё это просто не включается ----------
const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
const haptic = kind => { try { if (tg) kind === 'tap' ? tg.HapticFeedback.selectionChanged() : tg.HapticFeedback.impactOccurred(kind); } catch (e) { /* старый клиент */ } };
function syncBack() {
  if (!tg) return;
  const need = !!$('#xclose') || (tab !== 'feed' && !!$('#backfeed'));
  need ? tg.BackButton.show() : tg.BackButton.hide();
}
if (tg) {
  tg.ready(); tg.expand();
  try { tg.setHeaderColor('#0e0e0d'); tg.setBackgroundColor('#0e0e0d'); tg.setBottomBarColor && tg.setBottomBarColor('#0e0e0d'); } catch (e) { /* старый клиент */ }
  try { tg.disableVerticalSwipes(); } catch (e) { /* до Bot API 7.7 */ }
  tg.BackButton.onClick(() => { haptic('tap'); if ($('#xclose')) $('#xclose').click(); else if (tab !== 'feed') openTab('feed'); });
  new MutationObserver(syncBack).observe(layer, {childList: true});
}

fetch('data.json').then(r => r.json()).then(d => { D = d; E = createEngine(D); renderStart(); })
  .catch(() => { app.innerHTML = '<div class="title"><div class="q">Не удалось загрузить данные игры. Обновите страницу.</div></div>'; });

// ---------- карта и комната ----------
function bgmap() {
  const soviet = L.year < 1991 || (L.year === 1991 && L.month < 12);
  const ps = Object.entries(D.map.paths).map(([k, d]) => {
    const me = k === L.region;
    if (soviet) return `<path d="${d}" fill="${me ? '#6f7a66' : '#3c4237'}" stroke="#7d8670" stroke-width=".6"/>`;
    return me ? `<path d="${d}" fill="#6f7a66" stroke="#9aa38c" stroke-width=".8"/>` : `<path d="${d}" fill="none" stroke="#4a5045" stroke-width=".5" stroke-dasharray="2 3"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${D.map.width} 200">${ps}</svg>`;
}
const R = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
const SPR = {
  rug_on_wall: () => { let s = R(20, 16, 98, 56, '#8a3a30'); for (let i = 0; i < 5; i++) s += R(28 + i * 18, 24, 8, 40, '#c2a06a'); return s; },
  wall_unit_crystal: () => R(0, 30, 16, 78, '#5b4630') + R(3, 40, 10, 10, '#b9c7bd'), wall_unit: () => R(0, 30, 16, 78, '#5b4630'),
  tv_rubin: () => R(150, 80, 52, 28, '#3e352c') + R(156, 84, 32, 20, '#9fb0a6') + R(160, 108, 8, 8, '#3e352c') + R(184, 108, 8, 8, '#3e352c'),
  calendar_soviet: () => R(126, 20, 12, 16, '#d8d2c0') + R(126, 20, 12, 4, '#a33b2c'),
  ration_cards_on_fridge: () => R(222, 60, 16, 48, '#cfc8b4') + R(225, 66, 10, 6, '#e4dac4') + R(225, 74, 10, 6, '#e4dac4'),
  empty_shelf: () => R(124, 50, 22, 3, '#5b4630'), turkish_jacket: () => R(224, 56, 3, 52, '#3b3a33') + R(214, 56, 24, 36, '#5a4a6a'),
  snickers_box: () => R(196, 114, 22, 16, '#7a4a28') + R(198, 118, 18, 4, '#c99a58'), cassette_player: () => R(126, 96, 18, 10, '#2a2a2a'),
  vinyl_wallpaper: () => R(0, 0, 240, 6, '#9c967c'), calendar_girl: () => R(126, 18, 14, 20, '#c9a28a'), pager_on_table: () => R(78, 108, 8, 4, '#222'),
  jars_on_balcony: () => R(196, 118, 8, 12, '#a7884a') + R(206, 118, 8, 12, '#8a6a3a') + R(216, 118, 8, 12, '#a7884a'),
  car_keys_on_nail: () => R(140, 60, 2, 6, '#c99a58') + R(138, 66, 6, 4, '#c99a58'),
  vcr_under_tv: () => R(156, 74, 32, 6, '#222'), tapes_stack: () => R(204, 98, 10, 10, '#222') + R(204, 94, 10, 3, '#444'),
  phone_on_stand: () => R(134, 98, 10, 8, '#7a3a30'), pc_beige: () => R(84, 94, 26, 18, '#cfc8b4') + R(87, 97, 20, 12, '#5a7a72'),
  overalls_on_hook: () => R(224, 58, 3, 50, '#3b3a33') + R(214, 54, 24, 6, '#3b3a33') + R(216, 60, 20, 30, '#4a5a6a'),
  helmet_lamp: () => R(218, 70, 14, 8, '#c9a24a'), duffel_bag_north: () => R(200, 112, 30, 18, '#4a5a4a'),
  drafting_board: () => R(196, 40, 4, 68, '#5b4630') + R(184, 36, 34, 26, '#d8d2c0'), books_pile: () => R(124, 98, 20, 10, '#6a5040') + R(126, 92, 16, 6, '#7a6a50'),
  journals: () => R(126, 86, 14, 6, '#8a7a60'), notebooks_red_pen: () => R(80, 106, 20, 6, '#c9c2ae') + R(84, 104, 12, 2, '#a33b2c'),
  white_coat: () => R(224, 56, 3, 52, '#3b3a33') + R(214, 56, 22, 38, '#d8d2c0'), rubber_boots: () => R(220, 118, 6, 12, '#2a3a2a') + R(228, 118, 6, 12, '#2a3a2a'),
  seed_bags: () => R(200, 116, 14, 14, '#b8a070'), price_tags: () => R(124, 92, 12, 6, '#e4dac4'), sewing_machine: () => R(80, 98, 22, 12, '#2a2a2a'),
  jeans_pile: () => R(200, 112, 24, 18, '#4a6a8a'), checked_bags: () => R(196, 112, 22, 18, '#c9c2ae') + R(196, 116, 22, 2, '#7a3a30') + R(214, 104, 20, 26, '#c9c2ae') + R(214, 110, 20, 2, '#2f4f6a'),
  boxes_goods: () => R(194, 108, 20, 22, '#8a6a3a') + R(214, 114, 20, 16, '#7a5a30'), cash_box: () => R(84, 104, 14, 8, '#4a4a4a'),
  briefcase: () => R(196, 116, 20, 14, '#3a2a1a'), leather_chair: () => R(200, 84, 30, 24, '#3a2a1a'), mobile_brick: () => R(92, 104, 5, 10, '#1a1a1a'),
  phone_two_lines: () => R(130, 98, 12, 8, '#2a2a2a') + R(144, 98, 12, 8, '#2a2a2a'), uniform_chop: () => R(214, 56, 24, 36, '#2a2a2a'),
  leather_jacket_hook: () => R(224, 56, 3, 52, '#3b3a33') + R(214, 56, 24, 36, '#1a1a1a'), cap_police: () => R(218, 50, 16, 6, '#2a3a5a'),
  officer_cap: () => R(218, 50, 16, 6, '#3a4a2a'), kitel: () => R(214, 56, 24, 38, '#4a5a3a'), letter_from_army: () => R(84, 106, 14, 8, '#e4dac4'),
  cadet_uniform: () => R(214, 56, 24, 38, '#3a3a5a'), typewriter: () => R(80, 98, 24, 12, '#2a2a2a'), guitar: () => R(226, 68, 8, 40, '#8a5a2a') + R(222, 92, 16, 16, '#8a5a2a'),
  floppy_disks: () => R(112, 106, 8, 8, '#2a2a5a'), dictionaries: () => R(124, 96, 20, 12, '#5a3a3a'), portfolio_folder: () => R(84, 106, 16, 6, '#8a6a3a'),
  campaign_posters: () => R(126, 18, 18, 24, '#d8d2c0') + R(128, 20, 14, 6, '#a33b2c'), textbooks: () => R(84, 104, 22, 8, '#5a6a8a'),
  school_bag: () => R(200, 116, 16, 14, '#6a4a2a'), radio_old: () => R(124, 96, 16, 10, '#5b4630'), newspaper_job_ads: () => R(80, 108, 20, 4, '#d8d2c0'),
  sports_bag: () => R(198, 116, 26, 14, '#2a3a5a'), toys_floor: () => R(40, 124, 10, 8, '#c2a06a') + R(54, 126, 8, 6, '#7a8a6a'),
  kids_drawings: () => R(126, 46, 10, 8, '#e4dac4'), wedding_photo: () => R(126, 22, 14, 18, '#d8d2c0') + R(129, 25, 8, 12, '#5a5a4a'),
  one_cup: () => R(90, 106, 4, 6, '#e4dac4'), black_ribbon_photo: () => R(126, 22, 14, 18, '#d8d2c0') + R(126, 22, 4, 4, '#111'),
  drawn_curtains: () => R(152, 16, 62, 52, '#5a4a3a'), bottles_under_table: () => R(72, 122, 4, 10, '#3a6a4a') + R(78, 122, 4, 10, '#3a6a4a') + R(96, 122, 4, 10, '#3a6a4a'),
  ashtray: () => R(100, 108, 8, 4, '#888'), empty_fridge_open: () => R(222, 60, 16, 48, '#cfc8b4') + R(224, 62, 12, 44, '#efe9d8'), bills_pile: () => R(80, 108, 14, 4, '#d8d2c0'),
  new_furniture: () => R(0, 30, 16, 78, '#6a4a2a'), pill_bottles: () => R(100, 106, 4, 6, '#d8d2c0') + R(106, 106, 4, 6, '#c9a24a'), bed_unmade: () => R(14, 96, 30, 12, '#9a9480'),
  photo_uniform_afghan: () => R(140, 22, 10, 14, '#c9b48a'), photo_uniform: () => R(140, 22, 10, 14, '#a9a48a'), certificate_liquidator: () => R(140, 22, 12, 9, '#e4dac4'),
  suitcase_unpacked: () => R(196, 114, 26, 16, '#6a4a2a'), bunk_bed: () => R(14, 60, 40, 4, '#5a5a5a') + R(14, 92, 40, 4, '#5a5a5a') + R(14, 56, 3, 52, '#5a5a5a') + R(51, 56, 3, 52, '#5a5a5a'),
  stove: () => R(10, 40, 40, 68, '#d8d2c0'), log_walls: () => [0, 1, 2, 3, 4, 5].map(i => R(0, 14 + i * 16, 240, 2, '#6a5040')).join(''),
};
function roomSvg() {
  const W = D.window, y = L.year;
  const housing = [...L.items].find(i => E.ITEMS[i].group === 'housing');
  let wall = '#8e8a72', floor = '#5a4a3a', sprites = [], name = '';
  if (L.age < 18 && !housing) { name = W.housing.parents.name; sprites.push(...W.housing.parents.sprites); }
  else if (L.flags.has('village') && (!housing || housing === 'own_flat')) { wall = '#7a6248'; name = W.housing.izba.name; sprites.push('log_walls', 'stove'); }
  else if (housing === 'own_flat') { const v = W.housing.own_flat.variants[L.flatVariant] || {}; name = v.name || 'Квартира'; wall = L.flatVariant === 'stalinka' ? '#8a8268' : '#8e8a72'; }
  else if (housing && W.housing[housing]) { name = W.housing[housing].name; if (housing === 'dorm') sprites.push('bunk_bed'); wall = housing === 'kommunalka' ? '#7a7660' : housing === 'cottage' ? '#9a907a' : wall; }
  else name = 'У родителей';
  const era = W.era.find(e => y >= e.years[0] && y <= e.years[1]);
  if (era) sprites.push(...era.sprites);
  for (const it of L.items) { const w = E.ITEMS[it].window; if (w && W.items[w]) sprites.push(...W.items[w]); }
  sprites.push(...(W.job[L.job] || []));
  const wage = E.avgWage(L.region, y), m = E.money(L) / wage;
  for (const grp of Object.values(W.state)) {
    const rule = grp.find(r => { const w = r.who || {};
      if (w.flags && !w.flags.every(f => L.flags.has(f))) return false;
      if (w.money) { const n = parseFloat(w.money.replace(/[<>=]/g, '')); if (w.money[0] === '<' ? !(m < n) : !(m > n)) return false; }
      if (w.stats && w.stats.health) { const n = parseFloat(w.stats.health.replace(/[<>=]/g, '')); if (!(L.s.health < n)) return false; }
      return true; });
    if (rule) sprites.push(...rule.sprites);
  }
  let s = R(0, 0, 240, 140, wall) + R(0, 108, 240, 32, floor);
  s += R(152, 16, 62, 52, '#a9bdb7') + R(182, 16, 2, 52, wall) + R(152, 41, 62, 2, wall) + R(148, 12, 7, 60, '#6d5a48') + R(211, 12, 7, 60, '#6d5a48');
  if (!sprites.includes('bunk_bed')) s += R(18, 78, 104, 30, '#4d5f52') + R(14, 72, 10, 36, '#4d5f52') + R(116, 72, 10, 36, '#4d5f52');
  s += R(66, 112, 48, 6, '#6e4b33') + R(70, 118, 4, 14, '#6e4b33') + R(106, 118, 4, 14, '#6e4b33');
  for (const id of [...new Set(sprites)]) if (SPR[id]) s += SPR[id]();
  const season = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][Math.max(0, L.month - 1)];
  const capt = `${esc(E.cityName(L))}. ${esc(name)}. ${W.captions.time[season]}. ${W.captions.activity[L.focus] || ''}.`;
  return {svg: `<svg class="room" viewBox="0 0 240 140" role="img" aria-label="${esc(name)}">${s}</svg>`, capt};
}

// ---------- старт ----------
function renderStart() {
  stop();
  layer.innerHTML = '';
  app.innerHTML = `<div class="title">
    <div class="dim mono" style="font-size:11px;letter-spacing:.2em">КИНОХРОНИКА ОДНОЙ ЖИЗНИ</div>
    <div class="big">Время<br>перемен</div><div class="dim mono">1986 — 1999</div>
    <div style="font-size:14px;max-width:19em">Тебе выпадет случайный человек из 280 миллионов. Республику, возраст и семью не выбирают.</div>
    <div class="mono dim" style="font-size:12px">Пока ты здесь, в СССР родилось<br><span id="born" style="color:var(--amber);font-size:22px">0</span> человек</div>
    <button class="cta" id="go">Оказаться в 1986-м</button>
    <div style="display:flex;gap:14px;font-size:13px" class="dim"><button id="arch">Архив жизней</button>
      <button id="soft" aria-pressed="${prefs.soft}">Без тяжёлых сцен: ${prefs.soft ? 'вкл.' : 'выкл.'}</button></div></div>`;
  const t0 = Date.now(); const bt = setInterval(() => { const el = $('#born'); if (!el) return clearInterval(bt); el.textContent = Math.floor((Date.now() - t0) / 5600); }, 500);
  $('#go').onclick = () => { L = E.newLife(); L.soft = prefs.soft; renderIntro(); };
  $('#arch').onclick = archiveSheet;
  $('#soft').onclick = () => { prefs.soft = !prefs.soft; store.set('vp-prefs', prefs); renderStart(); };
}
function renderIntro() {
  const S = E.summary(L), room = roomSvg(), w = E.avgWage(L.region, 1986);
  const fam = L.age < 17 ? 'родители' : (L.flags.has('married') ? (L.sex === 'm' ? 'женат' : 'замужем') : (L.sex === 'm' ? 'не женат' : 'не замужем')) + (L.flags.has('has_kids') ? ', есть дети' : '');
  const items = [...L.items].map(i => E.ITEMS[i].name.toLowerCase()).join(', ') || '—';
  const seen = ['strength', 'mind', 'charm'].filter(t => L.traits[t] !== 'mid').map(t => D.stats.traits[t].name + (L.traits[t] === 'strong' ? ' ▲' : ' ▼'));
  app.innerHTML = `<div class="bgmap" aria-hidden="true">${bgmap()}</div>
    <div class="yr" style="margin-top:6px">1 января 1986</div>
    <div class="frame">${room.svg}<div class="capt">${room.capt}</div></div>
    <div style="margin-top:10px">${[['Имя', S.name], ['Возраст', E.D ? L.age + ' ' + plural(L.age) + ', ' + (L.sex === 'm' ? 'мужчина' : 'женщина') : ''],
      ['Где', S.place], ['Происхождение', L.flags.has('minority') ? 'русскоязычная семья' : 'местная семья'], ['Семья', fam], ['Занятие', S.job],
      ['Образование', {school: 'школа', ptu: 'ПТУ', technikum: 'техникум', university: 'вуз'}[L.edu] || L.edu], ['Имущество', items], ['Сберкнижка', S.moneyText]]
      .map(([a, b]) => `<div class="field"><span>${a}</span><span>${esc(b)}</span></div>`).join('')}</div>
    <div class="sec">Задатки</div><div class="chips">${seen.map(x => `<span class="chip">${x}</span>`).join('') || '<span class="dim">Ничего особенного — пока.</span>'}</div>
    <div style="display:flex;gap:10px;justify-content:center;margin-top:18px"><button class="cta" id="start">Начать</button><button class="cta ghost" id="reroll">Другая жизнь</button></div>`;
  $('#start').onclick = renderGame;
  $('#reroll').onclick = () => { L = E.newLife(); L.soft = prefs.soft; renderIntro(); };
}
const plural = a => { const m = a % 10, h = a % 100; return m === 1 && h !== 11 ? 'год' : m >= 2 && m <= 4 && (h < 12 || h > 14) ? 'года' : 'лет'; };

// ---------- игра ----------
const TABS = [['feed', 'Лента'], ['act', 'Решения'], ['money', 'Деньги'], ['life', 'Жизнь'], ['work', 'Работа'], ['stats', 'Итоги']];
let tab = 'feed', resumeSpeed = 1;
function renderGame() {
  shownYear = 0; tab = 'feed';
  app.innerHTML = `<div class="bgmap" aria-hidden="true" id="map"></div>
    <div class="top"><div class="hd"><div style="flex:1;min-width:0"><div class="date" id="date"></div><div class="who" id="who"></div>
      <div class="bar" style="margin-top:6px" aria-label="Прогресс года"><i id="yearbar" style="width:0%"></i></div></div>
      <div class="ctl">${[[0, '❚❚'], [1, '1×'], [2, '2×'], [4, '4×'], [8, '8×'], ['skip', '» к решению']].map(([v, t]) => `<button class="btn" data-sp="${v}">${t}</button>`).join('')}<button class="btn" id="settings" aria-label="Настройки">⚙</button></div></div>
      <nav class="tabs" role="tablist">${TABS.map(([k, t]) => `<button class="tab" role="tab" data-tab="${k}">${t}</button>`).join('')}</nav></div>
    <div class="frame" id="frame"></div>
    <div class="stats" id="stats"></div>
    <button class="money" id="money"></button>
    <button class="focus" id="focus"></button>
    <div id="choice"></div><div id="panel" hidden></div><div class="feed" id="feed"></div>`;
  document.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => setSpeed(b.dataset.sp === 'skip' ? 'skip' : +b.dataset.sp));
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => openTab(b.dataset.tab));
  $('#settings').onclick = settingsSheet;
  $('#money').onclick = () => openTab('money');
  $('#focus').onclick = focusSheet;
  update(); setSpeed(1);
  if (tg) try { tg.enableClosingConfirmation(); } catch (e) { /* старый клиент */ }
}
// разделы — на главном экране; пока открыт не «Лента», время стоит
function openTab(k) {
  if (k === tab && k !== 'feed') k = 'feed';
  if (tab === 'feed' && k !== 'feed') { resumeSpeed = autoFrom ?? (speed || 1); stop(); }
  tab = k; setTimeout(syncBack);
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === k)));
  const panel = $('#panel'), feed = $('#feed');
  if (k === 'feed') { panel.hidden = true; panel.innerHTML = ''; feed.hidden = false; if (!$('#choice').innerHTML && autoFrom === null) { waiting = false; setSpeed(resumeSpeed || 1); } return; }
  waiting = true; feed.hidden = true; panel.hidden = false;
  renderPanel();
}
function renderPanel() {
  const panel = $('#panel'); if (!panel || panel.hidden) return;
  panel.innerHTML = `<div class="panelhd"><span class="dim" style="font-size:12px">Время стоит, пока открыт раздел</span><button class="btn" id="backfeed">✕ к ленте</button></div>` + ({act: actPanel, money: moneyPanel, life: lifePanel, work: workPanel, stats: statsPanel}[tab])();
  $('#backfeed').onclick = () => openTab('feed');
  bindPanel();
}
const STATS6 = () => ['happy', 'health', 'fit', 'know', 'close', 'ties'].concat(L.flags.has('partner') ? ['rel'] : [], L.s.law > 20 ? ['law'] : []);
function update() {
  const S = E.summary(L), room = roomSvg();
  $('#date').textContent = S.date + (L.pending ? ' · ⏸ решение' : '');
  $('#who').textContent = `${S.name}, ${L.age} · ${S.place} · ${S.job}`;
  $('#yearbar').style.width = (L.month / 12 * 100) + '%';
  $('#map').innerHTML = bgmap();
  $('#frame').innerHTML = room.svg + `<div class="capt">${room.capt}</div>`;
  $('#stats').innerHTML = STATS6().map(k => { const v = Math.round(L.s[k]), low = k === 'law' ? v > 60 : v < 25;
    return `<button class="st" data-st="${k}">${D.stats.stats[k].name} <span class="mono">${v}</span><div class="bar"><i class="${low ? 'low' : ''}" style="width:${v}%"></i></div></button>`; }).join('');
  document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => fixSheet(b.dataset.st));
  const adult = L.age >= 17 && !['army', 'kid', 'school'].includes(L.job);
  const flow = S.flow;
  $('#money').innerHTML = adult
    ? `<div><span>Доход ${E.fmtMoney(L.lastIncome || 0, L.year)}/мес</span><span>траты ${E.fmtMoney(L.lastExp || 0, L.year)}</span><span class="${flow >= 0 ? 'pos' : 'neg'}">${flow >= 0 ? '+' : '−'}${S.flowText}</span></div>
       <div class="${S.debtText ? 'neg' : 'dim'}"><span>${S.debtText ? 'Долг родне ' + S.debtText + ' — гасится из остатка' : 'Сбережения ' + S.moneyText}${L.usd > 0 ? ' (в долларах ' + E.fmtMoney(L.usd, 1999) + ')' : ''}</span><span>${S.loanText ? 'займ под % ' + S.loanText : ''}</span></div>`
    : `<div><span>${L.job === 'army' ? 'Служба: деньги не нужны' : 'Деньгами распоряжается семья'}</span><span>Сбережения ${S.moneyText}</span></div>`;
  const fo = E.focusOptions(L).find(x => x[0] === L.focus);
  $('#focus').textContent = fo ? 'Фокус: ' + fo[1] + ' ✎' : 'Пока за тебя решают родители';
  // разделы показываются, только когда в них есть что делать
  const vis = {feed: true, act: E.actions(L).some(a => a.available), money: ownBudget(), life: L.age >= 7, work: !['kid'].includes(L.job), stats: true};
  document.querySelectorAll('[data-tab]').forEach(b => { b.hidden = !vis[b.dataset.tab]; if (b.dataset.tab === 'work') b.textContent = ['school', 'student', 'cadet'].includes(L.job) ? 'Учёба' : 'Работа'; });
  if (tab !== 'feed' && !vis[tab]) openTab('feed');
}
const ownBudget = () => L.age >= 17 && !['kid', 'school', 'army'].includes(L.job);
// автопауза: на время решения игра ставится на паузу (видно по кнопке ❚❚), после — продолжается на прежней скорости
let autoFrom = null;
function autoPause() {
  stop(); waiting = true;
  if (autoFrom === null) autoFrom = speed === 'skip' ? prevSpeed : (speed || resumeSpeed || 1);
  speed = 0; markSpeed();
}
function autoResume(ms) {
  waiting = false;
  if (autoFrom !== null) { speed = autoFrom; autoFrom = null; markSpeed(); }
  schedule(ms ?? 300);
}
function markSpeed() { document.querySelectorAll('[data-sp]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sp === String(speed)))); }
function setSpeed(s) {
  if (autoFrom !== null) { autoFrom = s === 0 ? 1 : s; return; }   // во время решения кнопки задают скорость «после»
  if (s === 'skip' && speed !== 'skip') prevSpeed = speed || 1;
  speed = s;
  document.querySelectorAll('[data-sp]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sp === String(s))));
  if (tab !== 'feed') { resumeSpeed = s; return; }
  schedule(150);
}
function stop() { clearTimeout(timer); timer = null; }
function schedule(ms) { stop(); if (waiting || speed === 0 || tab !== 'feed') return; timer = setTimeout(tick, ms ?? (speed === 'skip' ? 60 : MONTH_MS / speed)); }
function addLines(lines) {
  const feed = $('#feed'); if (!feed) return;
  if (L.year !== shownYear) { shownYear = L.year; feed.insertAdjacentHTML('afterbegin', `<div class="yr">${L.year}</div>`); }
  const m = E.MONTHS[Math.max(0, L.month - 1)].slice(0, 3);
  const yr = feed.querySelector('.yr');
  for (const l of lines) yr.insertAdjacentHTML('afterend', `<div class="ln ${l.cls || ''}"><span class="m">${m}</span><span class="t">${esc(l.t)}</span></div>`);
}
function logAct(lines) { addLines([].concat(lines).map(l => typeof l === 'string' ? {t: l, cls: 'act'} : l)); }
function tick() {
  if (waiting) return;
  const before = L.month;
  const r = E.step(L);
  addLines(r.lines);
  update();
  if (r.over || L.end) { waiting = true; stop(); setTimeout(finalScreen, 1400); return; }
  if (r.pause) { autoPause(); showPause(r.pause, () => { autoResume(); stop(); afterStep(r, before); }); return; }
  afterStep(r, before);
}
function afterStep(r, before) {
  if (r.choice) { showChoice(r.choice); return; }
  if (r.yearEnd) { autoPause(); showChronicle(r.yearEnd); return; }
  maybeWarn();
  schedule(L.month === before ? 250 : undefined);
}
function showChoice(c) {
  autoPause();
  update();
  const box = $('#choice');
  box.innerHTML = '<span hidden>pending</span>';
  layer.innerHTML = `<div class="shade"></div><div class="modal" role="dialog" aria-modal="true" aria-label="Решение">
    <div class="mlabel">⏸ ${esc(E.MONTHS[Math.max(0, L.month - 1)])} ${L.year} · нужно решение</div>
    <div class="mtext">${esc(c.text)}</div>${c.options.map(o => `<button class="opt" data-o="${o.i}"><span>${esc(o.text)}</span><span>${esc(o.hint)}</span></button>`).join('')}</div>`;
  layer.querySelector('button').focus({preventScroll: true});
  layer.querySelectorAll('[data-o]').forEach(b => b.onclick = () => {
    haptic('medium');
    addLines([{t: c.text}]);
    box.innerHTML = ''; layer.innerHTML = '';
    addLines(E.choose(L, +b.dataset.o));
    update();
    if (L.end) { waiting = true; setTimeout(finalScreen, 1400); return; }
    autoResume(300);
  });
}
function maybeWarn() {
  const S = E.summary(L);
  if (warnedYear === L.year || L.age < 18 || S.flow >= 0 || S.money > S.w || L.job === 'army') return;
  warnedYear = L.year; autoPause();
  const box = $('#choice');
  box.innerHTML = '<span hidden>pending</span>';
  layer.innerHTML = `<div class="shade"></div><div class="modal warn" role="dialog" aria-modal="true"><div class="mlabel">⏸ деньги</div><div class="mtext">Денег не хватает: в месяц уходит больше, чем приходит.</div>
    <button class="opt" id="w1"><span>Экономить на питании</span><span>минус траты, Здоровье без поддержки</span></button>
    <button class="opt ghost" id="w2"><span>Занять у родни</span><span>+2 зарплаты, Близкие ▼</span></button>
    <button class="opt ghost" id="w3"><span>Разберусь сам${L.sex === 'f' ? 'а' : ''}</span><span></span></button></div>`;
  const done = t => { box.innerHTML = ''; layer.innerHTML = ''; if (t) addLines([{t, cls: 'res'}]); update(); autoResume(300); };
  $('#w1').onclick = () => { L.spend.food = .7; done('Перешли на картошку и макароны.'); };
  $('#w2').onclick = () => { L.local += 2 * S.w * L.rate; L.s.close = Math.max(0, L.s.close - 3); done(E.gender(L, 'Занял у родни две зарплаты.')); };
  $('#w3').onclick = () => done('');
}

// ---------- разделы ----------
let bindPanel = () => {};
function actPanel() {
  const list = E.actions(L);
  bindPanel = () => document.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    const a = E.actions(L).find(x => x.id === b.dataset.act);
    if (!E.doAction(L, b.dataset.act)) { toast('Сейчас не получится.'); return; }
    logAct('Решение: ' + a.label.toLowerCase() + '.');
    openTab('feed'); stop(); waiting = false; tick();
  });
  const av = list.filter(a => a.available);
  return `<h2 class="ph2">Решения</h2><div class="dim" style="font-size:13px">Сделать шаг самому, не дожидаясь случая. Каждое — раз в год.</div>
    ${av.map(a => `<button class="row" data-act="${a.id}"><span>${esc(a.label)}<span class="eff">${esc(a.desc)}</span></span><span>›</span></button>`).join('')}
    ${av.length < list.length ? '<div class="dim" style="font-size:12px;margin-top:8px">Другие решения появятся, когда станут возможны.</div>' : ''}`;
}
function seg(key, val) { return `<span class="seg">${[[.7, 'экономно'], [1, 'обычно'], [1.4, 'щедро']].map(([v, t]) => `<button data-k="${key}" data-v="${v}" aria-pressed="${val === v}">${t}</button>`).join('')}</span>`; }
function moneyPanel() {
  const S = E.summary(L), y = L.year, B = L.breakdown || {inc: {}};
  const f = v => E.fmtMoney(v || 0, y);
  const fam = L.flags.has('partner') || L.flags.has('has_kids');
  const spendRows = [['food', 'Питание', B.food, 'щедро: Здоровье ▲'], fam ? ['family', L.flags.has('has_kids') ? 'Семья и дети' : 'Семья', (B.kids || 0), 'щедро: Близкие и Отношения ▲'] : null, ['leisure', 'Друзья и досуг', B.leisure, 'щедро: Связи и Счастье ▲']].filter(Boolean);
  const fixed = [['Жильё и коммуналка', B.home], ['Содержание имущества', B.upkeep], ['Сигареты и выпивка', B.habits]].filter(r => r[1] > 0);
  const shop = E.shopList(L).filter(it => it.can);
  const owned = [...L.items].map(i => E.ITEMS[i].name).concat(Object.keys(L.queueItems || {}).map(i => E.ITEMS[i].name + ' (в очереди)'));
  bindPanel = () => {
    const LV = {'0.7': 'экономно', '1': 'обычно', '1.4': 'щедро'}, NM = {food: 'питание', family: 'семью', leisure: 'друзей и досуг'};
    document.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { if (L.spend[b.dataset.k] === +b.dataset.v) return; L.spend[b.dataset.k] = +b.dataset.v;
      logAct('Траты на ' + NM[b.dataset.k] + ': ' + LV[b.dataset.v] + '.'); renderPanel(); });
    document.querySelectorAll('[data-keep]').forEach(b => b.onclick = () => { if (b.dataset.keep === 'usd' && y < 1989) return toast('До 1989 года доллары почти не достать.'); if (L.keep === b.dataset.keep) return; L.keep = b.dataset.keep;
      logAct(L.keep === 'usd' ? 'С января откладываешь в доллары.' : 'Откладываешь в рублях.'); renderPanel(); });
    document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => { const r = E.buy(L, b.dataset.buy); logAct(r); toast(r[0].t); update(); renderPanel(); });
    const d = $('#diet'); if (d) d.onclick = () => { L.diet = !L.diet; logAct(L.diet ? 'Теперь следишь за питанием: дороже, но Здоровье растёт.' : 'Перестал' + (L.sex === 'f' ? 'а' : '') + ' следить за питанием.'); renderPanel(); };
  };
  return `<h2 class="ph2">Деньги</h2>
    <div class="sec">Доходы в месяц</div>${Object.entries(B.inc || {}).map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span class="mono">${f(v)}</span></div>`).join('') || '<div class="dim">Своих доходов нет.</div>'}
    <div class="sec">Траты в месяц</div>
    ${spendRows.map(([k, n, v, e]) => `<div class="row"><span>${n} <span class="mono dim">${f(v)}</span><span class="eff">${e}</span></span>${seg(k, L.spend[k])}</div>`).join('')}
    <div class="row"><span>Следить за питанием<span class="eff">${L.diet ? 'стоит' : 'будет стоить'} ещё ${f((B.food || 0) / (L.diet ? 1.15 : 1) * .15)} в месяц · Здоровье ▲ каждый год</span></span><button class="switch" id="diet" role="switch" aria-checked="${L.diet}" aria-label="Следить за питанием"><i></i></button></div>
    ${fixed.map(([n, v]) => `<div class="row"><span>${n}</span><span class="mono">${f(v)}</span></div>`).join('')}
    <div class="row"><span><b>Итог месяца</b></span><span class="mono ${S.flow >= 0 ? 'pos' : 'neg'}">${S.flow >= 0 ? '+' : '−'}${S.flowText}</span></div>
    ${owned.length ? `<div class="sec">Имущество</div><div class="chips">${owned.map(n => `<span class="chip">${esc(n)}</span>`).join('')}</div>` : ''}
    ${shop.length ? `<div class="sec">Можно купить или достать</div><div class="dim" style="font-size:14px">У тебя ${esc(S.debtText ? 'долг ' + S.debtText : S.moneyText)}. Не хватит своих — займёшь у родни, не больше трёх зарплат.</div>` + shop.map(it => `<div class="row"><span>${esc(it.name)}<span class="eff">${esc(it.eff)}</span></span><button class="chip" data-buy="${it.id}">${esc(it.how)} · ${esc(it.priceText)}</button></div>`).join('') : ''}
    ${S.debtText ? `<div class="sec">Долг</div><div class="row"><span>Родне и знакомым, без процентов<span class="eff">гасится сам из того, что остаётся в месяц; пока он больше трёх зарплат — Близкие ▼</span></span><span class="mono neg">${S.debtText}</span></div>` : ''}
    <div class="sec">Сбережения</div>
    <div class="row"><span>${y <= 1991 ? 'Сберкнижка' : 'Рубли'}<span class="eff">тают вместе с инфляцией</span></span><span class="mono">${S.rubText}</span></div>
    ${L.usd > 0 || y >= 1989 ? `<div class="row"><span>Доллары<span class="eff">${y <= 1991 ? 'только у фарцовщиков, дорого' : 'держат цену'}</span></span><span class="mono">${E.fmtMoney(L.usd, 1999)}</span></div>` : ''}
    ${L.assets.map(a => `<div class="row"><span>${esc(D.stats.asset_kinds[a.kind])}<span class="eff">${esc(D.stats.sectors[a.sector] || '')}</span></span><span class="mono">${E.fmtMoney(a.value, 1999)}</span></div>`).join('')}
    ${y >= 1989 ? `<div class="row"><span>Куда откладывать</span><span class="seg">${[['rub', 'рубли'], ['usd', 'доллары']].map(([v, t]) => `<button data-keep="${v}" aria-pressed="${L.keep === v}">${t}</button>`).join('')}</span></div>` : ''}
    ${S.loanText ? `<div class="sec">Займы</div><div class="row"><span>Займ под процент</span><span class="mono">${S.loanText}</span></div>` : ''}`;
}
function lifePanel() {
  const f = L.flags;
  const said = [f.has('defender91') && 'стоял у Белого дома', f.has('afghan') && 'прошёл Афганистан', f.has('helped_neighbors') && 'укрыл соседей, когда было страшно',
    f.has('cheated_partner') && 'кинул партнёра', f.has('brigade') && 'с братвой', f.has('drinker') && 'пьёт', f.has('defaulter') && 'долги не отдаёт', f.has('activist') && 'ходит на митинги',
    f.has('entrepreneur') && 'умеет крутиться', f.has('refugee') && 'беженец'].filter(Boolean);
  const hob = {hobby_sport: 'спорт', hobby_music: 'музыка', hobby_tech: 'техника', hobby_books: 'книги', hobby_garden: 'огород', hobby_fishing: 'рыбалка'};
  bindPanel = () => {};
  return `<h2 class="ph2">Жизнь</h2>
    <div class="sec">Семья</div>
    ${f.has('partner') ? `<div class="st">${f.has('married') ? 'В браке' : 'Есть пара'} · Отношения ${Math.round(L.s.rel)}<div class="bar"><i style="width:${L.s.rel}%"></i></div></div>` : L.age >= 18 ? '<div class="row"><span>Пары нет</span></div>' : ''}
    ${f.has('has_kids') ? '<div class="row"><span>Дети</span><span class="dim">есть</span></div>' : ''}
    <div class="row"><span>Родители</span><span class="dim">${f.has('parents_alive') || L.age < 18 ? 'живы' : 'их нет'}</span></div>
    ${(() => { const h = ['smoker', 'drinker', 'addicted', 'coded', 'chronic'].filter(x => f.has(x)); return h.length ? `<div class="sec">Здоровье и привычки</div><div class="chips">${h.map(x => `<span class="chip">${({smoker: 'курит', drinker: 'пьёт', addicted: 'зависимость', coded: 'закодирован', chronic: 'хроническая болезнь'})[x]}</span>`).join('')}</div>` : ''; })()}
    ${(() => { const c = Object.keys(hob).filter(h => f.has(h)).map(h => `<span class="chip">${hob[h]}</span>`).concat(Object.entries(L.traits).filter(([k, v]) => v !== 'mid').map(([k, v]) => `<span class="chip">${D.stats.traits[k].name} ${v === 'strong' ? '▲' : '▼'}</span>`)); return c.length ? `<div class="sec">Увлечения и задатки</div><div class="chips">${c.join('')}</div>` : ''; })()}
    <div class="sec">Что о тебе говорят</div><div style="font:16px/1.4 var(--f-title)">${said.length ? '«' + esc(said.slice(0, 3).join(', ')) + '».' : 'Пока ничего особенного.'}</div>
    <div class="sec">Двор</div>${L.neighbors.map(n => `<div class="row"><span>${esc(n.label)}</span><span class="${n.st === 'ok' ? 'dim' : 'neg'}">${esc(n.note)}</span></div>`).join('')}`;
}
function workPanel() {
  const C = E.careerInfo(L);
  bindPanel = () => {};
  const hasJob = !!L.sphere && !['school', 'student', 'cadet', 'kid'].includes(L.job);
  return `<h2 class="ph2">${hasJob ? 'Работа' : 'Учёба'}</h2>${[['Занятие', E.summary(L).job], ['Образование', L.job === 'school' ? '' : ({school: 'школа', ptu: 'ПТУ', technikum: 'техникум', university: 'вуз'}[L.edu] || L.edu)],
    ['Учится заочно', L.flags.has('evening_study') ? 'да' : ''], ['Сфера', hasJob ? C.sphere : ''], ['Должность', hasJob ? C.rank : ''], ['Опыт в сфере', hasJob ? C.exp + ' ' + plural(C.exp) : ''],
    ['Трудовой стаж', C.stazh >= 1 ? C.stazh + ' ' + plural(C.stazh) : ''], ['Доход в месяц', ownBudget() && L.lastIncome ? C.pay : ''], ['Знания', L.job === 'school' ? Math.round(L.s.know) : '']]
    .filter(r => r[1]).map(([a, b]) => `<div class="row"><span>${a}</span><span>${esc(b)}</span></div>`).join('')}
    ${C.all.length > 1 ? `<div class="sec">Опыт по сферам</div>` + C.all.map(([a, b]) => `<div class="row"><span>${esc(a)}</span><span class="mono">${b}</span></div>`).join('') : ''}
    ${hasJob ? '<div class="dim" style="font-size:13px;margin-top:10px">Стаж в сфере: +3% к зарплате в год, должность: +15%. Смена сферы обнуляет опыт; работа «в конверте» с 1992 года в стаж не идёт. Сменить работу — в разделе «Решения».</div>' : ''}`;
}
function statsPanel() {
  const pct = Math.round(L.survivors * 100);
  const pts = (L.curve || []).concat([[L.year + (L.month / 12), L.survivors]]);
  const lo = Math.max(0, Math.floor((Math.min(...pts.map(p => p[1])) * 100 - 5) / 10) * 10);
  const X = y => 36 + (y - 1986) * 18, Y = v => 10 + (100 - v * 100) / (100 - lo) * 96;
  const happyAvg = L.happyN ? Math.round(L.happySum / L.happyN) : Math.round(L.s.happy);
  bindPanel = () => {};
  return `<h2 class="ph2">Итоги</h2><div class="sec">Ровесники того же пола, ${esc(E.regionName(L.region, L.year, L.month))}</div>
    <svg viewBox="0 0 300 130" style="width:100%;height:auto" role="img" aria-label="Из ровесников живы ${pct}%">
     <line x1="36" y1="10" x2="36" y2="106" stroke="#3b3a33"/><line x1="36" y1="106" x2="290" y2="106" stroke="#3b3a33"/>
     <text x="4" y="14" font-size="9" fill="#a99f8a">100%</text><text x="8" y="106" font-size="9" fill="#a99f8a">${lo}%</text>
     <polyline fill="none" stroke="#c99a58" stroke-width="2" points="${[[1986, 1]].concat(pts).map(([y, v]) => X(y).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ')}"/>
     <circle cx="${X(pts[pts.length - 1][0])}" cy="${Y(pts[pts.length - 1][1])}" r="4" fill="#e4dac4"/>
     <text x="28" y="120" font-size="9" fill="#a99f8a">1986</text><text x="262" y="120" font-size="9" fill="#a99f8a">1999</text></svg>
    <div class="row"><span>Из твоих ровесников живы</span><span class="mono">${pct}%</span></div>
    <div class="row"><span>Счастье в среднем за жизнь</span><span class="mono">${happyAvg}</span></div>
    <div class="row"><span>Твой доход к среднему по республике</span><span class="mono">${L.lastIncome ? (L.lastIncome / E.avgWage(L.region, L.year)).toFixed(1).replace('.', ',') : '—'}</span></div>`;
}

// ---------- шторки ----------
function sheet(html, onclose) {
  const was = waiting; waiting = true; stop();
  layer.innerHTML = `<div class="shade" id="shade"></div><div class="sheet" role="dialog"><div class="grab"></div><button class="btn" id="xclose" style="float:right" aria-label="Закрыть">✕</button>${html}</div>`;
  const close = () => { layer.innerHTML = ''; if (onclose) onclose(); waiting = was; if (L && !L.end && $('#feed') && !was) schedule(300); };
  $('#shade').onclick = close; $('#xclose').onclick = close;
  return close;
}
function settingsSheet() {
  const close = sheet(`<h2>Настройки</h2>
    <button class="row" id="softb"><span>Без тяжёлых сцен</span><span class="dim">${L.soft ? 'вкл.' : 'выкл.'}</span></button>
    <button class="row" id="exitb"><span>Выйти в начало</span><span class="dim">жизнь не сохранится</span></button>`);
  $('#softb').onclick = () => { L.soft = !L.soft; prefs.soft = L.soft; store.set('vp-prefs', prefs); close(); settingsSheet(); };
  $('#exitb').onclick = () => { close(); renderStart(); };
}
function focusSheet() {
  const opts = E.focusOptions(L);
  if (!opts.length) return toast('Пока за тебя решают родители.');
  const close = sheet(`<h2>Фокус</h2><div class="dim" style="font-size:13px">Меняется в любой момент. Показано только то, что есть в твоей жизни сейчас.</div>${opts.map(([k, t, d]) => `<button class="row" data-f="${k}"><span>${t}<span class="eff">${d}</span></span><span>${L.focus === k ? '●' : ''}</span></button>`).join('')}`);
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { if (L.focus !== b.dataset.f) { L.focus = b.dataset.f; logAct('Фокус: ' + opts.find(o => o[0] === L.focus)[1].toLowerCase() + '.'); } update(); close(); });
}
function fixSheet(k) {
  const v = Math.round(L.s[k]), name = D.stats.stats[k].name;
  const F = (f, t) => Object.assign(() => { L.focus = f; return 'Фокус: ' + t + '.'; }, {fk: f});
  const acts = {happy: [['Фокус «Увлечение»', F('hobby', 'увлечение')], ['Тратить на друзей щедрее', () => { L.spend.leisure = 1.4; return 'Траты на друзей: щедро.'; }]],
    health: [['Следить за питанием', () => { L.diet = true; return 'Теперь следишь за питанием.'; }], ['Фокус «Здоровье»', F('health', 'здоровье')]],
    fit: [['Фокус «Здоровье»', F('health', 'здоровье')]].concat(E.actions(L).some(a => a.id === 'sport' && a.available) ? [['Заняться спортом', () => { E.doAction(L, 'sport'); return 'Ищешь, где заниматься.'; }]] : []),
    know: E.focusOptions(L).some(x => x[0] === 'study') ? [['Фокус «Учёба»', F('study', 'учёба')]] : E.actions(L).some(a => a.id === 'study' && a.available) ? [['Пойти учиться', () => { E.doAction(L, 'study'); return 'Смотришь, куда поступить.'; }]] : [],
    close: [['Тратить на семью щедрее', () => { L.spend.family = 1.4; return 'Траты на семью: щедро.'; }], ['Фокус «Семья»', F('family', 'семья')]],
    rel: [['Тратить на семью щедрее', () => { L.spend.family = 1.4; return 'Траты на семью: щедро.'; }], ['Фокус «Семья»', F('family', 'семья')]],
    ties: [['Тратить на друзей щедрее', () => { L.spend.leisure = 1.4; return 'Траты на друзей: щедро.'; }], ['Фокус «Увлечение»', F('hobby', 'увлечение')]],
    law: [['Залечь на дно: фокус «Баланс»', F('balance', 'баланс')]]}[k] || [];
  const why = {happy: 'Растёт от любимых дел, отдыха, близких, денег на жизнь. Падает от безработицы, бедности, тяжёлых лет.', health: 'Тянут вниз: возраст, курение, алкоголь, бедность.',
    fit: 'Падает с возрастом и без нагрузки.', know: 'Уходят без практики.', close: 'Падают без трат и внимания, от переездов и запоев.', rel: 'Падают без внимания, от вахт, ссор и измен.',
    ties: 'Падают без общения, на пенсии и без работы.', law: 'Растёт от криминала, теневой торговли, взяток.'}[k];
  const okFocus = new Set(E.focusOptions(L).map(x => x[0]));
  const spendOk = ownBudget();
  for (let i = acts.length - 1; i >= 0; i--) { const t = acts[i][0];
    if ((acts[i][1].fk && !okFocus.has(acts[i][1].fk)) || (/^Тратить|питанием/.test(t) && !spendOk)) acts.splice(i, 1); }
  const close = sheet(`<h2>${name} ${v}</h2><div class="dim" style="font-size:13px">${why}</div>${acts.length ? '' : '<div class="dim" style="font-size:13px;margin-top:8px">Пока повлиять на это нельзя.</div>'}${acts.map(([t], i) => `<button class="opt" style="margin-top:8px" data-a="${i}"><span>${t}</span><span></span></button>`).join('')}`);
  document.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { const t = acts[+b.dataset.a][1](); logAct(t); toast(t); update(); close(); });
}
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }

// ---------- хроника года, пауза, финал ----------
function showChronicle(c) {
  stop();
  (L.curve = L.curve || []).push([L.year, L.survivors]);
  const y = c.year, last = y >= 1999;
  layer.innerHTML = `<div class="shade"></div><div class="sheet" role="dialog" aria-label="Хроника года"><button class="btn" id="xchron" style="float:right" aria-label="Закрыть">✕</button>
    <div class="news"><div class="mono dim" style="font-size:10px;letter-spacing:.2em">КИНОХРОНИКА · ВЫПУСК ${y}</div><div class="k">Итоги года</div></div>
    ${c.news.filter(n => n.text).map(n => `<div class="hl">${n.from ? `<small>${esc(n.from.toUpperCase())}</small>` : ''}${esc(n.text)}</div>`).join('')}
    <div class="sec">Цены и деньги</div>${c.prices.map(([a, b]) => `<div class="row"><span>${a}</span><span class="mono">${esc(b)}</span></div>`).join('')}
    <div class="sec">Твой год</div>${c.log.length ? c.log.map(t => `<p class="yl">${esc(t)}</p>`).join('') : '<p class="yl">Обычный год, без больших перемен.</p>'}
    ${c.neighbors.length ? `<div class="sec">Во дворе</div>${c.neighbors.map(t => `<p class="yl">${esc(t)}</p>`).join('')}` : ''}
    ${last || !ownBudget() || y + 1 < 1989 ? '' : `<div class="sec">Куда откладывать в ${y + 1}-м</div><div class="chips">${[['rub', 'Рубли'], ['usd', 'Доллары']].map(([v, t]) => `<button class="chip" data-keep="${v}" aria-pressed="${L.keep === v}">${t}</button>`).join('')}</div>`}
    ${last || !E.focusOptions(L).length ? '' : `<div class="sec">Фокус на ${y + 1}-й</div><div class="chips">${E.focusOptions(L).map(([k, t]) => `<button class="chip" data-f="${k}" aria-pressed="${L.focus === k}">${t}</button>`).join('')}</div>`}
    <div class="sec">${last ? 'Что скажешь себе в 1986-м?' : 'Что загадаешь на ' + (y + 1) + '-й?'}</div><input class="inp" id="wish" maxlength="120" placeholder="можно не писать">
    <div style="text-align:center;margin-top:16px"><button class="cta" id="ny">${last ? 'Встретить 2000-й' : 'Встретить ' + (y + 1) + '-й'}</button></div></div>`;
  layer.querySelectorAll('[data-keep]').forEach(b => b.onclick = () => { if (b.dataset.keep === 'usd' && y < 1988) return toast('До 1989 года доллары почти не достать.'); L.keep = b.dataset.keep; layer.querySelectorAll('[data-keep]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  layer.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { if (L.focus !== b.dataset.f) logAct('Фокус на ' + (y + 1) + '-й: ' + b.textContent.toLowerCase() + '.'); L.focus = b.dataset.f; layer.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  const go = () => {
    const w = $('#wish').value.trim(); if (w) (last ? L.letters : L.wishes).push(last ? w : [y, w]);
    layer.innerHTML = '';
    if (last) { finalScreen(); return; }
    E.nextYear(L); update(); autoResume(200);
  };
  $('#ny').onclick = go; $('#xchron').onclick = go;
}
function showPause(p, cont) {
  stop();
  layer.innerHTML = `<div class="shade" style="background:rgba(0,0,0,.92)"></div><div class="sheet" style="top:0;bottom:0;max-height:none;border:0;border-radius:0;background:transparent;display:flex">
    <div class="title" style="min-height:0;flex:1"><div class="mono dim" style="font-size:11px;letter-spacing:.2em">ПАУЗА</div>
    <div class="q">${esc(p.text)}</div><input class="inp" id="pl" maxlength="140" placeholder="Одна строка — она войдёт в письмо в 1986-й">
    <button class="cta" id="pc">Дальше</button><button class="btn" id="px">✕ пропустить</button></div></div>`;
  $('#px').onclick = () => { layer.innerHTML = ''; waiting = false; cont(); };
  $('#pc').onclick = () => { const t = $('#pl').value.trim(); if (t) L.letters.push(t); layer.innerHTML = ''; waiting = false; cont(); };
}
function finalScreen() {
  stop(); layer.innerHTML = '';
  const S = E.summary(L), V = E.views(L), alive = !L.end;
  const head = L.end ? (L.end.type === 'abroad' ? `${L.name.first} уехал${L.sex === 'f' ? 'а' : ''} за границу` : `${L.name.first}, ${L.year - L.end.age}–${L.end.year}`) : `${L.name.first} пережил${L.sex === 'f' ? 'а' : ''} девяностые`;
  const sub = L.end ? (L.end.type === 'abroad' ? `${E.MONTHS[L.end.month - 1]} ${L.end.year}. Дальше — другая страна.` : `${E.MONTHS[Math.max(0, L.end.month - 1)]} ${L.end.year}, ${L.end.age} ${plural(L.end.age)}.`) : `31 декабря 1999 года тебе ${L.age} ${plural(L.age)}.`;
  const w0 = L.startMoney / L.startWage, w1 = E.money(L) / E.avgWage(L.region, Math.min(L.year, 1999));
  const room = roomSvg();
  const letter = L.letters.slice(-3);
  const rec = {name: L.name.first + ' ' + L.name.last, region: E.D.regions[L.origRegion].old, head, sub, date: Date.now(), w0: w0.toFixed(1), w1: w1.toFixed(1)};
  const arch = store.get('vp-archive', []); arch.unshift(rec); store.set('vp-archive', arch.slice(0, 10));
  const share = [head + '.', sub, `Сбережения: было ${w0.toFixed(1)} зарплаты → стало ${w1.toFixed(1)}.`, `Из ровесников живы ${Math.round(L.survivors * 100)}%.`, letter[0] ? '«' + letter[0] + '»' : '', '«Время перемен», 1986–1999'].filter(Boolean).join('\n');
  app.innerHTML = `<div class="bgmap" aria-hidden="true">${bgmap()}</div>
    <div class="title" style="min-height:0;padding:20px 0 10px"><div class="mono dim" style="font-size:11px;letter-spacing:.2em">${alive ? '31 ДЕКАБРЯ 1999' : 'КОНЕЦ ПЛЁНКИ'}</div><div class="big" style="font-size:34px">${esc(head)}</div><div class="dim">${esc(sub)}</div></div>
    <div class="frame">${room.svg}<div class="capt">${room.capt}</div></div>
    ${[['Родил' + (L.sex === 'f' ? 'ась' : 'ся'), (L.year - L.age) + ', ' + E.D.regions[L.origRegion].old], ['Последний адрес', S.place], ['Последнее занятие', S.job],
      ['Сбережения', `было ${w0.toFixed(1)} → стало ${w1.toFixed(1)} средних зарплат`], ['Сменил' + (L.sex === 'f' ? 'а' : '') + ' сферу', L.switches + ' раз'], ['Из ровесников живы', Math.round(L.survivors * 100) + '%']]
      .map(([a, b]) => `<div class="field"><span>${a}</span><span>${esc(b)}</span></div>`).join('')}
    <div class="sec">Кем ты был${L.sex === 'f' ? 'а' : ''} в 90-е</div>
    <svg viewBox="0 0 280 120" style="width:100%;height:auto" role="img" aria-label="${esc(V.text)}"><line x1="140" y1="8" x2="140" y2="112" stroke="#3b3a33"/><line x1="20" y1="60" x2="260" y2="60" stroke="#3b3a33"/>
     <text x="22" y="56" font-size="9" fill="#a99f8a">старый порядок</text><text x="214" y="56" font-size="9" fill="#a99f8a">реформы</text><text x="144" y="16" font-size="9" fill="#a99f8a">Союз</text><text x="144" y="110" font-size="9" fill="#a99f8a">независимость</text>
     <circle cx="${140 + V.reform * 1.1}" cy="${60 + V.union * .5}" r="5" fill="#c99a58"/></svg>
    <div style="font:17px/1.4 var(--f-title)">${esc(V.text)}</div>
    ${letter.length ? `<div class="sec">Письмо в 1986-й</div><div style="font:17px/1.4 var(--f-title)">${letter.map(t => '«' + esc(t) + '»').join('<br>')}</div>` : ''}
    <div class="sec">Двор</div>${L.neighbors.map(n => `<div class="row"><span>${esc(n.label)}</span><span class="dim">${esc(n.note)}</span></div>`).join('')}
    <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap">${tg ? '<button class="cta" id="tgshare">Поделиться</button>' : ''}<button class="cta${tg ? ' ghost' : ''}" id="copy">Скопировать итог</button><button class="cta ghost" id="again">Ещё жизнь</button></div>
    <pre id="sharetxt" class="mono dim" style="white-space:pre-wrap;font-size:12px" hidden></pre>`;
  window.scrollTo(0, 0);
  $('#again').onclick = () => { waiting = false; renderStart(); };
  if (tg) { try { tg.disableClosingConfirmation(); } catch (e) { /* старый клиент */ } haptic('heavy'); }
  if ($('#tgshare')) $('#tgshare').onclick = () => {
    const url = TG_BOT ? 'https://t.me/' + TG_BOT + (TG_APP ? '/' + TG_APP : '') : location.href.split('#')[0];
    tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(share));
  };
  $('#copy').onclick = () => { navigator.clipboard.writeText(share).then(() => toast('Скопировано.')).catch(() => { const p = $('#sharetxt'); p.textContent = share; p.hidden = false; }); };
}
function archiveSheet() {
  const arch = store.get('vp-archive', []);
  sheet(`<h2>Архив жизней</h2>${arch.length ? arch.map(r => `<div class="row"><span>${esc(r.name)}<span class="eff">${esc(r.region)} · ${esc(r.head)}</span></span><span class="dim mono" style="font-size:11px">${esc(r.w0)} → ${esc(r.w1)}</span></div>`).join('') : '<div class="dim">Пока пусто. Здесь будут последние 10 прожитых жизней.</div>'}`);
}
})();
