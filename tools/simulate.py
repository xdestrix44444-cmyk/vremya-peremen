#!/usr/bin/env python3
"""Симулятор жизней «Время перемен»: прогоняет тысячи случайных жизней 1986–1999 по data/events/*.yaml.

Запуск: .venv/bin/python tools/simulate.py [число жизней] [seed]
Полный отчёт — reports/sim_<дата>.md, в консоль — сводка.

Демография и деньги здесь — заглушки до шага с таблицами данных (CONCEPT §9).
Игрок выбирает варианты случайно («случайный игрок»), фокус года — тоже случайно.
"""
import datetime
import glob
import math
import os
import random
import sys
from collections import Counter, defaultdict

import csv

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
REF = yaml.safe_load(open(os.path.join(DATA, 'stats.yaml'), encoding='utf-8'))
STAT_RANGE = {k: tuple(v['range']) for k, v in REF['stats'].items()}
TRAITS = list(REF['traits'])
TALENTS = REF['traits']['talent']['kinds']

EVENTS = []
for f in sorted(glob.glob(os.path.join(DATA, 'events', '*.yaml'))):
    doc = yaml.safe_load(open(f, encoding='utf-8'))
    for e in doc['events']:
        e['_section'] = doc['title']
        EVENTS.append(e)
BY_ID = {e['id']: e for e in EVENTS}
EVENTS = [e for e in EVENTS if e.get('trigger') != 'engine']   # переходы (дембель, диплом, пенсия) ведёт движок
CHANCE = [e for e in EVENTS if 'chance' in e]
FIXED = [e for e in EVENTS if e not in CHANCE and (e.get('fixed') or (e.get('when') or {}).get('month'))]
RANDOM = [e for e in EVENTS if e not in FIXED and e not in CHANCE and e['type'] != 'news']
SOFT_CAP = {'health', 'fit', 'know', 'close', 'ties', 'rel'}   # выше 70 прирост вдвое медленнее

# ---------- данные: население 1986 и таблицы смертности (ООН, WPP 2024), экономика (data/tables) ----------
TABLES = os.path.join(DATA, 'tables')
POP_CELLS = []      # ((республика, возрастная группа, пол), тыс. человек)
for r in csv.DictReader(open(os.path.join(TABLES, 'population_1986.csv'))):
    a = int(r['age_start'])
    if a <= 85:
        POP_CELLS.append(((r['region'], a, 'm'), float(r['male_k'])))
        POP_CELLS.append(((r['region'], a, 'f'), float(r['female_k'])))
QX = {}             # (республика, год, пол) -> [(возраст от, возраст до, qx)]
for r in csv.DictReader(open(os.path.join(TABLES, 'mortality_qx.csv'))):
    QX.setdefault((r['region'], int(r['year']), r['sex']), []).append((int(r['age_start']), int(r['age_start']) + int(r['age_span']), float(r['qx'])))
ITEMS = yaml.safe_load(open(os.path.join(DATA, 'items.yaml'), encoding='utf-8'))['items']
OWN_HOUSING = {'own_flat', 'cottage'}
ECON = {(r['region'], int(r['year'])): r for r in csv.DictReader(open(os.path.join(TABLES, 'economy.csv')))}
# Нормировка смертности: средний персонаж каждого пола и возраста умирает ровно как в таблице ООН,
# а здоровье, привычки и бригада только перераспределяют риск между людьми. Нормы считает калибровочный прогон.
MORT_NORM = defaultdict(lambda: 1.0)
MORT_ACC = defaultdict(lambda: [0.0, 0])
PURE = bool(os.environ.get('SIM_PURE'))   # отладка: чистые таблицы ООН без личных поправок
# курсы по месяцам (tools/etl_rates.py): «рублёвый эквивалент» за доллар; до 1992 для показа 1 ₽ = 1 у.е.
RATES, BLACK = {}, {}
for r in csv.DictReader(open(os.path.join(TABLES, 'rates_monthly.csv'))):
    k = (r['region'], int(r['year']), int(r['month']))
    RATES[k] = float(r['local_per_usd'])
    if r['black_market_per_usd']:
        BLACK[k] = float(r['black_market_per_usd'])
SECT = yaml.safe_load(open(os.path.join(TABLES, 'sectors.yaml'), encoding='utf-8'))
JAN92_LOSS = []      # доля сбережений, «съеденная» в январе 1992


def avg_wage(region, year):
    """Средняя зарплата: рубли до 1991, у.е. с 1992 (data/tables/economy.csv)."""
    row = ECON[(region, year)]
    return float(row['wage_rub'] if year <= 1991 else row['wage_usd'])


# ---------- бюджет месяца (CONCEPT §3.10), стартовая калибровка ----------
# зарплата профессии относительно средней: (СССР до 1991, с 1992)
JOB_PAY = {'worker': (1, .9), 'miner': (1.8, 1.3), 'engineer': (.9, .6), 'scientist': (.9, .4), 'teacher': (.8, .5),
           'doctor': (.85, .5), 'kolkhoz': (.75, .4), 'farmer': (.6, .7), 'shop': (.8, 1), 'coop': (2.5, 2.5),
           'shuttle': (2, 2), 'kiosk': (2.5, 2.5), 'firm': (2.5, 2.5), 'banker': (8, 8), 'broker': (5, 5), 'guard': (1, 1.3),
           'brigade': (4, 4), 'police': (.9, .7), 'officer': (1.3, .7), 'journalist': (.9, 1.2), 'artist': (1, 1),
           'programmer': (1, 2.5), 'translator': (2, 2.5), 'official': (1.1, 1), 'politician': (3, 3), 'shift': (2.5, 2.5),
           'migrant': (1.5, 1.5), 'student': (.2, .2), 'cadet': (.3, .3), 'unemployed': (.15, .15)}
STATE_JOBS = {'worker', 'miner', 'engineer', 'scientist', 'teacher', 'doctor', 'kolkhoz', 'officer', 'police'}
NO_BUDGET = {'kid', 'school', 'army'}
# стаж и опыт по сферам (CONCEPT §3.11a)
SPHERES = REF['spheres']
JOB_SPHERE = {j: sp for sp, v in SPHERES.items() for j in v['jobs']}
SHADOW = set(REF['shadow_jobs_after_1992'])
NO_SENIORITY = {'trade', 'crime'}
PAY_NORM = .8                                # подбирается так, чтобы средний работник получал среднюю зарплату            # в торговле и бригаде доход не растёт от стажа          # деньги ведёт семья или государство
SPEND = [(.7, 30), (1, 50), (1.4, 20)]          # уровни трат случайного игрока: экономно / обычно / щедро

# ---------- старая заглушка демографии (только для справки) ----------
POP = {'RU': 145.0, 'UA': 51.0, 'UZ': 18.5, 'KZ': 16.2, 'BY': 10.0, 'AZ': 6.8, 'GE': 5.2, 'TJ': 4.8,
       'MD': 4.2, 'KG': 4.1, 'LT': 3.6, 'AM': 3.4, 'TM': 3.2, 'LV': 2.6, 'EE': 1.5}
TIER = {r: 'young' for r in ('UZ', 'TJ', 'TM', 'KG')}
TIER.update({r: 'mid' for r in ('AZ', 'AM', 'KZ', 'MD', 'GE')})
PYRAMID = {  # доля пятилетних групп 0–4 … 80–84
    'old':   [8, 7.5, 7, 7, 7.5, 8.5, 8.5, 7.5, 4.5, 6, 6.5, 6, 5, 3.5, 3, 2, 1.5],
    'mid':   [10, 9.5, 9, 8.5, 8.5, 9, 8.5, 7, 4, 5, 5, 4.5, 3.5, 2.5, 2, 1.5, 1],
    'young': [15, 13.5, 12, 11, 10, 9, 7.5, 5.5, 3.5, 3.5, 3, 2.5, 1.5, 1.2, 0.8, 0.5, 0.3]}
MINORITY = {'RU': 0, 'UA': .22, 'BY': .13, 'KZ': .38, 'LV': .34, 'EE': .30, 'LT': .09, 'MD': .13,
            'KG': .21, 'UZ': .08, 'TJ': .08, 'TM': .09, 'AZ': .06, 'GE': .06, 'AM': .02}
URBAN = {'RU': .74, 'UA': .67, 'BY': .66, 'KZ': .57, 'LV': .71, 'EE': .71, 'LT': .68, 'MD': .47,
         'KG': .38, 'UZ': .40, 'TJ': .32, 'TM': .45, 'AZ': .54, 'GE': .56, 'AM': .68}
INFANT = {'RU': .019, 'UA': .014, 'BY': .012, 'KZ': .027, 'LV': .011, 'EE': .011, 'LT': .011, 'MD': .023,
          'KG': .035, 'UZ': .040, 'TJ': .045, 'TM': .050, 'AZ': .028, 'GE': .022, 'AM': .020}
SLAVIC_BALTIC = {'RU', 'UA', 'BY', 'KZ', 'LV', 'LT', 'EE'}
CRISIS = {1986: .9, 1987: .88, 1988: .9, 1989: .95, 1990: .98, 1991: 1, 1992: 1.12, 1993: 1.3, 1994: 1.4,
          1995: 1.32, 1996: 1.2, 1997: 1.12, 1998: 1.12, 1999: 1.22}

# годовой бюджет событий по возрасту: (строк от, до, развилок от, до) — CONCEPT §3.2
BUDGET = [(6, 2, 3, 0, 0), (13, 4, 6, 1, 2), (17, 6, 8, 2, 3), (30, 7, 10, 3, 4), (55, 6, 9, 2, 4), (200, 4, 6, 1, 2)]
ACTIVE = {'brigade', 'business', 'deputy_local', 'deputy_rep', 'deputy_duma', 'official', 'debt_bandits', 'debt_private'}
TRAINING_JOBS = {'army', 'cadet', 'worker', 'miner', 'shift', 'guard', 'brigade', 'kolkhoz', 'farmer', 'police', 'officer'}
KNOW_JOBS = {'school', 'student', 'cadet', 'scientist', 'engineer', 'teacher', 'doctor', 'programmer', 'journalist', 'translator', 'banker'}


def health_norm(a):
    """Средняя «возрастная» норма здоровья: старение шкалы совпадает с её убыванием в month_tick."""
    return 88 - .3 * max(0, min(a, 50) - 30) - .6 * max(0, min(a, 70) - 50) - 1.0 * max(0, a - 70)


def wpick(pairs, rng):
    tot = sum(w for _, w in pairs)
    r = rng.random() * tot
    for x, w in pairs:
        r -= w
        if r <= 0:
            return x
    return pairs[-1][0]


class Life:
    def __init__(self, rng, force_region=None):
        self.rng = rng
        cells = [c for c in POP_CELLS if not force_region or c[0][0] == force_region]
        (self.region, a0, self.sex) = wpick(cells, rng)
        self.age = a0 + rng.randint(0, 4)
        self.birth_month = rng.randint(1, 12)
        # население ООН дано на середину 1986 года: кто празднует день рождения в январе–июне, 1 января ещё на год младше
        if self.birth_month <= 6 and self.age > 0:
            self.age -= 1
        self.traits = {t: wpick([('weak', 20), ('mid', 60), ('strong', 20)], rng) for t in TRAITS if t != 'talent'}
        self.talent = rng.choice(TALENTS) if rng.random() < .2 else None
        self.flags = set()
        if rng.random() < MINORITY[self.region]:
            self.flags.add('minority')
        if rng.random() < .015:
            self.flags.add('jewish_roots')
        if rng.random() < {'KZ': .06, 'KG': .02, 'RU': .006}.get(self.region, 0):
            self.flags.add('german_roots')
        if rng.random() > URBAN[self.region]:
            self.flags.add('village')
        elif rng.random() < (.09 if self.region == 'RU' else .15):
            self.flags.add('capital')
        if rng.random() < (.97 if self.age < 25 else .8 if self.age < 40 else .45 if self.age < 55 else .1):
            self.flags.add('parents_alive')
        if self.region in ('UA', 'BY') and rng.random() < .03:
            self.flags.add('chernobyl_zone')
        a = self.age
        tb = {'weak': -8, 'mid': 0, 'strong': 8}
        self.s = {
            'health': max(20, min(95, health_norm(a) + tb[self.traits['constitution']] + rng.gauss(0, 6))),
            'fit': max(10, min(90, (40 + a * 1.5 if a < 20 else 65 - (a - 20) * .6) + tb[self.traits['strength']] + rng.gauss(0, 8))),
            'know': max(5, min(90, (a * 4 if a < 17 else 45 + rng.gauss(0, 12)) + tb[self.traits['mind']])),
            'close': rng.uniform(45, 75), 'ties': rng.uniform(25, 60) + tb[self.traits['charm']],
            'rel': 0, 'fame': 0, 'law': 0, 'views_reform': rng.gauss(0, 15), 'views_union': rng.gauss(0, 15)}
        self.edu = 'school'
        if a < 7:
            self.job = 'kid'
        elif a < 17:
            self.job = 'school'
        elif a < 22 and rng.random() < .35:
            self.job, self.edu, self.study_end = 'student', 'university', 1986 + (22 - a)
        elif a >= self.pens_age():
            self.job = 'pension'
        else:
            self.edu = wpick([('school', 40), ('ptu', 20), ('technikum', 18), ('university', 22)], rng)
            self.job = self.pick_job()
        if a >= 20 and self.sex == 'm' and rng.random() < .8:
            self.flags.add('served')
        if a >= 24 and rng.random() < .75:
            self.flags |= {'married', 'partner'}
            self.s['rel'] = rng.uniform(40, 80)
            if a >= 26 and rng.random() < .85:
                self.flags.add('has_kids')
        if a >= 17 and rng.random() < (.55 if self.sex == 'm' else .1):
            self.flags.add('smoker')
        if a >= 30 and self.sex == 'm' and rng.random() < .12:
            self.flags.add('drinker')
        # сбережения на книжке: в среднем ~4–5 зарплат на взрослого (вклады населения 1987), у пенсионеров больше
        # корзины сбережений (CONCEPT §3.4): local — в национальной валюте, usd — в долларах; money — сумма в у.е.
        self.rate, self.local, self.usd, self.assets = 1.0, 0.0, 0.0, []
        self.money = avg_wage(self.region, 1986) * rng.lognormvariate(1.2 if a < 55 else 1.8, .8) if a >= 20 else 0
        self.keep = 'rub'       # куда идут сбережения: rub | usd
        self.exp = defaultdict(float)   # годы опыта по сферам
        self.left_sphere = {}           # сфера -> год ухода
        self.sphere = JOB_SPHERE.get(self.job)
        self.rank = 0                   # 0 рядовой … 3 начальник
        yrs = max(0, a - (22 if self.edu == 'university' else 18)) if self.job not in ('kid', 'school', 'student') else 0
        self.stazh = yrs if self.job != 'pension' else max(20, yrs * .8)
        if self.sphere:
            self.exp[self.sphere] = yrs * rng.uniform(.6, 1)
            self.rank = min(3, sum(rng.random() < .3 for _ in range(int(self.exp[self.sphere] // 8))))
        self.switches = 0
        self.ever_source = ''
        self.loan = 0.0         # сумма займа под процент (в у.е.)
        self.items = set()
        if a >= 25:
            self.items.add(wpick([('own_flat', 83), ('kommunalka', 10), ('dorm', 7)], rng))
            for it, p_ in (('tv_vcr', .3), ('dacha', .3), ('phone_line', .3)):
                if rng.random() < p_:
                    self.items.add(it)
            if (self.sex == 'm' or 'married' in self.flags) and rng.random() < .3:
                self.items.add('car')
        elif a >= 18 and rng.random() < .4:
            self.items.add('dorm')
        self.spend = 1
        self.debt_months = 0
        self.focus = 'family'
        self.fired = Counter()
        self.ever = set(self.flags)
        self.jobs_ever = {self.job}
        self.end = None          # ('death', причина, год) | ('abroad', None, год)
        self.moved = False
        self.army_months = 0
        self.unemployed_months = 0
        self.lines = Counter()   # (возрастная группа) -> строк
        self.choices = Counter()

    @property
    def money(self):
        return self.local / self.rate + self.usd

    @money.setter
    def money(self, v):          # изменения денег проходят через национальную валюту (зарплата, траты, долги)
        self.local = (v - self.usd) * self.rate

    def pens_age(self):
        return 60 if self.sex == 'm' else 55

    def role(self):
        a = self.age
        if a < 7:
            return 'kid'
        if a < 17:
            return 'school'
        if a >= self.pens_age() or self.job == 'pension':
            return 'pension'
        return 'young' if a < 25 else 'adult'

    def pick_job(self):
        if 'village' in self.flags:
            return wpick([('kolkhoz', 70), ('teacher', 10), ('shop', 10), ('worker', 10)], self.rng)
        if self.edu == 'university':
            return wpick([('engineer', 40), ('teacher', 20), ('doctor', 12), ('scientist', 10), ('official', 8), ('journalist', 3), ('officer', 7)], self.rng)
        return wpick([('worker', 60), ('shop', 12), ('miner', 8 if self.region in ('RU', 'UA', 'KZ') else 0), ('police', 5), ('teacher', 5), ('kolkhoz', 10)], self.rng)


# ---------- условия и проверки ----------
def cond_ok(life, who, year):
    if not who:
        return True
    if 'age' in who and not (who['age'][0] <= life.age <= who['age'][1]):
        return False
    if 'years' in who and not (who['years'][0] <= year <= who['years'][1]):
        return False
    if 'sex' in who and who['sex'] != life.sex:
        return False
    if 'role' in who and life.role() not in who['role']:
        return False
    if 'job' in who and life.job not in who['job']:
        return False
    if 'not_job' in who and life.job in who['not_job']:
        return False
    for key in ('exp', 'money'):
        if key not in who:
            continue
        c = who[key]
        op = ''.join(ch for ch in c if ch in '<>=')
        v = cur_exp(life) if key == 'exp' else life.money / avg_wage(life.region, year)
        n = float(c[len(op):])
        if not {'>': v > n, '<': v < n, '>=': v >= n, '<=': v <= n, '=': v == n}[op]:
            return False
    if 'edu' in who and life.edu not in who['edu']:
        return False
    for st, c in (who.get('stats') or {}).items():
        v = life.s[st]
        op = ''.join(ch for ch in c if ch in '<>=')
        n = float(c[len(op):])
        if not {'>': v > n, '<': v < n, '>=': v >= n, '<=': v <= n, '=': v == n}[op]:
            return False
    for t, lvl in (who.get('traits') or {}).items():
        if t == 'talent':
            if life.talent != lvl:
                return False
        elif life.traits[t] != lvl:
            return False
    if any(f not in life.flags for f in who.get('flags') or []):
        return False
    if any(f in life.flags for f in who.get('not_flags') or []):
        return False
    if who.get('any_flags') and not any(f in life.flags for f in who['any_flags']):
        return False
    return True


def eligible(life, e, year, month):
    w = e.get('when') or {}
    if w and not (w.get('from', 1986) <= year <= w.get('to', 1999)):
        return False
    if 'month' in w and w['month'] != month:
        return False
    if e.get('where') and life.region not in e['where']:
        return False
    if not e.get('repeat') and life.fired[e['id']]:
        return False
    if e.get('focus') and life.focus not in ([e['focus']] if isinstance(e['focus'], str) else e['focus']):
        return False
    return cond_ok(life, e.get('who'), year)


def score(life, mods, year):
    v = 0.0
    for k, x in (mods or {}).items():
        if k in ('base', 'note'):
            continue
        if k == 'year':
            v += x.get(year, 0)
        elif k == 'region':
            v += x.get(life.region, 0)
        elif k == 'edu':
            v += x.get(life.edu, 0)
        elif k == 'exp':
            v += x * cur_exp(life)
        elif k in ('fame', 'law'):
            v += x * life.s[k]                 # у Известности и Внимания закона точка отсчёта — ноль
        elif k in life.s:
            v += x * (life.s[k] - 50)
        elif k in life.traits:
            v += {'strong': x, 'mid': 0, 'weak': -x}[life.traits[k]]
        elif k in life.flags:
            v += x
    return v


STATS_CHECKS = defaultdict(lambda: [0, 0, 0])  # id/вариант -> [попыток, успехов, упёрлось в край]


def resolve(life, e, c, year):
    if 'check' in c:
        ch = c['check'].get('base', 50) + score(life, c['check'], year)
        key = f'{e["id"]} · {c["text"]}'
        STATS_CHECKS[key][0] += 1
        if ch <= 5 or ch >= 90:
            STATS_CHECKS[key][2] += 1
        ch = max(5, min(90, ch))
        ok = life.rng.random() * 100 < ch
        STATS_CHECKS[key][1] += ok
        return c['success'] if ok else c['fail']
    if c.get('outcomes'):
        outs = c['outcomes']
        ws = [max(0.1, o.get('w', 1) + score(life, o.get('mods'), year)) for o in outs]
        return wpick(list(zip(outs, ws)), life.rng)   # веса исходов без зажима (SCHEMA)
    return None


DEATH_BY_EVENT = Counter()


def apply(life, o, year, src):
    if not o:
        return
    for k, v in (o.get('effects') or {}).items():
        if k == 'money_m':
            life.money += v * avg_wage(life.region, year)   # money_m — в средних месячных зарплатах
        else:
            lo, hi = STAT_RANGE[k]
            if k in SOFT_CAP and v > 0 and life.s[k] > 70:
                v /= 2
            life.s[k] = max(lo, min(hi, life.s[k] + v))
    new_debt = [f for f in (o.get('sets') or []) if f in ('debt_bank', 'debt_private', 'debt_bandits') and f not in life.flags]
    for f in o.get('sets') or []:
        life.flags.add(f)
        life.ever.add(f)
    if new_debt:
        got = (o.get('effects') or {}).get('money_m', 0)
        life.loan += max(got, 2) * avg_wage(life.region, year)      # сумма займа — сколько выдали, не меньше двух зарплат
    for f in o.get('clears') or []:
        life.flags.discard(f)
    if set(o.get('clears') or []) & {'debt_bank', 'debt_private', 'debt_bandits'} and not life.flags & {'debt_bank', 'debt_private', 'debt_bandits'}:
        life.loan = 0                                     # долг закрыт событием (выплачен, прощён, сбежал)
    if 'job' in o:
        life.job = o['job']
        life.jobs_ever.add(o['job'])
        if o['job'] == 'student':
            life.study_end = year + (5 if o.get('edu') == 'university' else 3)
        if o['job'] == 'cadet':
            life.study_end = year + 4
    if 'edu' in o:
        life.edu = o['edu']
    it = o.get('item')
    if it:
        if 'remove_group' in it:
            life.items = {i for i in life.items if ITEMS[i]['group'] != it['remove_group']}
        if 'remove' in it:
            life.items.discard(it['remove'])
        if 'add' in it:
            if ITEMS[it['add']]['group'] == 'housing':
                life.items = {i for i in life.items if ITEMS[i]['group'] != 'housing'}
            life.items.add(it['add'])
            life.ever.add('item:' + it['add'])
    if o.get('asset'):
        life.ever_source = f'{src}:{o["asset"].get("sector", "")}'
        add_asset(life, o['asset'], year)
    if o.get('promote'):
        life.rank = min(3, life.rank + 1)
        life.ever.add('promoted')
    if 'move' in o and o['move'] != life.region:
        life.region = o['move']
        life.moved = True
        life.flags.discard('minority')
    if o.get('end') and not life.end:
        life.end = (o['end'], src, year)
        if o['end'] == 'death':
            DEATH_BY_EVENT[src] += 1


def fire(life, e, year):
    life.fired[e['id']] += 1
    apply(life, e, year, e['id'])
    if life.end:
        return
    chs = [c for c in e.get('choices') or [] if cond_ok(life, c.get('who'), year)]
    if chs:
        # в долгах игрок обычно не выбирает варианты, которые стоят денег
        cheap = [c for c in chs if (c.get('effects') or {}).get('money_m', 0) >= 0]
        if life.money < 0 and cheap and life.rng.random() < .8:
            chs = cheap
        # займ под процент разумный игрок берёт в основном от нужды
        loans = [c for c in chs if set(c.get('sets') or []) & {'debt_private', 'debt_bandits', 'debt_bank'}]
        if loans and len(loans) < len(chs) and life.rng.random() < (.5 if life.money >= 0 else .3):
            chs = [c for c in chs if c not in loans]
        c = life.rng.choice(chs)
        apply(life, c, year, e['id'])
        if not life.end:
            apply(life, resolve(life, e, c, year), year, e['id'])


# ---------- смертность ----------
def q_year(life, year):
    a = life.age
    # таблица смертности ООН: вероятность умереть в возрастной группе -> за один год
    tab = QX[(life.region, year, life.sex)]
    lo, hi, qx = next((x for x in tab if x[0] <= a < x[1]), tab[-1])     # последняя группа — «100+»
    q = 1 - (1 - qx) ** (1 / (hi - lo)) if 0 < hi - lo < 50 else min(qx, .6)
    # личные поправки: здоровье относительно возрастной нормы, привычки, бригада
    m = max(.5, min(3, 1 + (health_norm(a) - life.s['health']) / 100 * 1.5))
    if life.s['health'] <= 5:
        m *= 3          # «больничный» статус вместо мгновенной смерти
    for f, k in (('drinker', 1.6), ('addicted', 3), ('brigade', 2.5)):
        if f in life.flags:
            m *= k
    if 'smoker' in life.flags and a >= 40:
        m *= 1.3
    if PURE:
        return min(q, .6)
    key = (life.sex, min(a // 10, 9))
    acc = MORT_ACC[key]
    acc[0] += m
    acc[1] += 1
    return min(q * m / MORT_NORM[key], .6)


NATURAL_DEATHS = Counter()


def month_tick(life, year, month):
    rng = life.rng
    if month == life.birth_month:
        life.age += 1
    a, s = life.age, life.s
    # убывание шкал (CONCEPT §3.13), «обычные» траты поддерживают Близких и Связи
    dh = .3 if 30 <= a < 50 else .6 if 50 <= a < 70 else 1.0 if a >= 70 else 0
    dh += (1 if 'smoker' in life.flags and a >= 30 else 0) + (2 if 'drinker' in life.flags else 0) - (1 if 'diet' in life.flags else 0)
    s['health'] -= dh / 12
    df = (1 if a >= 30 else 0) + (1 if a >= 45 else 0) + (1 if a >= 60 else 0)
    df += 0 if (life.job in TRAINING_JOBS or life.focus == 'health' or a < 18) else 2 * (.5 if life.focus == 'balance' else 1)
    s['fit'] += (3 / 12 if a < 18 else 0) - df / 12
    s['know'] += 4 / 12 if life.job in ('school', 'student', 'cadet') else (0 if life.job in KNOW_JOBS else -(1 if a < 50 else 2) / 12)
    half = .5 if life.focus == 'balance' else 1
    s['close'] -= 0 if life.focus == 'family' else half / 12
    social_work = life.focus == 'work' and life.job in ('shop', 'kiosk', 'firm', 'coop', 'shuttle', 'official', 'politician', 'brigade', 'banker')
    s['ties'] -= 0 if social_work else half * (3 if life.job in ('unemployed', 'pension') else 1) / 12
    if 'partner' in life.flags and life.focus != 'family':
        s['rel'] -= half * 4 / 12
    # имущество: ежегодные эффекты помесячно (CONCEPT §3.10b)
    for it in life.items:
        for k, v in (ITEMS[it].get('own') or {}).items():
            if v > 0 and s[k] > 70:
                v /= 2
            s[k] += v / 12
    s['law'] -= 1 / 12 if not life.flags & {'brigade', 'shadow_trade'} else 0
    for k, (lo, hi) in STAT_RANGE.items():
        s[k] = max(lo, min(hi, s[k]))
    career_month(life, year, month)
    budget_month(life, year, month)
    # переходы состояний, которые должен вести движок
    if a >= 7 and life.job == 'kid':
        life.job = 'school'
    if life.job == 'school' and a >= 18:
        life.job = wpick([('worker', 50), ('student', 30), ('unemployed', 20)], rng)
        if life.job == 'student':
            life.edu, life.study_end = 'technikum', year + 3
    if life.job in ('student', 'cadet') and year >= getattr(life, 'study_end', 0) and month == 7:
        life.job = 'officer' if life.job == 'cadet' else 'unemployed'
        if life.edu in ('technikum', 'university') and life.job == 'unemployed':
            life.job = life.pick_job()
    if life.job == 'army':
        life.army_months += 1
        if life.army_months >= 24:
            life.flags.add('served')
            life.ever.add('served')
            life.job, life.army_months = 'unemployed', 0
    if a >= life.pens_age() and life.job not in ('pension', 'politician', 'banker', 'brigade') and month == life.birth_month:
        life.job = 'pension'
    if life.job == 'unemployed':
        life.unemployed_months += 1
        if rng.random() < .04:
            life.job = life.pick_job() if life.edu != 'school' else wpick([('worker', 60), ('shop', 40)], rng)
    life.jobs_ever.add(life.job)
    # смерть
    if rng.random() < 1 - (1 - q_year(life, year)) ** (1 / 12):
        life.end = ('death', 'естественная', year)
        NATURAL_DEATHS['естественная смертность'] += 1


def cur_exp(life):
    return life.exp[life.sphere] if life.sphere else 0


def career_month(life, year, month):
    """Опыт, смена сферы, стаж, повышения (CONCEPT §3.11a)."""
    sp = JOB_SPHERE.get(life.job)
    if sp and sp != life.sphere:
        if life.sphere:
            life.left_sphere[life.sphere] = year
            life.switches += 1
            if sp in SPHERES[life.sphere]['related']:
                life.exp[sp] = max(life.exp[sp], life.exp[life.sphere] * .5)
        if year - life.left_sphere.get(sp, year) > 5:
            life.exp[sp] *= .5                       # вернулся после долгого перерыва
        life.sphere, life.rank = sp, 0
    if sp:
        life.exp[sp] += 1 / 12
    working = sp or life.job in ('army', 'student')
    if working and not (year >= 1992 and life.job in SHADOW and 'official_record' not in life.flags):
        life.stazh += 1 / 12
    if month == 12 and sp and sp not in NO_SENIORITY and life.rank < 3:
        ch = (.02 + .006 * life.exp[sp] + (.05 if life.focus == 'work' else -.01 if life.focus in ('hobby', 'family') else 0)
              + .002 * (life.s['know'] - 50) + .002 * (life.s['ties'] - 50)) / (1 + 1.5 * life.rank)   # выше — труднее
        if life.rng.random() < min(.12, max(.005, ch)):
            life.rank += 1
            life.ever.add('promoted')


def pay_mult(life):
    if not life.sphere or JOB_SPHERE.get(life.job) != life.sphere:
        return 1
    seniority = 0 if life.sphere in NO_SENIORITY else min(.4, .03 * life.exp[life.sphere])
    return (1 + seniority) * (1 + .15 * life.rank) * PAY_NORM


def budget_month(life, year, month):
    """Доход минус траты домохозяйства за месяц, долги и обесценивание (CONCEPT §3.10, §3.14)."""
    rng, f = life.rng, life.flags
    soviet = year <= 1991
    # курс месяца: сбережения в нацвалюте пересчитываются сами (инфляция «съедает» их долю)
    before = life.money
    life.rate = RATES[(life.region, year, month)]
    if year == 1992 and month == 1 and before > 0 and life.age >= 20:
        JAN92_LOSS.append(1 - life.money / before)
    # раз в год сбережения переводятся в доллары, если игрок так решил (до 1992 — по курсу чёрного рынка)
    if month == 1 and life.keep == 'usd' and life.local > 0:
        buy = BLACK.get((life.region, year, month)) or life.rate
        life.usd += life.local / buy
        life.local = 0.0
    if month == 12:
        revalue_assets(life, year)
    if life.age < 17 or life.job in NO_BUDGET:
        return
    w = avg_wage(life.region, year)
    if life.job == 'pension':
        income = w * float(ECON[(life.region, year)]['pension_to_wage']) * min(1.2, .63 + .01 * life.stazh)
    else:
        income = w * JOB_PAY.get(life.job, (1, 1))[0 if soviet else 1] * pay_mult(life) \
            * {'work': 1.1, 'study': .9, 'health': .95, 'family': .95}.get(life.focus, 1)
        # зарплата отстаёт от инфляции на 3 месяца: платят по ценам трёхмесячной давности
        if year >= 1992 and (year, month) >= (1992, 4):
            m3 = (year * 12 + month - 4)
            income *= RATES[(life.region, m3 // 12, m3 % 12 + 1)] / life.rate
        if 1993 <= year <= 1998 and life.job in STATE_JOBS and rng.random() < .3:
            income = 0                                   # зарплату задержали
    if 'married' in f:
        income += w * (.8 if soviet or rng.random() > .2 else 0)
    if not soviet:
        income += w * (.1 if life.job == 'pension' else .25)   # огород, шабашки, подработки, помощь родни
    persons = 1 + ('married' in f) + (1.5 if 'has_kids' in f else 0)
    lvl = life.spend
    food = (.45 if soviet else .55) * w * (.6 + .4 * persons) * lvl
    home = (.08 if soviet else .12) * w
    kids = (.15 * w * lvl) if 'has_kids' in f else 0
    other = (.30 if soviet else .25) * w * lvl
    habits = w * (.03 * ('smoker' in f) + .08 * ('drinker' in f))
    if 'dacha' in f or 'dacha' in life.items:
        food *= 1 - ITEMS['dacha']['saves_food']
    upkeep = sum(ITEMS[i].get('upkeep', 0) for i in life.items) * w
    exp = food + home + kids + other + habits + upkeep
    if life.job == 'pension' and 'married' not in f:
        exp *= .4                                        # одинокий пенсионер живёт скромно
    elif life.job == 'student':
        exp *= .3                                        # живёт с родителями или в общаге
    if life.money < -3 * w:
        exp = min(exp, income)                            # режим выживания: тратится только то, что есть
    life.money += income - exp
    # нехватка денег без процентного долга: живёт в долг у родни и беднеет. Долги под процент берутся только
    # выбором игрока в событиях (DEBT-01, 04, 06, 07), движок их сам не навязывает.
    if month == 1 and life.money < -3 * w:
        life.s['close'] -= 2                            # живёт в долг у родни
    # займы под процент (CONCEPT §3.14): у займа своя сумма и ставка, платёж — до 15% дохода, если есть чем платить
    if life.loan > 0:
        life.ever.add('debt_any')
        rate = .15 if 'debt_bandits' in f else .10 if 'debt_private' in f else .03
        due = life.loan * (1 + rate)
        pay = min(due, max(0, .15 * income), max(0, life.money + 3 * w))
        life.loan = due - pay
        life.money -= pay
        if pay < life.loan * rate:
            life.debt_months += 1                        # просрочка: долг растёт
        # стадии просрочки: ростовщик передаёт долг бригаде, бригада и банк забирают имущество
        if 'debt_private' in f and life.loan > 5 * w and rng.random() < .2:
            f.discard('debt_private')
            f.add('debt_bandits')
            life.ever.add('debt_bandits')
        if ('debt_bandits' in f and life.loan > 6 * w) or ('debt_bank' in f and life.loan > 10 * w):
            if 'debt_bandits' in f:
                life.s['close'], life.s['health'] = life.s['close'] - 10, life.s['health'] - 5
            life.items -= {i for i in life.items if ITEMS[i]['group'] in ('car', 'country')}
            if life.loan > 15 * w and life.items & OWN_HOUSING:
                life.items = {i for i in life.items if ITEMS[i]['group'] != 'housing'} | {'kommunalka'}
            life.loan = w
            f.add('defaulter')
            life.ever.add('seized')
        if life.loan <= .01 * w:
            life.loan = 0
            f -= {'debt_bank', 'debt_private', 'debt_bandits'}
    # влияние трат на шкалы (CONCEPT §3.10a), помесячно; «обычно» гасит естественное убывание Близких, Связей, Отношений
    if lvl == 1:
        d = {'close': 1, 'ties': 1, 'rel': 4 if 'partner' in f else 0}
    elif lvl < 1:
        d = {'health': -1.5, 'fit': -1, 'close': -3 - 2 * ('married' in f) - 2 * ('has_kids' in f), 'ties': -3,
             'rel': -4 if 'partner' in f else 0}
    else:
        d = {'health': 1, 'close': 4 + 2 * ('married' in f) + 2 * ('has_kids' in f), 'ties': 3 + 1, 'rel': 8 if 'partner' in f else 0}
    if life.money < -3 * w:
        d['health'] = d.get('health', 0) - 2
        d['fit'] = d.get('fit', 0) - 1
    for k, v in d.items():
        if v > 0 and life.s[k] > 70:
            v /= 2
        life.s[k] += v / 12


def focus_weight(life, e, risky):
    sec = e['_section'][:3]
    if risky and sec in ('4. ', '5. '):
        return 2.5
    if life.focus == 'hobby' and sec == '17.':
        return 3
    if life.focus == 'family' and e['id'] == 'REL-01':
        return 2
    if life.focus == 'work' and e['type'] == 'offer':
        return 1.5
    return 1


def revalue_assets(life, year):
    """Акции и предприятия идут за индексом отрасли, приносят дивиденды (data/tables/sectors.yaml)."""
    for a in life.assets:
        if a['kind'] == 'property':
            a['value'] *= SECT['property_yearly'].get(year, 1)
        else:
            a['value'] *= SECT['yearly'].get(a.get('sector', 'local'), {}).get(year, 1)
        life.usd += a['value'] * SECT['dividend'][a['kind']] * (1 + .5 * ('enterprise_owner' in life.flags and a['kind'] != 'shares'))


def add_asset(life, a, year):
    w = avg_wage(life.region, year)
    if 'scale' in a:
        for x in life.assets:
            if x['kind'] == a['kind']:
                x['value'] *= a['scale']
        if a['scale'] == 0:
            life.assets = [x for x in life.assets if x['kind'] != a['kind']]
    else:
        life.assets.append({'kind': a['kind'], 'sector': a.get('sector', 'local'), 'value': a.get('value', 1) * w, 'from': life.ever_source})
        life.ever.add('asset:' + a['kind'])


def buy_items(life, year):
    """Разумный игрок раз в год покупает то, что может себе позволить (CONCEPT §3.10b)."""
    if life.age < 18 or life.job in NO_BUDGET:
        return
    rng, w = life.rng, avg_wage(life.region, year)
    for it, d in ITEMS.items():
        if it in life.items or d.get('price', 0) <= 0:
            continue
        g = d['group']
        if g == 'housing' and life.items & OWN_HOUSING and it != 'cottage':
            continue
        if d.get('needs') == ['own_flat'] and not life.items & OWN_HOUSING:
            continue
        soviet = year < d.get('market_from', 2000)
        if soviet:
            way = d.get('soviet')
            ok = way == 'free' or (way == 'queue' and life.job not in ('unemployed', 'pension') and rng.random() < .12) \
                or (way == 'blat' and life.s['ties'] > 60 and rng.random() < .3)
        else:
            ok = rng.random() < .25
        if ok and life.money > d['price'] * w * d.get('luxury', 1.5):
            life.money -= d['price'] * w
            if g == 'housing':
                life.items -= {i for i in life.items if ITEMS[i]['group'] == 'housing'}
            life.items.add(it)
            life.ever.add('item:' + it)
            for k, v in (d.get('buy') or {}).items():
                life.s[k] += v
    for it in list(life.items):                        # кражи, аварии, пожары
        if rng.random() < ITEMS[it].get('risk', 0):
            life.items.discard(it)
            life.ever.add('lost_item')


def age_group(a):
    return '0–6' if a <= 6 else '7–13' if a <= 13 else '14–17' if a <= 17 else '18–30' if a <= 30 else '31–55' if a <= 55 else '56+'


def run_life(rng, force_region=None):
    life = Life(rng, force_region)
    start = dict(region=life.region, age=life.age, sex=life.sex)
    traj = {}
    for year in range(1986, 2000):
        # фокус года — случайный игрок
        life.focus = rng.choice(['study' if life.job in ('student', 'cadet', 'school') else 'work', 'family', 'health', 'hobby', 'balance'])
        # игрок здравомыслящий: в долгах экономит, при запасе может позволить себе больше
        life.spend = .7 if life.money < 0 and rng.random() < .8 else wpick(SPEND, rng)
        # доллары: до 1992 — редкость (статья, нужен выход на фарцовщиков), потом — массовая привычка
        if year >= 1989:
            p_usd = (.12 if life.s['ties'] > 50 else .03) if year <= 1991 else .4
            life.keep = 'usd' if rng.random() < p_usd else 'rub'
        a = life.age
        _, l0, l1, c0, c1 = next(b for b in BUDGET if a <= b[0])
        risky = life.focus == 'work' and life.job in ('shop', 'kiosk', 'firm', 'coop', 'shuttle', 'brigade', 'banker', 'broker')
        bonus = min(3, len(life.flags & ACTIVE)) + (1 if risky else 0) + min(2, ('partner' in life.flags) + ('has_kids' in life.flags))
        n_lines, n_choice = min(14, rng.randint(l0, l1) + bonus), min(6, rng.randint(c0, c1) + (1 if life.flags & ACTIVE else 0))
        chron = [e for e in FIXED if e.get('choices') and eligible(life, e, year, e['when']['month'])]
        n_choice = max(0, n_choice - len(chron))      # развилки хроники и сезонные развилки входят в бюджет
        n_lines = max(n_choice, n_lines - len(chron))
        plan = defaultdict(list)
        pool_c = [e for e in RANDOM if e['type'] in ('choice', 'offer') and eligible(life, e, year, 0)]
        pool_s = [e for e in RANDOM if e['type'] == 'scene' and eligible(life, e, year, 0)]
        picked = []
        for pool, n in ((pool_c, n_choice), (pool_s, n_lines - n_choice)):
            pool = list(pool)
            for _ in range(max(0, n)):
                if not pool:
                    break
                e = wpick([(x, x.get('weight', 1) * focus_weight(life, x, risky)) for x in pool], rng)
                pool.remove(e)
                picked.append(e)
        for e in picked:
            plan[rng.randint(1, 12)].append(e)
        for e in CHANCE:                              # годовая вероятность, вне бюджета
            m = (e.get('when') or {}).get('month') or rng.randint(1, 12)
            if rng.random() < e['chance']:
                plan[m].append(e)
        for month in range(1, 13):
            month_tick(life, year, month)
            if life.end:
                break
            todo = [e for e in FIXED if (e.get('when') or {}).get('month') == month] + plan[month]
            for e in todo:
                if life.end or not eligible(life, e, year, month if 'month' in (e.get('when') or {}) else 0):
                    continue
                if e['type'] == 'news':
                    continue
                fire(life, e, year)
                life.lines[age_group(life.age)] += 1
                if e.get('choices'):
                    life.choices[age_group(life.age)] += 1
            if life.end:
                break
        # фокус года
        fx = {'work': {'close': -2, 'rel': -3, 'health': -1, 'know': 1 if life.job in KNOW_JOBS else 0},
              'study': {'know': 6, 'ties': 1},
              'health': {'health': 3, 'fit': 4},
              'hobby': {'close': 1, 'know': 2 if life.talent in ('tech', 'lang') else 0, 'fit': 3 if life.talent == 'sport' else 0,
                        'fame': 2 if life.talent == 'music' and 'talent_found' in life.flags else 0},
              'family': {'close': 4, 'rel': 6 if 'partner' in life.flags else 0},
              'balance': {}}[life.focus]
        buy_items(life, year)
        apply(life, {'effects': fx}, year, 'focus')
        traj[year] = dict(life.s, age=life.age, alive=not life.end)
        if life.end:
            break
    return life, start, traj


# ---------- отчёт ----------
def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1986
    region = sys.argv[3] if len(sys.argv) > 3 else None
    # калибровочный прогон: средние поправки смертности по полу и возрасту
    crng = random.Random(seed + 1)
    for _ in range(max(1500, n // 3)):
        run_life(crng, region)
    for k, (tot, cnt) in MORT_ACC.items():
        MORT_NORM[k] = tot / cnt if cnt > 50 else 1.0
    with open(os.path.join(TABLES, 'mortality_norm.csv'), 'w', newline='') as g:
        w = csv.writer(g)
        w.writerow(['sex', 'age_decade', 'mean_modifier'])
        for (sx, d), v in sorted(MORT_NORM.items()):
            w.writerow([sx, d * 10, round(v, 4)])
    for c in (DEATH_BY_EVENT, NATURAL_DEATHS, STATS_CHECKS):
        c.clear()
    JAN92_LOSS.clear()
    rng = random.Random(seed)
    lives = [run_life(rng, region) for _ in range(n)]
    out = []

    def p(*a):
        out.append(' '.join(str(x) for x in a))

    pct = lambda k: f'{k / n * 100:.1f}%'
    p(f'# Прогон симулятора: {n} жизней, seed {seed}' + (f', только {region}' if region else '') + f', {datetime.date.today()}', '')
    p('Игрок выбирает развилки случайно, фокус года случайный, траты — по остатку денег. Данные — data/tables (см. SOURCES.md).', '')

    ends = Counter(l.end[0] if l.end else 'alive' for l, _, _ in lives)
    p('## 1. Чем кончились жизни', '')
    p(f'- Дожили до 2000 года: {pct(ends["alive"])}; умерли: {pct(ends["death"])}; уехали за границу: {pct(ends["abroad"])}')
    p(f'- Переехали в другую республику: {pct(sum(l.moved for l, _, _ in lives))}')
    p('- Республика на старте: ' + ', '.join(f'{r} {v}' for r, v in Counter(st['region'] for _, st, _ in lives).most_common()))
    by_age = defaultdict(lambda: [0, 0])
    for l, st, _ in lives:
        g = '0–14' if st['age'] < 15 else '15–39' if st['age'] < 40 else '40–59' if st['age'] < 60 else '60+'
        by_age[g][0] += 1
        by_age[g][1] += bool(l.end and l.end[0] == 'death')
    p('- Умерли за 14 лет по возрасту на старте: ' + '; '.join(f'{g}: {d / t * 100:.1f}% (из {t})' for g, (t, d) in sorted(by_age.items())))
    p('- Причины смерти: ' + ', '.join(f'{k} {v}' for k, v in NATURAL_DEATHS.items()) + f', в событиях {sum(DEATH_BY_EVENT.values())}')
    p('- Гибель в событиях, топ: ' + '; '.join(f'{k} {v}' for k, v in DEATH_BY_EVENT.most_common(12)), '')

    p('## 2. Шкалы', '')
    p('Средние значения у живых на конец года (здор / физ / знания / близкие / связи / закон / известность):', '')
    p('| Год | Здор | Физ | Знания | Близкие | Связи | Закон | Известн. |', '|---|---|---|---|---|---|---|---|')
    for y in range(1986, 2000):
        rows = [t[y] for _, _, t in lives if y in t and t[y]['alive']]
        if rows:
            m = lambda k: f'{sum(r[k] for r in rows) / len(rows):.0f}'
            p(f'| {y} | {m("health")} | {m("fit")} | {m("know")} | {m("close")} | {m("ties")} | {m("law")} | {m("fame")} |')
    p('')
    final = [l for l, _, _ in lives if not l.end]
    lives_all = [l for l, _, _ in lives]
    for k in ('health', 'fit', 'know', 'close', 'ties', 'law', 'fame', 'rel'):
        vals = [l.s[k] for l in final]
        lo, hi = STAT_RANGE[k]
        p(f'- {REF["stats"][k]["name"]}: на нуле {sum(v <= lo for v in vals) / len(vals) * 100:.0f}%, на максимуме {sum(v >= hi for v in vals) / len(vals) * 100:.0f}%')
    adults = [l for l in final if l.age >= 20]
    money = sorted(l.money / avg_wage(l.region, 1999) for l in adults)
    q = lambda x: f'{money[int(len(money) * x)]:.1f}'
    p(f'- Сбережения взрослых в конце 1999, в средних зарплатах: медиана {q(.5)}, 10% {q(.1)}, 25% {q(.25)}, 75% {q(.75)}, 90% {q(.9)}')
    p(f'- В долгах на конец 1999: {sum(l.money < 0 for l in adults) / len(adults) * 100:.0f}%; '
      f'хоть раз в долгах с процентами: {sum("debt_any" in l.ever for l in lives_all) / n * 100:.0f}%; '
      f'долг бандитам хоть раз: {sum("debt_bandits" in l.ever for l in lives_all) / n * 100:.1f}%; '
      f'забирали имущество: {sum("seized" in l.ever for l in lives_all) / n * 100:.1f}%')
    byjob = defaultdict(list)
    for l in adults:
        byjob[l.job].append(l.money / avg_wage(l.region, 1999))
    p('- Медиана сбережений по последнему занятию: ' + ', '.join(f'{j} {sorted(v)[len(v) // 2]:.1f}' for j, v in sorted(byjob.items(), key=lambda x: -len(x[1]))[:12]), '')

    p('## 3. Плотность событий: строк и развилок в год по возрасту (цель — CONCEPT §3.2)', '')
    lines, chs, years = Counter(), Counter(), Counter()
    for l, _, t in lives:
        lines.update(l.lines)
        chs.update(l.choices)
        for y, r in t.items():
            years[age_group(r['age'])] += 1
    target = {'0–6': '2–3 / 0', '7–13': '4–6 / 1–2', '14–17': '6–8 / 2–3', '18–30': '7–10 / 3–4', '31–55': '6–9 / 2–4', '56+': '4–6 / 1–2'}
    p('| Возраст | Строк в год | Развилок в год | Цель |', '|---|---|---|---|')
    for g in target:
        if years[g]:
            p(f'| {g} | {lines[g] / years[g]:.1f} | {chs[g] / years[g]:.1f} | {target[g]} |')
    p('')

    p('## 4. Ветки и судьбы (хоть раз за жизнь)', '')
    ever = Counter()
    for l, _, _ in lives:
        ever.update(l.ever)
        ever.update('job:' + j for j in l.jobs_ever)
    for k in ('served', 'afghan', 'chechen', 'veteran', 'brigade', 'record', 'business', 'entrepreneur', 'official', 'deputy_local',
              'deputy_duma', 'activist', 'refugee', 'migrant', 'divorced', 'drinker', 'addicted', 'debt_bandits', 'mmm_investor', 'talent_found'):
        p(f'- {k}: {pct(ever[k])}')
    p('- Профессии (хоть раз): ' + ', '.join(f'{k[4:]} {pct(v)}' for k, v in sorted(((k, v) for k, v in ever.items() if k.startswith('job:')), key=lambda x: -x[1])), '')

    p('## 4a. Карьера и стаж', '')
    work = [l for l in adults if l.sphere and JOB_SPHERE.get(l.job) == l.sphere]
    p(f'- Хоть раз сменили сферу: {sum(l.switches > 0 for l in lives_all) / n * 100:.0f}%; сменили 2+ раза: {sum(l.switches > 1 for l in lives_all) / n * 100:.0f}%')
    p(f'- Повышали хоть раз: {sum("promoted" in l.ever for l in lives_all) / n * 100:.0f}%')
    p('- Должность у работающих в 1999: ' + ', '.join(f'{["рядовой", "старший", "руководитель", "начальник"][r]} {sum(l.rank == r for l in work) / max(1, len(work)) * 100:.0f}%' for r in range(4)))
    bands = defaultdict(list)
    for l in work:
        e = cur_exp(l)
        bands['0–3' if e < 3 else '3–8' if e < 8 else '8–15' if e < 15 else '15+'].append(pay_mult(l))
    p('- Множитель зарплаты по опыту в сфере: ' + ', '.join(f'{b}: ×{sum(v) / len(v):.2f} (n={len(v)})' for b, v in sorted(bands.items())))
    pens = [l for l in adults if l.job == 'pension']
    if pens:
        p(f'- Стаж пенсионеров: медиана {sorted(l.stazh for l in pens)[len(pens) // 2]:.0f} лет; пенсия к средней: ×{sum(min(1.2, .63 + .01 * l.stazh) for l in pens) / len(pens):.2f}')
    p('')

    p('## 4c. Деньги и активы', '')
    if JAN92_LOSS:
        p(f'- Январь 1992: у взрослых со сбережениями «сгорело» в среднем {sum(JAN92_LOSS) / len(JAN92_LOSS) * 100:.0f}% (в у.е.)')
    usd_share = [l.usd / l.money for l in adults if l.money > 0 and l.usd > 0]
    p(f'- Держат часть сбережений в долларах: {len(usd_share) / len(adults) * 100:.0f}% взрослых')
    nw = lambda l: (l.money + sum(a['value'] for a in l.assets)) / avg_wage(l.region, 1999)
    p(f'- Капитал с активами (в средних зарплатах): медиана {sorted(nw(l) for l in adults)[len(adults) // 2]:.1f}')
    ast = Counter(a['kind'] for l in adults for a in l.assets)
    p('- Активы у взрослых: ' + ', '.join(f'{k} {v}' for k, v in ast.items()) + f'; акционеров {sum(bool(l.assets) for l in adults) / len(adults) * 100:.0f}%')
    by_src = defaultdict(list)
    for l in adults:
        for a in l.assets:
            by_src[a['from']].append(a['value'] / avg_wage(l.region, 1999))
    p('- Стоимость активов к 1999 по происхождению (средн. зарплат): ' + '; '.join(f'{k} {sum(v) / len(v):.1f} (n={len(v)})' for k, v in sorted(by_src.items(), key=lambda x: -len(x[1]))[:10]))
    p('')

    p('## 4b. Имущество у взрослых в конце 1999', '')
    own = lambda its: sum(bool(l.items & its) for l in adults) / len(adults) * 100
    p(f'- Своя квартира: {own(OWN_HOUSING):.0f}%; коммуналка или общага: {own({"kommunalka", "dorm"}):.0f}%; коттедж: {own({"cottage"}):.1f}%')
    p(f'- Машина: {own({"car"}):.0f}%; дача: {own({"dacha"}):.0f}%; телефон: {own({"phone_line"}):.0f}%; '
      f'телевизор и видик: {own({"tv_vcr"}):.0f}%; компьютер: {own({"computer"}):.0f}%')
    p(f'- Теряли вещь (кража, авария, пожар): {sum("lost_item" in l.ever for l in lives_all) / n * 100:.0f}%', '')

    p('## 5. События', '')
    fired = Counter()
    for l, _, _ in lives:
        fired.update({k: 1 for k in l.fired})
    never = [e['id'] for e in EVENTS if e['type'] != 'news' and not fired[e['id']]]
    p(f'- Ни разу не выпали ({len(never)}): ' + ', '.join(never))
    p('- Чаще всего (% жизней, где было хоть раз): ' + '; '.join(f'{k} {pct(v)}' for k, v in fired.most_common(20)))
    rare = sorted(((k, v) for k, v in fired.items() if v < n * .002), key=lambda x: x[1])
    p(f'- Очень редкие (< 0,2% жизней, {len(rare)}): ' + ', '.join(f'{k} ({v})' for k, v in rare), '')

    p('## 6. Проверки выбора, которые почти всегда упираются в край 5% или 90%', '')
    bad = [(k, v) for k, v in STATS_CHECKS.items() if v[0] >= 30 and v[2] / v[0] > .5]
    for k, (tries, ok, edge) in sorted(bad, key=lambda x: -x[1][2] / x[1][0])[:25]:
        p(f'- {k}: успех {ok / tries * 100:.0f}%, в краю {edge / tries * 100:.0f}% попыток (n={tries})')
    if not bad:
        p('- нет')
    p('')

    os.makedirs(os.path.join(ROOT, 'reports'), exist_ok=True)
    path = os.path.join(ROOT, 'reports', f'sim_{datetime.date.today()}' + (f'_{region}' if region else '') + '.md')
    open(path, 'w', encoding='utf-8').write('\n'.join(out))
    print('\n'.join(out))
    print(f'\nОтчёт: {path}')


if __name__ == '__main__':
    main()
