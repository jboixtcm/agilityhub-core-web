"""E11-W05 round 2: put the round-2 report (88 + 87's tails + 89) at the end of the Executor report."""

import pathlib

HERE = pathlib.Path(__file__).parent
TASK = HERE.parents[1] / "tasks" / "E11-W05.md"
MARK = "\n## Organizer verification\n"

text = TASK.read_text()
assert text.count(MARK) == 1
report = "".join((HERE / name).read_text() for name in ("88-r2-report.md", "87-r2-tails.md", "89-r2-report-end.md"))
head, tail = text.split(MARK)
assert "### Round 2 report (" not in head
TASK.write_text(head.rstrip("\n") + "\n\n" + report.rstrip("\n") + "\n" + MARK + tail)
print(len(TASK.read_text().encode()))
