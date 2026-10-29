#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SAMPLE_DIR="$ROOT_DIR/.data/sample"

mkdir -p "$SAMPLE_DIR"

TEXT="Welcome to the weekly sync. We decided to ship the beta on November fifteenth. Action item: Priya will update the API documentation by Friday. Action item: Ravi should fix the login bug as soon as possible. That is everything for today. Thanks everyone."

echo "Generating spoken audio sample with macOS say..."
AIFF_FILE="$SAMPLE_DIR/meeting.aiff"
MP3_FILE="$SAMPLE_DIR/meeting_sample.mp3"
WAV_FILE="$SAMPLE_DIR/meeting_sample.wav"

if command -v say >/dev/null 2>&1; then
    say -o "$AIFF_FILE" "$TEXT"
    ffmpeg -y -i "$AIFF_FILE" -ar 16000 -ac 1 -b:a 64k "$MP3_FILE" >/dev/null 2>&1
    ffmpeg -y -i "$AIFF_FILE" -ar 16000 -ac 1 "$WAV_FILE" >/dev/null 2>&1
    rm -f "$AIFF_FILE"
    echo "[OK] Generated $MP3_FILE and $WAV_FILE"
else
    echo "Warning: macOS 'say' command not found. Generating synthetic tone with ffmpeg..."
    ffmpeg -y -f lavfi -i "sine=frequency=1000:duration=5" -ar 16000 -ac 1 "$MP3_FILE" >/dev/null 2>&1
    ffmpeg -y -f lavfi -i "sine=frequency=1000:duration=5" -ar 16000 -ac 1 "$WAV_FILE" >/dev/null 2>&1
fi

# 1. Generate 35-minute looped audio for chunking test (~2100 seconds)
LONG_MP3="$SAMPLE_DIR/meeting_35min.mp3"
echo "Generating 35-minute looped audio for chunking tests ($LONG_MP3)..."
ffmpeg -y -stream_loop -1 -i "$MP3_FILE" -t 2100 -c copy "$LONG_MP3" >/dev/null 2>&1
echo "[OK] Generated $LONG_MP3"

# 2. Generate 0-byte file
touch "$SAMPLE_DIR/empty.mp3"

# 3. Generate corrupt file
echo "This is not valid audio data" > "$SAMPLE_DIR/corrupt.mp3"

echo "Sample audio generation complete in $SAMPLE_DIR."
