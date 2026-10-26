"""Read-only consent evidence from this task's fictional local Core stack; never log credentials."""
import argparse
import json
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("project")
parser.add_argument("output")
args = parser.parse_args()
if not args.project.startswith("agilityhub-2026-10-23-functional-web-"):
    raise SystemExit("Refusing an unrelated Docker project")
image = subprocess.check_output(
    ["docker", "inspect", args.project + "-core-1", "--format", "{{.Image}}"], text=True
).strip()
assert image == "sha256:1e8060615d372dc826ea431e1cd9ef3733c440d7ce4ecc02199f708e9c6d752e"
environment = json.loads(subprocess.check_output(
    ["docker", "inspect", args.project + "-seed-1", "--format", "{{json .Config.Env}}"], text=True
))
password = next(value.split("=", 1)[1] for value in environment if value.startswith("SEED_PASSWORD="))
headers = {"Host": "admin.example.test", "Origin": "http://admin.example.test"}
body = urllib.parse.urlencode({
    "grant_type": "password", "client_id": "clubs-admin",
    "username": "admin@example.test", "password": password,
}).encode()
request = urllib.request.Request("http://127.0.0.1:18080/oauth2/token", data=body,
    headers={**headers, "Content-Type": "application/x-www-form-urlencoded"})
with urllib.request.urlopen(request, timeout=20) as response:
    token = json.load(response)["access_token"]
headers = {**headers, "Authorization": "Bearer " + token, "Accept": "application/json"}
raw = json.loads(subprocess.check_output([
    "docker", "exec", args.project + "-mongo-1", "mongosh", "--quiet",
    "mongodb://localhost:27017/agilityhub_e1_web", "--eval",
    'const club=db.clubs.findOne({slug:"canic"});'
    'print(JSON.stringify(db.members.find({clubId:club._id,memberNumber:{$in:[6,7]}},'
    '{_id:1,memberNumber:1,consents:1}).sort({memberNumber:1}).toArray()));',
], text=True))
assert [row["memberNumber"] for row in raw] == [6, 7]
rows = []
for source in raw:
    member_id = str(source["_id"])
    results = []
    for path in [f"/api/v1/members/{member_id}", f"/api/v1/members/{member_id}/consents"]:
        request = urllib.request.Request("http://127.0.0.1:18080" + path, headers=headers)
        with urllib.request.urlopen(request, timeout=20) as response:
            results.append((response.status, json.load(response)))
    detail_status, detail = results[0]
    history_status, history = results[1]
    current = detail.get("consents", {}).get("imageRights", {})
    image_history = [row for row in history if row.get("type") == "IMAGE_USE"]
    rows.append({
        "memberNumber": source["memberNumber"],
        "storedImageRights": source.get("consents", {}).get("imageRights"),
        "detailStatus": detail_status, "currentImageRights": current,
        "currentUiGranted": bool(current.get("granted")),
        "historyStatus": history_status, "imageHistory": image_history,
    })
result = {"image": image, "scope": "fictional local seed, read-only consent comparison", "members": rows}
Path(args.output).write_text(json.dumps(result, indent=2) + "\n")
for row in rows:
    stored = row["storedImageRights"]
    print(f'member {row["memberNumber"]}: stored accepted={stored.get("accepted")}, '
          f'current granted={row["currentImageRights"].get("granted", "ABSENT")}, '
          f'current UI={row["currentUiGranted"]}, '
          f'history granted={[entry.get("granted") for entry in row["imageHistory"]]}, '
          f'HTTP={row["detailStatus"]}/{row["historyStatus"]}')
