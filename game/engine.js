// «Время перемен» — движок. Без DOM: работает и в браузере, и в проверочном прогоне.
// Логика перенесена из tools/simulate.py; правила — CONCEPT.md.
(function (root) {
'use strict';

function createEngine(D, rand) {
  rand = rand || Math.random;
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const pick = a => a[Math.floor(rand() * a.length)];
  const wpick = pairs => { let t = 0; for (const p of pairs) t += Math.max(0, p[1]); let r = rand() * t;
    for (const p of pairs) { r -= Math.max(0, p[1]); if (r <= 0) return p[0]; } return pairs[pairs.length - 1][0]; };
  const STAT_RANGE = {}; for (const k in D.stats.stats) STAT_RANGE[k] = D.stats.stats[k].range;
  const TRAITS = Object.keys(D.stats.traits).filter(t => t !== 'talent');
  const TALENTS = D.stats.traits.talent.kinds;
  const JOB_SPHERE = {}; for (const sp in D.stats.spheres) for (const j of D.stats.spheres[sp].jobs) JOB_SPHERE[j] = sp;
  const SHADOW = new Set(D.stats.shadow_jobs_after_1992);
  const NO_SENIORITY = new Set(['trade', 'crime']);
  const OWN_HOUSING = new Set(['own_flat', 'cottage']);
  const ITEMS = D.items;
  const EVENTS = D.events.filter(e => e.trigger !== 'engine');
  const CHANCE = EVENTS.filter(e => 'chance' in e);
  const FIXED = EVENTS.filter(e => !('chance' in e) && (e.fixed || (e.when && e.when.month)));
  const RANDOM = EVENTS.filter(e => !('chance' in e) && !(e.fixed || (e.when && e.when.month)) && e.type !== 'news');
  const SOFT = new Set(['health', 'fit', 'know', 'close', 'ties', 'rel']);
  const HOBBIES = ['hobby_sport', 'hobby_music', 'hobby_tech', 'hobby_books', 'hobby_garden', 'hobby_fishing'];
  const STUDY_JOBS = new Set(['school', 'student', 'cadet']);
  const NO_WORK = new Set(['kid', 'school', 'student', 'cadet', 'pension']);
  const JOB_PAY = {worker: [1, .9], miner: [1.8, 1.3], engineer: [.9, .6], scientist: [.9, .4], teacher: [.8, .5], doctor: [.85, .5],
    kolkhoz: [.75, .4], farmer: [.6, .7], shop: [.8, 1], coop: [2.5, 2.5], shuttle: [2, 2], kiosk: [2.5, 2.5], firm: [2.5, 2.5],
    banker: [8, 8], broker: [5, 5], guard: [1, 1.3], brigade: [4, 4], police: [.9, .7], officer: [1.3, .7], journalist: [.9, 1.2],
    artist: [1, 1], programmer: [1, 2.5], translator: [2, 2.5], official: [1.1, 1], politician: [3, 3], shift: [2.5, 2.5],
    migrant: [1.5, 1.5], student: [.2, .2], cadet: [.3, .3], unemployed: [.15, .15]};
  const STATE_JOBS = new Set(['worker', 'miner', 'engineer', 'scientist', 'teacher', 'doctor', 'kolkhoz', 'officer', 'police']);
  const NO_BUDGET = new Set(['kid', 'school', 'army']);
  const TRAINING = new Set(['army', 'cadet', 'worker', 'miner', 'shift', 'guard', 'brigade', 'kolkhoz', 'farmer', 'police', 'officer']);
  const KNOW_JOBS = new Set(['school', 'student', 'cadet', 'scientist', 'engineer', 'teacher', 'doctor', 'programmer', 'journalist', 'translator', 'banker']);
  const ACTIVE = ['brigade', 'business', 'deputy_local', 'deputy_rep', 'deputy_duma', 'official', 'debt_bandits', 'debt_private'];
  const BUDGET = [[6, 2, 3, 0, 0], [13, 3, 5, 1, 2], [17, 4, 6, 1, 2], [30, 5, 7, 2, 3], [55, 5, 7, 2, 3], [200, 3, 5, 1, 2]];
  const JOB_NAMES = {kid: 'детство', school: 'школа', student: 'учёба', cadet: 'военное училище', army: 'армия', worker: 'рабочий',
    miner: 'шахтёр', engineer: 'инженер', scientist: 'научный сотрудник', teacher: 'учитель', doctor: 'врач', kolkhoz: 'колхоз',
    farmer: 'фермер', shop: 'продавец', coop: 'кооператор', shuttle: 'челнок', kiosk: 'свой ларёк', firm: 'коммерческая фирма',
    banker: 'банкир', broker: 'брокер', guard: 'охранник', brigade: 'бригада', police: 'милиция', officer: 'офицер',
    journalist: 'журналист', artist: 'музыкант', programmer: 'программист', translator: 'переводчик', official: 'госслужба',
    politician: 'политик', shift: 'вахта', migrant: 'на заработках', unemployed: 'без работы', pension: 'пенсия'};
  const RANKS = ['рядовой', 'старший', 'руководитель', 'начальник'];
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const PAUSES = {'1986-5': 'Апрель 1986. Чернобыль. О чём ты тогда думал?', '1991-8': '19 августа 1991. По всем каналам «Лебединое озеро». Что ты делаешь этим утром?',
    '1991-12': '26 декабря 1991. Советского Союза больше нет. Что ты чувствуешь?', '1992-1': 'Январь 1992. Цены отпустили. Что будет дальше?',
    '1998-8': '17 августа 1998. Дефолт. Что ты сейчас понял?'};

  const econ = (r, y) => D.econ[r + '|' + y];
  const avgWage = (r, y) => y <= 1991 ? econ(r, y)[1] : econ(r, y)[2];
  const rateAt = (r, y, m) => D.rates[r][(y - 1986) * 12 + m - 1];
  const blackAt = (r, y, m) => y <= 1991 ? D.black[r][(y - 1986) * 12 + m - 1] : null;
  const healthNorm = a => 88 - .3 * Math.max(0, Math.min(a, 50) - 30) - .6 * Math.max(0, Math.min(a, 70) - 50) - Math.max(0, a - 70);
  const clamp = (k, v) => Math.max(STAT_RANGE[k][0], Math.min(STAT_RANGE[k][1], v));

  // ---------- рождение ----------
  function newLife() {
    const cells = [];
    for (const [r, a, m, f] of D.pop) { cells.push([[r, a, 'm'], m]); cells.push([[r, a, 'f'], f]); }
    const [region, a0, sex] = wpick(cells);
    const L = {region, sex, origRegion: region, year: 1986, month: 0, age: a0 + ri(0, 4), birthMonth: ri(1, 12),
      flags: new Set(), ever: new Set(), fired: {}, s: {}, traits: {}, talent: rand() < .2 ? pick(TALENTS) : null,
      focus: 'family', spend: {food: 1, family: 1, leisure: 1}, diet: false, keep: 'rub', rate: 1, local: 0, usd: 0, loan: 0,
      assets: [], items: new Set(), exp: {}, rank: 0, sphere: null, stazh: 0, armyMonths: 0, studyEnd: 0, switches: 0,
      queue: [], plan: {}, end: null, log: [], yearLog: [], letters: [], wishes: [], neighbors: [], queueItems: {},
      survivors: 1, jan92: null, moved: false};
    if (L.birthMonth <= 6 && L.age > 0) L.age -= 1;
    for (const t of TRAITS) L.traits[t] = wpick([['weak', 20], ['mid', 60], ['strong', 20]]);
    const R = D.regions[region];
    const minorityP = {RU: 0, UA: .22, BY: .13, KZ: .38, LV: .34, EE: .30, LT: .09, MD: .13, KG: .21, UZ: .08, TJ: .08, TM: .09, AZ: .06, GE: .06, AM: .02}[region];
    if (rand() < minorityP) L.flags.add('minority');
    if (rand() < .015) L.flags.add('jewish_roots');
    if (rand() < ({KZ: .06, KG: .02, RU: .006}[region] || 0)) L.flags.add('german_roots');
    const urban = {RU: .74, UA: .67, BY: .66, KZ: .57, LV: .71, EE: .71, LT: .68, MD: .47, KG: .38, UZ: .40, TJ: .32, TM: .45, AZ: .54, GE: .56, AM: .68}[region];
    if (rand() > urban) { L.flags.add('village'); L.place = pick(R.village); L.city = null; }
    else { L.city = rand() < (region === 'RU' ? .15 : .35) ? R.cities.find(c => c[3]) : pick(R.cities); if (L.city[3]) L.flags.add('capital'); }
    if ((region === 'UA' || region === 'BY') && rand() < .03) L.flags.add('chernobyl_zone');
    const a = L.age;
    if (rand() < (a < 25 ? .97 : a < 40 ? .8 : a < 55 ? .45 : .1)) L.flags.add('parents_alive');
    const tb = {weak: -8, mid: 0, strong: 8};
    const g = (m, sd) => m + sd * (rand() + rand() + rand() - 1.5) * 1.15;
    L.s = {health: Math.max(20, Math.min(95, healthNorm(a) + tb[L.traits.constitution] + g(0, 6))),
      fit: Math.max(10, Math.min(90, (a < 20 ? 40 + a * 1.5 : 65 - (a - 20) * .6) + tb[L.traits.strength] + g(0, 8))),
      know: Math.max(5, Math.min(90, (a < 17 ? a * 4 : 45 + g(0, 12)) + tb[L.traits.mind])),
      close: 45 + rand() * 30, ties: 25 + rand() * 35 + tb[L.traits.charm], rel: 0, fame: 0, law: 0, happy: 45 + rand() * 20,
      views_reform: g(0, 15), views_union: g(0, 15)};
    L.edu = 'school';
    if (a < 7) L.job = 'kid';
    else if (a < 17) L.job = 'school';
    else if (a < 22 && rand() < .35) { L.job = 'student'; L.edu = 'university'; L.studyEnd = 1986 + (22 - a); }
    else if (a >= pensAge(L)) L.job = 'pension';
    else { L.edu = wpick([['school', 40], ['ptu', 20], ['technikum', 18], ['university', 22]]); L.job = pickJob(L); }
    if (a >= 20 && sex === 'm' && rand() < .8) L.flags.add('served');
    if (a >= 24 && rand() < .75) { L.flags.add('married'); L.flags.add('partner'); L.s.rel = 40 + rand() * 40; if (a >= 26 && rand() < .85) L.flags.add('has_kids'); }
    if (a >= 17 && rand() < (sex === 'm' ? .55 : .1)) L.flags.add('smoker');
    if (a >= 30 && sex === 'm' && rand() < .12) L.flags.add('drinker');
    if (a >= 25) {
      L.items.add(wpick([['own_flat', 83], ['kommunalka', 10], ['dorm', 7]]));
      for (const [it, p] of [['tv_vcr', .3], ['dacha', .3], ['phone_line', .3]]) if (rand() < p) L.items.add(it);
      if ((sex === 'm' || L.flags.has('married')) && rand() < .3) L.items.add('car');
    } else if (a >= 18 && rand() < .4) L.items.add('dorm');
    L.flatVariant = L.flags.has('village') ? 'izba' : wpick(Object.entries(D.window.housing.own_flat.variants).map(([k, v]) => [k, v.w]));
    L.sphere = JOB_SPHERE[L.job] || null;
    const yrs = ['kid', 'school', 'student'].includes(L.job) ? 0 : Math.max(0, a - (L.edu === 'university' ? 22 : 18));
    L.stazh = L.job === 'pension' ? Math.max(20, yrs * .8) : yrs;
    if (L.sphere) { L.exp[L.sphere] = yrs * (.6 + rand() * .4); for (let i = 0; i < Math.floor(L.exp[L.sphere] / 8); i++) if (rand() < .3) L.rank = Math.min(3, L.rank + 1); }
    L.local = a >= 20 ? avgWage(region, 1986) * Math.exp(g(a < 55 ? 1.2 : 1.8, .8)) : 0;
    L.name = makeName(L);
    L.neighbors = makeNeighbors(L);
    for (const f of L.flags) L.ever.add(f);
    L.startMoney = money(L); L.startWage = avgWage(region, 1986);
    L.focus = L.job === 'kid' ? 'family' : STUDY_JOBS.has(L.job) ? 'study' : NO_WORK.has(L.job) ? 'balance' : 'work';
    return L;
  }
  function makeName(L) {
    const set = (L.region === 'RU' || L.flags.has('minority')) ? 'slav' : L.region;
    const N = D.names[set] || D.names.slav;
    const first = pick(N[L.sex]);
    let sur = pick(N.s);
    if (Array.isArray(sur)) sur = L.sex === 'm' ? sur[0] : sur[1];
    else if (L.sex === 'f' && /(ов|ев|ёв|ин|ын)$/.test(sur)) sur += 'а';
    return {first, last: sur};
  }
  function makeNeighbors(L) {
    const N = D.names[(L.region === 'RU' || L.flags.has('minority')) ? 'slav' : L.region] || D.names.slav;
    const used = new Set();
    return [0, 1, 2, 3].map(() => {
      let apt; do apt = ri(2, 60); while (used.has(apt)); used.add(apt);
      const sex = rand() < .5 ? 'm' : 'f', age = ri(5, 75);
      const pre = age >= 60 ? (sex === 'm' ? 'дед ' : 'баба ') : age >= 32 ? (sex === 'm' ? 'дядя ' : 'тётя ') : '';
      return {label: pre + pick(N[sex]) + ' из ' + apt + '-й', sex, age, st: 'ok', note: sex === 'm' ? 'живёт как жил' : 'живёт как жила', drink: false};
    });
  }
  const pensAge = L => L.sex === 'm' ? 60 : 55;
  function pickJob(L) {
    if (L.flags.has('village')) return wpick([['kolkhoz', 70], ['teacher', 10], ['shop', 10], ['worker', 10]]);
    if (L.edu === 'university') return wpick([['engineer', 40], ['teacher', 20], ['doctor', 12], ['scientist', 10], ['official', 8], ['journalist', 3], ['officer', 7]]);
    return wpick([['worker', 60], ['shop', 12], ['miner', ['RU', 'UA', 'KZ'].includes(L.region) ? 8 : 0], ['police', 5], ['teacher', 5], ['kolkhoz', 10]]);
  }
  function role(L) {
    const a = L.age;
    if (a < 7) return 'kid'; if (a < 17) return 'school';
    if (a >= pensAge(L) || L.job === 'pension') return 'pension';
    return a < 25 ? 'young' : 'adult';
  }
  function money(L) { return L.local / L.rate + L.usd; }
  function addMoney(L, v) { L.local += v * L.rate; }
  const curExp = L => L.sphere ? (L.exp[L.sphere] || 0) : 0;

  // ---------- условия и проверки ----------
  function cmp(v, c) { const op = (String(c).match(/^[<>=]+/) || ['='])[0]; const n = parseFloat(String(c).slice(op.length));
    return op === '>' ? v > n : op === '<' ? v < n : op === '>=' ? v >= n : op === '<=' ? v <= n : v === n; }
  function condOk(L, who, year) {
    if (!who) return true;
    if (who.age && (L.age < who.age[0] || L.age > who.age[1])) return false;
    if (who.years && (year < who.years[0] || year > who.years[1])) return false;
    if (who.sex && who.sex !== L.sex) return false;
    if (who.role && !who.role.includes(role(L))) return false;
    if (who.job && !who.job.includes(L.job)) return false;
    if (who.not_job && who.not_job.includes(L.job)) return false;
    if (who.edu && !who.edu.includes(L.edu)) return false;
    if (who.exp && !cmp(curExp(L), who.exp)) return false;
    if (who.money && !cmp(money(L) / avgWage(L.region, year), who.money)) return false;
    for (const st in (who.stats || {})) if (!cmp(L.s[st], who.stats[st])) return false;
    for (const t in (who.traits || {})) { if (t === 'talent' ? L.talent !== who.traits[t] : L.traits[t] !== who.traits[t]) return false; }
    if ((who.flags || []).some(f => !L.flags.has(f))) return false;
    if ((who.not_flags || []).some(f => L.flags.has(f))) return false;
    if (who.any_flags && !who.any_flags.some(f => L.flags.has(f))) return false;
    return true;
  }
  function eligible(L, e, year, month) {
    const w = e.when || {};
    if (w.from && (year < w.from || year > w.to)) return false;
    if (w.month && month && w.month !== month) return false;
    if (e.where && !e.where.includes(L.region)) return false;
    if (!e.repeat && L.fired[e.id]) return false;
    if (e.focus && ![].concat(e.focus).includes(L.focus)) return false;   // сцены фокуса: появляются, когда выбран этот фокус
    return condOk(L, e.who, year);
  }
  function score(L, mods, year) {
    let v = 0;
    for (const k in (mods || {})) {
      const x = mods[k];
      if (k === 'base' || k === 'note') continue;
      if (k === 'year') v += x[year] || 0;
      else if (k === 'region') v += x[L.region] || 0;
      else if (k === 'edu') v += x[L.edu] || 0;
      else if (k === 'exp') v += x * curExp(L);
      else if (k === 'fame' || k === 'law') v += x * L.s[k];
      else if (k in L.s) v += x * (L.s[k] - 50);
      else if (k in L.traits) v += {strong: x, mid: 0, weak: -x}[L.traits[k]];
      else if (L.flags.has(k)) v += x;
    }
    return v;
  }
  const STUDY_IDS = /^(KID-21|KID-27|STU-|MIL-09|SCI-02|CAR-03|REP-MD-02|REP-LV-04|EMI-07|ACT-STUDY)/;
  const HEALTH_IDS = /^(HAB-0[247]|HLT-13|HOB-0[23]|FIT-)/;
  function focusBonus(L, e) {
    if (!e) return 0;
    const id = e.id, sec = e.section;
    if (STUDY_IDS.test(id)) return (L.focus === 'study' ? 15 : 0) + .3 * (L.s.know - 50);
    if (HEALTH_IDS.test(id)) return L.focus === 'health' ? 15 : 0;
    if (L.focus === 'work' && ['2', '4', '10', '13', '19', '20'].includes(sec)) return 10;
    if (L.focus === 'family' && ['8', '9'].includes(sec)) return 10;
    if (L.focus === 'hobby' && ['17', '21'].includes(sec)) return 10;
    return 0;
  }
  function chanceOf(L, c, year, e) {
    const knowIn = c.check.know !== undefined;
    let b = focusBonus(L, e || L.pending);
    if (knowIn && STUDY_IDS.test((e || L.pending || {}).id || '')) b -= .3 * (L.s.know - 50);   // знания уже в формуле
    return Math.max(5, Math.min(90, (c.check.base ?? 50) + score(L, c.check, year) + b));
  }
  function expected(L, c, year, e) {
    const acc = {};
    const add = (o, w) => { for (const k in (o && o.effects) || {}) acc[k] = (acc[k] || 0) + o.effects[k] * w; };
    add(c, 1);
    if (c.check) { const p = chanceOf(L, c, year, e) / 100; add(c.success, p); add(c.fail, 1 - p); }
    if (c.outcomes) { const ws = c.outcomes.map(x => Math.max(.1, (x.w ?? 1) + score(L, x.mods, year))); const t = ws.reduce((a, b) => a + b, 0); c.outcomes.forEach((o, i) => add(o, ws[i] / t)); }
    return acc;
  }
  // сколько можно потратить: свои сбережения плюс до трёх зарплат в долг у родни
  function creditRoom(L) { return money(L) + 3 * avgWage(L.region, L.year); }
  function affordable(L, c) { const m = (c.effects || {}).money_m || 0; return m >= 0 || L.age < 17 || -m * avgWage(L.region, L.year) <= creditRoom(L); }
  function short(t) { t = String(t || '').split(/[.!?]/)[0].replace(/[«»]/g, '').trim(); return t.length > 40 ? t.slice(0, 38).trim() + '…' : t; }
  // подсказка к варианту: что будет сразу, чем может кончиться, как изменится доход
  function arrows(eff, n) {
    return Object.entries(eff || {}).filter(([k, v]) => k !== 'money_m' && D.stats.stats[k] && !k.startsWith('views') && Math.abs(v) >= .5)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, n).map(([k, v]) => D.stats.stats[k].name + (k === 'law' ? (v > 0 ? ' ▲ (плохо)' : ' ▼') : v > 0 ? ' ▲' : ' ▼')).join(', ');
  }
  function moneyWord(v, L) { const a = Math.abs(v) * avgWage(L.region, L.year); return (v > 0 ? 'получишь ' : 'заплатишь ') + fmtMoney(a, L.year); }
  function projectedIncome(L, job) {
    const soviet = L.year <= 1991, w = avgWage(L.region, L.year), sp = JOB_SPHERE[job];
    if (job === 'pension' || !JOB_PAY[job]) return null;
    let exp = sp ? (L.exp[sp] || 0) : 0;
    if (sp && L.sphere && sp !== L.sphere && D.stats.spheres[L.sphere].related.includes(sp)) exp = Math.max(exp, (L.exp[L.sphere] || 0) * .5);
    const sen = !sp || NO_SENIORITY.has(sp) ? 0 : Math.min(.4, .03 * exp);
    const rank = sp && sp === L.sphere ? L.rank : 0;
    return w * JOB_PAY[job][soviet ? 0 : 1] * (1 + sen) * (1 + .15 * rank) * .8;
  }
  function hint(L, c, year, e) {
    const parts = [];
    let now = (c.effects || {}).money_m || 0;
    if (c.pay_debt && L.loan > 0) now = Math.min(now, -L.loan / avgWage(L.region, L.year));   // весь остаток займа с процентами
    if (now) parts.push(moneyWord(now, L) + ' сразу' + (now < 0 && -now * avgWage(L.region, L.year) > money(L) && L.age >= 17 ? ' (часть в долг)' : ''));
    const a0 = arrows(c.effects, 2); if (a0) parts.push(a0);
    if (c.check) {
      const p = chanceOf(L, c, year, e);
      const word = p >= 70 ? 'почти наверняка' : p >= 50 ? 'скорее всего' : p >= 30 ? 'как повезёт' : p >= 15 ? 'вряд ли' : 'почти без шансов';
      const sa = arrows(c.success.effects, 1), fa = arrows(c.fail.effects, 1);
      parts.push('«' + short(c.success.text) + '» — ' + word + (sa ? ' (' + sa + ')' : '') + (fa ? '; иначе ' + fa : ''));
    } else if (c.outcomes) {
      const ws = c.outcomes.map(x => Math.max(.1, (x.w ?? 1) + score(L, x.mods, year))); const t = ws.reduce((a, b) => a + b, 0);
      if (c.outcomes.some(o => o.end === 'death')) parts.push('опасно для жизни');
      let m = 0; c.outcomes.forEach((o, i) => { m += ((o.effects || {}).money_m || 0) * ws[i] / t; });
      if (Math.abs(m) >= .1) parts.push('в итоге в среднем ' + (m > 0 ? '+' : '−') + fmtMoney(Math.abs(m) * avgWage(L.region, L.year), L.year));
      const ex = {}; c.outcomes.forEach((o, i) => { for (const k in (o.effects || {})) ex[k] = (ex[k] || 0) + o.effects[k] * ws[i] / t; });
      const a1 = arrows(ex, 1); if (a1) parts.push('чаще: ' + a1);
    }
    if (c.check && [c.success, c.fail].some(o => o.end === 'death')) parts.push('опасно для жизни');
    const job = c.job || (c.success && c.success.job) || (c.outcomes && c.outcomes.length === 1 && c.outcomes[0].job);
    if (job && L.age >= 16) {
      const nw = projectedIncome(L, job), cur = L.lastIncome && L.breakdown && L.breakdown.inc ? (L.breakdown.inc['Зарплата'] || 0) : 0;
      if (nw !== null) parts.push('доход ' + fmtMoney(cur, L.year) + ' → ' + fmtMoney(nw, L.year) + ' в месяц' + (JOB_SPHERE[job] && JOB_SPHERE[job] !== L.sphere && L.sphere ? ', опыт с нуля' : ''));
    }
    return parts.join(' · ');
  }
  function fmtMoney(v, year) { const u = year <= 1991 ? ' ₽' : ' у.е.'; return Math.round(v).toLocaleString('ru-RU') + u; }

  // ---------- применение исходов ----------
  function apply(L, o, src, out) {
    if (!o) return;
    const year = L.year, w = avgWage(L.region, year);
    for (const k in (o.effects || {})) {
      let v = o.effects[k];
      if (k === 'money_m') {
        const before = money(L); addMoney(L, v * w);
        if (v < 0 && money(L) < 0 && out) out.push({t: before > 0 ? 'Своих денег не хватило: ' + fmtMoney(-money(L), year) + ' занял' + gEnd(L) + ' у родни и знакомых.' : 'Ещё ' + fmtMoney(-v * w, year) + ' в долг у родни.', cls: 'bad'});
        continue;
      }
      if (SOFT.has(k) && v > 0 && L.s[k] > 70) v /= 2;
      L.s[k] = clamp(k, L.s[k] + v);
    }
    const debts = ['debt_bank', 'debt_private', 'debt_bandits'];
    const newDebt = (o.sets || []).filter(f => debts.includes(f) && !L.flags.has(f));
    for (const f of (o.sets || [])) { L.flags.add(f); L.ever.add(f); }
    if (newDebt.length) L.loan += Math.max((o.effects || {}).money_m || 0, 2) * w;
    for (const f of (o.clears || [])) L.flags.delete(f);
    if ((o.clears || []).some(f => debts.includes(f)) && !debts.some(f => L.flags.has(f))) {
      // «Платить всё»: кроме суммы из эффектов списывается настоящий остаток займа с набежавшими процентами
      if (o.pay_debt) { const rest = L.loan - Math.max(0, -((o.effects || {}).money_m || 0)) * w; if (rest > 0) addMoney(L, -rest); }
      L.loan = 0;
    }
    if (o.job) setJob(L, o.job, o.edu, out);
    else if (o.edu) L.edu = o.edu;
    if (o.promote) { L.rank = Math.min(3, L.rank + 1); out.push({t: 'Повышение: теперь ты ' + RANKS[L.rank] + '.', cls: 'good'}); remember(L, 'Повышение: теперь ты ' + RANKS[L.rank] + '.', 6); }
    if (o.item) {
      const it = o.item;
      if (it.remove_group) for (const i of [...L.items]) if (ITEMS[i].group === it.remove_group) L.items.delete(i);
      if (it.remove) L.items.delete(it.remove);
      if (it.add) { if (ITEMS[it.add].group === 'housing') for (const i of [...L.items]) if (ITEMS[i].group === 'housing') L.items.delete(i); L.items.add(it.add); }
    }
    if (o.asset) addAsset(L, o.asset, src);
    if (o.move && o.move !== L.region) moveTo(L, o.move, out);
    if (o.end && !L.end) L.end = {type: o.end, year, month: L.month, age: L.age, cause: src};
  }
  function setJob(L, job, edu, out) {
    L.job = job;
    if (edu) L.edu = edu;
    if (job === 'student') L.studyEnd = L.year + (edu === 'university' || L.edu === 'university' ? 5 : 3);
    if (job === 'cadet') L.studyEnd = L.year + 4;
    if (job === 'army') { L.armyMonths = 0; L.lastIncome = 0; L.lastExp = 0; }
  }
  function addAsset(L, a, src) {
    const w = avgWage(L.region, L.year);
    if ('scale' in a) { for (const x of L.assets) if (x.kind === a.kind) x.value *= a.scale; if (a.scale === 0) L.assets = L.assets.filter(x => x.kind !== a.kind); }
    else L.assets.push({kind: a.kind, sector: a.sector || 'local', value: (a.value || 1) * w, from: src});
  }
  function moveTo(L, r, out) {
    const from = D.regions[L.region].new;
    L.region = r; L.moved = true; L.flags.delete('minority'); L.flags.delete('village'); L.flags.delete('capital');
    L.city = pick(D.regions[r].cities); L.place = null;
    L.rate = rateAt(r, L.year, L.month || 1);
    out.push({t: 'Переезд. Теперь ты живёшь в городе ' + cityName(L) + '. Для местных ты приезжий из страны «' + from + '».', cls: 'big'});
  }
  function cityName(L, year) { year = year || L.year; if (!L.city) return L.place; return L.city[1] && year >= L.city[2] ? L.city[1] : L.city[0]; }
  function regionName(r, year, month) { return (year > 1991 || (year === 1991 && month === 12)) ? D.regions[r].new : D.regions[r].old; }

  // ---------- месяц ----------
  function qYear(L) {
    const tab = D.qx[L.region + '|' + L.year + '|' + L.sex];
    let row = tab.find(x => x[0] <= L.age && L.age < x[1]) || tab[tab.length - 1];
    const span = row[1] - row[0];
    let q = span > 0 && span < 50 ? 1 - Math.pow(1 - row[2], 1 / span) : Math.min(row[2], .6);
    let m = Math.max(.5, Math.min(3, 1 + (healthNorm(L.age) - L.s.health) / 100 * 1.5));
    if (L.s.health <= 5) m *= 3;
    if (L.flags.has('drinker')) m *= 1.6; if (L.flags.has('addicted')) m *= 3; if (L.flags.has('brigade')) m *= 2.5;
    if (L.flags.has('smoker') && L.age >= 40) m *= 1.3;
    const norm = D.norm[L.sex + '|' + Math.min(Math.floor(L.age / 10), 9)] || 1;
    return Math.min(q * m / norm, .6);
  }
  function payMult(L) {
    if (!L.sphere || JOB_SPHERE[L.job] !== L.sphere) return 1;
    const sen = NO_SENIORITY.has(L.sphere) ? 0 : Math.min(.4, .03 * (L.exp[L.sphere] || 0));
    return (1 + sen) * (1 + .15 * L.rank) * .8;
  }
  function career(L, out) {
    const sp = JOB_SPHERE[L.job];
    if (sp && sp !== L.sphere) {
      if (L.sphere) { L.switches++; if (D.stats.spheres[L.sphere].related.includes(sp)) L.exp[sp] = Math.max(L.exp[sp] || 0, (L.exp[L.sphere] || 0) * .5); }
      L.sphere = sp; L.rank = 0;
    }
    if (sp) L.exp[sp] = (L.exp[sp] || 0) + 1 / 12;
    if ((sp || L.job === 'army' || L.job === 'student') && !(L.year >= 1992 && SHADOW.has(L.job) && !L.flags.has('official_record'))) L.stazh += 1 / 12;
    if (L.month === 12 && sp && !NO_SENIORITY.has(sp) && L.rank < 3) {
      const ch = (.02 + .006 * L.exp[sp] + (L.focus === 'work' ? .05 : ['hobby', 'family'].includes(L.focus) ? -.01 : 0) + .002 * (L.s.know - 50) + .002 * (L.s.ties - 50)) / (1 + 1.5 * L.rank);
      if (rand() < Math.min(.12, Math.max(.005, ch))) { L.rank++; out.push({t: 'Повышение: теперь ты ' + RANKS[L.rank] + '.', cls: 'good'}); }
    }
  }
  function budget(L, out) {
    const f = L.flags, y = L.year, m = L.month, soviet = y <= 1991;
    const before = money(L);
    L.rate = rateAt(L.region, y, m);
    if (L.age >= 17 && before > 0) {
      const lost = 1 - money(L) / before;
      if (y === 1992 && m === 1) {
        L.jan92 = lost;
        out.push({t: 'Цены отпустили. Твои ' + fmtMoney(before, 1991) + ' на книжке теперь стоят ' + fmtMoney(money(L), 1992) + ': сгорело ' + Math.round(lost * 100) + '%', cls: 'bad'});
      } else if ((m === 1 && lost > .05) || lost > .25) {
        out.push({t: 'Инфляция съела ' + Math.round(lost * 100) + '% твоих рублёвых сбережений: минус ' + fmtMoney(before - money(L), y), cls: 'bad'});
      }
    }
    if (m === 1 && L.keep === 'usd' && L.local > 0) { L.usd += L.local / (blackAt(L.region, y, m) || L.rate); L.local = 0; }
    if (m === 12) revalue(L);
    if (L.age < 17 || NO_BUDGET.has(L.job)) { L.lastIncome = 0; L.lastExp = 0; return; }   // в армии и в детстве своих трат нет
    const w = avgWage(L.region, y);
    let income; const inc = {};
    if (L.job === 'pension') income = w * econ(L.region, y)[3] * Math.min(1.2, .63 + .01 * L.stazh);
    else {
      income = w * (JOB_PAY[L.job] || [1, 1])[soviet ? 0 : 1] * payMult(L) * ({work: 1.1, study: .9, health: .95, family: .95}[L.focus] || 1);
      if ((y > 1992 || (y === 1992 && m >= 4))) { const t = y * 12 + m - 4; income *= rateAt(L.region, Math.floor(t / 12), t % 12 + 1) / L.rate; }
      if (y >= 1993 && y <= 1998 && STATE_JOBS.has(L.job) && rand() < .3) { income = 0; if (rand() < .3) out.push({t: 'Зарплату опять задержали.', cls: 'dim'}); }
    }
    inc[L.job === 'pension' ? 'Пенсия' : 'Зарплата'] = income;
    if (f.has('married')) { const p = w * (soviet || rand() > .2 ? .8 : 0); income += p; inc['Зарплата партнёра'] = p; }
    if (!soviet) { const sd = w * (L.job === 'pension' ? .1 : .25); income += sd; inc['Огород, подработки'] = sd; }
    const persons = 1 + (f.has('married') ? 1 : 0) + (f.has('has_kids') ? 1.5 : 0);
    const sp = L.spend;
    let food = (soviet ? .45 : .55) * w * (.6 + .4 * persons) * sp.food * (L.diet ? 1.15 : 1);
    if (L.items.has('dacha')) food *= .85;
    const home = (soviet ? .08 : .12) * w;
    const kids = f.has('has_kids') ? .15 * w * sp.family : 0;
    const other = (soviet ? .30 : .25) * w * sp.leisure;
    const habits = w * ((f.has('smoker') ? .03 : 0) + (f.has('drinker') ? .08 : 0));
    let upkeep = 0; for (const i of L.items) upkeep += (ITEMS[i].upkeep || 0) * w;
    let exp = food + home + kids + other + habits + upkeep;
    if (L.job === 'pension' && !f.has('married')) exp *= .4; else if (L.job === 'student') exp *= .3;
    if (money(L) < -3 * w) exp = Math.min(exp, income);
    L.lastIncome = income; L.lastExp = exp;
    L.breakdown = {food, home, kids, leisure: other, habits, upkeep, inc};
    addMoney(L, income - exp);
    if (m === 1 && money(L) < -3 * w) L.s.close -= 2;
    // займы
    if (L.loan > 0) {
      L.ever.add('debt_any');
      const rate = f.has('debt_bandits') ? .15 : f.has('debt_private') ? .10 : .03;
      const due = L.loan * (1 + rate);
      const pay = Math.min(due, Math.max(0, .15 * income), Math.max(0, money(L) + 3 * w));
      L.loan = due - pay; addMoney(L, -pay);
      if (f.has('debt_private') && L.loan > 5 * w && rand() < .2) { f.delete('debt_private'); f.add('debt_bandits'); L.ever.add('debt_bandits'); out.push({t: 'Ростовщик передал твой долг «серьёзным людям».', cls: 'bad'}); }
      if ((f.has('debt_bandits') && L.loan > 6 * w) || (f.has('debt_bank') && L.loan > 10 * w)) {
        if (f.has('debt_bandits')) { L.s.close -= 10; L.s.health -= 5; }
        for (const i of [...L.items]) if (['car', 'country'].includes(ITEMS[i].group)) L.items.delete(i);
        if (L.loan > 15 * w && [...L.items].some(i => OWN_HOUSING.has(i))) { for (const i of [...L.items]) if (ITEMS[i].group === 'housing') L.items.delete(i); L.items.add('kommunalka'); }
        L.loan = w; f.add('defaulter'); out.push({t: 'За долги забрали имущество.', cls: 'bad'});
      }
      if (L.loan <= .01 * w) { L.loan = 0; for (const d of ['debt_bank', 'debt_private', 'debt_bandits']) f.delete(d); out.push({t: 'Долг закрыт.', cls: 'good'}); }
    }
    // влияние трат на шкалы (помесячно)
    const d = {close: 0, ties: 0, rel: 0, health: 0, fit: 0};
    const lv = x => x < 1 ? -1 : x > 1 ? 1 : 0;
    // «экономно» — без поддержки (шкалы и так убывают со временем), «обычно» — держит, «щедро» — растит (CONCEPT §3.10a)
    d.health += [0, 0, 1][lv(sp.food) + 1] + (L.diet ? 2 : 0);
    d.close += [0, 1, 2 + (f.has('has_kids') ? 2 : 0)][lv(sp.family) + 1];
    d.rel += f.has('partner') ? [0, 4, 8][lv(sp.family) + 1] : 0;
    d.ties += [0, 1, 4][lv(sp.leisure) + 1]; d.close += [0, 0, 1][lv(sp.leisure) + 1];
    if (money(L) < -3 * w) { d.health -= 2; d.fit -= 1; }
    for (const k in d) { let v = d[k]; if (v > 0 && L.s[k] > 70) v /= 2; L.s[k] += v / 12; }
  }
  function revalue(L) {
    const S = D.sectors;
    for (const a of L.assets) {
      a.value *= a.kind === 'property' ? (S.property_yearly[L.year] || 1) : ((S.yearly[a.sector] || {})[L.year] || 1);
      L.usd += a.value * S.dividend[a.kind] * (L.flags.has('enterprise_owner') && a.kind !== 'shares' ? 1.5 : 1);
    }
  }
  function monthTick(L, out) {
    const s = L.s, f = L.flags, a0 = L.age;
    if (L.month === L.birthMonth) L.age++;
    const a = L.age;
    s.health -= ((30 <= a && a < 50 ? .3 : 50 <= a && a < 70 ? .6 : a >= 70 ? 1 : 0) + (f.has('smoker') && a >= 30 ? 1 : 0) + (f.has('drinker') ? 2 : 0)) / 12;
    let df = (a >= 30 ? 1 : 0) + (a >= 45 ? 1 : 0) + (a >= 60 ? 1 : 0);
    df += (TRAINING.has(L.job) || L.focus === 'health' || a < 18) ? 0 : 2 * (L.focus === 'balance' ? .5 : 1);
    s.fit += (a < 18 ? 3 / 12 : 0) - df / 12;
    s.know += ['school', 'student', 'cadet'].includes(L.job) ? 4 / 12 : KNOW_JOBS.has(L.job) ? 0 : -(a < 50 ? 1 : 2) / 12;
    const half = L.focus === 'balance' ? .5 : 1;
    s.close -= L.focus === 'family' ? 0 : half / 12;
    const social = L.focus === 'work' && ['shop', 'kiosk', 'firm', 'coop', 'shuttle', 'official', 'politician', 'brigade', 'banker'].includes(L.job);
    s.ties -= social ? 0 : half * (['unemployed', 'pension'].includes(L.job) ? 3 : 1) / 12;
    if (f.has('partner') && L.focus !== 'family') s.rel -= half * 4 / 12;
    s.law -= f.has('brigade') || f.has('shadow_trade') ? 0 : 1 / 12;
    for (const it of L.items) for (const k in (ITEMS[it].own || {})) { let v = ITEMS[it].own[k]; if (v > 0 && s[k] > 70) v /= 2; s[k] += v / 12; }
    // переходы, которые ведёт движок
    if (a >= 7 && L.job === 'kid' && L.month === 9) { L.job = 'school'; out.push({t: '1 сентября. Гладиолусы, ранец, первый класс.'}); }
    if (L.job === 'school' && a >= 18) { setJob(L, rand() < .4 ? 'student' : 'worker', 'technikum'); out.push({t: L.job === 'student' ? 'Поступил' + gEnd(L) + ' в техникум.' : 'Пошёл' + gEnd(L, 'ла') + ' работать.'}); }
    if (['student', 'cadet'].includes(L.job) && L.year >= L.studyEnd && L.month === 7) {
      if (L.job === 'cadet') { L.job = 'officer'; out.push({t: 'Выпуск из училища. Лейтенантские погоны, распределение.', cls: 'big'}); }
      else { L.job = pickJob(L); out.push({t: (L.year <= 1991 ? 'Диплом. Распределение: ' : 'Диплом. Работу нашёл' + gEnd(L, 'ла') + ' сам' + (L.sex === 'f' ? 'а' : '') + ': ') + JOB_NAMES[L.job] + '.', cls: 'big'}); }
    }
    if (L.job === 'army') { L.armyMonths++; if (L.armyMonths >= 24) { f.add('served'); L.ever.add('served'); L.job = 'unemployed'; out.push({t: 'Дембель. Альбом, аксельбанты, поезд домой.', cls: 'big'}); } }
    if (a >= pensAge(L) && !['pension', 'politician', 'banker', 'brigade'].includes(L.job) && L.month === L.birthMonth && a0 < a) { L.job = 'pension'; out.push({t: 'Проводили на пенсию. Подарили часы.', cls: 'big'}); }
    if (L.job === 'unemployed' && rand() < (L.focus === 'work' ? .08 : .04)) { L.job = L.edu !== 'school' ? pickJob(L) : wpick([['worker', 60], ['shop', 40]]); out.push({t: 'Нашёл' + gEnd(L, 'ла') + ' работу: ' + JOB_NAMES[L.job] + '.'}); }
    if (f.has('evening_study')) {
      L.eveningStart = L.eveningStart || L.year;
      if (L.month === 6 && L.year - L.eveningStart >= (L.edu === 'school' || L.edu === 'ptu' ? 3 : 5)) {
        L.edu = L.edu === 'school' || L.edu === 'ptu' ? 'technikum' : 'university'; f.delete('evening_study'); L.eveningStart = 0;
        s.know += 5; out.push({t: gender(L, 'Получил диплом вечернего отделения. Теперь у тебя ' + (L.edu === 'university' ? 'высшее образование.' : 'среднее специальное.')), cls: 'good'});
      }
    }
    fixFocus(L, out);
    career(L, out);
    budget(L, out);
    if (L.age >= 7) { s.happy += (happyBase(L) - s.happy) * .08; s.health += (s.happy - 50) * .002; L.happySum = (L.happySum || 0) + s.happy; L.happyN = (L.happyN || 0) + 1; }
    for (const k in s) s[k] = clamp(k, s[k]);
    if (rand() < 1 - Math.pow(1 - qYear(L), 1 / 12)) L.end = {type: 'death', year: L.year, month: L.month, age: L.age, cause: causeOf(L)};
  }
  function gEnd(L, f) { return L.sex === 'm' ? '' : (f || 'а'); }
  function causeOf(L) {
    const a = L.age;
    if (a < 1) return 'инфекция в первый год жизни';
    if (a < 15) return pick(['несчастный случай', 'тяжёлая болезнь']);
    if (a < 50) return L.sex === 'm' ? wpick([['ДТП', 3], ['нападение на улице', 2], ['отравление алкоголем', L.flags.has('drinker') ? 4 : 1], ['несчастный случай на работе', 2], ['сердце', 2]])
      : wpick([['ДТП', 2], ['тяжёлая болезнь', 3], ['рак', 2], ['сердце', 1]]);
    return wpick([['инфаркт', 4], ['инсульт', 3], ['рак', 3], ['пневмония', 1]]);
  }

  // ---------- год ----------
  function focusWeight(L, e, risky) {
    if (risky && (e.section === '4' || e.section === '5')) return 2.5;
    if (L.focus === 'hobby' && (e.section === '17' || e.section === '21')) return 3;
    if (L.focus === 'family' && e.id === 'REL-01') return 2;
    if (L.focus === 'work' && e.type === 'offer') return 1.5;
    return 1;
  }
  function startYear(L) {
    L.yearLog = [];
    const a = L.age, b = BUDGET.find(x => a <= x[0]);
    const risky = L.focus === 'work' && ['shop', 'kiosk', 'firm', 'coop', 'shuttle', 'brigade', 'banker', 'broker'].includes(L.job);
    const active = ACTIVE.filter(x => L.flags.has(x)).length;
    const bonus = Math.min(3, active) + (risky ? 1 : 0) + Math.min(2, (L.flags.has('partner') ? 1 : 0) + (L.flags.has('has_kids') ? 1 : 0));
    let nLines = Math.min(14, ri(b[1], b[2]) + bonus), nChoice = Math.min(6, ri(b[3], b[4]) + (active ? 1 : 0));
    const chron = FIXED.filter(e => e.choices && eligible(L, e, L.year, e.when.month)).length;
    nChoice = Math.max(0, nChoice - chron); nLines = Math.max(nChoice, nLines - chron);
    L.plan = {};
    // события разносятся по месяцам: сначала в пустые, решения — не в один месяц с хроникой и друг с другом
    const load = {}; for (let m = 1; m <= 12; m++) load[m] = 0;
    for (const e of FIXED) if (e.choices && eligible(L, e, L.year, e.when.month)) load[e.when.month] += 2;
    const put = (e, w) => {
      let m = e.when && e.when.month;
      if (!m) { const min = Math.min(...Object.values(load)); const free = Object.keys(load).filter(k => load[k] === min); m = +free[ri(0, free.length - 1)]; }
      load[m] += w; (L.plan[m] = L.plan[m] || []).push(e);
    };
    const pc = RANDOM.filter(e => (e.type === 'choice' || e.type === 'offer') && eligible(L, e, L.year, 0));
    const ps = RANDOM.filter(e => e.type === 'scene' && eligible(L, e, L.year, 0));
    for (const [pool, n, w] of [[pc, nChoice, 2], [ps, nLines - nChoice, 1]]) {
      for (let i = 0; i < n && pool.length; i++) {
        const e = wpick(pool.map(x => [x, (x.weight ?? 1) * focusWeight(L, x, risky)]));
        pool.splice(pool.indexOf(e), 1);
        put(e, w);
      }
    }
    // «шансы»: редкие опасности и бытовые сцены идут как выпали; сцен фокуса — не больше двух за год
    const fired = CHANCE.filter(e => rand() < e.chance && (!e.focus || eligible(L, e, L.year, 0)));
    const fs = fired.filter(e => e.focus);
    for (const e of fired.filter(e => !e.focus)) put(e, e.choices ? 2 : 1);
    for (let i = 0; i < 2 && fs.length; i++) put(fs.splice(ri(0, fs.length - 1), 1)[0], 1);
  }
  function yearEnd(L) {
    const fx = {work: {close: -2, rel: -3, health: -1, know: KNOW_JOBS.has(L.job) ? 1 : 0}, study: {know: 6, happy: -3}, health: {health: 3, fit: 4},
      hobby: {ties: 2, happy: 3, know: ['tech', 'lang'].includes(L.talent) ? 2 : 0, fit: L.talent === 'sport' ? 3 : 0, fame: L.talent === 'music' && L.flags.has('talent_found') ? 2 : 0},
      family: {close: 4, rel: L.flags.has('partner') ? 6 : 0}, balance: {}}[L.focus];
    apply(L, {effects: fx}, 'focus', []);
    const nb = updateNeighbors(L);
    // кривая дожития ровесников (по таблице ООН)
    const tab = D.qx[L.region + '|' + L.year + '|' + L.sex];
    const row = tab.find(x => x[0] <= L.age && L.age < x[1]) || tab[tab.length - 1];
    const span = row[1] - row[0];
    L.survivors *= 1 - (span > 0 && span < 50 ? 1 - Math.pow(1 - row[2], 1 / span) : Math.min(row[2], .6));
    const top = L.yearLog.slice().sort((a, b) => b.w - a.w).slice(0, 4).sort((a, b) => a.n - b.n).map(x => x.t);
    return {year: L.year, news: newsFor(L), prices: pricesFor(L), log: top, neighbors: nb};
  }
  function newsFor(L) {
    const y = L.year, u = D.news.union[y] || [], rr = (D.news.republics[L.region] || {})[y];
    const res = [];
    if (L.region === 'RU' || y <= 1991) { res.push({from: y <= 1991 ? 'Из Москвы' : 'Москва', text: u[0]}); if (rr) res.push({from: regionName(L.region, y, 12), text: rr}); else if (u[1]) res.push({from: '', text: u[1]}); }
    else { res.push({from: regionName(L.region, y, 12), text: rr || autoNews(L)}); res.push({from: 'Из Москвы', text: u[0]}); }
    return res;
  }
  function autoNews(L) {
    const [infl, wr, wu] = econ(L.region, L.year);
    if (infl > 100) return 'Цены за год выросли в ' + (1 + infl / 100).toFixed(1).replace('.', ',') + ' раза';
    if (infl > 20) return 'Цены за год выросли на ' + Math.round(infl) + '%';
    return L.year <= 1991 ? 'Средняя зарплата — ' + Math.round(wr) + ' ₽' : 'Средняя зарплата — около ' + Math.round(wu) + ' у.е.';
  }
  function pricesFor(L) {
    const y = L.year, w = avgWage(L.region, y);
    return [['Средняя зарплата', fmtMoney(w, y)], ['Доллар', y <= 1991 ? Math.round(blackAt(L.region, y, 12)) + ' ₽ у фарцовщиков' : '≈ ' + Math.round(rateAt(L.region, y, 12)).toLocaleString('ru-RU') + ' руб. экв.'],
      ['Твои сбережения', fmtMoney(money(L), y)]];
  }
  function updateNeighbors(L) {
    const out = [], y = L.year;
    for (const n of L.neighbors) {
      if (n.st !== 'ok') continue;
      n.age++;
      const a = n.age, fe = n.sex === 'f', ga = fe ? 'а' : '';
      const tab = D.qx[L.region + '|' + y + '|' + n.sex];
      const row = tab.find(x => x[0] <= a && a < x[1]) || tab[tab.length - 1];
      const span = row[1] - row[0];
      const q = (span > 0 && span < 50 ? 1 - Math.pow(1 - row[2], 1 / span) : row[2]) * (n.drink ? 1.6 : 1);
      if (rand() < q) { n.st = 'dead'; n.note = 'умер' + (fe ? 'ла' : '') + ' в ' + y; out.push(n.label + ' умер' + (fe ? 'ла' : '') + '.'); continue; }
      const opts = [];
      if (y >= 1989 && y <= 1995 && a > 18) opts.push([() => { n.st = 'left'; n.note = 'уехал' + ga + ' в Израиль'; }, .02]);
      if (L.region !== 'RU' && y >= 1992 && y <= 1998) opts.push([() => { n.st = 'left'; n.note = 'уехал' + ga + ' в Россию'; }, L.region === 'TJ' && y <= 1993 ? .12 : .03]);
      if (y >= 1992 && y <= 1997 && a >= 20 && a < 55) opts.push([() => { n.note = 'открыл' + ga + ' ларёк'; }, .05]);
      if (y >= 1994 && a >= 22 && a < 55) opts.push([() => { n.note = 'купил' + ga + ' иномарку'; }, .03]);
      if (y >= 1992 && !fe && a >= 17 && a < 35) opts.push([() => { n.note = 'сидит'; }, .02]);
      if (y >= 1990 && !fe && a >= 25 && !n.drink) opts.push([() => { n.drink = true; n.note = 'запил'; }, .03]);
      if (a >= 19 && a <= 35) opts.push([() => { n.note = fe ? 'вышла замуж' : 'женился'; }, .07]);
      for (const [fn, p] of opts) if (rand() < p) { fn(); out.push(n.label + ': ' + n.note + '.'); break; }
    }
    return out;
  }

  // ---------- тексты: варианты, возраст, род ----------
  const FEM = new Set('отказался отстоял отмечался зачитывался пролежал сгорел дал сходил вложил отказал вложился записался отслужил устроился развёлся женился болел бросил вернулся видел вступил выиграл выкупил выстоял вышел достал закашлялся заработал затерялся остался остановился отбился отсудил переехал пересидел попал попробовал поступил потратил пошёл проиграл проскочил простоял простудился распродал сдал сменил сорвался ушёл был держал дождался дошёл заболел забрал заплатил купил лечился начал нашёл окончил оставил перешёл подал получил понял потерял пришёл продал прожил прошёл разобрал разругался решил сбежал собрал стал съездил уехал узнал укрыл упал успел устал выжил отдал провожал попросил боялся занял восстанавливался заговорил зачитался мечтал молчал отравился очнулся поднимался подобрал подписал поскользнулся починил промолчал простил разгружал занимал выпил'.split(' '));
  const OTHER_SUBJ = /(^|\s)(Он|Она|Партн|Сын|Дочь|Дима|Сосед|Друг|Должник|Ростовщик|Директор|Ребён|Брат|Сестр|Начальник|Знакомый|Конкурент|Отец|Мать|Банк|Фонд|Завод|Ларёк|Рынок|Тётя|Племянник|Будильник|Телевизор|Магнитофон|Код|Ваучер|Пирамида|Касса|Кооператив|Суд|Урожай|Покупатель|Пациент|Тренер|Хозяин|Бригадир|Продюсер|Старший|Погром|Выходной|Конверт|Закон|Материал|Никто|ларёк|осадок)/;
  const FEM_IRR = {'перенёс': 'перенесла', 'Перенёс': 'Перенесла', 'смог': 'смогла', 'Смог': 'Смогла'};
  function fem(w) { if (FEM_IRR[w]) return FEM_IRR[w]; const lw = w.toLowerCase(); if (!FEM.has(lw)) return w;
    const r = lw.endsWith('лся') ? w.slice(0, -3) + 'лась' : lw.endsWith('ёл') ? w.slice(0, -2) + 'ла' : w + 'а';
    return r; }
  function gender(L, t, other) {
    if (L.sex !== 'f' || other || !t) return t;
    return t.split(/(?<=[.!?])\s+/).map(sn => OTHER_SUBJ.test(sn) ? sn : sn.replace(/[А-ЯЁа-яё]+/g, fem)).join(' ');
  }
  function textOf(L, e) {
    const byAge = e.texts_by_age && e.texts_by_age[role(L)];
    let t = byAge;
    if (!t && e.variants) { const vs = e.variants.map(v => typeof v === 'string' ? {t: v} : v).filter(v => (!v.from || L.year >= v.from) && (!v.to || L.year <= v.to)); t = vs.length ? pick(vs).t : e.text; }
    t = t || e.text;
    return gender(L, t, e.third_person);
  }
  // ---------- шаг игры: месяц или продолжение после выбора ----------
  function step(L) {
    // возвращает {lines, choice, pause, yearEnd, over}
    const res = {lines: [], choice: null, pause: null, yearEnd: null, over: false};
    if (L.end) { res.over = true; return res; }
    if (!L.queue.length) {
      if (L.month === 12) { res.yearEnd = yearEnd(L); return res; }
      L.month++;
      if (L.month === 1 && L.yearStarted !== L.year) { L.yearStarted = L.year; startYear(L); }
      monthTick(L, res.lines);
      if (L.end) { res.over = true; res.lines.push({t: deathLine(L), cls: 'dead'}); return res; }
      L.queue = FIXED.filter(e => e.when.month === L.month).concat(L.plan[L.month] || []);
      const pk = L.year + '-' + L.month;
      if (PAUSES[pk] && L.age >= 12) res.pause = {key: pk, text: PAUSES[pk]};
      queueItems(L, res.lines);
    }
    while (L.queue.length) {
      const e = L.queue.shift();
      const month = e.when && e.when.month ? L.month : 0;
      if (!eligible(L, e, L.year, month)) continue;
      if (e.type === 'news') continue;
      L.fired[e.id] = (L.fired[e.id] || 0) + 1;
      const text = textOf(L, e);
      apply(L, e, e.id, res.lines);
      let chs = (e.choices || []).map((c, i) => [c, i]).filter(([c]) => condOk(L, c.who, L.year));
      const aff = chs.filter(([c]) => affordable(L, c));
      if (aff.length) chs = aff;
      if (chs.length && role(L) !== 'kid') {
        res.choice = {id: e.id, text, options: chs.map(([c, i]) => ({i, text: c.text, hint: hint(L, c, L.year, e)}))};
        L.pending = e; L.pendingText = text;
        return res;
      }
      if (chs.length) { const [c] = pick(chs); const out = []; applyChoice(L, e, c, out); res.lines.push({t: text}, ...out); }
      else { res.lines.push({t: text, cls: e.fixed ? 'big' : ''}); if (!e.fixed && e.section !== '6') remember(L, text, weightOf(e.effects) + 1); }
      if (L.end) { res.over = true; res.lines.push({t: deathLine(L), cls: 'dead'}); return res; }
    }
    return res;
  }
  // итог года: не все тексты подряд, а 2–4 главных момента — чем кончились выборы и что случилось важного
  function weightOf(eff) { let w = 0; for (const k in (eff || {})) if (k !== 'views_reform' && k !== 'views_union') w += Math.abs(eff[k]) * (k === 'money_m' ? 3 : 1); return w; }
  function remember(L, t, w) { if (t) L.yearLog.push({t: String(t).replace(/\s+$/, ''), w, n: L.yearLog.length}); }
  function choiceMemo(L, prompt, c, o) {
    if (c.memo) return gender(L, c.memo, false);
    if (o && o.text) return gender(L, o.text, false);
    return '';                                     // простой выбор без последствий в итог года не попадает
  }
  function applyChoice(L, e, c, out) {
    apply(L, c, e.id, out);
    if (L.end) return;
    let o = null;
    if (c.check) { o = rand() * 100 < chanceOf(L, c, L.year, e) ? c.success : c.fail; }
    else if (c.outcomes) o = wpick(c.outcomes.map(x => [x, Math.max(.1, (x.w ?? 1) + score(L, x.mods, L.year))]));
    remember(L, choiceMemo(L, L.pendingText || textOf(L, e), c, o), weightOf(c.effects) + weightOf(o && o.effects) + 2);
    if (o) {
      const hard = o.end === 'death' || ((o.effects || {}).health || 0) <= -10;
      if (o.text) out.push({t: L.soft && hard ? 'Случилась беда.' : gender(L, o.text, e.third_person), cls: hard ? 'bad res' : 'res'});
      apply(L, o, e.id, out);
    }
  }
  const SHOWN = ['happy', 'health', 'fit', 'know', 'close', 'ties', 'rel', 'law', 'fame'];
  function snap(L) { const o = {m: money(L)}; for (const k of SHOWN) o[k] = L.s[k]; return o; }
  function diff(L, a) {
    const parts = [];
    for (const k of SHOWN) { const d = Math.round(L.s[k] - a[k]); if (d && !(k === 'rel' && !L.flags.has('partner'))) parts.push(D.stats.stats[k].name + ' ' + (d > 0 ? '+' : '−') + Math.abs(d)); }
    const dm = money(L) - a.m;
    if (Math.abs(dm) >= .5 && L.age >= 17) parts.push((dm > 0 ? '+' : '−') + fmtMoney(Math.abs(dm), L.year));
    return parts.join(' · ');
  }
  function choose(L, i) {
    const e = L.pending; L.pending = null;
    const c = e.choices[i];
    const out = [{t: '→ ' + c.text, cls: 'res'}];
    const before = snap(L);
    applyChoice(L, e, c, out);
    const d = diff(L, before); if (d) out.push({t: d, cls: 'delta'});
    if (L.end) out.push({t: deathLine(L), cls: 'dead'});
    return out;
  }
  function deathLine(L) {
    if (L.end.type === 'abroad') return 'Ты уезжаешь из страны. Дальше — другая жизнь.';
    const c = String(L.end.cause);
    return /^[A-Z]/.test(c) ? 'Ты погиб' + gEnd(L, 'ла') + '.' : 'Ты умер' + gEnd(L, 'ла') + '. Причина: ' + c + '.';
  }
  function nextYear(L) { L.year++; L.month = 0; }
  function queueItems(L, out) {
    for (const it in L.queueItems) {
      if (L.queueItems[it] <= L.year * 12 + L.month) {
        delete L.queueItems[it];
        L.queue.push({id: 'Q-' + it, type: 'offer', repeat: true, text: 'Подошла очередь: ' + ITEMS[it].name.toLowerCase() + '. Цена — ' + fmtMoney(ITEMS[it].price * avgWage(L.region, L.year), L.year) + '.',
          choices: [{text: 'Купить', effects: {money_m: -ITEMS[it].price}, item: {add: it}}, {text: 'Отказаться'}]});
      }
    }
  }

  // ---------- действия игрока ----------
  function shopList(L) {
    const y = L.year, w = avgWage(L.region, y);
    return Object.entries(ITEMS).filter(([k, d]) => d.price > 0).map(([k, d]) => {
      const soviet = y < (d.market_from || 2000);
      let how, can = true;
      if (L.items.has(k)) { how = 'есть'; can = false; }
      else if (k in L.queueItems) { how = 'в очереди'; can = false; }
      else if (soviet && !d.soviet) { how = 'с ' + d.market_from + ' года'; can = false; }
      else if (soviet && d.soviet === 'queue') how = 'встать в очередь';
      else if (soviet && d.soviet === 'blat') how = 'по блату';
      else how = money(L) >= d.price * w ? 'купить' : 'купить в долг';
      if ((how.startsWith('купить') || how === 'по блату') && creditRoom(L) < d.price * w) can = false;
      const eff = Object.entries(d.own || {}).filter(([kk, v]) => v > 0).map(([kk]) => D.stats.stats[kk].name + ' ▲').slice(0, 2).join(' ');
      return {id: k, name: d.name, how, can, price: d.price * w, priceText: fmtMoney(d.price * w, y), eff: ownText(d) ? ownText(d) + ' в год' : eff, note: d.note || ''};
    });
  }
  const dot = t => /[.!?]$/.test(t) ? t : t + '.';
  function ownText(d) { return Object.entries(d.own || {}).filter(([k, v]) => v).map(([k, v]) => D.stats.stats[k].name + ' ' + (v > 0 ? '+' : '−') + Math.abs(v)).join(', '); }
  function buy(L, id) {
    // возвращает строки для ленты: что сделал, что изменилось сразу, что будет давать дальше
    const d = ITEMS[id], y = L.year, w = avgWage(L.region, y), price = d.price * w;
    const soviet = y < (d.market_from || 2000), name = d.name.toLowerCase();
    if (soviet && d.soviet === 'queue') {
      const due = y * 12 + L.month + ri(12, 60); L.queueItems[id] = due;
      return [{t: gender(L, 'Встал в очередь: ' + name + '. Подойдёт примерно в ' + (Math.floor(due / 12)) + dot(' году — к тому времени нужно ' + fmtMoney(price, y))), cls: 'act'}];
    }
    if (soviet && d.soviet === 'blat' && !(L.s.ties > 55 && rand() < .5)) { L.s.ties = clamp('ties', L.s.ties - 1);
      return [{t: 'Достать по блату не вышло: «Приходите через месяц». Связей не хватило.', cls: 'act'}, {t: 'Связи −1', cls: 'delta'}]; }
    if (creditRoom(L) < price) return [{t: 'Не хватает денег: ' + name + ' стоит ' + fmtMoney(price, y) + ', а у тебя ' + fmtMoney(Math.max(0, money(L)), y) + ' и в долг дадут не больше трёх зарплат', cls: 'act'}];
    const before = snap(L), had = money(L);
    addMoney(L, -price);
    if (d.group === 'housing') for (const i of [...L.items]) if (ITEMS[i].group === 'housing') L.items.delete(i);
    L.items.add(id);
    for (const k in (d.buy || {})) L.s[k] = clamp(k, L.s[k] + d.buy[k]);
    const lines = [{t: gender(L, dot('Купил: ' + name + ' за ' + fmtMoney(price, y))), cls: 'act'}];
    if (money(L) < 0) { L.s.close = clamp('close', L.s.close - 2);
      lines.push({t: gender(L, (had > 0 ? 'Своих было ' + fmtMoney(had, y) + ', остальные ' : '') + fmtMoney(-money(L), y) + ' занял у родни. Долг гасится сам из того, что остаётся в месяц.'), cls: 'bad'}); }
    const dd = diff(L, before); if (dd) lines.push({t: dd, cls: 'delta'});
    const ot = ownText(d); if (ot) lines.push({t: 'Каждый год, пока ' + (d.group === 'housing' ? 'живёшь там' : 'вещь есть') + ': ' + ot + (d.upkeep ? '; содержание ' + fmtMoney(d.upkeep * w, y) + ' в месяц' : '') + '.', cls: 'dim'});
    return lines;
  }

  // ---------- фокус: только то, что есть в жизни сейчас ----------
  function focusOptions(L) {
    if (L.age < 7) return [];
    const o = [];
    if (STUDY_JOBS.has(L.job) || L.flags.has('evening_study')) o.push(['study', 'Учёба', 'Знания ▲▲, экзамены и поступление легче. Доход −10%']);
    if (!NO_WORK.has(L.job)) o.push(['work', L.job === 'unemployed' ? 'Поиск работы' : L.job === 'army' ? 'Служба' : 'Работа',
      L.job === 'unemployed' ? 'Работу находишь вдвое чаще, предложений больше' : 'Повышения и предложения чаще, доход +10%. Близкие и Отношения ▼']);
    o.push(['health', 'Здоровье', 'Здоровье и Физподготовка ▲, бросить привычку легче. Доход −5%']);
    o.push(['hobby', 'Увлечение', HOBBIES.some(h => L.flags.has(h)) ? 'События увлечения втрое чаще, Счастье ▲' : 'Найти увлечение для души, Счастье ▲']);
    if (L.flags.has('partner') || L.flags.has('has_kids') || L.flags.has('parents_alive') || L.age < 18) o.push(['family', 'Семья', 'Близкие и Отношения ▲▲, знакомства чаще. Доход −5%']);
    o.push(['balance', 'Баланс', 'Ничего не растёт быстро, но и падает вдвое медленнее. Счастье ▲']);
    return o;
  }
  function fixFocus(L, out) {
    const ok = focusOptions(L).map(x => x[0]);
    if (ok.length && !ok.includes(L.focus)) { L.focus = ok.includes('work') ? 'work' : ok.includes('study') ? 'study' : 'balance'; if (out) out.push({t: 'Фокус сменился: ' + focusOptions(L).find(x => x[0] === L.focus)[1] + '.', cls: 'dim'}); }
  }
  // ---------- счастье: тянется к уровню, который задаёт сама жизнь ----------
  function happyBase(L) {
    const s = L.s, f = L.flags, w = avgWage(L.region, L.year), m = money(L) / w, y = L.year;
    let b = 50 + .25 * (s.health - 60) + .25 * (s.close - 50) + (f.has('partner') ? .2 * (s.rel - 50) : -3);
    b += (L.lastIncome || 0) >= (L.lastExp || 0) ? 4 : -4;
    b += m < -3 ? -8 : m > 6 ? 4 : 0;
    b += [...L.items].some(i => OWN_HOUSING.has(i)) ? 3 : (L.items.has('kommunalka') || L.items.has('dorm')) ? -3 : 0;
    b += (L.items.has('car') ? 2 : 0) + (L.items.has('tv_vcr') ? 2 : 0) + (L.items.has('dacha') ? 2 : 0);
    for (const k of ['food', 'family', 'leisure']) b += L.spend[k] > 1 ? 3 : 0;
    b += L.job === 'unemployed' ? -8 : 0;
    b += {1992: -6, 1993: -4, 1994: -4, 1995: -3, 1998: -4}[y] || 0;
    b += {balance: 3, hobby: HOBBIES.some(h => f.has(h)) ? 5 : 2, work: -2, family: 2, study: -3}[L.focus] || 0;
    b += f.has('drinker') ? -3 : 0;
    b += {weak: -4, mid: 0, strong: 3}[L.traits.will] + {weak: -2, mid: 0, strong: 2}[L.traits.charm];
    return Math.max(5, Math.min(95, b));
  }
  // ---------- решения по инициативе игрока ----------
  const JOB_EVENTS = D.events.filter(e => e.section === '13' && e.id !== 'JOB-16').map(e => e.id)
    .concat(['CAR-05', 'MIG-01', 'REP-AZ-03', 'REP-LV-03', 'REP-KG-02', 'REP-EE-03']);
  const ACTIONS = [
    ['politics', 'Пойти в политику', 'Митинги, движения, выборы, должность во власти', ['POL-02', 'POL-03', 'POL-14', 'POL-15', 'POL-05', 'POL-09', 'POL-10-1993', 'POL-10-1995', 'POL-10-1999', 'POL-12', 'POL-17']],
    ['business', 'Открыть своё дело', 'Фарца, кооператив, челнок, ларёк, фирма', ['BIZ-01', 'BIZ-02', 'BIZ-06', 'BIZ-08', 'REP-RU-03', 'REP-UA-04', 'REP-BY-03', 'REP-UZ-04', 'REP-GE-04', 'BIZ-21', 'BIZ-11', 'BIZ-22']],
    ['job', 'Искать новую работу', 'Два предложения по твоему образованию и году', JOB_EVENTS],
    ['study', 'Пойти учиться', 'Вечернее, заочное, курсы, военное училище', ['ACT-STUDY', 'CAR-03', 'MIL-09']],
    ['sport', 'Заняться спортом', 'Секция для школьника, взрослым — фокус «Здоровье»: качалка, бег, лыжи', ['FIT-01']],
    ['hobby', 'Найти увлечение', 'Для души: Счастье и Связи', ['HOB-00']],
    ['love', 'Личная жизнь', 'Познакомиться или сделать предложение', ['REL-01', 'REL-04']],
    ['quit', 'Бросить пить или курить', 'Здоровье ▲, если хватит воли', ['HAB-02', 'HAB-04']],
    ['emigrate', 'Уехать', 'Из республики или из страны', ['EMI-01', 'EMI-02', 'EMI-03', 'EMI-05', 'EMI-11', 'REP-TM-03', 'EMI-07', 'EMI-04']],
    ['loan', 'Занять денег', 'У родни, в банке, у ростовщика', ['DEBT-01', 'DEBT-04', 'DEBT-06', 'DEBT-05']],
  ];
  const BY_ID = {}; for (const e of EVENTS) BY_ID[e.id] = e;
  function forced(e) { const c = Object.assign({}, e); if (e.when) c.when = {from: e.when.from, to: e.when.to}; return c; }
  function actionCands(L, ids) { return ids.map(i => BY_ID[i]).filter(e => e && eligible(L, forced(e), L.year, 0)); }
  function actions(L) {
    L.actYear = L.actYear || {};
    return ACTIONS.map(([id, label, desc, ids]) => {
      const c = actionCands(L, ids).concat(id === 'sport' && L.age >= 16 && L.focus !== 'health' && focusOptions(L).some(x => x[0] === 'health') ? [{id: 'focus-health'}] : []);
      const done = L.actYear[id] === L.year;
      return {id, label, desc, available: !done && c.length > 0 && L.age >= 14 && !L.pending,
        reason: done ? 'уже пробовал' + gEnd(L, 'а') + ' в этом году' : c.length ? '' : 'сейчас не получится'};
    });
  }
  function doAction(L, id) {
    const a = ACTIONS.find(x => x[0] === id); if (!a) return false;
    let c = actionCands(L, a[3]);
    if (id === 'sport' && !c.length && L.age >= 16) { L.actYear = L.actYear || {}; L.actYear[id] = L.year; L.focus = 'health';
      L.queue.unshift({id: 'ACT-SPORT', type: 'scene', repeat: true, text: gender(L, 'Решил заняться собой: записался в качалку и купил кеды. Фокус — здоровье.')}); return true; }
    if (!c.length) return false;
    L.actYear = L.actYear || {}; L.actYear[id] = L.year;
    if (id === 'job') { c = c.sort(() => rand() - .5).slice(0, 2); }
    else c = [c[0]];
    L.queue = c.map(forced).concat(L.queue);
    return true;
  }
  // ---------- сводки для экранов ----------
  function summary(L) {
    const y = L.year, w = avgWage(L.region, y);
    return {
      date: (MONTHS[Math.max(0, L.month - 1)]) + ' ' + y, name: L.name.first + ' ' + L.name.last, age: L.age,
      place: cityName(L) + ', ' + regionName(L.region, y, L.month), job: JOB_NAMES[L.job] + (L.sphere && JOB_SPHERE[L.job] === L.sphere && L.rank ? ', ' + RANKS[L.rank] : ''),
      money: money(L), moneyText: fmtMoney(money(L), y), debtText: money(L) < 0 ? fmtMoney(-money(L), y) : '', flow: (L.lastIncome || 0) - (L.lastExp || 0), flowText: fmtMoney(Math.abs((L.lastIncome || 0) - (L.lastExp || 0)), y),
      usdText: fmtMoney(L.usd, 1999), rubText: fmtMoney(L.local / L.rate, y), loanText: L.loan > 0 ? fmtMoney(L.loan, y) : '', loanLoad: L.lastIncome ? Math.round(Math.min(L.loan * .03, .15 * L.lastIncome) / L.lastIncome * 100) : 0,
      soviet: y <= 1991 && !(y === 1991 && L.month === 12), w,
    };
  }
  function careerInfo(L) {
    return {sphere: L.sphere ? D.stats.spheres[L.sphere].name : '—', rank: RANKS[L.rank], exp: Math.round(curExp(L)), stazh: Math.round(L.stazh),
      pay: L.lastIncome ? fmtMoney(L.lastIncome, L.year) : '—', all: Object.entries(L.exp).filter(([k, v]) => v >= 1).map(([k, v]) => [D.stats.spheres[k].name, Math.round(v)])};
  }
  function views(L) {
    const r = L.s.views_reform, u = L.s.views_union;
    const a = r > 25 ? 'Убеждённый реформатор' : r > 8 ? 'Умеренный реформатор' : r < -25 ? 'Сторонник старого порядка' : r < -8 ? 'Скорее за старый порядок' : 'Человек вне политики';
    const b = u < -20 ? ', жалеющий о большой стране' : u > 20 ? ', за самостоятельность своей страны' : '';
    return {reform: r, union: u, text: a + b + '.'};
  }

  return {snap, diff, D, newLife, step, choose, nextYear, summary, careerInfo, views, shopList, buy, money, role, cityName, regionName, focusOptions, fixFocus, actions, doAction, gender,
    avgWage, fmtMoney, JOB_NAMES, RANKS, MONTHS, ITEMS, JOB_SPHERE, healthNorm};
}
root.createEngine = createEngine;
})(typeof window !== 'undefined' ? window : this);
