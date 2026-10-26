#!/usr/bin/env python3
"""Render exact final verification commands and retained forty-line tails."""
import json
from pathlib import Path
folder=Path(__file__).resolve().parent
names=['40-final-ci','41-full-browser-final','43-final-bundle-size','44-final-literals','45-final-format','29-i18n-postfix','core-e1-r3','core-e4w16-r2','core-e9-r2','core-e10-r2','core-auth-r2']
parts=['# Final command evidence\n\nCommands run in `/Users/jordib/dev/agilityhub/agilityhub-core-web`. Heavy executions use the shared host lock; their full logs and input manifests are retained beside this file. API and the other browser lanes retain their own command appendices.\n']
for name in names:
    summary_path=folder/(name+'.summary.json')
    if not summary_path.exists():
        raise SystemExit('Incomplete: '+name)
    summary=json.loads(summary_path.read_text())
    if summary['commandExitCode']!=0 or summary['inputsUnchanged'] is not True:
        raise SystemExit('Not accepted: '+name)
    parts += [f'## {name}\n', '```sh\n'+(folder/(name+'.command')).read_text().strip()+'\n```\n', f'Exit: {summary["commandExitCode"]}. Inputs: {summary["inputCount"]}, unchanged. Full output: [{name}.log]({name}.log).\n', '```text\n'+'\n'.join((folder/(name+'.log')).read_text().splitlines()[-40:])+'\n```\n']
parts += ['The i18n check ran before the additional booking test file (945 inputs). The subsequently changed files are unrelated to translations or its validator; the final CI gate tests the same translation sources. The 946-input manifest covers these complete CI/mock-browser gates and earlier passing real-browser groups. E3-r5/E6/E7 use948 inputs after the three-file test-runner readiness correction (48-harness-only-delta.json). E8-r3 uses the final948-input manifest54 after the single E8 passwordless-owner fixture correction (54-e8-fixture-delta.json). Application code and API image remain identical; E8 preserves all financial, locale and permission assertions while using the supported login method of its selected owner. The six additional readiness-helper tests are recorded separately in the web lane.\n']
(folder/'FINAL_COMMANDS.md').write_text('\n'.join(parts))
print('FINAL_COMMANDS.md written; all listed gates passed')
