# Security recheck — 26 October 2026

Local-only follow-up for the isolated Clubs demo. No deployment, registry push, provider action, source dependency change or image rebuild. The scanned image is the same immutable local image used by the functional suites, not an image inferred from a mutable remote tag.

## Result

- Exact image: `sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9`, local tag `agilityhub-core-api:review-fixes-20261024`, `linux/arm64`.
- Trivy 0.74.0; vulnerability database update, Java database update and offline image scan all exit **0**. The policy gate also exits **0**.
- **0 HIGH, 0 CRITICAL, 55 MEDIUM, 4 LOW, 0 UNKNOWN** findings across **59 package/advisory occurrences and 48 distinct advisory IDs**. These units must not be added together as independent defects.
- Both databases were actually refreshed on 26 October: vulnerability dataset `UpdatedAt=2026-10-26T01:20:01.38093772Z`; Java dataset `UpdatedAt=2026-10-26T00:59:12.444835411Z`. Before/after download timestamps and scanner hash are recorded in `40-image-scan-summary.json`.
- `44-image-scan-delta.json` compares the same image with the retained 24 October scan: **no added, removed or severity-changed package findings**. The raw scanner report is `42-image-scan-raw.json`.

This is advisory-database coverage of the local arm64 image, not a claim that the software has no vulnerabilities. The chosen hosted architecture must be built and scanned separately if different. Public DNS/TLS, real provider delivery and Learn federation are outside this local run.

## Maintenance observations

The current scanner lists fixes for two medium findings: `zlib1g` (CVE-2026-85091, fixed package `1:1.3.dfsg+really1.3.1-1ubuntu3.2`) and `ognl:ognl` (CVE-2026-113730, fixed version `3.4.13`). They remain recorded maintenance candidates, not silently suppressed findings. Other retained findings and their scanner-provided fix status remain in the full report.

Read-only source review confirms that both Thymeleaf engines resolve classpath templates, with fixed `email/system` and `email/notification` template names. Message data enters the template context. No explicit application-source calls to `ProcessBuilder`, `Runtime.getRuntime`, `gzwrite` or GnuTLS were found. Docker's healthcheck invokes curl over loopback HTTP. These observations narrow the known application paths but do not prove all transitive/native use impossible. `source-triage.json` and its separate input hashes retain the scope and owning sources.

## Secret-scanner preparation

Gitleaks **8.30.1** was downloaded from its official GitHub release, verified against the official release checksum, extracted as a single regular executable, and its version was executed. The local binary is `/Users/jordib/dev/agilityhub/agilityhub-core-api/.local/security-tools/gitleaks-8.30.1`; `gitleaks-install.json` contains package/binary hashes and URLs. The installer initially hit a Python local CA-chain problem and then used curl with normal system certificate verification; no TLS verification was disabled. No package manager or global installation was modified.

The coordinator owns the final changed-source and evidence secret scans. Installing this scanner alone is not a secret-scan result.

## Exact commands and tails

All image scan/update commands were run within the shared `heavy.sh` lock with `HEAVY_WAIT_MIN=120`. Analysis used the exact local image ID and `--offline-scan` after the recorded update attempts. Each full output is preserved beside its command and exit file.

### 40-update-vulnerability-db — exit 0

```sh
env TRIVY_CACHE_DIR=/Users/jordib/dev/agilityhub/agilityhub-core-api/.local/security-tools/db /Users/jordib/dev/agilityhub/agilityhub-core-api/.local/security-tools/trivy-0.74.0 image --skip-version-check --no-progress --timeout 10m --download-db-only
```

Last 40 lines (or complete shorter output):

```text
2026-10-26T08:32:18+01:00	INFO	[vulndb] Need to update DB
2026-10-26T08:32:18+01:00	INFO	[vulndb] Downloading vulnerability DB...
2026-10-26T08:32:18+01:00	INFO	[vulndb] Downloading artifact...	repo="mirror.gcr.io/aquasec/trivy-db:2"
2026-10-26T08:32:25+01:00	INFO	[vulndb] Artifact successfully downloaded	repo="mirror.gcr.io/aquasec/trivy-db:2"
```

### 41-update-java-db — exit 0

```sh
env TRIVY_CACHE_DIR=/Users/jordib/dev/agilityhub/agilityhub-core-api/.local/security-tools/db /Users/jordib/dev/agilityhub/agilityhub-core-api/.local/security-tools/trivy-0.74.0 image --skip-version-check --no-progress --timeout 10m --download-java-db-only
```

Last 40 lines (or complete shorter output):

```text
2026-10-26T08:32:25+01:00	INFO	[javadb] Downloading Java DB...
2026-10-26T08:32:25+01:00	INFO	[javadb] Downloading artifact...	repo="mirror.gcr.io/aquasec/trivy-java-db:1"
2026-10-26T08:33:05+01:00	INFO	[javadb] Artifact successfully downloaded	repo="mirror.gcr.io/aquasec/trivy-java-db:1"
2026-10-26T08:33:05+01:00	INFO	[javadb] Java DB is cached for 3 days. If you want to update the database more frequently, "trivy clean --java-db" command clears the DB cache.
```

### 42-image-scan — exit 0

```sh
env TRIVY_CACHE_DIR=/Users/jordib/dev/agilityhub/agilityhub-core-api/.local/security-tools/db /Users/jordib/dev/agilityhub/agilityhub-core-api/.local/security-tools/trivy-0.74.0 image --skip-version-check --no-progress --timeout 10m --skip-db-update --skip-java-db-update --offline-scan --image-src docker --scanners vuln --list-all-pkgs --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL --format json --output /Users/jordib/dev/agilityhub/agilityhub-core-web/roadmap/evidence/2026-10-26-functional-fixes-security/42-image-scan-raw.json sha256:9f8a73041597a46df54ec22789dba793e9d6d20b7454fae61a9238d1824753a9
```

Last 40 lines (or complete shorter output):

```text
2026-10-26T08:33:05+01:00	INFO	[vuln] Vulnerability scanning is enabled
2026-10-26T08:33:07+01:00	INFO	Detected OS	family="ubuntu" version="26.04"
2026-10-26T08:33:07+01:00	INFO	[ubuntu] Detecting vulnerabilities...	os_version="26.04" pkg_num=140
2026-10-26T08:33:07+01:00	INFO	Number of language-specific files	num=1
2026-10-26T08:33:07+01:00	INFO	[jar] Detecting vulnerabilities...
```

### gitleaks-install — exit 0

```sh
python3 roadmap/evidence/2026-10-26-functional-fixes-security/install-gitleaks.py
```

Last 40 lines (or complete shorter output):

```text
{
  "version": "8.30.1",
  "path": "/Users/jordib/dev/agilityhub/agilityhub-core-api/.local/security-tools/gitleaks-8.30.1",
  "packageUrl": "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_darwin_arm64.tar.gz",
  "checksumsUrl": "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_checksums.txt",
  "packageSha256": "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
  "binarySha256": "ba52fb1bfabbcde42f032afad3d6e0b19dff8ed105229a16e7caa338bbc0e84f",
  "checksumVerified": true,
  "method": "Official release archive and checksum file fetched over HTTPS; scanner version executed locally. No sources scanned by this installer."
}
```
