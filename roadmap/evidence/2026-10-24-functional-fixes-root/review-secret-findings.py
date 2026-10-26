#!/usr/bin/env python3
"""Verify retained scan hits against actual SHA-256 inputs; do not exempt other values."""
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
API = ROOT.parent / 'agilityhub-core-api'
scan = json.loads(Path(sys.argv[1]).read_text())
reviewed = []
unresolved = []
for repository in scan['results']:
    for item in repository['locations']:
        path = ROOT / item['file']
        line = path.read_text().splitlines()[item['line'] - 1].strip().rstrip(',')
        try:
            entry = json.loads('{' + line + '}')
        except (json.JSONDecodeError, TypeError):
            unresolved.append(item); continue
        if len(entry) != 1:
            unresolved.append(item); continue
        field, value = next(iter(entry.items()))
        target = None
        if item['file'].endswith('/48-harness-final-inputs.json'):
            target = ROOT / field
        elif item['file'].endswith(('/19-contract-and-seed-final.json', '/47-api-contract-integrity.json')):
            target = {'apiOpenapi': API / 'docs/openapi/openapi.json', 'webOpenapi': ROOT / 'packages/api-client/openapi/openapi.json'}.get(field)
        if item['rule'] != 'generic-api-key' or not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value) or target is None or not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != value:
            unresolved.append(item); continue
        reviewed.append({**item, 'classification': 'source SHA-256, not a credential', 'verifiedSource': str(target)})
result = {'scan': str(Path(sys.argv[1]).resolve()), 'scannerVersion': scan['scannerVersion'], 'rawFindings': sum(r['findings'] for r in scan['results']), 'verifiedDigestFalsePositives': len(reviewed), 'unresolved': unresolved, 'reviewed': reviewed, 'policy': 'No scanner rule or source allowlist changed; each flagged 64-hex value is rehashed from its named current source.'}
Path(sys.argv[2]).write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({k:result[k] for k in ('rawFindings','verifiedDigestFalsePositives','unresolved')},indent=2))
raise SystemExit(1 if unresolved else 0)
