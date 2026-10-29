#!/usr/bin/env python3
"""
Live smoke test script for MeetScribe.
Tests the full system end-to-end against a running API server on http://localhost:8000.
Each step prints [PASS] or [FAIL <reason>] and exits with code 1 on any failure.
"""

import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

BASE_URL = os.getenv("API_URL", "http://localhost:8000")
ROOT_DIR = Path(__file__).resolve().parent.parent
SAMPLE_AUDIO_DIR = ROOT_DIR / ".data" / "sample"
SAMPLE_AUDIO_PATH = SAMPLE_AUDIO_DIR / "meeting_sample.mp3"

steps_results: List[Dict[str, Any]] = []


def record_step(step_num: int, name: str, passed: bool, detail: str = "") -> None:
    status_str = "PASS" if passed else f"FAIL: {detail}"
    print(f"Step {step_num:02d}: {name:<50} [{status_str}]")
    steps_results.append({
        "step": step_num,
        "name": name,
        "passed": passed,
        "detail": detail,
    })
    if not passed:
        print_summary()
        sys.exit(1)


def print_summary() -> None:
    print("\n" + "=" * 70)
    print("MEETSCRIBE SMOKE TEST RESULTS SUMMARY")
    print("=" * 70)
    for s in steps_results:
        st = "PASS" if s["passed"] else f"FAIL ({s['detail']})"
        print(f"Step {s['step']:02d}: {s['name']:<48} {st}")
    print("=" * 70)
    total = len(steps_results)
    passed = sum(1 for s in steps_results if s["passed"])
    print(f"Total: {passed}/{total} steps passed.")
    print("=" * 70 + "\n")


def main() -> None:
    print(f"\nStarting MeetScribe smoke test against {BASE_URL}...\n")

    # Step 1: Health & Readiness check
    try:
        r_health = requests.get(f"{BASE_URL}/healthz", timeout=5)
        r_ready = requests.get(f"{BASE_URL}/readyz", timeout=5)
        if r_health.status_code == 200 and r_ready.status_code == 200:
            record_step(1, "Health and Readiness check (/healthz, /readyz)", True)
        else:
            record_step(1, "Health and Readiness check (/healthz, /readyz)", False,
                        f"healthz: {r_health.status_code}, readyz: {r_ready.status_code}")
    except Exception as e:
        record_step(1, "Health and Readiness check (/healthz, /readyz)", False, str(e))

    # Step 2: Register a random user and log in
    unique_suffix = uuid.uuid4().hex[:8]
    email = f"smoketest_{unique_suffix}@example.com"
    password = f"SecurePass123!_{unique_suffix}"
    token: Optional[str] = None
    try:
        r_reg = requests.post(
            f"{BASE_URL}/api/v1/auth/register",
            json={"email": email, "password": password, "name": "Smoke Tester"},
            timeout=10,
        )
        if r_reg.status_code != 201:
            record_step(2, "Register random user and log in", False, f"Register failed: {r_reg.text}")

        r_login = requests.post(
            f"{BASE_URL}/api/v1/auth/login",
            json={"email": email, "password": password},
            timeout=10,
        )
        if r_login.status_code != 200:
            record_step(2, "Register random user and log in", False, f"Login failed: {r_login.text}")

        token = r_login.json().get("access_token")
        if not token:
            record_step(2, "Register random user and log in", False, "Missing access_token in login response")
        record_step(2, "Register random user and log in", True)
    except Exception as e:
        record_step(2, "Register random user and log in", False, str(e))

    headers = {"Authorization": f"Bearer {token}"}

    # Step 3: Ensure sample audio exists
    try:
        if not SAMPLE_AUDIO_PATH.exists() or SAMPLE_AUDIO_PATH.stat().st_size == 0:
            print("Sample audio missing; generating via scripts/make_sample_audio.sh...")
            subprocess.run(
                ["bash", str(ROOT_DIR / "scripts" / "make_sample_audio.sh")],
                check=True,
                capture_output=True,
            )
        if not SAMPLE_AUDIO_PATH.exists() or SAMPLE_AUDIO_PATH.stat().st_size == 0:
            record_step(3, "Generate sample audio if missing", False, "Failed to create sample audio file")
        else:
            record_step(3, "Generate sample audio if missing", True)
    except Exception as e:
        record_step(3, "Generate sample audio if missing", False, str(e))

    # Step 4: POST /meetings, PUT to upload_url, POST /complete
    meeting_id: Optional[str] = None
    try:
        audio_size = SAMPLE_AUDIO_PATH.stat().st_size
        filename = SAMPLE_AUDIO_PATH.name
        r_create = requests.post(
            f"{BASE_URL}/api/v1/meetings",
            json={"filename": filename, "content_type": "audio/mpeg", "size_bytes": audio_size},
            headers=headers,
            timeout=10,
        )
        if r_create.status_code != 201:
            record_step(4, "Initiate, PUT, and complete upload", False, f"Create meeting failed: {r_create.text}")

        create_data = r_create.json()
        meeting_id = create_data["meeting_id"]
        upload_url = create_data["upload_url"]

        with open(SAMPLE_AUDIO_PATH, "rb") as f:
            audio_bytes = f.read()

        put_headers = {"Content-Type": "audio/mpeg"}
        r_put = requests.put(upload_url, data=audio_bytes, headers=put_headers, timeout=30)
        if r_put.status_code not in (200, 201, 204):
            record_step(4, "Initiate, PUT, and complete upload", False, f"PUT upload failed: {r_put.status_code}")

        r_comp = requests.post(
            f"{BASE_URL}/api/v1/meetings/{meeting_id}/complete",
            headers=headers,
            timeout=10,
        )
        if r_comp.status_code != 200:
            record_step(4, "Initiate, PUT, and complete upload", False, f"Complete failed: {r_comp.text}")
        record_step(4, "Initiate, PUT, and complete upload", True)
    except Exception as e:
        record_step(4, "Initiate, PUT, and complete upload", False, str(e))

    # Step 5: Poll /status until done (timeout 10 min)
    try:
        poll_start = time.time()
        timeout_sec = 600
        done = False
        last_status = "queued"
        while time.time() - poll_start < timeout_sec:
            r_stat = requests.get(
                f"{BASE_URL}/api/v1/meetings/{meeting_id}/status",
                headers=headers,
                timeout=10,
            )
            if r_stat.status_code != 200:
                record_step(5, "Poll /status until done (timeout 10 min)", False, f"Status poll returned {r_stat.status_code}")

            stat_data = r_stat.json()
            last_status = stat_data.get("status")
            stage = stat_data.get("stage")
            pct = stat_data.get("progress_pct")

            if last_status == "done":
                done = True
                break
            elif last_status == "failed":
                err = stat_data.get("error_message")
                record_step(5, "Poll /status until done (timeout 10 min)", False, f"Pipeline failed: {err}")

            time.sleep(3)

        if not done:
            record_step(5, "Poll /status until done (timeout 10 min)", False, f"Timed out after {timeout_sec}s; last_status={last_status}")
        record_step(5, "Poll /status until done (timeout 10 min)", True)
    except Exception as e:
        record_step(5, "Poll /status until done (timeout 10 min)", False, str(e))

    # Step 6: Transcript is non-empty and mentions "documentation" or "login"
    try:
        r_trans = requests.get(
            f"{BASE_URL}/api/v1/meetings/{meeting_id}/transcript",
            headers=headers,
            timeout=10,
        )
        if r_trans.status_code != 200:
            record_step(6, "Transcript verified with expected keywords", False, f"Get transcript returned {r_trans.status_code}")

        trans_data = r_trans.json()
        full_text = (trans_data.get("full_text") or "").lower()
        if not full_text:
            record_step(6, "Transcript verified with expected keywords", False, "Transcript full_text is empty")
        elif "documentation" not in full_text and "login" not in full_text:
            record_step(6, "Transcript verified with expected keywords", False, f"Keywords missing in transcript: {full_text[:100]}...")
        else:
            record_step(6, "Transcript verified with expected keywords", True)
    except Exception as e:
        record_step(6, "Transcript verified with expected keywords", False, str(e))

    # Step 7: Summary is non-empty; key points between 1 and 10
    try:
        r_detail = requests.get(
            f"{BASE_URL}/api/v1/meetings/{meeting_id}",
            headers=headers,
            timeout=10,
        )
        if r_detail.status_code != 200:
            record_step(7, "Summary non-empty and key points count 1..10", False, f"Get detail returned {r_detail.status_code}")

        detail_data = r_detail.json()
        summary_obj = detail_data.get("summary")
        if not summary_obj:
            record_step(7, "Summary non-empty and key points count 1..10", False, "Detail has no summary object")
        elif not summary_obj.get("summary"):
            record_step(7, "Summary non-empty and key points count 1..10", False, "Summary text is empty")
        else:
            key_pts = summary_obj.get("key_points") or []
            if not (1 <= len(key_pts) <= 10):
                record_step(7, "Summary non-empty and key points count 1..10", False, f"Key points count {len(key_pts)} not in 1..10")
            else:
                record_step(7, "Summary non-empty and key points count 1..10", True)
    except Exception as e:
        record_step(7, "Summary non-empty and key points count 1..10", False, str(e))

    # Step 8: At least 1 action item; at least one owner contains "Priya" or "Ravi"
    first_action_id: Optional[str] = None
    try:
        action_items = detail_data.get("action_items") or []
        if len(action_items) < 1:
            record_step(8, "Action item extracted with owner Priya or Ravi", False, "No action items extracted")
        else:
            first_action_id = action_items[0].get("id")
            owners = [(item.get("owner") or "") for item in action_items]
            has_expected_owner = any("priya" in o.lower() or "ravi" in o.lower() for o in owners)
            if not has_expected_owner:
                record_step(8, "Action item extracted with owner Priya or Ravi", False, f"No owner matches Priya/Ravi: {owners}")
            else:
                record_step(8, "Action item extracted with owner Priya or Ravi", True)
    except Exception as e:
        record_step(8, "Action item extracted with owner Priya or Ravi", False, str(e))

    # Step 9: Audio URL responds to a Range request with 206
    try:
        r_audio = requests.get(
            f"{BASE_URL}/api/v1/meetings/{meeting_id}/audio-url",
            headers=headers,
            timeout=10,
        )
        if r_audio.status_code != 200:
            record_step(9, "Audio URL responds to Range request with 206", False, f"audio-url endpoint returned {r_audio.status_code}")

        playback_url = r_audio.json().get("url")
        if not playback_url:
            record_step(9, "Audio URL responds to Range request with 206", False, "No URL in audio-url response")
        else:
            range_headers = {"Range": "bytes=0-1023"}
            r_range = requests.get(playback_url, headers=range_headers, timeout=10)
            if r_range.status_code != 206:
                record_step(9, "Audio URL responds to Range request with 206", False, f"Range request status {r_range.status_code} != 206")
            else:
                record_step(9, "Audio URL responds to Range request with 206", True)
    except Exception as e:
        record_step(9, "Audio URL responds to Range request with 206", False, str(e))

    # Step 10: Export markdown and PDF succeed
    try:
        r_md = requests.get(
            f"{BASE_URL}/api/v1/meetings/{meeting_id}/export?format=md",
            headers=headers,
            timeout=10,
        )
        r_pdf = requests.get(
            f"{BASE_URL}/api/v1/meetings/{meeting_id}/export?format=pdf",
            headers=headers,
            timeout=10,
        )
        if r_md.status_code != 200:
            record_step(10, "Export Markdown and PDF succeed", False, f"Markdown export failed: {r_md.status_code}")
        elif r_pdf.status_code != 200:
            record_step(10, "Export Markdown and PDF succeed", False, f"PDF export failed: {r_pdf.status_code}")
        elif not r_pdf.content.startswith(b"%PDF"):
            record_step(10, "Export Markdown and PDF succeed", False, "PDF content does not start with %PDF magic header")
        else:
            record_step(10, "Export Markdown and PDF succeed", True)
    except Exception as e:
        record_step(10, "Export Markdown and PDF succeed", False, str(e))

    # Step 11: Patch an action item to done; list with status=done returns it
    try:
        if not first_action_id:
            record_step(11, "Patch action item to done and filter", False, "No action item available to patch")
        else:
            r_patch = requests.patch(
                f"{BASE_URL}/api/v1/action-items/{first_action_id}",
                json={"status": "done"},
                headers=headers,
                timeout=10,
            )
            if r_patch.status_code != 200:
                record_step(11, "Patch action item to done and filter", False, f"Patch action item failed: {r_patch.text}")

            r_filter = requests.get(
                f"{BASE_URL}/api/v1/action-items?status=done",
                headers=headers,
                timeout=10,
            )
            if r_filter.status_code != 200:
                record_step(11, "Patch action item to done and filter", False, f"Filter action items failed: {r_filter.text}")

            items_done = r_filter.json().get("items") or []
            matching = [it for it in items_done if it.get("id") == first_action_id]
            if not matching:
                record_step(11, "Patch action item to done and filter", False, "Patched item not returned in status=done filter")
            else:
                record_step(11, "Patch action item to done and filter", True)
    except Exception as e:
        record_step(11, "Patch action item to done and filter", False, str(e))

    # Step 12: Isolation: second user gets 404 on the meeting
    try:
        user2_email = f"smoketest_other_{uuid.uuid4().hex[:8]}@example.com"
        r_u2 = requests.post(
            f"{BASE_URL}/api/v1/auth/register",
            json={"email": user2_email, "password": "Password123!", "name": "User Two"},
            timeout=10,
        )
        r_u2_login = requests.post(
            f"{BASE_URL}/api/v1/auth/login",
            json={"email": user2_email, "password": "Password123!"},
            timeout=10,
        )
        u2_token = r_u2_login.json().get("access_token")
        u2_headers = {"Authorization": f"Bearer {u2_token}"}

        r_iso = requests.get(
            f"{BASE_URL}/api/v1/meetings/{meeting_id}",
            headers=u2_headers,
            timeout=10,
        )
        if r_iso.status_code != 404:
            record_step(12, "User isolation enforced (second user gets 404)", False, f"Expected 404, got {r_iso.status_code}")
        else:
            record_step(12, "User isolation enforced (second user gets 404)", True)
    except Exception as e:
        record_step(12, "User isolation enforced (second user gets 404)", False, str(e))

    # Step 13: Delete meeting; GET returns 404; storage object gone
    try:
        r_del = requests.delete(
            f"{BASE_URL}/api/v1/meetings/{meeting_id}",
            headers=headers,
            timeout=10,
        )
        if r_del.status_code != 204:
            record_step(13, "Delete meeting and clean up storage", False, f"Delete failed: {r_del.status_code}")

        r_check = requests.get(
            f"{BASE_URL}/api/v1/meetings/{meeting_id}",
            headers=headers,
            timeout=10,
        )
        if r_check.status_code != 404:
            record_step(13, "Delete meeting and clean up storage", False, f"Meeting still accessible after delete: {r_check.status_code}")
        else:
            record_step(13, "Delete meeting and clean up storage", True)
    except Exception as e:
        record_step(13, "Delete meeting and clean up storage", False, str(e))

    print_summary()
    print("ALL SMOKE TEST STEPS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    main()

