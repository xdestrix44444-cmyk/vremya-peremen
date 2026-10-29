"""Удаление событий по id: tools/remove_events.py ID ID ..."""
import sys, glob, yaml

def save(path, d):
    head = {k: v for k, v in d.items() if k != 'events'}
    out = yaml.safe_dump(head, allow_unicode=True, sort_keys=False, width=200) + 'events:\n'
    for e in d['events']:
        out += yaml.safe_dump([e], allow_unicode=True, sort_keys=False, width=200, default_flow_style=None)
    open(path, 'w').write(out)

ids = set(sys.argv[1:]); found = set()
for f in sorted(glob.glob('data/events/*.yaml')):
    d = yaml.safe_load(open(f))
    keep = [e for e in d['events'] if e['id'] not in ids]
    if len(keep) != len(d['events']):
        found |= {e['id'] for e in d['events'] if e['id'] in ids}
        d['events'] = keep; save(f, d)
if ids - found: sys.exit('нет таких id: ' + ', '.join(sorted(ids - found)))
print('удалено', len(found))
