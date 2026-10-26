#!/usr/bin/env python3
"""Scan the two current user-facing reports using private temporary copies."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

folder=Path(__file__).resolve().parent
base=Path('/Users/jordib/Dropbox/Documents/SOFTWARE_CANIC/05-desenvolupament')
api=Path('/Users/jordib/dev/agilityhub/agilityhub-core-api')
scanner=api/'.local/security-tools/gitleaks-8.30.1'
paths=[base/'CORRECCIONS_I_REGRESSIO_LOCAL_2026-10-24.md',base/'INCIDENCIES_OBERTES.md']
hashes={str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
with tempfile.TemporaryDirectory(prefix='agilityhub-final-doc-scan-') as temporary:
 temp=Path(temporary);source=temp/'input';source.mkdir()
 for path in paths:shutil.copyfile(path,source/path.name)
 findings=temp/'findings.json'
 command=[str(scanner),'dir','--no-banner','--redact','--config',str(api/'.gitleaks.toml'),'--report-format','json','--report-path',str(findings),str(source)]
 completed=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 rows=json.loads(findings.read_text()) if findings.exists() else []
 result={'scannerVersion':subprocess.check_output([str(scanner),'version'],text=True).strip(),'exitCode':completed.returncode,'findings':len(rows),'locations':[{'file':Path(row['File']).name,'line':row['StartLine'],'rule':row['RuleID']} for row in rows],'inputHashes':hashes,'inputsUnchanged':all(hashlib.sha256(Path(path).read_bytes()).hexdigest()==value for path,value in hashes.items()),'scope':'Only the two edited user-facing master Markdown reports; private copies deleted after scanning.'}
 destination=folder/sys.argv[1]
 assert not destination.exists()
 destination.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({key:result[key] for key in ('scannerVersion','exitCode','findings','inputsUnchanged')},indent=2))
 raise SystemExit(completed.returncode if result['inputsUnchanged'] else 99)
