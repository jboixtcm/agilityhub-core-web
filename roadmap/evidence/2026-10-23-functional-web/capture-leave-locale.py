"""Read-only locale probe against this task's fictional local member; credentials stay in memory."""
import json
import base64
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request

project = "agilityhub-2026-10-23-functional-web-core-e8"
image = subprocess.check_output(["docker", "inspect", project + "-core-1", "--format", "{{.Image}}"], text=True).strip()
assert image == "sha256:1e8060615d372dc826ea431e1cd9ef3733c440d7ce4ecc02199f708e9c6d752e"
environment = json.loads(subprocess.check_output(["docker", "inspect", project + "-seed-1", "--format", "{{json .Config.Env}}"], text=True))
password = next(value.split("=", 1)[1] for value in environment if value.startswith("SEED_PASSWORD="))
headers = {"Host": "app.example.test", "Origin": "http://app.example.test"}
body = urllib.parse.urlencode({"grant_type": "password", "client_id": "clubs-app", "username": "member.5@example.test", "password": password}).encode()
request = urllib.request.Request("http://127.0.0.1:18080/oauth2/token", data=body, headers={**headers, "Content-Type": "application/x-www-form-urlencoded"})
with urllib.request.urlopen(request, timeout=15) as response:
    token = json.load(response)["access_token"]
claims = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=="))
token_locale = claims.get("locale")
headers = {**headers, "Authorization": "Bearer " + token, "Accept": "application/json"}
rows = []
for locale in ["ca", "es", "en"]:
    request = urllib.request.Request("http://127.0.0.1:18080/api/v1/me/leave-requests", headers={**headers, "Accept-Language": locale})
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.load(response)
        rows.append({"acceptLanguage": locale, "contentLanguage": response.headers.get("Content-Language"), "status": response.status, "reasons": payload.get("reasons")})
result = {"scope": "fictional local normal member, real GET with explicit language headers", "image": image, "tokenLocale": token_locale, "responses": rows}
Path("roadmap/evidence/2026-10-23-functional-web/core-e8/leave-locale-probe.json").write_text(json.dumps(result, indent=2) + "\n")
print("Token locale:", token_locale)
for row in rows:
    print(row["acceptLanguage"], row["status"], "Content-Language:", row["contentLanguage"], [reason["label"] for reason in row["reasons"]])
