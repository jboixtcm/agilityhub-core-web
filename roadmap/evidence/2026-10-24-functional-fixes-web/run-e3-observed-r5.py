#!/usr/bin/env python3
"""Observe local-only delivery metadata while the unchanged E3 browser spec runs."""
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import time
from urllib.parse import urlsplit

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
STAGE = "e3-r5"
PROJECT = "agilityhub-functional-fixes-web-" + STAGE
CORE = PROJECT + "-core-1"
MONGO = PROJECT + "-mongo-1"
DIAGNOSTICS = OUT / "core-e3-r5-observation"


def redact(text):
    text = re.sub(r"([?&][A-Za-z_][A-Za-z0-9_-]*=)[^&\s\"'<>]+", r"\1[redacted]", text)
    text = re.sub(r"(?i)(bearer\s+)\S+", r"\1[redacted]", text)
    text = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", "[jwt-redacted]", text)
    text = re.sub(r"\b(?:sk|pk|whsec|cs|pi|evt|pm|seti|cus)_[A-Za-z0-9_]+\b", "[provider-redacted]", text)
    text = re.sub(r"\b[0-9a-fA-F]{48,}\b", "[opaque-redacted]", text)
    text = re.sub(r"(?i)((?:password|secret|token|authorization|cookie)\s*[:=]\s*)[^\s,;]+", r"\1[redacted]", text)
    text = re.sub(r"[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[recipient-redacted]", text)
    return text


def command(args, include_stderr=False):
    try:
        result = subprocess.run(args, cwd=ROOT, capture_output=True, timeout=5)
        return result.stdout + (result.stderr if include_stderr else b"") if result.returncode == 0 else None
    except subprocess.TimeoutExpired:
        return None


def mailbox():
    archive = command(["docker", "cp", CORE + ":/app/mailbox/.", "-"])
    if archive is None:
        return None
    messages = []
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:*") as contents:
        for entry in contents.getmembers():
            if not entry.isfile() or not entry.name.endswith(".json"):
                continue
            item = {"fileHash": hashlib.sha256(entry.name.encode()).hexdigest()[:16], "pending": Path(entry.name).name.startswith(".pending-")}
            try:
                message = json.load(contents.extractfile(entry))
                recipients = message.get("to", [])
                if isinstance(recipients, str):
                    recipients = [recipients]
                body = (message.get("html") or "") + " " + (message.get("text") or "")
                paths = sorted({urlsplit(url).path for url in re.findall(r"https?://[^\s\"'<>]+", body)})
                item.update(acceptedApplicant=any(str(value).lower() == "nora.e3@example.test" for value in recipients), acceptedSecondary=any(str(value).lower() == "nora.feina.e3@example.test" for value in recipients), recipientFingerprints=[hashlib.sha256(str(value).lower().encode()).hexdigest()[:16] for value in recipients], recipientCount=len(recipients), hasActivationPath="/activacio" in body, linkPaths=paths, htmlLength=len(message.get("html") or ""), textLength=len(message.get("text") or ""), tagKeys=sorted((message.get("tags") or {}).keys()), notificationId=(message.get("tags") or {}).get("notificationId"))
            except (ValueError, TypeError, OSError) as error:
                item["parseErrorType"] = type(error).__name__
            messages.append(item)
    return sorted(messages, key=lambda item: item["fileHash"])


QUERY = r'''
const account = db.accounts.findOne({email:"nora.e3@example.test"},{_id:1,status:1,emailStatus:1,locale:1});
const rows = db.domain_events.find({type:{$in:["MemberValidated","SignupRecognitionRequested"]}},{_id:1,type:1,status:1,attempts:1,nextAttemptAt:1,publishedAt:1,error:1,occurredAt:1,processedAt:1}).toArray();
const notifications = db.notifications.find({code:"N-02"},{_id:1,code:1,status:1,channel:1,createdAt:1,sentAt:1,error:1,"deliveries.channel":1,"deliveries.status":1,"deliveries.attempts":1,"deliveries.nextAttemptAt":1,"deliveries.lastError":1}).toArray();
const backlog = db.domain_events.aggregate([{$match:{status:{$ne:"PUBLISHED"}}},{$group:{_id:{type:"$type",status:"$status",error:"$error"},count:{$sum:1}}}]).toArray();
const memberships = account == null ? [] : db.memberships.find({accountId:account._id},{_id:0,status:1,roles:1}).toArray();
const tokenCount = account == null ? 0 : db.magic_link_tokens.countDocuments({accountId:account._id,purpose:"WELCOME"});
const appClub = db.clubs.findOne({"domains.host":"app.example.test"},{_id:0,status:1,"domains.host":1,"domains.type":1,"domains.status":1,"domains.primary":1});
print(JSON.stringify({account:account == null ? null : {status:account.status,emailStatus:account.emailStatus,locale:account.locale},memberships,tokenCount,appClub,events:rows,notifications,backlog}));
'''


def main():
    assert len(sys.argv) == 2, "supply the exact reviewed image ID"
    assert Path("/tmp/agilityhub-heavy.lock").is_dir(), "run through heavy.sh"
    assert not DIAGNOSTICS.exists(), "do not overwrite observation evidence"
    DIAGNOSTICS.mkdir()
    (DIAGNOSTICS / "scope.json").write_text(json.dumps({"stage":STAGE,"scope":"Local fictional demo only; observer reads mailbox metadata and selected database fields. Raw email bodies, addresses, activation query values and credentials are never written to evidence.","specUnchanged":True,"timeoutUnchanged":True},indent=2)+"\n")
    observed_logs = set()
    last_snapshot = None
    snapshots = DIAGNOSTICS / "delivery-timeline.jsonl"
    process = subprocess.Popen([sys.executable, str(OUT / "run-core.py"), STAGE, sys.argv[1]], cwd=ROOT, env=os.environ.copy())
    while process.poll() is None:
        try:
            snapshot = {"mailbox": mailbox()}
        except (OSError, tarfile.TarError, ValueError, KeyError, TypeError) as error:
            snapshot = {"mailbox": None, "mailboxObservationErrorType": type(error).__name__}
        database = command(["docker","exec",MONGO,"mongosh","--quiet","mongodb://localhost:27017/agilityhub_e1_web","--eval",QUERY])
        if database is not None:
            try:
                snapshot["database"] = json.loads(redact(database.decode()))
            except ValueError:
                snapshot["databaseParseError"] = True
        logs = command(["docker","logs","--timestamps","--tail=1000",CORE], include_stderr=True)
        if logs is not None:
            observed_logs.update(redact(logs.decode(errors="replace")).splitlines())
            (DIAGNOSTICS / "core-redacted.log").write_text("\n".join(sorted(observed_logs))+"\n")
        serialized = json.dumps(snapshot,sort_keys=True)
        if serialized != last_snapshot and (snapshot["mailbox"] is not None or "database" in snapshot):
            with snapshots.open("a") as output:
                output.write(json.dumps({"observedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),**snapshot},sort_keys=True)+"\n")
            last_snapshot = serialized
        time.sleep(1)
    raise SystemExit(process.wait())


if __name__ == "__main__":
    main()
