"""E10-W02 step 3: every MSW route of the console (S17) is an operation of the adopted snapshot,
and pending.json carries no overlay. Run from the repository root:
python3 roadmap/evidence/E10-W02/s17-routes-check.py"""

import json
import re

snapshot = json.load(open("packages/api-client/openapi/openapi.json"))
pending = json.load(open("packages/api-client/openapi/pending.json"))
source = open("packages/api-client/src/mocks/console-handlers.ts").read()
routes = re.findall(r'http\.(get|post|put|patch|delete)\(\s*"\*(/api/v1/[^"]+)"', source)


def normalized(path):
    return re.sub(r"\{[^}]+\}", "{}", re.sub(r":[A-Za-z]+", "{}", path))


published = {}
for path, item in snapshot["paths"].items():
    for method in item:
        published.setdefault(normalized(path), set()).add(method)

missing = []
for method, path in routes:
    found = method in published.get(normalized(path), set())
    print(f"{method.upper():6} {path:70} {'in openapi.json' if found else 'NOT IN SNAPSHOT'}")
    if not found:
        missing.append((method, path))
print()
print(
    "pending.json: "
    f"paths={len(pending.get('paths', {}))} "
    f"schemas={len(pending.get('components', {}).get('schemas', {}))} "
    f"overlays={len(pending.get('x-schema-overlays', {}))}"
)
print(f"console MSW routes: {len(routes)}, not in the adopted snapshot: {len(missing)}")
raise SystemExit(1 if missing else 0)
