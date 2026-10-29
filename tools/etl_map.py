#!/usr/bin/env python3
"""Контуры 15 республик для фона (Natural Earth 1:110m) -> data/tables/map_paths.json.
Проекция: долгота × cos(55°), широта; от 20° в.д. до 180° (Чукотка обрезана для компактности); упрощение Дугласа — Пекера.
Запуск: python3 -I tools/etl_map.py
"""
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ISO = {'RUS': 'RU', 'UKR': 'UA', 'BLR': 'BY', 'UZB': 'UZ', 'KAZ': 'KZ', 'GEO': 'GE', 'AZE': 'AZ', 'LTU': 'LT', 'MDA': 'MD',
       'LVA': 'LV', 'KGZ': 'KG', 'TJK': 'TJ', 'ARM': 'AM', 'TKM': 'TM', 'EST': 'EE'}
gj = json.load(open(os.path.join(ROOT, 'data', 'raw', 'geo', 'ne110.geojson'), encoding='utf-8'))
K = math.cos(math.radians(55))


def proj(lon, lat):
    if lon < 0:
        lon += 360          # Чукотка за 180°
    return ((lon - 20) * K * 4, (82 - lat) * 4)


def dp(pts, eps):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-9
    i, dmax = 0, 0
    for k in range(1, len(pts) - 1):
        d = abs(dy * pts[k][0] - dx * pts[k][1] + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            i, dmax = k, d
    if dmax > eps:
        return dp(pts[:i + 1], eps)[:-1] + dp(pts[i:], eps)
    return [pts[0], pts[-1]]


out, cities = {}, {}
for f in gj['features']:
    iso = f['properties'].get('ADM0_A3') or f['properties'].get('ISO_A3')
    if iso not in ISO:
        continue
    g = f['geometry']
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    d = []
    for poly in polys:
        ring = [proj(*c) for c in poly[0] if c[0] >= 19 or c[0] < -160]
        if len(ring) < 4:
            continue
        h = len(ring) // 2                      # замкнутое кольцо упрощаем двумя половинами
        ring = dp(ring[:h + 1], 1.2)[:-1] + dp(ring[h:], 1.2)
        if len(ring) < 4:
            continue
        d.append('M' + ' '.join(f'{x:.0f},{y:.0f}' for x, y in ring) + 'Z')
    out[ISO[iso]] = ''.join(d)
xs = [float(p.split(',')[0].lstrip('MZ')) for v in out.values() for p in v.replace('Z', ' ').replace('M', ' ').split()]
json.dump({'paths': out, 'width': round(max(xs)) + 4, 'height': 240, 'proj': 'x=(lon-20)*cos55*4, y=(82-lat)*4'},
          open(os.path.join(ROOT, 'data', 'tables', 'map_paths.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print({k: len(v) for k, v in out.items()}, 'width', round(max(xs)))
