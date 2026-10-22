"""E10-W02 round 2: the schemas `BrandingResponse` reaches, adopted snapshot vs staged one."""

import json

ADOPTED = "packages/api-client/openapi/openapi.json"
STAGED = "packages/api-client/openapi/openapi.next.json"


def collect(node, schemas, seen):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "$ref":
                name = value.split("/")[-1]
                if name not in seen:
                    seen.add(name)
                    collect(schemas.get(name, {}), schemas, seen)
            else:
                collect(value, schemas, seen)
    elif isinstance(node, list):
        for item in node:
            collect(item, schemas, seen)


with open(ADOPTED, encoding="utf-8") as handle:
    adopted = json.load(handle)["components"]["schemas"]
with open(STAGED, encoding="utf-8") as handle:
    staged = json.load(handle)["components"]["schemas"]
names = {"BrandingResponse"}
collect(staged["BrandingResponse"], staged, names)
collect(adopted["BrandingResponse"], adopted, names)
changed = 0
for name in sorted(names):
    if json.dumps(adopted.get(name), sort_keys=True) != json.dumps(staged.get(name), sort_keys=True):
        changed += 1
        print("changed:", name)
        print("  adopted:", json.dumps(adopted.get(name))[:800])
        print("  staged: ", json.dumps(staged.get(name))[:800])
print(f"{len(names)} schemas reached from BrandingResponse, {changed} changed")
