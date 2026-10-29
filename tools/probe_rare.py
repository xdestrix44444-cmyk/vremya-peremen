#!/usr/bin/env python3
"""Проверка редких событий.

1. Прогоны по каждой из 15 республик отдельно (маленькие республики иначе почти не выпадают).
2. Для событий, которые всё равно не выпали: собираем персонажа, который подходит под условия, и проверяем,
   что событие вообще может сработать (иначе это ошибка в данных). Печатаем, какие условия редки.
Запуск: .venv/bin/python tools/probe_rare.py [жизней на республику]
"""
import csv
import os
import random
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import simulate as S  # noqa: E402

n = int(sys.argv[1]) if len(sys.argv) > 1 else 600
for r in csv.DictReader(open(os.path.join(S.TABLES, 'mortality_norm.csv'))):
    S.MORT_NORM[(r['sex'], int(r['age_decade']) // 10)] = float(r['mean_modifier'])

fired, ever, lives_total = Counter(), Counter(), 0
for reg in sorted(S.POP):
    rng = random.Random(hash(reg) % 10000)
    for _ in range(n):
        life, _, _ = S.run_life(rng, reg)
        lives_total += 1
        fired.update({k: 1 for k in life.fired})
        ever.update(life.ever)
        ever.update('job:' + j for j in life.jobs_ever)

never = [e for e in S.EVENTS if e['type'] != 'news' and not fired[e['id']]]
rare = [(e['id'], fired[e['id']]) for e in S.EVENTS if e['type'] != 'news' and 0 < fired[e['id']] < lives_total * .001]
print(f'Прогнано {lives_total} жизней ({n} на каждую из 15 республик).')
print(f'Не выпали ни разу: {len(never)}; очень редкие (<0,1%): {len(rare)}')


def probe(e):
    """Собрать подходящего персонажа и проверить, срабатывает ли событие."""
    rng = random.Random(1)
    reg = (e.get('where') or ['RU'])[0]
    life = S.Life(rng, reg)
    w = e.get('when') or {}
    year, month = w.get('from', 1990), w.get('month', 0)
    who = e.get('who') or {}
    if 'age' in who:
        life.age = (who['age'][0] + who['age'][1]) // 2
    role_age = {'kid': 4, 'school': 12, 'young': 21, 'adult': 40, 'pension': 66}
    if 'role' in who:
        life.age = role_age[who['role'][0]] if 'age' not in who else life.age
    if 'sex' in who:
        life.sex = who['sex']
    if 'job' in who:
        life.job = who['job'][0]
        life.sphere = S.JOB_SPHERE.get(life.job)
    if 'edu' in who:
        life.edu = who['edu'][0]
    life.flags = set(who.get('flags') or []) | set((who.get('any_flags') or [])[:1])
    for st, c in (who.get('stats') or {}).items():
        op = ''.join(ch for ch in c if ch in '<>=')
        v = float(c[len(op):])
        life.s[st] = v + 5 if '>' in op else v - 5
    for t, lvl in (who.get('traits') or {}).items():
        if t == 'talent':
            life.talent = lvl
        else:
            life.traits[t] = lvl
    if 'exp' in who and life.sphere:
        life.exp[life.sphere] = float(who['exp'].lstrip('<>=')) + 1
    if 'money' in who:
        life.money = (float(who['money'].lstrip('<>=')) + 1) * S.avg_wage(reg, year)
    return S.eligible(life, e, year, month), life


req_rows = []
for e in never:
    ok, _ = probe(e)
    who = e.get('who') or {}
    reqs = [f'{f} {ever[f] / lives_total * 100:.1f}%' for f in (who.get('flags') or [])]
    reqs += [f'job:{j} {ever["job:" + j] / lives_total * 100:.1f}%' for j in (who.get('job') or [])]
    if who.get('any_flags'):
        reqs.append('любой из ' + '/'.join(who['any_flags']))
    where = ','.join(e.get('where') or ['все'])
    w = e.get('when') or {}
    req_rows.append((e['id'], 'ок' if ok else 'НЕ СРАБАТЫВАЕТ', where, f"{w.get('from', '')}–{w.get('to', '')}", '; '.join(reqs) or '—'))

print('\n| Событие | Условия выполнимы? | Где | Годы | Что требует (доля жизней, где это было) |')
print('|---|---|---|---|---|')
for row in req_rows:
    print('| ' + ' | '.join(row) + ' |')
print('\nОчень редкие: ' + ', '.join(f'{i} ({k})' for i, k in sorted(rare, key=lambda x: x[1])))
