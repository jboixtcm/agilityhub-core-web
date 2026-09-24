"""Read-only provenance check for E0-W08 (git on the source root is denied in the executor sandbox).

Reads the source repository's `.git/HEAD`, `.git/refs` and `.git/index` (index format v2/v3) without
running git, and compares the git blob hash of every working file under the copied paths with the
hash recorded in the index. Prints: HEAD commit, and per path `M` (modified vs index), `??`
(untracked), `D` (in index, missing on disk). Equivalent to the worktree half of
`git status --short -- <paths>` (it does not detect staged-but-uncommitted changes).

Usage: python3 roadmap/evidence/E0-W08/provenance.py <source-root> <path> [<path> ...]
"""

import hashlib
import os
import struct
import sys


def read_head(root):
    head = open(os.path.join(root, ".git", "HEAD")).read().strip()
    if not head.startswith("ref: "):
        return head, "(detached)"
    ref = head[5:]
    ref_path = os.path.join(root, ".git", ref)
    if os.path.exists(ref_path):
        return open(ref_path).read().strip(), ref
    packed = os.path.join(root, ".git", "packed-refs")
    for line in open(packed):
        parts = line.strip().split(" ")
        if len(parts) == 2 and parts[1] == ref:
            return parts[0], ref
    return "?", ref


def read_index(root):
    data = open(os.path.join(root, ".git", "index"), "rb").read()
    sig, version, count = struct.unpack(">4sLL", data[:12])
    if sig != b"DIRC" or version not in (2, 3):
        raise SystemExit(f"unsupported index {sig!r} v{version}")
    entries = {}
    pos = 12
    for _ in range(count):
        start = pos
        sha = data[pos + 40 : pos + 60].hex()
        flags = struct.unpack(">H", data[pos + 60 : pos + 62])[0]
        pos += 62
        if version == 3 and flags & 0x4000:
            pos += 2
        end = data.index(b"\0", pos)
        name = data[pos:end].decode("utf-8")
        # fixed part + name, padded with 1..8 NUL bytes to a multiple of 8
        pos = start + ((end - start + 8) // 8) * 8
        entries[name] = sha
    return entries


def blob_sha(path):
    content = open(path, "rb").read()
    return hashlib.sha1(b"blob %d\0" % len(content) + content).hexdigest()


def main():
    root = sys.argv[1]
    paths = sys.argv[2:]
    sha, ref = read_head(root)
    print(f"HEAD {ref} {sha}")
    index = read_index(root)
    changes = 0
    tracked = 0
    for prefix in paths:
        in_index = {n: s for n, s in index.items() if n == prefix or n.startswith(prefix.rstrip("/") + "/")}
        tracked += len(in_index)
        on_disk = set()
        if os.path.isfile(os.path.join(root, prefix)):
            on_disk.add(prefix)
        for dirpath, dirnames, filenames in os.walk(os.path.join(root, prefix)):
            dirnames[:] = [d for d in dirnames if d not in ("node_modules", "dist")]
            for f in filenames:
                rel = os.path.relpath(os.path.join(dirpath, f), root)
                if f.startswith(".env"):
                    continue
                on_disk.add(rel)
        for rel in sorted(on_disk | set(in_index)):
            if rel not in in_index:
                print(f"?? {rel}")
                changes += 1
            elif rel not in on_disk:
                print(f" D {rel}")
                changes += 1
            elif blob_sha(os.path.join(root, rel)) != in_index[rel]:
                print(f" M {rel}")
                changes += 1
    print(f"tracked files checked: {tracked}; differences: {changes}")


main()
