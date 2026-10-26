#!/usr/bin/env python3
"""Read-only Compose merge check; prints no environment values except proxy trust."""
import json
from pathlib import Path
import subprocess
import sys
base = Path(__file__).resolve().parent
root = base.parents[2]
result = subprocess.run([sys.executable, str(base/'with-https-compose.py'), 'docker', 'compose',
    '-f', str(root/'scripts/core-stack/docker-compose.yml'), 'config', '--no-interpolate', '--format', 'json'],
    capture_output=True, text=True, cwd=root)
if result.returncode:
    print(result.stderr)
    raise SystemExit(result.returncode)
doc = json.loads(result.stdout[result.stdout.find('{'):])
values = doc['services']['core']['environment']
if isinstance(values, list):
    values = dict(item.split('=', 1) for item in values)
record = {'exitCode': 0, 'trustedProxyPattern': values['TRUSTED_PROXY_PATTERN'],
    'proxyNetwork': doc['services']['playwright']['networks'], 'network': doc['networks']['default'],
    'sourceMount': next(x['source'] for x in doc['services']['playwright']['volumes'] if x['target']=='/src')}
assert record['trustedProxyPattern'] == r'172\.31\.247\.11'
assert record['proxyNetwork']['default']['ipv4_address'] == '172.31.247.11'
assert record['sourceMount'] == str(root)
print(json.dumps(record, indent=2))
