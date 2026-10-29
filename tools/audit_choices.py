#!/usr/bin/env python3
"""Проверка логики развилок: ожидаемый эффект каждого варианта и «очевидные» выборы.

Для каждого варианта считается ожидаемое изменение шкал и денег (прямые эффекты + среднее по исходам;
шанс проверки — при средних шкалах и задатках). Ищем:
  - доминируемые варианты: другой вариант не хуже ни по чему и лучше хотя бы в одном;
  - пустые варианты: ничего не дают и не отнимают, когда остальные что-то меняют;
  - развилки без настоящего выбора: у всех вариантов одинаковый знак по всем шкалам.
Варианты, которые меняют работу, жильё, флаги, переезд или финал, считаются несравнимыми (у них свой смысл).
Запуск: .venv/bin/python tools/audit_choices.py
"""
import glob
import os

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOOD = {'health': 1, 'fit': 1, 'know': 1, 'close': 1, 'ties': 1, 'rel': 1, 'fame': .3, 'law': -1, 'happy': 1, 'money_m': 4}


def ev(o, w=1.0, acc=None):
    acc = acc if acc is not None else {}
    for k, v in (o.get('effects') or {}).items():
        if k in GOOD:
            acc[k] = acc.get(k, 0) + v * w
    if o.get('end') == 'death':
        acc['death'] = acc.get('death', 0) + w
    return acc


def choice_ev(c):
    acc = ev(c)
    if 'check' in c:
        p = max(5, min(90, c['check'].get('base', 50))) / 100
        ev(c['success'], p, acc)
        ev(c['fail'], 1 - p, acc)
    if c.get('outcomes'):
        tot = sum(o.get('w', 1) for o in c['outcomes'])
        for o in c['outcomes']:
            ev(o, o.get('w', 1) / tot, acc)
    return acc


def special(c):
    keys = ('job', 'move', 'item', 'asset', 'edu', 'promote', 'sets', 'clears')
    if any(k in c for k in keys):
        return True
    for o in (c.get('outcomes') or []) + [c.get('success') or {}, c.get('fail') or {}]:
        if any(k in o for k in keys) or o.get('end') == 'abroad':
            return True
    return False


def better_or_equal(a, b):
    keys = set(a) | set(b)
    if a.get('death', 0) > b.get('death', 0):
        return False
    return all(a.get(k, 0) * GOOD.get(k, 0) >= b.get(k, 0) * GOOD.get(k, 0) - 1e-9 for k in keys if k != 'death')


problems = []
for f in sorted(glob.glob(os.path.join(ROOT, 'data', 'events', '*.yaml'))):
    for e in yaml.safe_load(open(f, encoding='utf-8'))['events']:
        chs = e.get('choices') or []
        if len(chs) < 2:
            continue
        evs = [(c, choice_ev(c), special(c)) for c in chs]
        for c, a, sp in evs:
            if sp:
                continue
            for d, b, sp2 in evs:
                if d is c or sp2:
                    continue
                if better_or_equal(b, a) and not better_or_equal(a, b):
                    problems.append((e['id'], 'доминируется', c['text'], d['text']))
                    break
        plain = [x for x in evs if not x[2]]
        if len(plain) >= 2 and not any(any(abs(v) > 1e-9 for v in a.values()) for _, a, _ in plain):
            problems.append((e['id'], 'все варианты пустые', '', ''))
print(f'Нашлось {len(problems)} проблем')
for p in problems:
    print(' | '.join(p))
