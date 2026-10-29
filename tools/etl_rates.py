#!/usr/bin/env python3
"""Собирает data/tables/rates_monthly.csv: курс национальной валюты к доллару по месяцам, 1986–1999.

Курс записан в «рублёвом эквиваленте» (деноминации и смены валют не влияют на стоимость сбережений).
- Россия: опорные точки рыночного курса (сверить с ЦБ), между ними — плавная (геометрическая) интерполяция.
- Остальные республики: с января 1992 стартуют с российского курса и дальше обесцениваются по своей инфляции
  (data/tables/economy.csv) против долларовой (≈3% в год). Это оценка: реальные колебания курсов не учтены.
- До 1992: «сопоставимый курс» 1 ₽ = 1 у.е. для показа сумм (решение CONCEPT §3.4) и отдельно — чёрный рынок для покупки долларов.
Запуск: python3 -I tools/etl_rates.py
"""
import csv
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = os.path.join(ROOT, 'data', 'tables')
econ = {(r['region'], int(r['year'])): r for r in csv.DictReader(open(os.path.join(T, 'economy.csv')))}
REGIONS = sorted({r for r, _ in econ})

# Россия, руб. за доллар (до 1998 — старые рубли; 1998–1999 пересчитаны в старые ×1000). Сверить с ЦБ.
RU_ANCHORS = {(1992, 1): 180, (1992, 6): 125, (1992, 12): 415, (1993, 6): 1060, (1993, 12): 1247, (1994, 6): 1985,
              (1994, 9): 2596, (1994, 10): 3081, (1994, 12): 3550, (1995, 6): 4560, (1995, 12): 4640, (1996, 12): 5560,
              (1997, 12): 5960, (1998, 7): 6240, (1998, 8): 7900, (1998, 9): 16000, (1998, 12): 20650, (1999, 6): 24200,
              (1999, 12): 27000}
# чёрный рынок до 1992 (оценка)
BLACK = {(1986, 1): 4, (1988, 1): 5, (1989, 6): 10, (1990, 6): 18, (1991, 6): 40, (1991, 12): 170}


def interp(anchors, y, m):
    t = y * 12 + m
    pts = sorted((yy * 12 + mm, v) for (yy, mm), v in anchors.items())
    if t <= pts[0][0]:
        return pts[0][1]
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        if t0 <= t <= t1:
            return math.exp(math.log(v0) + (math.log(v1) - math.log(v0)) * (t - t0) / (t1 - t0))
    return pts[-1][1]


rows = []
for r in REGIONS:
    rate = None
    for y in range(1986, 2000):
        infl = float(econ[(r, y)]['inflation_pct'] or 0)
        monthly = ((1 + infl / 100) / 1.03) ** (1 / 12)
        if y == 1992 and r != 'RU':
            monthly = ((1 + infl / 100) / 1.03 / 3.45) ** (1 / 11)   # январь 1992 — общий скачок цен
        for m in range(1, 13):
            if y <= 1991:
                show, black = 1.0, interp(BLACK, y, m)
            elif r == 'RU':
                show, black = interp(RU_ANCHORS, y, m), None
            else:
                rate = interp(RU_ANCHORS, 1992, 1) if (y, m) == (1992, 1) else rate * monthly
                show, black = rate, None
            rows.append([r, y, m, round(show, 4), '' if black is None else round(black, 2)])

with open(os.path.join(T, 'rates_monthly.csv'), 'w', newline='') as g:
    w = csv.writer(g)
    w.writerow(['region', 'year', 'month', 'local_per_usd', 'black_market_per_usd'])
    w.writerows(rows)
for r in ('RU', 'UA', 'EE', 'TJ'):
    print(r, [(y, round(next(x[3] for x in rows if x[0] == r and x[1] == y and x[2] == 12))) for y in (1992, 1993, 1995, 1999)])
