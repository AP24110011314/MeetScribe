#!/usr/bin/env bash
# Smoke test for MeetScribe end-to-end flow
# Run from project root: ./scripts/smoke_test.sh

set -euo pipefail

API_BASE="http://localhost:8000/api/v1"
AUDIO_FILE="${1:-/tmp/test_meeting.wav}"

echo "=== MeetScribe Smoke Test ==="
echo "API: $API_BASE"
echo "Audio: $AUDIO_FILE"
echo ""

# Check if audio file exists
if [[ ! -f "$AUDIO_FILE" ]]; then
    echo "ERROR: Audio file not found: $AUDIO_FILE"
    echo "Generate with: say -v Samantha 'Hello team. John will update the docs by Friday.' -o /tmp/test.aiff && ffmpeg -y -i /tmp/test.aiff -ar 16000 -ac 1 /tmp/test.wav"
    exit 1
fi

# 1. Register a user
echo "1. Registering test user..."
REGISTER_RESP=$(curl -s -X POST "$API_BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email": "smoke@test.com", "password": "testpass123"}')
echo "   Response: $REGISTER_RESP"
USER_ID=$(echo "$REGISTER_RESP" | jq -r '.id // empty')
if [[ -z "$USER_ID" ]]; then
    echo "   User may already exist, trying login..."
fi

# 2. Login
echo "2. Logging in..."
LOGIN_RESP=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "smoke@test.com", "password": "testpass123"}')
ACCESS_TOKEN=$(echo "$LOGIN_RESP" | jq -r '.access_token // empty')
if [[ -z "$ACCESS_TOKEN" || "$ACCESS_TOKEN" == "null" ]]; then
    echo "   ERROR: Failed to get access token"
    echo "   Response: $LOGIN_RESP"
    exit 1
fi
echo "   Got access token: ${ACCESS_TOKEN:0:20}..."

AUTH_HEADER="Authorization: Bearer $ACCESS_TOKEN"

# 3. Create meeting (get presigned URL)
echo "3. Creating meeting..."
FILENAME=$(basename "$AUDIO_FILE")
FILESIZE=$(stat -f%z "$AUDIO_FILE" 2>/dev/null || stat -c%s "$AUDIO_FILE")
CREATE_RESP=$(curl -s -X POST "$API_BASE/meetings" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{\"filename\": \"$FILENAME\", \"content_type\": \"audio/wav\", \"size_bytes\": $FILESIZE}")
echo "   Response: $CREATE_RESP"
MEETING_ID=$(echo "$CREATE_RESP" | jq -r '.meeting_id // empty')
UPLOAD_URL=$(echo "$CREATE_RESP" | jq -r '.upload_url // empty')
if [[ -z "$MEETING_ID" || -z "$UPLOAD_URL" ]]; then
    echo "   ERROR: Failed to create meeting"
    exit 1
fi
echo "   Meeting ID: $MEETING_ID"
echo "   Upload URL: ${UPLOAD_URL:0:60}..."

# 4. Upload audio to presigned URL
echo "4. Uploading audio to S3..."
UPLOAD_RESP=$(curl -s -w "\n%{http_code}" -X PUT "$UPLOAD_URL" \
  -H "Content-Type: audio/wav" \
  --data-binary @"$AUDIO_FILE")
HTTP_CODE=$(echo "$UPLOAD_RESP" | tail -1)
if [[ "$HTTP_CODE" != "200" ]]; then
    echo "   ERROR: Upload failed with HTTP $HTTP_CODE"
    echo "   Response: $UPLOAD_RESP"
    exit 1
fi
echo "   Upload successful (HTTP $HTTP_CODE)"

# 5. Complete meeting (enqueue processing)
echo "5. Completing meeting (enqueueing processing)..."
COMPLETE_RESP=$(curl -s -X POST "$API_BASE/meetings/$MEETING_ID/complete" \
  -H "$AUTH_HEADER")
echo "   Response: $COMPLETE_RESP"
STATUS=$(echo "$COMPLETE_RESP" | jq -r '.status // empty')
if [[ "$STATUS" != "queued" ]]; then
    echo "   ERROR: Meeting not queued, status: $STATUS"
    exit 1
fi
echo "   Meeting queued for processing"

# 6. Poll status until done or failed
echo "6. Polling status..."
MAX_POLLS=60
POLL_INTERVAL=5
for ((i=1; i<=MAX_POLLS; i++)); do
    STATUS_RESP=$(curl -s -X GET "$API_BASE/meetings/$MEETING_ID/status" \
      -H "$AUTH_HEADER")
    STATUS=$(echo "$STATUS_RESP" | jq -r '.status // empty')
    STAGE=$(echo "$STATUS_RESP" | jq -r '.stage // empty')
    PROGRESS=$(echo "$STATUS_RESP" | jq -r '.progress_pct // empty')
    ERROR=$(echo "$STATUS_RESP" | jq -r '.error_message // empty')
    
    echo "   Poll $i/$MAX_POLLS: status=$STATUS stage=$STAGE progress=${PROGRESS}%"
    
    if [[ "$STATUS" == "done" ]]; then
        echo "   ✓ Processing complete!"
        break
    elif [[ "$STATUS" == "failed" ]]; then
        echo "   ✗ Processing failed: $ERROR"
        exit 1
    fi
    
    if [[ $i -eq $MAX_POLLS ]]; then
        echo "   ERROR: Timeout waiting for processing"
        exit 1
    fi
    
    sleep $POLL_INTERVAL
done

# 7. Fetch meeting detail
echo "7. Fetching meeting detail..."
DETAIL_RESP=$(curl -s -X GET "$API_BASE/meetings/$MEETING_ID" \
  -H "$AUTH_HEADER")
echo "   Response: $DETAIL_RESP"

# 8. Verify results
echo "8. Verifying results..."
HAS_TRANSCRIPT=$(echo "$DETAIL_RESP" | jq -e '.transcript != null' >/dev/null && echo "yes" || echo "no")
HAS_SUMMARY=$(echo "$DETAIL_RESP" | jq -e '.summary != null' >/dev/null && echo "yes" || echo "no")
HAS_ACTION_ITEMS=$(echo "$DETAIL_RESP" | jq -e '.action_items != null and (.action_items | length > 0)' >/dev/null && echo "yes" || echo "no")

echo "   Transcript: $HAS_TRANSCRIPT"
echo "   Summary: $HAS_SUMMARY"
echo "   Action Items: $HAS_ACTION_ITEMS"

if [[ "$HAS_TRANSCRIPT" == "yes" && "$HAS_SUMMARY" == "yes" && "$HAS_ACTION_ITEMS" == "yes" ]]; then
    echo ""
    echo "=== SMOKE TEST PASSED ==="
    exit 0
else
    echo ""
    echo "=== SMOKE TEST FAILED: Missing expected data ==="
    exit 1
fi