"""Create the figures and Russian report from raw browser measurements."""
import argparse
import json
from pathlib import Path
from statistics import median

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('before', type=Path)
    parser.add_argument('after', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    packs = [json.loads(path.read_text()) for path in (args.before, args.after)]
    if packs[0]['chromium'] != packs[1]['chromium']:
        raise ValueError('Browser versions differ')
    variants = ('PR №44', 'Эксперимент Vue 3')
    colors = ('#526882', '#a94e12')
    devices = ((1440, 'Компьютер · 1440 × 900'), (390, 'Мобильная эмуляция · 390 × 900 · CPU ×4'))
    rows = [{(item['width'], item['size']): item for item in pack['cells']} for pack in packs]
    sizes = sorted({r[1] for r in rows[0]})
    if rows[0].keys() != rows[1].keys():
        raise ValueError('Incomplete pairs in supplied benchmark results')
    for width, _ in devices:
        for size in sizes:
            assert all(row[width, size]['reloadVerified'] for row in rows)
    plt.rcParams.update({'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False})
    for field in ('scroll', 'memory'):
        fig, axes = plt.subplots(2, 2, figsize=(11.4, 7), layout='constrained')
        for column, (width, device) in enumerate(devices):
            top, bottom = axes[0, column], axes[1, column]
            top.set_title(device)
            for row, color, label in zip(rows, colors, variants):
                largest = row[width, sizes[-1]]
                if field == 'scroll':
                    top.plot(sizes, [row[width, size]['scroll']['p95Ms'] for size in sizes],
                             color=color, marker='o', label=label)
                    y = largest['scroll']['gapsMs']
                    bottom.plot(range(1, len(y) + 1), y, color=color, label=label, linewidth=1.25)
                else:
                    top.plot(sizes, [row[width, size]['heap'][0]['heapMiB'] for size in sizes],
                             color=color, marker='o', label=label)
                    bottom.plot([p['opens'] for p in largest['heap']],
                                [p['heapMiB'] for p in largest['heap']],
                                color=color, marker='o', label=label)
            top.set_xscale('log')
            top.set_xticks(sizes, [str(n) for n in sizes], rotation=25)
            top.set_xlabel('Рецептов в библиотеке')
            if field == 'scroll':
                top.set_ylabel('95-й процентиль интервала, мс')
                bottom.set_ylabel('Интервал rAF, мс')
                bottom.set_xlabel(f'Номер кадра · библиотека {sizes[-1]}')
                for axis in (top, bottom):
                    axis.axhline(1000 / 60, color='#758071', ls=':', label='16,7 мс')
            else:
                top.set_ylabel('JS-куча после GC, МиБ')
                bottom.set_ylabel('JS-куча после GC, МиБ')
                bottom.set_xlabel(f'Открытий карточки · библиотека {sizes[-1]}')
            for axis in (top, bottom):
                axis.grid(alpha=.2)
                axis.legend(fontsize=8)
        fig.suptitle('Интервалы кадров при прокрутке' if field == 'scroll' else 'Использованная JavaScript-куча')
        fig.savefig(args.output / (field + '.png'), dpi=145)
        plt.close(fig)

    def pair(old, new):
        return f'{old:g} → {new:g}'

    out = ['# Сравнение PR №44 и эксперимента Vue 3', '',
           f"Эталон `{packs[0]['commit']}`. Сборки проверялись в Chromium {packs[0]['chromium']} последовательно.",
           'Исходные измерения находятся в before.json и after.json. В каждой ячейке таблицы сначала приведён эталон, затем эксперимент.',
           '', '![Плавность прокрутки](scroll.png)', '', '![Потребление памяти](memory.png)', '',
           '## Методика', '',
           'Каждая комбинация размера и устройства использует отдельный пустой профиль браузера. '
           'Синтетическая библиотека содержит указанное общее число рецептов, примерно четверть составляют полуфабрикаты. '
           'У добавленного рецепта один ингредиент. В трёх начальных рецептах есть в том числе вложенный полуфабрикат и несколько ингредиентов. '
           'Пакеты загружены с локального HTTP, кэш браузера холодный, service worker заблокирован для сравнимости. '
           'Заполнение базы исключено из времени открытия. Измерение первоначального запуска включает переход к библиотеке, появление ряда и два кадра.',
           '', 'Время действий измерено в странице между вызовом действия и вторым requestAnimationFrame. '
           'Это приближение к визуальному отклику, без физического дисплея. Для поиска, фильтра, открытия, редактирования и переключения приведена медиана трёх действий, '
           'для сохранения — одно измерение с проверкой изменённого значения после перезагрузки. Переключение измеряет полный цикл «рецепты → заготовки».',
           '', '90 кадров прокрутки с шагом 64 пикселя измеряются через rAF. '
           'Для библиотеки в 100 записей прокрутка доходит до конца раньше. '
           'Длинная задача — запись PerformanceObserver (≥ 50 мс). Память измерена через CDP после принудительной сборки мусора. '
           'Единицы — МиБ занятой JS-кучи, без памяти GPU и всего процесса. Повторный сценарий открывает две карточки поочерёдно 30 раз. '
           'Один прогон на ячейку и эмуляция CPU характеризуют стенд, многочасовую работу и физический HONOR следует оценить отдельно.',
           '']
    for width, label in devices:
        out += ['## ' + label, '',
                '| Рецептов | Загрузка, мс | Поиск, мс | Папка, мс | Карточка, мс | Разделы, мс | Ингредиент, мс | Сохранение, мс |',
                '|---:|---:|---:|---:|---:|---:|---:|---:|']
        for size in sizes:
            a, b = (r[width, size] for r in rows)
            values = [pair(a['loadMs'], b['loadMs'])]
            for metric in ('search', 'filterFolder', 'openCard', 'switchPrep', 'editIngredient', 'save'):
                values.append(pair(a['actions'][metric]['settledMs'], b['actions'][metric]['settledMs']))
            out.append('| ' + ' | '.join([str(size)] + values) + ' |')
        out += ['', '| Рецептов | rAF, кадр/с | p95 кадра, мс | Кадров >32 мс / 90 | Макс. длинная задача, мс | Строк в DOM | Куча после 30 открытий, МиБ |',
                '|---:|---:|---:|---:|---:|---:|---:|']
        for size in sizes:
            a, b = (r[width, size] for r in rows)
            vals = [pair(a['scroll'][k], b['scroll'][k]) for k in ('fps', 'p95Ms', 'framesOver32')]
            vals += [pair(a[key], b[key]) for key in ('maxLongTaskMs', 'liveRows')]
            vals.append(pair(a['heap'][-1]['heapMiB'], b['heap'][-1]['heapMiB']))
            out.append('| ' + ' | '.join([str(size)] + vals) + ' |')
        out += ['']
    (args.output / 'README.md').write_text('\n'.join(out) + '\n')


if __name__ == '__main__':
    main()
