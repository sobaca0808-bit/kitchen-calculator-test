"""Append the unified review build without changing any previous calculator."""
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
    names = ['kitchen-calculator-final-preview-v1', 'kitchen-calculator-final-drafts-v1',
             'kitchen-calculator-final-photos-v1', 'kitchen-calculator-final-import-backups-v1',
             'kitchen-calculator-final-appearance-v1']
    module.build(args.pages, args.previous_proof, args.proof, args.source, args.pr,
                 path='final', names=names,
                 title='<title>Кухонный калькулятор — единая версия перед выпуском</title>',
                 notice='ФИНАЛЬНЫЙ ТЕСТ · Все согласованные функции · Отдельная база. Основная версия и прежние стенды не меняются.')
