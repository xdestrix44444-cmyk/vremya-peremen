#!/usr/bin/env python3
"""Проверяет data/events/*.yaml и собирает EVENTS.md.

Запуск: .venv/bin/python tools/build.py
"""
import glob
import os
import re
import sys
from collections import Counter, defaultdict

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

ref = yaml.safe_load(open(os.path.join(DATA, 'stats.yaml'), encoding='utf-8'))
flags = yaml.safe_load(open(os.path.join(DATA, 'flags.yaml'), encoding='utf-8'))
STATS = set(ref['stats'])
TRAITS = set(ref['traits'])
REGIONS = set(ref['regions'])
JOBS = set(ref['jobs'])
EDU = set(ref['edu_levels'])
ROLES = set(ref['roles'])
ASSET_KINDS, SECTORS = set(ref['asset_kinds']), set(ref['sectors'])
ITEMS = yaml.safe_load(open(os.path.join(DATA, 'items.yaml'), encoding='utf-8'))['items']
ITEM_GROUPS = {v['group'] for v in ITEMS.values()}
TYPES = set(ref['event_types'])
EFFECT_KEYS = STATS | set(ref['money_keys'])
FLAGS = set(flags)

errors, warnings = [], []
flag_set, flag_read = defaultdict(set), defaultdict(set)
CHOICE_KEYS = {'memo', 'text', 'effects', 'sets', 'clears', 'job', 'edu', 'move', 'end', 'check', 'success', 'fail', 'outcomes', 'who', 'ref', 'item', 'asset', 'promote', 'pay_debt'}
COND_RE = re.compile(r'^(>=|<=|>|<|=)\s*-?\d+$')


def err(eid, msg):
    errors.append(f'{eid}: {msg}')


def check_effects(eid, eff):
    for k in (eff or {}):
        if k not in EFFECT_KEYS:
            err(eid, f'неизвестная шкала в эффектах: {k}')


def check_flags(eid, lst, store):
    for f in lst or []:
        if f not in FLAGS:
            err(eid, f'флаг не в реестре: {f}')
        store[f].add(eid)


def check_mods(eid, mods):
    for k, v in (mods or {}).items():
        if k in ('base', 'note'):
            continue
        if k == 'year':
            if not all(1986 <= int(y) <= 1999 for y in v):
                err(eid, f'год вне 1986–1999 в mods: {v}')
        elif k == 'region':
            for r in v:
                if r not in REGIONS:
                    err(eid, f'неизвестная республика в mods: {r}')
        elif k == 'edu':
            for r in v:
                if r not in EDU:
                    err(eid, f'неизвестное образование в mods: {r}')
        elif k in STATS or k in TRAITS or k == 'exp':
            pass
        elif k in FLAGS:
            flag_read[k].add(eid)
        else:
            err(eid, f'неизвестный ключ проверки: {k}')


def check_outcome(eid, o):
    check_effects(eid, o.get('effects'))
    check_flags(eid, o.get('sets'), flag_set)
    check_flags(eid, o.get('clears'), flag_set)
    check_mods(eid, o.get('mods'))
    if 'move' in o and o['move'] not in REGIONS:
        err(eid, f'переезд в неизвестную республику: {o["move"]}')
    it = o.get('item')
    if it:
        for k in ('add', 'remove'):
            if k in it and it[k] not in ITEMS:
                err(eid, f'неизвестная вещь: {it[k]}')
        if 'remove_group' in it and it['remove_group'] not in ITEM_GROUPS:
            err(eid, f'неизвестная группа вещей: {it["remove_group"]}')
    a = o.get('asset')
    if a:
        if a.get('kind') not in ASSET_KINDS:
            err(eid, f'неизвестный вид актива: {a.get("kind")}')
        if a.get('sector') and a['sector'] not in SECTORS:
            err(eid, f'неизвестная отрасль: {a["sector"]}')
    if 'edu' in o and o['edu'] not in EDU:
        err(eid, f'неизвестное образование в исходе: {o["edu"]}')
    if 'job' in o and o['job'] not in JOBS:
        err(eid, f'неизвестная профессия в исходе: {o["job"]}')
    if 'end' in o and o['end'] not in ('death', 'abroad'):
        err(eid, f'неизвестный финал: {o["end"]}')


def check_who(eid, who):
    for k, v in (who or {}).items():
        if k == 'stats':
            for s, c in v.items():
                if s not in STATS:
                    err(eid, f'неизвестная шкала в условии: {s}')
                if not COND_RE.match(str(c)):
                    err(eid, f'плохое условие {s}: {c}')
        elif k == 'traits':
            for t, lvl in v.items():
                if t not in TRAITS:
                    err(eid, f'неизвестный задаток: {t}')
                elif lvl not in ref['trait_levels'] and lvl not in ref['traits']['talent']['kinds']:
                    err(eid, f'неизвестный уровень задатка {t}: {lvl}')
        elif k == 'job':
            for j in v:
                if j not in JOBS:
                    err(eid, f'неизвестная профессия: {j}')
        elif k == 'edu':
            for j in v:
                if j not in EDU:
                    err(eid, f'неизвестное образование: {j}')
        elif k == 'role':
            for j in v:
                if j not in ROLES:
                    err(eid, f'неизвестная роль: {j}')
        elif k == 'not_job':
            for j in v:
                if j not in JOBS:
                    err(eid, f'неизвестная профессия: {j}')
        elif k in ('flags', 'not_flags', 'any_flags'):
            check_flags(eid, v, flag_read)
        elif k in ('exp', 'money'):
            if not COND_RE.match(str(v)):
                err(eid, f'плохое условие {k}: {v}')
        elif k == 'years':
            if not (1986 <= v[0] <= v[1] <= 1999):
                err(eid, f'годы варианта вне 1986–1999: {v}')
        elif k not in ('age', 'sex'):
            err(eid, f'неизвестное условие: {k}')


def validate(e, seen):
    eid = e.get('id', '?')
    if eid in seen:
        err(eid, 'повтор ID')
    seen.add(eid)
    for k in ('id', 'type', 'text'):
        if k not in e:
            err(eid, f'нет поля {k}')
    if e.get('trigger') not in (None, 'engine'):
        err(eid, f'неизвестный trigger: {e["trigger"]}')
    if 'chance' in e and not (0 < e['chance'] <= 1):
        err(eid, f'chance вне (0, 1]: {e["chance"]}')
    if 'chance' in e and 'weight' in e:
        err(eid, 'одновременно chance и weight')
    if e.get('type') not in TYPES:
        err(eid, f'неизвестный тип: {e.get("type")}')
    w = e.get('when') or {}
    if w and not (1986 <= w.get('from', 1986) <= w.get('to', 1999) <= 1999):
        err(eid, f'годы вне 1986–1999: {w}')
    for r in e.get('where') or []:
        if r not in REGIONS:
            err(eid, f'неизвестная республика: {r}')
    check_who(eid, e.get('who'))
    check_outcome(eid, {k: e[k] for k in ('effects', 'sets', 'clears', 'job', 'edu', 'move', 'end', 'asset', 'item') if k in e})
    if e.get('type') in ('choice', 'offer') and not e.get('choices'):
        err(eid, 'развилка без вариантов')
    for c in e.get('choices') or []:
        extra = set(c) - CHOICE_KEYS
        if extra:
            err(eid, f'лишние ключи в варианте (запятая в тексте без кавычек?): {extra}')
        if 'text' not in c:
            err(eid, 'вариант без текста')
        check_who(eid, c.get('who'))
        check_outcome(eid, {k: c[k] for k in ('effects', 'sets', 'clears', 'job', 'edu', 'move', 'end', 'asset', 'item') if k in c})
        check_mods(eid, c.get('check'))
        for key in ('success', 'fail'):
            if key in c:
                check_outcome(eid, c[key])
        for o in c.get('outcomes') or []:
            check_outcome(eid, o)
        if 'check' in c and not ('success' in c and 'fail' in c):
            err(eid, 'check без success/fail')


# ---------- сборка Markdown ----------
def fmt_when(e):
    w = e.get('when') or {}
    if not w:
        return 'все годы'
    y = str(w['from']) if w['from'] == w['to'] else f'{w["from"]}–{w["to"]}'
    return y + (f', мес. {w["month"]}' if 'month' in w else '')


def fmt_who(e):
    who = e.get('who') or {}
    parts = []
    if 'years' in who:
        parts.append(f'{who["years"][0]}–{who["years"][1]}')
    if 'exp' in who:
        parts.append(f'опыт в сфере {who["exp"]} лет')
    if 'money' in who:
        parts.append(f'сбережения {who["money"]} зарплат')
    if 'age' in who:
        parts.append(f'{who["age"][0]}–{who["age"][1]} лет')
    if 'sex' in who:
        parts.append('мужчины' if who['sex'] == 'm' else 'женщины')
    for k in ('role', 'job', 'edu'):
        if k in who:
            parts.append(', '.join(who[k]))
    for s, c in (who.get('stats') or {}).items():
        parts.append(f'{ref["stats"][s]["name"]} {c}')
    for t, lvl in (who.get('traits') or {}).items():
        parts.append(f'{ref["traits"][t]["name"]}: {lvl}')
    if who.get('flags'):
        parts.append('есть: ' + ', '.join(who['flags']))
    if who.get('not_flags'):
        parts.append('нет: ' + ', '.join(who['not_flags']))
    if who.get('any_flags'):
        parts.append('хоть один: ' + ', '.join(who['any_flags']))
    return '; '.join(parts) or '—'


def fmt_eff(eff):
    if not eff:
        return ''
    out = []
    for k, v in eff.items():
        name = 'деньги (мес.)' if k == 'money_m' else ref['stats'][k]['name']
        out.append(f'{name} {v:+g}')
    return ' (' + ', '.join(out) + ')'


def fmt_out(o):
    s = o.get('text', '') + fmt_eff(o.get('effects'))
    if o.get('sets'):
        s += ' [+' + ', '.join(o['sets']) + ']'
    if o.get('promote'):
        s += ' → повышение'
    if o.get('item'):
        it = o['item']
        s += ' → ' + ', '.join(f'{"+" if k == "add" else "−"}{ITEMS[v]["name"] if v in ITEMS else v}' for k, v in it.items())
    if o.get('asset'):
        a = o['asset']
        s += f' → актив: {ref["asset_kinds"][a["kind"]]}' + (f' ({ref["sectors"][a["sector"]]})' if a.get('sector') else '') + \
             (f' ×{a["scale"]}' if 'scale' in a else f', {a["value"]:+g} мес.' if 'value' in a else '')
    if o.get('job'):
        s += f' → работа: {o["job"]}'
    if o.get('edu'):
        s += f' → учёба: {o["edu"]}'
    if o.get('move'):
        s += f' → переезд {o["move"]}'
    if o.get('end'):
        s += ' → ' + ('гибель' if o['end'] == 'death' else 'уехал')
    return s.strip()


def fmt_choices(e):
    lines = []
    for c in e.get('choices') or []:
        s = f'**{c["text"]}**' + (f' _({fmt_who(c)})_' if c.get('who') else '') + fmt_eff(c.get('effects'))
        if c.get('sets'):
            s += ' [+' + ', '.join(c['sets']) + ']'
        if c.get('job'):
            s += f' → работа: {c["job"]}'
        if c.get('move'):
            s += f' → переезд {c["move"]}'
        if c.get('end'):
            s += ' → ' + ('гибель' if c['end'] == 'death' else 'уехал')
        if 'check' in c:
            s += f' — шанс от {c["check"].get("base", "?")}%: ✓ {fmt_out(c["success"])}; ✗ {fmt_out(c["fail"])}'
        if c.get('outcomes'):
            s += ' — ' + '; '.join(f'{o.get("w", "?")}: {fmt_out(o)}' for o in c['outcomes'])
        if c.get('ref'):
            s += f' ({c["ref"]})'
        lines.append(s)
    return '<br>'.join(lines) or '—'


def cell(s):
    return str(s).replace('|', '\\|').replace('\n', ' ')


def main():
    files = sorted(glob.glob(os.path.join(DATA, 'events', '*.yaml')))
    seen, sections, all_events = set(), [], []
    for f in files:
        doc = yaml.safe_load(open(f, encoding='utf-8'))
        title, events = doc['title'], doc['events']
        for e in events:
            validate(e, seen)
        sections.append((title, doc.get('note', ''), events))
        all_events += events

    for f in FLAGS:
        kind = flags[f]['kind']
        if f not in flag_set and kind != 'origin':
            warnings.append(f'флаг «{f}» никто не ставит')
        if f not in flag_read and not flags[f].get('engine'):
            warnings.append(f'флаг «{f}» никто не читает')

    out = ['# «Время перемен» — каталог событий', '',
           '> Файл собран скриптом `tools/build.py` из `data/events/*.yaml`. Править данные, а не этот файл.', '',
           f'Всего событий: **{len(all_events)}**. Формат — `data/SCHEMA.md`, флаги — `data/flags.yaml`.', '']
    for title, note, events in sections:
        out += [f'## {title}', '']
        if note:
            out += [note, '']
        out += ['| ID | Тип | Когда | Где | Кто | Сцена | Выборы и исходы |', '|---|---|---|---|---|---|---|']
        for e in events:
            sc = e['text'] + fmt_eff(e.get('effects'))
            if e.get('sets'):
                sc += ' [+' + ', '.join(e['sets']) + ']'
            out.append('| ' + ' | '.join(cell(x) for x in (
                e['id'], e['type'] + (' · хроника' if e.get('fixed') else '') + (' · движок' if e.get('trigger') else '') + (f' · {e["chance"]:.0%} в год' if 'chance' in e else ''), fmt_when(e),
                ', '.join(e.get('where') or ['все']), fmt_who(e), sc, fmt_choices(e))) + ' |')
        out.append('')
    open(os.path.join(ROOT, 'EVENTS.md'), 'w', encoding='utf-8').write('\n'.join(out))

    by_type = Counter(e['type'] for e in all_events)
    print(f'Событий: {len(all_events)} в {len(files)} файлах. По типам: {dict(by_type)}')
    for title, _, events in sections:
        print(f'  {title}: {len(events)}')
    print(f'Ошибок: {len(errors)}, предупреждений: {len(warnings)}')
    for m in errors:
        print('  ОШИБКА', m)
    for m in warnings:
        print('  внимание', m)
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
