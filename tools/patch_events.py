"""Точечная правка событий по id: tools/patch_events.py patch.yaml
Формат патча: {ID: {путь.через.точки: значение}}; индексы списков — числа (choices.1.effects),
значение null удаляет ключ. Файлы событий пересохраняются в прежнем формате."""
import sys, glob, yaml

def save(path, d):
    head = {k: v for k, v in d.items() if k != 'events'}
    out = yaml.safe_dump(head, allow_unicode=True, sort_keys=False, width=200) + 'events:\n'
    for e in d['events']:
        out += yaml.safe_dump([e], allow_unicode=True, sort_keys=False, width=200, default_flow_style=None)
    open(path, 'w').write(out)

def setp(obj, path, val):
    ks = path.split('.')
    for k in ks[:-1]:
        obj = obj[int(k)] if isinstance(obj, list) else obj.setdefault(k, {})
    k = ks[-1]
    if isinstance(obj, list): obj[int(k)] = val
    elif val is None: obj.pop(k, None)
    else: obj[k] = val

raw = yaml.safe_load(open(sys.argv[1])); patch = {}
for k, v in raw.items():                      # допускается и «ID.путь: значение» на верхнем уровне
    i, _, p = k.partition('.')
    patch.setdefault(i, {}).update({p: v} if p else v)
left = set(patch)
for f in sorted(glob.glob('data/events/*.yaml')):
    d = yaml.safe_load(open(f)); hit = False
    for e in d['events']:
        if e['id'] in patch:
            for p, v in patch[e['id']].items(): setp(e, p, v)
            left.discard(e['id']); hit = True
    if hit: save(f, d)
if left: sys.exit('нет таких id: ' + ', '.join(sorted(left)))
print('ok', len(patch))
