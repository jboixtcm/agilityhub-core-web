"""E11-W05 round 2: the literal last 40 lines (ANSI colour codes stripped) of each verification log."""

import pathlib
import re

HERE = pathlib.Path(__file__).parent
LOGS = [
    "80-r2-lint.log",
    "81-r2-typecheck.log",
    "82-r2-i18n-check.log",
    "83-r2-test.log",
    "84-r2-build.log",
    "85-r2-size.log",
    "86-r2-e2e-docker.log",
]
ANSI = re.compile(r"\x1b\[[0-9;]*m")

out = []
for name in LOGS:
    lines = ANSI.sub("", (HERE / name).read_text()).splitlines()
    out.append(f"##### `{name}` (last 40 of {len(lines)} lines)\n```\n" + "\n".join(lines[-40:]) + "\n```\n")
(HERE / "87-r2-tails.md").write_text("\n".join(out))
print(sum(len(block.encode()) for block in out))
