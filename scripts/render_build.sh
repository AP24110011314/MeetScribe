#!/usr/bin/env bash
# Render Build Script for MeetScribe API and Background Workers
# Runs during the Render deployment build step
set -o errexit

echo "=========================================================="
echo "MeetScribe — Production Deployment Build on Render"
echo "=========================================================="

# 1. Install & Upgrade Python Dependencies
echo "--> Installing Python dependencies..."
python -m pip install --upgrade pip
cd backend
pip install -e .

# 2. Verify or Install Static ffmpeg / ffprobe
echo "--> Checking for ffmpeg and ffprobe..."
if ! command -v ffmpeg &> /dev/null; then
  echo "ffmpeg not found in system PATH. Downloading static Linux x86_64 binary..."
  mkdir -p "$HOME/bin"
  curl -sL https://github.com/eugeneware/ffmpeg-static/releases/download/b4.4.1/ffmpeg-linux-x64 -o "$HOME/bin/ffmpeg"
  curl -sL https://github.com/eugeneware/ffmpeg-static/releases/download/b4.4.1/ffprobe-linux-x64 -o "$HOME/bin/ffprobe"
  chmod +x "$HOME/bin/ffmpeg" "$HOME/bin/ffprobe"
  export PATH="$HOME/bin:$PATH"
  echo "ffmpeg installed at $HOME/bin/ffmpeg"
else
  echo "ffmpeg is available in PATH: $(ffmpeg -version | head -n 1)"
fi

# 3. Run Database Migrations
echo "--> Running Alembic database migrations..."
if [ -n "$DATABASE_URL" ]; then
  alembic upgrade head
  echo "Database migrations applied successfully."
else
  echo "Notice: DATABASE_URL not set during build phase. Skipping migrations (run at startup or ensure db is linked)."
fi

# 4. Pre-download Whisper model into build cache
echo "--> Pre-downloading Whisper tiny model for fast startup..."
python -c "from faster_whisper import WhisperModel; WhisperModel('tiny', device='cpu', compute_type='int8')" || echo "Notice: Whisper pre-download skipped or will occur on first run."

echo "=========================================================="
echo "Build finished successfully!"
echo "=========================================================="

