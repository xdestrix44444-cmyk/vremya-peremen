#!/usr/bin/env python3
"""Разовая правка развилок по результатам tools/audit_choices.py и отзыву 28.10.2026.
Принцип: у каждого варианта своя цена. Счастье (happy) — «здесь и сейчас», шкалы и деньги — «потом».
Правка задаётся как (событие, текст варианта) -> новые поля варианта (заменяют effects / outcomes / check).
Запуск один раз: .venv/bin/python tools/fix_choices.py
"""
import glob
import os
import re

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FIX = {
  # --- гражданское участие: причастность и связи против безопасности ---
  ('H-86-04', 'Сидеть дома'): {'effects': {'happy': -2}},
  ('H-89-02', 'Остаться дома'): {'effects': {'views_union': 10, 'happy': -2}},
  ('H-89-06', 'Встать в цепь'): {'effects': {'ties': 3, 'close': 2, 'views_union': 20, 'happy': 6, 'health': -1}},
  ('H-89-06', 'Смотреть дома по телевизору'): {'effects': {'happy': -1}},
  ('H-90-04', 'Не выходить из дома'): {'outcomes': [{'w': 80, 'text': 'Отсиделись. Страшные три дня.', 'effects': {'happy': -4}},
                                                    {'w': 20, 'text': 'Погром дошёл до вашего двора.', 'effects': {'health': -10, 'happy': -8}}]},
  ('H-90-04', 'Уехать к родне'): {'effects': {'money_m': -1, 'close': -1, 'happy': -1}},
  ('H-90-06', 'Учить язык'): {'effects': {'know': 3, 'money_m': -0.3, 'happy': -2, 'ties': 1}},
  ('H-91-01', 'Махнуть рукой'): {'effects': {'money_m': -1, 'happy': 1}},
  ('H-91-01', 'Стоять в очереди в сберкассе'): {'effects': {'health': -1, 'happy': -3}},
  ('H-93-01', 'Поддержать Ельцина'): {'effects': {'views_reform': 10, 'ties': 3, 'close': -2}},
  ('POL-08', 'Воздержаться'): {'effects': {'ties': -3, 'happy': 2}},
  ('POL-12', 'Поддержать сильного кандидата'): {'effects': {'ties': 6, 'happy': -2, 'law': 2}},
  ('MIL-15', 'Доложить начальству'): {'effects': {'happy': 2}},
  ('BIZ-13', 'Закрыть фирму и открыть новую'): {'effects': {'money_m': -5, 'law': 5, 'ties': -3, 'happy': -3}},
  ('BIZ-22', 'Расширить'): {'effects': {'happy': -2, 'close': -2}},
  # --- быт ---
  ('DAY-01', 'Встать в очередь'): {'effects': {'happy': 3, 'close': 1, 'fit': -0.5}},
  ('DAY-01', 'Пройти мимо'): {'effects': {'happy': -1}},
  ('DAY-06', 'Ставить банку перед экраном'): {'effects': {'close': 1, 'happy': 1}},
  ('DAY-06', 'Смеяться'): {'effects': {'ties': 1, 'happy': 2}},
  ('DAY-07', 'Пойти'): {'effects': {'close': 1, 'happy': 2, 'money_m': -0.2}},
  ('DAY-08', 'Меняться'): {'effects': {'ties': 1, 'happy': 1, 'law': 1}},
  ('DAY-15', 'Поставить дверь'): {'effects': {'money_m': -1, 'happy': 1}},
  ('DAY-15', 'Обойтись'): {'outcomes': [{'w': 75, 'text': 'Пронесло.'}, {'w': 25, 'text': 'Обокрали и вас.', 'effects': {'money_m': -3, 'happy': -5}}]},
  # --- детство ---
  ('KID-10', 'Бокс или борьба'): {'effects': {'fit': 6, 'happy': 1}, 'sets': ['fighter', 'hobby_sport']},
  ('KID-10', 'Футбол или хоккей'): {'effects': {'fit': 5, 'ties': 1, 'happy': 2}, 'sets': ['hobby_sport']},
  ('KID-10', 'Музыкалка или гитара'): {'effects': {'know': 2, 'ties': 1, 'happy': 1}, 'sets': ['hobby_music']},
  ('KID-10', 'Радиокружок или компьютеры'): {'effects': {'know': 5}, 'sets': ['hobby_tech']},
  ('KID-10', 'Шахматы или олимпиады'): {'effects': {'know': 5, 'happy': -1}, 'sets': ['hobby_books']},
  ('KID-10', 'Ничего, только двор'): {'effects': {'ties': 2, 'happy': 3}},
  ('KID-11', 'Лазить на стройку'): {'outcomes': [{'w': 85, 'text': 'Вернулся грязный и счастливый.', 'effects': {'ties': 2, 'happy': 4}},
                                                {'w': 15, 'text': 'Сорвался, перелом руки.', 'effects': {'health': -5, 'happy': -3}}]},
  ('KID-16', 'Ходить'): {'effects': {'know': 5, 'ties': -1}, 'sets': ['hobby_tech']},
  ('KID-16', 'Нет'): {'effects': {'ties': 1, 'happy': 1}},
  # --- семья и отношения ---
  ('FAM-03', 'Поделить мирно'): {'effects': {'close': 4, 'money_m': 2}},
  ('FAM-03', 'Судиться'): {'outcomes': [{'w': 50, 'text': 'Отсудил своё.', 'effects': {'money_m': 8, 'close': -8}},
                                        {'w': 50, 'text': 'Суды на год, и разругался со всеми.', 'effects': {'money_m': -2, 'close': -8, 'happy': -4}}]},
  ('FAM-04', 'Уехать с ними'): {'effects': {'close': 2, 'happy': -3, 'money_m': -3}, 'sets': ['migrant'],
                                'outcomes': [{'w': 100, 'text': 'Уехали вместе: новое место, всё с нуля.', 'move': 'RU'}]},
  ('FAM-05', 'Съехаться'): {'effects': {'close': 3, 'money_m': 1, 'rel': -4, 'happy': -2}},
  ('FAM-05', 'Разменяться'): {'effects': {'close': -1, 'money_m': -1, 'rel': 3, 'happy': 2}},
  ('FAM-06', 'Помогать каждый месяц'): {'effects': {'money_m': -1, 'close': 3}},
  ('FAM-06', 'Забрать к себе'): {'effects': {'close': 5, 'money_m': -0.5, 'rel': -3, 'happy': -2}},
  ('FAM-13', 'Отпустить'): {'effects': {'happy': 2}, 'outcomes': [{'w': 60, 'text': 'Перебесился.'}, {'w': 40, 'text': 'Детская комната милиции.', 'effects': {'close': -5, 'law': 3}}]},
  ('FAM-13', 'Наказать'): {'outcomes': [{'w': 50, 'text': 'Помогло.', 'effects': {'close': -1}}, {'w': 50, 'text': 'Ушёл из дома на неделю.', 'effects': {'close': -6, 'happy': -3}}]},
  ('REL-03', 'Постараться понравиться'): {'effects': {'happy': -1}},
  ('REL-03', 'Быть собой'): {'effects': {'rel': 1, 'happy': 1}},
  ('REL-09', 'Уступить'): {'effects': {'rel': 3, 'happy': -3}},
  ('REL-09', 'Стоять на своём'): {'effects': {'happy': 2}},
  ('REL-11', 'Нет'): {'effects': {'rel': -6, 'happy': 1}},
  ('REL-24', 'Каждые выходные'): {'effects': {'close': 4, 'money_m': -0.5, 'happy': 2}},
  ('REL-24', 'Редко'): {'effects': {'close': -3, 'happy': -1}},
  ('REL-26', 'Отговорить'): {'effects': {'rel': -5, 'money_m': -2}},
  ('REL-26', 'Жить на два города'): {'effects': {'rel': -8, 'money_m': 2, 'happy': -2}},
  # --- работа ---
  ('SCI-02', 'Защищаться'): {'effects': {'happy': -2, 'money_m': -1}},
  ('SCI-04', 'Подать заявку'): {'effects': {'happy': -1}},
  ('EDU-02', 'Бастовать'): {'effects': {'law': 3, 'close': -1}},
  ('EDU-02', 'Работать'): {'effects': {'ties': -2}},
  ('EDU-04', 'Перейти'): {'effects': {'money_m': 3, 'ties': -3, 'happy': -1}},
  ('EDU-04', 'Остаться'): {'effects': {'happy': 1, 'ties': 1}},
  ('MEDIA-03', 'Перейти'): {'effects': {'fame': 10, 'money_m': 3, 'close': -2, 'happy': -1}},
  ('VIL-03', 'Ничего не брать'): {'effects': {'ties': 2}},
  ('IND-05', 'Взять продукцией и продавать на рынке'): {'effects': {'money_m': -1, 'ties': 1, 'happy': -2, 'fit': -1}},
  ('PEN-03', 'Пойти'): {'effects': {'ties': 2, 'views_reform': -10, 'health': -1, 'happy': 2}},
  ('PEN-06', 'Остаться дома'): {'effects': {'close': -1, 'happy': 1}},
  ('REP-KG-03', 'Сдавать'): {'effects': {'money_m': 2, 'close': -2, 'happy': -1}},
  ('REP-EE-02', 'Голосовать'): {'effects': {'views_union': -10, 'ties': 2, 'law': 3}},
  ('JOB-14', 'Взяться'): {'effects': {'money_m': 1, 'fit': 1, 'health': -1, 'happy': -1, 'close': -1}},
  ('CAR-02', 'Пойти'): {'effects': {'know': 4, 'ties': 1, 'close': -1, 'happy': -1}},
  # --- долги ---
  ('DEBT-01', 'Занять у родни'): {'effects': {'money_m': 1, 'close': -3, 'happy': -1}},
  ('DEBT-01', 'Занять у друзей'): {'effects': {'money_m': 1, 'ties': -2, 'happy': -1}},
  ('DEBT-01', 'Продать вещь'): {'effects': {'money_m': 0.7, 'happy': -2}},
  ('DEBT-01', 'Ужаться'): {'effects': {'health': -1, 'happy': -2}},
  ('DEBT-05', 'Заложить'): {'outcomes': [{'w': 70, 'text': 'Выкупил через месяц.', 'effects': {'money_m': 1, 'happy': -1}},
                                          {'w': 30, 'text': 'Выкупить не смог, вещь ушла.', 'effects': {'money_m': 1, 'happy': -4}}]},
  ('DEBT-08', 'Избегать'): {'effects': {'close': -4, 'money_m': 1}},
  ('DEBT-17', 'Дать'): {'effects': {'money_m': -2}, 'outcomes': [{'w': 65, 'text': 'Вернул в срок и с благодарностью.', 'effects': {'money_m': 2, 'ties': 3, 'happy': 1}},
                                                                  {'w': 35, 'text': 'Не вернул.', 'effects': {'ties': -1, 'happy': -2}, 'sets': ['lent_unpaid']}]},
  ('DEBT-17', 'Дать меньше'): {'effects': {'money_m': -0.5}, 'outcomes': [{'w': 80, 'text': 'Вернул.', 'effects': {'money_m': 0.5, 'ties': 1}},
                                                                          {'w': 20, 'text': 'Не вернул, но сумма небольшая.', 'effects': {'happy': -1}}]},
  ('DEBT-17', 'Отказать'): {'effects': {'ties': -3, 'happy': -1}},
  # --- здоровье ---
  ('HLT-01', 'Отлежаться на больничном'): {'effects': {'money_m': -0.3, 'happy': 1}},
  ('HLT-01', 'Перенести на ногах'): {'effects': {'happy': -1},
     'outcomes': [{'w': 70, 'text': 'Обошлось, но неделю как в тумане.', 'effects': {'health': -2}},
                  {'w': 30, 'text': 'Осложнение на сердце или лёгкие.', 'effects': {'health': -8}, 'sets': ['chronic']}]},
  ('HLT-05', 'Районная стоматология без наркоза'): {'effects': {'happy': -3}},
  ('HLT-05', 'Платная клиника'): {'effects': {'money_m': -1}},
  ('HLT-05', 'Терпеть'): {'effects': {'happy': -1}, 'outcomes': [{'w': 60, 'text': 'Само прошло.'}, {'w': 40, 'text': 'Флюс, больница.', 'effects': {'health': -4, 'happy': -3}}]},
  ('HLT-13', 'Втянуться'): {'effects': {'money_m': -0.3, 'close': -1}},
  ('TAL-10', 'Участвовать'): {'effects': {'money_m': -0.5}},
  # --- отдых ---
  ('LEI-02', 'Турция'): {'effects': {'money_m': -3, 'health': 4, 'close': 4, 'happy': 5}},
  ('LEI-02', 'Египет'): {'effects': {'money_m': -4, 'health': 5, 'close': 4, 'happy': 7}},
  ('LEI-02', 'Дача'): {'effects': {'fit': 2, 'close': 1, 'happy': 1}},
  ('LEI-01', 'Сочи дикарём'): {'effects': {'money_m': -1, 'health': 3, 'close': 1, 'happy': 5}},
  ('LEI-01', 'На даче'): {'effects': {'fit': 2, 'close': 1, 'happy': 1}},
  ('LEI-03', 'Позвать всех'): {'effects': {'money_m': -1, 'ties': 2, 'close': 2, 'happy': 4}},
  ('LEI-03', 'Тихо дома'): {'effects': {'close': 1, 'happy': 1}},
  ('LEI-06', 'Поехать'): {'effects': {'money_m': -0.3, 'ties': 2, 'close': 1, 'fit': 1, 'happy': 4}},
  ('LEI-06', 'Отказаться'): {'effects': {'ties': -1, 'happy': -1}},
  ('LEI-07', 'Пойти'): {'effects': {'money_m': -0.5, 'ties': 2, 'happy': 4}},
  ('LEI-08', 'Читать по вечерам'): {'effects': {'know': 2, 'happy': 2, 'ties': -1}},
  ('LEI-08', 'Некогда'): {'effects': {'money_m': 0.2}},
  # --- привычки: удовольствие сейчас, расплата потом ---
  ('HAB-01', 'Не пить'): {'effects': {'ties': -1, 'happy': -1}},
}
# выбор «Выпить» в гараже: явная цена
HAB01_DRINK = {'effects': {'happy': 3, 'ties': 1}}

n = 0
MATCHED = set()
for f in sorted(glob.glob(os.path.join(ROOT, 'data', 'events', '*.yaml'))):
    src = open(f, encoding='utf-8').read()
    doc = yaml.safe_load(src)
    changed = False
    for e in doc['events']:
        for c in e.get('choices') or []:
            fx = FIX.get((e['id'], c['text']))
            if e['id'] == 'HAB-01' and c['text'] == 'Выпить':
                fx = HAB01_DRINK
            if not fx:
                continue
            MATCHED.add((e['id'], c['text']))
            for k, v in fx.items():
                if k == 'effects':
                    c['effects'] = {**(c.get('effects') or {}), **v} if e['id'] == 'HAB-01' and c['text'] == 'Выпить' else v
                elif k == 'outcomes':
                    c.pop('check', None); c.pop('success', None); c.pop('fail', None)
                    c['outcomes'] = v
                else:
                    c[k] = v
            changed = True
            n += 1
    if changed:
        # переписываем файл в блочном виде, сохраняя заголовок и якоря неважны (PRIV не трогаем)
        assert 'voucher_choices' not in doc, f
        head = {'title': doc['title'], 'note': doc.get('note', '')}
        out = yaml.safe_dump(head, allow_unicode=True, sort_keys=False, width=200) + 'events:\n'
        for e in doc['events']:
            out += yaml.safe_dump([e], allow_unicode=True, sort_keys=False, width=200, default_flow_style=None)
        open(f, 'w', encoding='utf-8').write(out)
print('исправлено вариантов:', n, 'из', len(FIX) + 1)
print('не найдены:', [k for k in FIX if k not in MATCHED])
