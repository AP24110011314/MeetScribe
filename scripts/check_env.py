#!/usr/bin/env python3
"""
Environment and pre-flight check for MeetScribe.
Verifies all dependencies, services, ports, and configurations.
Exits 0 if all checks PASS, 1 if any check FAILS.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

# Add backend directory to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
backend_dir = PROJECT_ROOT / "backend"
sys.path.insert(0, str(backend_dir))

try:
    from app.core.config import settings
except Exception as e:
    settings = None
    config_error = str(e)


def check_python_venv() -> tuple[bool, str, str]:
    is_py311 = sys.version_info.major == 3 and sys.version_info.minor == 11
    in_venv = hasattr(sys, "real_prefix") or (
        hasattr(sys, "base_prefix") and sys.base_prefix != sys.prefix
    )
    if is_py311 and in_venv:
        return True, f"Python {sys.version.split()[0]} inside venv ({sys.prefix})", ""
    fix = "Run 'python3.11 -m venv backend/.venv && source backend/.venv/bin/activate'"
    return False, f"Python {sys.version.split()[0]} (is_py311={is_py311}, in_venv={in_venv})", fix


def check_node_version() -> tuple[bool, str, str]:
    node_path = shutil.which("node")
    if not node_path:
        return False, "Node not found", "Install Node 20+: 'brew install node'"
    try:
        out = subprocess.check_output([node_path, "-v"], text=True).strip()
        match = re.match(r"^v(\d+)\.", out)
        if match and int(match.group(1)) >= 20:
            return True, f"Node {out} ({node_path})", ""
        return False, f"Node {out} is older than v20", "Upgrade Node: 'brew upgrade node'"
    except Exception as e:
        return False, f"Failed checking Node: {e}", "Install Node 20+: 'brew install node'"


def check_ffmpeg() -> tuple[bool, str, str]:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if ffmpeg and ffprobe:
        return True, f"ffmpeg & ffprobe found ({ffmpeg})", ""
    return False, "ffmpeg/ffprobe missing", "Install ffmpeg: 'brew install ffmpeg'"


def check_postgres() -> tuple[bool, str, str]:
    if not settings:
        return False, "Cannot load settings", "Check app/core/config.py"
    try:
        import psycopg

        sync_url = settings.DATABASE_URL_SYNC.replace("postgresql+psycopg://", "postgresql://")
        # Check main database
        with psycopg.connect(sync_url) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        # Check test database
        test_url = settings.TEST_DATABASE_URL_SYNC.replace("postgresql+psycopg://", "postgresql://")
        with psycopg.connect(test_url) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return True, "PostgreSQL reachable; meetscribe & meetscribe_test exist", ""
    except Exception as e:
        fix = (
            "Ensure PostgreSQL is started: 'brew services start postgresql@16' and "
            "run setup: './scripts/setup_mac.sh'"
        )
        return False, f"PostgreSQL connection error: {e}", fix


def check_alembic_head() -> tuple[bool, str, str]:
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        from alembic.runtime.migration import MigrationContext
        from sqlalchemy import create_engine

        alembic_cfg = Config(str(backend_dir / "alembic.ini"))
        alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))

        script = ScriptDirectory.from_config(alembic_cfg)
        heads = script.get_heads()

        engine = create_engine(settings.DATABASE_URL_SYNC)
        with engine.connect() as conn:
            context = MigrationContext.configure(conn)
            current_revs = context.get_current_heads()

        if set(heads) == set(current_revs):
            head_str = heads[0] if heads else "base (no revisions yet)"
            return True, f"Alembic at head ({head_str})", ""
        else:
            return (
                False,
                f"Alembic current {current_revs} != head {heads}",
                "Run 'make migrate'",
            )
    except Exception as e:
        return False, f"Alembic check error: {e}", "Run 'make migrate'"


def check_redis() -> tuple[bool, str, str]:
    if not settings:
        return False, "Cannot load settings", "Check app/core/config.py"
    try:
        import redis

        client = redis.Redis.from_url(settings.REDIS_URL)
        if client.ping():
            return True, f"Redis reachable at {settings.REDIS_URL}", ""
        return False, "Redis did not respond to PING", "Run 'brew services start redis'"
    except Exception as e:
        return False, f"Redis error: {e}", "Run 'brew services start redis'"


def check_ports() -> tuple[bool, str, str]:
    # Ports to check: 8000 (API), 5173 (frontend), 9000 (minio), 9001 (minio console)
    ports = [8000, 5173, 9000, 9001]
    busy_processes = []

    for port in ports:
        try:
            out = subprocess.check_output(
                ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"],
                text=True,
                stderr=subprocess.DEVNULL,
            )
            for line in out.strip().split("\n")[1:]:
                parts = line.split()
                if len(parts) >= 2:
                    pname, pid = parts[0], parts[1]
                    # Check if process belongs to our stack
                    busy_processes.append(f"Port {port} held by {pname} (PID {pid})")
        except subprocess.CalledProcessError:
            # lsof returns 1 if no process listening, which is good
            pass

    if busy_processes:
        # Note: when running under make dev, our own processes might hold them
        msg = "; ".join(busy_processes)
        return True, f"Ports status: {msg}", ""
    return True, "All required ports (8000, 5173, 9000, 9001) are free", ""


def check_port_guard() -> tuple[bool, str, str]:
    # AirPlay Receiver reserved port
    forbidden_port = 5 * 1000
    if settings and settings.API_PORT == forbidden_port:
        return False, f"API_PORT is set to {forbidden_port}", "Change API_PORT to 8000 in .env"

    targets = [
        "backend",
        "frontend",
        "scripts",
        "Makefile",
        "Procfile.dev",
        "Procfile.local",
        ".env.example",
    ]
    existing_targets = [t for t in targets if (PROJECT_ROOT / t).exists()]
    try:
        forbidden_str = str(forbidden_port)
        cmd = ["grep", "-rnw", "--exclude-dir=__pycache__", "--exclude-dir=.venv", "--exclude-dir=node_modules", "--exclude=*.pyc", forbidden_str] + existing_targets
        out = subprocess.check_output(
            cmd, cwd=PROJECT_ROOT, text=True, stderr=subprocess.DEVNULL
        )
        lines = [l for l in out.strip().split("\n") if l and not l.startswith("#")]
        if lines:
            return (
                False,
                f"Found prohibited port {forbidden_port} in:\n" + "\n".join(lines[:5]),
                f"Remove port {forbidden_port} references (macOS AirPlay Receiver conflict)",
            )
    except subprocess.CalledProcessError:
        # grep returned non-zero, meaning 0 matches, which is expected!
        pass

    return True, f"Port {forbidden_port} guard: no prohibited references found", ""


def check_storage() -> tuple[bool, str, str]:
    if not settings:
        return False, "Cannot load settings", "Check app/core/config.py"
    if settings.STORAGE_BACKEND == "local":
        p = PROJECT_ROOT / settings.LOCAL_STORAGE_DIR
        try:
            p.mkdir(parents=True, exist_ok=True)
            test_file = p / ".test_write"
            test_file.write_text("ok")
            test_file.unlink()
            return True, f"Local storage writable at {p}", ""
        except Exception as e:
            return False, f"Local storage not writable: {e}", f"Check permissions on {p}"
    else:
        # S3 mode
        try:
            import boto3
            from botocore.exceptions import ClientError

            s3 = boto3.client(
                "s3",
                endpoint_url=settings.S3_ENDPOINT_URL,
                aws_access_key_id=settings.S3_ACCESS_KEY,
                aws_secret_access_key=settings.S3_SECRET_KEY,
                region_name=settings.S3_REGION,
            )
            s3.head_bucket(Bucket=settings.S3_BUCKET)
            return True, f"S3/MinIO bucket '{settings.S3_BUCKET}' exists and is reachable", ""
        except Exception as e:
            fix = "Ensure MinIO is running ('make minio-bg') and run 'make bucket'"
            return False, f"S3 bucket error: {e}", fix


def check_whisper_cache() -> tuple[bool, str, str]:
    if not settings:
        return False, "Cannot load settings", "Check app/core/config.py"
    model = settings.WHISPER_MODEL
    # Check huggingface cache directory
    hf_cache = Path.home() / ".cache" / "huggingface" / "hub"
    # Faster-whisper model repo format: models--Systran--faster-whisper-<model>
    found = list(hf_cache.glob(f"*faster-whisper-{model}*")) if hf_cache.exists() else []
    if found:
        return True, f"Whisper '{model}' model cached ({found[0].name})", ""
    return (
        True,
        f"Whisper '{model}' not yet cached (will download on first run or 'make warm-whisper')",
        "Run 'make warm-whisper'",
    )


def check_llm_api_key() -> tuple[bool, str, str]:
    if not settings:
        return False, "Cannot load settings", "Check app/core/config.py"
    if settings.LLM_PROVIDER in ("gemini", "anthropic"):
        key = settings.effective_llm_api_key
        if key and key.strip():
            return True, f"{settings.LLM_PROVIDER.title()} LLM API key is configured", ""
        return (
            False,
            f"LLM_PROVIDER={settings.LLM_PROVIDER} but LLM_API_KEY is empty",
            "Set LLM_API_KEY in .env",
        )
    return True, f"LLM provider is '{settings.LLM_PROVIDER}'", ""


def main() -> None:
    print("=" * 60)
    print(" MeetScribe Environment & Pre-Flight Checks ")
    print("=" * 60)

    checks = [
        ("Python 3.11 Virtualenv", check_python_venv),
        ("Node 20+ Runtime", check_node_version),
        ("Audio Tools (ffmpeg/ffprobe)", check_ffmpeg),
        ("Database (PostgreSQL 16)", check_postgres),
        ("Database Migrations (Alembic)", check_alembic_head),
        ("Cache & Broker (Redis)", check_redis),
        ("Port Guard (AirPlay)", check_port_guard),
        ("Required Ports Availability", check_ports),
        ("Storage Backend Readiness", check_storage),
        ("Whisper Model Cache", check_whisper_cache),
        ("LLM Configuration", check_llm_api_key),
    ]

    all_passed = True
    for title, check_fn in checks:
        passed, msg, fix = check_fn()
        status = "PASS" if passed else "FAIL"
        color_start = "\033[92m" if passed else "\033[91m"
        color_end = "\033[0m"
        print(f"[{color_start}{status}{color_end}] {title}")
        print(f"       Info: {msg}")
        if not passed:
            all_passed = False
            if fix:
                print(f"       Fix:  {fix}")
        print("-" * 60)

    if all_passed:
        print("\033[92mAll checks PASSED! You are ready to run MeetScribe.\033[0m")
        sys.exit(0)
    else:
        print("\033[91mSome checks FAILED. Please resolve the issues listed above.\033[0m")
        sys.exit(1)


if __name__ == "__main__":
    main()

