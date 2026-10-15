import json
import sys

d = json.load(open("packages/api-client/openapi/openapi.json"))
seen = set()
GENERIC = {"Bad Request", "Unauthorized", "Forbidden", "Not Found", "Conflict", "Unprocessable Entity",
           "Too Many Requests", "Client error", "Internal Server Error", "Not Implemented", "Server error"}


def refs(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == "$ref":
                yield v.split("/")[-1]
            else:
                yield from refs(v)
    elif isinstance(o, list):
        for v in o:
            yield from refs(v)


def short(s):
    if s is None:
        return None
    return json.dumps(s, separators=(",", ":"))


pats = sys.argv[1:]
todo = []
for p, v in d["paths"].items():
    if any(x in p for x in pats):
        for m, o in v.items():
            if m not in ("get", "post", "put", "patch", "delete"):
                continue
            print("=====", m.upper(), p, o.get("operationId"))
            print("  desc:", o.get("description"))
            for prm in o.get("parameters", []):
                print("  param:", prm["in"], prm["name"], short(prm.get("schema")), prm.get("required", False))
            rb = o.get("requestBody")
            if rb:
                print("  body:", short(rb["content"]))
            for code, r in o.get("responses", {}).items():
                if r.get("description") in GENERIC and not code.startswith("2"):
                    continue
                print("  ", code, r.get("description"), short(r.get("content")) if code.startswith("2") else "")
            for k in o:
                if k.startswith("x-"):
                    print("  ", k, short(o[k]))
            todo += list(refs(o))
while todo:
    n = todo.pop()
    if n in seen or n == "ApiError":
        continue
    seen.add(n)
    s = d["components"]["schemas"].get(n)
    print("#####", n, short(s))
    todo += list(refs(s))
