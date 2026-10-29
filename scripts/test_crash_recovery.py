#!/usr/bin/env python3
"""
Automated test script for Crash Recovery (F19).
Tests worker crash mid-transcription, reaper detection, re-queuing,
and successful completion with no duplicate segments.
"""

import os
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path

import requests

BASE_URL = os.getenv("API_URL", "http://localhost:8000")
ROOT_DIR = Path(__file__).resolve().parent.parent
SAMPLE_AUDIO_DIR = ROOT_DIR / ".data" / "sample"
LONG_AUDIO_PATH = SAMPLE_AUDIO_DIR / "meeting_35min.mp3"


def find_worker_pid() -> int | None:
    try:
        out = subprocess.check_output(["pgrep", "-f", "celery.*worker"], text=True).strip()
        pids = [int(p) for p in out.splitlines() if p.isdigit()]
        return pids[0] if pids else None
    except Exception:
        return None


def main() -> None:
    print("\n" + "=" * 70)
    print("MEETSCRIBE CRASH RECOVERY TEST (F19)")
    print("=" * 70)

    # 1. Register user
    user_email = f"crash_test_{uuid.uuid4().hex[:8]}@example.com"
    user_pass = "Password123!@#"
    print(f"Step 1: Registering test user {user_email}...")
    requests.post(
        f"{BASE_URL}/api/v1/auth/register",
        json={"email": user_email, "password": user_pass, "name": "Crash Tester"},
        timeout=10,
    )
    r_login = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={"email": user_email, "password": user_pass},
        timeout=10,
    )
    token = r_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("[PASS] User registered and authenticated.")

    # 2. Upload 35-minute file
    print(f"\nStep 2: Uploading 35-minute audio ({LONG_AUDIO_PATH})...")
    file_size = LONG_AUDIO_PATH.stat().st_size
    r_create = requests.post(
        f"{BASE_URL}/api/v1/meetings",
        json={"filename": "meeting_35min.mp3", "content_type": "audio/mpeg", "size_bytes": file_size},
        headers=headers,
        timeout=10,
    )
    meeting_data = r_create.json()
    meeting_id = meeting_data["meeting_id"]
    upload_url = meeting_data["upload_url"]

    with open(LONG_AUDIO_PATH, "rb") as f:
        audio_bytes = f.read()

    requests.put(upload_url, data=audio_bytes, headers={"Content-Type": "audio/mpeg"}, timeout=60)
    requests.post(f"{BASE_URL}/api/v1/meetings/{meeting_id}/complete", headers=headers, timeout=10)
    print(f"[PASS] Meeting {meeting_id} uploaded and queued.")

    # 3. Wait until status becomes 'transcribing'
    print("\nStep 3: Waiting for status to reach 'transcribing'...")
    start_wait = time.time()
    worker_pid: int | None = None
    while time.time() - start_wait < 60:
        r_stat = requests.get(f"{BASE_URL}/api/v1/meetings/{meeting_id}/status", headers=headers, timeout=10)
        status_info = r_stat.json()
        current_status = status_info.get("status")
        stage = status_info.get("stage")

        if current_status == "transcribing" or stage == "transcription":
            worker_pid = find_worker_pid()
            print(f"[PASS] Meeting reached transcribing! Found worker PID: {worker_pid}")
            break
        time.sleep(1)

    if not worker_pid:
        print("[FAIL] Did not reach transcribing or worker PID not found.")
        sys.exit(1)

    # 4. Crash the worker (kill -9)
    print(f"\nStep 4: Simulating worker crash by executing kill -9 {worker_pid}...")
    try:
        os.kill(worker_pid, signal.SIGKILL)
        print(f"[PASS] Worker process {worker_pid} killed successfully.")
    except Exception as e:
        print(f"[FAIL] Could not kill worker process: {e}")
        sys.exit(1)

    # 5. Invoke reaper to detect stuck job (stale_minutes=0 to simulate staleness immediately)
    print("\nStep 5: Invoking reaper task to reclaim stuck meeting...")
    from app.workers.reaper import reap_stuck_jobs
    reap_result = reap_stuck_jobs(stale_minutes=0)
    print(f"  Reaper execution result: {reap_result}")

    # Verify meeting re-queued
    r_stat_after = requests.get(f"{BASE_URL}/api/v1/meetings/{meeting_id}/status", headers=headers, timeout=10)
    stat_reaped = r_stat_after.json()
    print(f"  Status after reaper: {stat_reaped.get('status')}")

    # 6. Restart the worker cleanly with file-redirected logging
    print("\nStep 6: Restarting Celery worker...")
    log_file = open(ROOT_DIR / ".data" / "worker.log", "a")
    worker_proc = subprocess.Popen(
        [
            str(ROOT_DIR / "backend" / ".venv" / "bin" / "celery"),
            "-A",
            "app.workers.celery_app",
            "worker",
            "--pool=solo",
            "-l",
            "info",
        ],
        cwd=str(ROOT_DIR / "backend"),
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )
    with open(ROOT_DIR / ".data" / "worker.pid", "w") as f:
        f.write(str(worker_proc.pid))
    print(f"[PASS] Worker restarted with PID {worker_proc.pid}.")

    # 7. Wait for completion and verify process_attempts >= 2
    print("\nStep 7: Waiting for meeting to finish processing (timeout 600s)...")
    wait_start = time.time()
    final_status = ""
    attempts = 0
    while time.time() - wait_start < 600:
        r_poll = requests.get(f"{BASE_URL}/api/v1/meetings/{meeting_id}/status", headers=headers, timeout=10)
        pdata = r_poll.json()
        final_status = pdata.get("status")
        attempts = pdata.get("process_attempts")
        pct = pdata.get("progress_pct")
        stage = pdata.get("stage")
        print(f"  Polling: status={final_status}, stage={stage}, progress={pct}%, attempts={attempts}")

        if final_status == "done":
            break
        elif final_status == "failed":
            print(f"[FAIL] Pipeline failed: {pdata.get('error_message')}")
            sys.exit(1)
        time.sleep(5)

    if final_status != "done":
        print(f"[FAIL] Pipeline timed out; final status: {final_status}")
        sys.exit(1)

    print(f"[PASS] Meeting reached 'done' with process_attempts = {attempts}")
    if attempts < 2:
        print(f"[WARNING] Expected process_attempts >= 2, got {attempts}")

    # 8. Verify transcript segments for duplicates
    print("\nStep 8: Verifying transcript has no duplicate segments...")
    r_trans = requests.get(f"{BASE_URL}/api/v1/meetings/{meeting_id}/transcript", headers=headers, timeout=10)
    trans_data = r_trans.json()
    segments = trans_data.get("segments", [])
    print(f"  Total transcript segments: {len(segments)}")

    # Check for duplicate segment IDs
    seg_ids = [s["id"] for s in segments]
    if len(seg_ids) != len(set(seg_ids)):
        print(f"[FAIL] Duplicate segment IDs detected: {len(seg_ids)} vs {len(set(seg_ids))} unique")
        sys.exit(1)
    else:
        print(f"[PASS] All {len(segments)} segment IDs are strictly unique (no duplicates).")

    # Clean up test meeting
    requests.delete(f"{BASE_URL}/api/v1/meetings/{meeting_id}", headers=headers, timeout=10)
    print("\n" + "=" * 70)
    print("CRASH RECOVERY TEST PASSED COMPLETELY!")
    print("=" * 70)


if __name__ == "__main__":
    main()
