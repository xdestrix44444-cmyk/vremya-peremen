import csv, gzip, sys
raw, out = sys.argv[1], sys.argv[2]
ISO = {'RU','UA','BY','UZ','KZ','GE','AZ','LT','MD','LV','KG','TJ','AM','TM','EE'}
# смертность: qx по возрастным группам, мужчины и женщины, 1986–1999
with gzip.open(f'{raw}/WPP2024_Life_Table_Abridged_Medium_1950-2023.csv.gz','rt',encoding='utf-8-sig') as f, open(f'{out}/mortality_qx.csv','w',newline='') as g:
    w = csv.writer(g); w.writerow(['region','year','sex','age_start','age_span','qx','ex'])
    for r in csv.DictReader(f):
        if r['ISO2_code'] in ISO and 1986 <= int(r['Time']) <= 1999 and r['Sex'] in ('Male','Female'):
            w.writerow([r['ISO2_code'], r['Time'], 'm' if r['Sex']=='Male' else 'f', r['AgeGrpStart'], r['AgeGrpSpan'], round(float(r['qx']),6), round(float(r['ex']),2)])
# население на 1 июля 1986, пятилетние группы, тыс. человек
with gzip.open(f'{raw}/WPP2024_PopulationByAge5GroupSex_Medium.csv.gz','rt',encoding='utf-8-sig') as f, open(f'{out}/population_1986.csv','w',newline='') as g:
    w = csv.writer(g); w.writerow(['region','age_start','male_k','female_k'])
    for r in csv.DictReader(f):
        if r['ISO2_code'] in ISO and r['Time'] == '1986':
            w.writerow([r['ISO2_code'], r['AgeGrpStart'], r['PopMale'], r['PopFemale']])
