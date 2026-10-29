#!/usr/bin/env python3
"""Собирает data/tables/economy.csv из выгрузок Всемирного банка (data/raw/wb_*.json) и опорных рядов ниже.

Запуск: python3 -I tools/etl_economy.py
Что здесь оценка, а что данные — см. data/tables/SOURCES.md.
"""
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, OUT = os.path.join(ROOT, 'data', 'raw'), os.path.join(ROOT, 'data', 'tables')
ISO3 = {'RUS': 'RU', 'UKR': 'UA', 'BLR': 'BY', 'UZB': 'UZ', 'KAZ': 'KZ', 'GEO': 'GE', 'AZE': 'AZ', 'LTU': 'LT', 'MDA': 'MD',
        'LVA': 'LV', 'KGZ': 'KG', 'TJK': 'TJ', 'ARM': 'AM', 'TKM': 'TM', 'EST': 'EE'}
YEARS = range(1986, 2000)


def wb(ind):
    out = {}
    for d in json.load(open(os.path.join(RAW, f'wb_{ind}.json')))[1]:
        if d['value'] is not None:
            out[(ISO3[d['countryiso3code']], int(d['date']))] = d['value']
    return out


cpi, defl, gdp_usd = wb('FP.CPI.TOTL.ZG'), wb('NY.GDP.DEFL.KD.ZG'), wb('NY.GDP.PCAP.CD')

# Россия: средняя начисленная зарплата, руб. в месяц (до 1998 — старыми рублями). Сверить с Росстатом.
RU_WAGE_RUB = {1986: 208, 1987: 215, 1988: 233, 1989: 260, 1990: 297, 1991: 548, 1992: 5995, 1993: 58663,
               1994: 220351, 1995: 472400, 1996: 790200, 1997: 950200, 1998: 1051500, 1999: 1522600}
# Рыночный курс рубля к доллару, среднее за год (до 1991 — чёрный рынок, оценка; с 1998 — пересчёт в старые рубли).
RU_USD_MARKET = {1986: 4, 1987: 4.5, 1988: 5, 1989: 10, 1990: 18, 1991: 60, 1992: 222, 1993: 932, 1994: 2204,
                 1995: 4559, 1996: 5121, 1997: 5785, 1998: 9700, 1999: 24600}
# Советские годы: зарплата республики относительно РСФСР (оценка по описанию: выше всех РСФСР и Прибалтика,
# затем Казахстан и Беларусь, остальные на 10–15% ниже среднего; вариация < 10%). Украина сверена: 244 ₽ в 1990.
SOVIET_RATIO = {'RU': 1.0, 'EE': 1.05, 'LV': 1.0, 'LT': 1.0, 'KZ': .95, 'BY': .92, 'UA': .85, 'AM': .88, 'MD': .85,
                'GE': .85, 'TM': .85, 'AZ': .82, 'UZ': .82, 'KG': .82, 'TJ': .80}
# Официальная инфляция СССР до 1990 (скрытая инфляция и дефицит сюда не входят).
SOVIET_CPI = {1986: 2, 1987: 1, 1988: 1, 1989: 2, 1990: 5}
PENSION_RATIO = {y: (.40 if y <= 1991 else .33) for y in YEARS}   # средняя пенсия к средней зарплате, оценка

rows = []
for r in ISO3.values():
    for y in YEARS:
        if y <= 1990:
            infl, src = SOVIET_CPI[y], 'СССР офиц.'
        elif (r, y) in cpi:
            infl, src = cpi[(r, y)], 'WB CPI'
        else:
            infl, src = defl.get((r, y)), 'WB дефлятор'
        wage_rub = round(RU_WAGE_RUB[y] * SOVIET_RATIO[r]) if y <= 1991 else ''
        wage_usd = ''
        if y >= 1992:
            ru = RU_WAGE_RUB[y] / RU_USD_MARKET[y]
            if r == 'RU':
                wage_usd = round(ru)
            else:
                # ближайший год, где есть ВВП и у республики, и у России
                yy = min((abs(k - y), k) for k in YEARS if (r, k) in gdp_usd and ('RU', k) in gdp_usd)[1]
                rel = gdp_usd[(r, yy)] / gdp_usd[('RU', yy)]
                # беднее России — разрыв сжимается (калибровка по Украине 1996), богаче — растягивается (Прибалтика)
                ratio = rel ** .7 if rel < 1 else rel ** 1.2
                wage_usd = round(ru * max(.15, min(6.0, ratio)))
        rows.append([r, y, '' if infl is None else round(infl, 1), src, wage_rub, wage_usd,
                     RU_USD_MARKET[y] if r == 'RU' else '', PENSION_RATIO[y],
                     'данные' if r == 'RU' else 'оценка'])

with open(os.path.join(OUT, 'economy.csv'), 'w', newline='') as g:
    w = csv.writer(g)
    w.writerow(['region', 'year', 'inflation_pct', 'inflation_source', 'wage_rub', 'wage_usd', 'ru_usd_market',
                'pension_to_wage', 'wage_quality'])
    w.writerows(rows)
miss = [(r[0], r[1]) for r in rows if r[1] >= 1992 and r[5] == '']
print('строк', len(rows), 'нет зарплаты в у.е.:', miss)
for r in rows:
    if r[0] in ('RU', 'UA', 'EE', 'TJ') and r[1] in (1993, 1996, 1999):
        print(r[0], r[1], 'инфл', r[2], 'у.е.', r[5])
