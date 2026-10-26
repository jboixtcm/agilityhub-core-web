#!/usr/bin/env python3
"""Add one evidence-only Compose override without modifying the established core harness."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

real_docker = shutil.which("docker")
if real_docker is None:
    raise SystemExit("docker unavailable")
override = str(Path(__file__).with_name("https-compose.override.yml").resolve())
with tempfile.TemporaryDirectory(prefix="agilityhub-functional-compose-") as directory:
    shim = Path(directory) / "docker"
    shim.write_text("#!/usr/bin/env python3\nimport os, sys\nargs = sys.argv[1:]\n"
                    "if args and args[0] == 'compose':\n"
                    "    position = args.index('-f') + 2\n"
                    "    args[position:position] = ['-f', os.environ['AH_FUNCTIONAL_COMPOSE_OVERRIDE']]\n"
                    "os.execv(os.environ['AH_FUNCTIONAL_REAL_DOCKER'], [os.environ['AH_FUNCTIONAL_REAL_DOCKER'], *args])\n")
    shim.chmod(0o700)
    environment = os.environ | {"PATH": directory + os.pathsep + os.environ["PATH"],
        "AH_FUNCTIONAL_REAL_DOCKER": real_docker, "AH_FUNCTIONAL_COMPOSE_OVERRIDE": override}
    print("HTTPS fixture: one trusted proxy 172.31.247.11; dedicated disposable 172.31.247.0/24", flush=True)
    result = subprocess.run(sys.argv[1:], env=environment)
raise SystemExit(result.returncode)
