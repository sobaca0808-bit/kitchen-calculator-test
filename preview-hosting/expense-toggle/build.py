"""Append the per-recipe switch sandbox without replacing any previous test."""
import argparse
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pages', type=Path, required=True)
    parser.add_argument('--previous-proof', type=Path, required=True)
    parser.add_argument('--proof', type=Path, required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--pr', type=int, required=True)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('expenses_builder', ROOT / 'preview-hosting/expenses/build.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    names = ['kitchen-calculator-expense-toggle-preview-v1', 'kitchen-calculator-expense-toggle-drafts-v1',
             'kitchen-calculator-expense-toggle-photos-v1', 'kitchen-calculator-expense-toggle-import-backups-v1',
             'kitchen-calculator-expense-toggle-appearance-v1']
    module.build(args.pages, args.previous_proof, args.proof, args.source, args.pr,
                 path='expense-toggle', names=names,
                 title='<title>Переключатель расходов в карточке — отдельный тест</title>',
                 notice='ТЕСТ · Расходы в карточке · Отдельная база. Прежние калькуляторы и данные не меняются.')
