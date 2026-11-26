"""Assemble the distinct workspace review beside the recorded PR43 publication."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'sintez-pr43'))
import build as previous

ROUTE = 'sintez-workspace-review'
parser = argparse.ArgumentParser()
parser.add_argument('--source-tree', type=Path, required=True)
parser.add_argument('--source', required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--zip', type=Path, required=True)
parser.add_argument('--pr42', type=Path)
parser.add_argument('--pr43', type=Path)
parser.add_argument('--report', type=Path)
args = parser.parse_args()

# The approved PR43 packager provides the namespacing, PWA integrity and ZIP.
candidate_builder = Path(previous.__file__).read_text()
for old, new in (('kitchen-calculator-pr43', 'kitchen-calculator-workspace-review'),
                 ("ROUTE = 'sintez-pr43'", f'ROUTE = {ROUTE!r}'),
                 (previous.SOURCE, args.source),
                 ("assert len(metadata['files']) == 79", "assert len(metadata['files']) == 80")):
    assert old in candidate_builder
    candidate_builder = candidate_builder.replace(old, new)
scope = {'__file__': previous.__file__, '__name__': 'workspace_candidate'}
exec(compile(candidate_builder, previous.__file__, 'exec'), scope)
if not args.pr42:
    scope['make_candidate'](args.source_tree, args.output, args.zip)
    raise SystemExit(0)

published, protected = previous.restore(args.output, args.pr42)
receipt = json.loads(args.pr43.read_text())
assert receipt['source_commit'] == previous.SOURCE and receipt['url'] == previous.URL
assert published == receipt['preserved_https']
prior_route = receipt['release_https']
assert len(prior_route) == 81 and all(name.startswith('sintez-pr43/') for name in prior_route)

def retain(item):
    name, digest = item
    path = args.output / name
    assert path.resolve().is_relative_to(args.output.resolve())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(previous.read_live(name, digest))

with ThreadPoolExecutor(max_workers=6) as pool:
    list(pool.map(retain, prior_route.items()))
protected.update(prior_route)
published.update(prior_route)
assert len(protected) == 1311 and len(published) == 1058
target = args.output / ROUTE
scope['make_candidate'](args.source_tree, target, args.zip)
(target / args.zip.name).write_bytes(args.zip.read_bytes())
fresh = {p.relative_to(args.output).as_posix(): previous.sha(p.read_bytes())
         for p in target.rglob('*') if p.is_file()}
assert len(fresh) == 82
assert all(previous.sha((args.output / name).read_bytes()) == digest for name, digest in protected.items())
args.report.write_text(json.dumps({'source_commit': args.source, 'url': previous.URL,
    'before_https': published, 'preserved_https': published, 'release_https': fresh,
    'previous_files': len(protected)}, indent=2) + '\n')
