#!/usr/bin/env bash
set -euo pipefail

echo "=== MeetScribe macOS Setup ==="

# 1. Verify Homebrew
if ! command -v brew >/dev/null 2>&1; then
    echo "ERROR: Homebrew is required but not installed."
    echo "Install Homebrew from: https://brew.sh"
    exit 1
fi
echo "[OK] Homebrew found."

# 2. brew install missing dependencies
BREW_DEPS=(python@3.11 node postgresql@16 redis ffmpeg minio)
for dep in "${BREW_DEPS[@]}"; do
    if ! brew list "$dep" >/dev/null 2>&1; then
        echo "Installing $dep via brew..."
        brew install "$dep"
    else
        echo "[OK] Brew package $dep is installed."
    fi
done

# 3. Ensure postgresql@16/bin is on PATH
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
if [ -d "$PG_BIN" ]; then
    export PATH="$PG_BIN:$PATH"
    if [ -f "$HOME/.zshrc" ] && ! grep -q "$PG_BIN" "$HOME/.zshrc" 2>/dev/null; then
        echo "export PATH=\"$PG_BIN:\$PATH\"" >> "$HOME/.zshrc"
    fi
fi

# 4. Start services and wait for PostgreSQL
echo "Starting PostgreSQL 16 and Redis services..."
brew services start postgresql@16 || true
brew services start redis || true

echo "Waiting for PostgreSQL to be ready..."
until pg_isready -q; do
    sleep 1
done
echo "[OK] PostgreSQL is ready."

# 5. Create role 'meet' and databases if missing
if ! psql -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='meet'" | grep -q 1; then
    echo "Creating PostgreSQL user 'meet'..."
    psql -d postgres -c "CREATE USER meet WITH PASSWORD 'meet' CREATEDB;"
else
    echo "[OK] PostgreSQL role 'meet' exists."
fi

for db in meetscribe meetscribe_test; do
    if ! psql -d postgres -lqt | cut -d \| -f 1 | grep -qw "$db"; then
        echo "Creating database $db..."
        createdb -O meet "$db"
    else
        echo "[OK] Database $db exists."
    fi
done

# 6. Copy .env.example to .env if missing and generate JWT_SECRET
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    RANDOM_SECRET=$(openssl rand -hex 32)
    sed -i '' "s/JWT_SECRET=change-me/JWT_SECRET=$RANDOM_SECRET/" .env
    echo "[OK] Generated unique JWT_SECRET in .env."
else
    echo "[OK] .env already exists."
fi

# 7. Create backend/.venv and install dependencies
if [ ! -d .venv ] && [ ! -d backend/.venv ]; then
    echo "Creating Python 3.11 virtual environment..."
    python3.11 -m venv .venv
fi
if [ -d backend/.venv ] && [ ! -L backend/.venv ]; then
    rm -rf .venv
    mv backend/.venv .venv
fi
if [ ! -L backend/.venv ]; then
    rm -rf backend/.venv
    ln -s ../.venv backend/.venv
fi

echo "Installing backend dependencies..."
backend/.venv/bin/pip install --upgrade pip
(cd backend && .venv/bin/pip install -e ".[dev]")

# 8. Install frontend dependencies and playwright chromium
if [ -d frontend ]; then
    echo "Installing frontend dependencies..."
    (cd frontend && npm install)
    if [ -d frontend/node_modules ] && [ ! -L frontend/node_modules ]; then
        rm -rf node_modules
        mv frontend/node_modules ./node_modules
        ln -s ../node_modules frontend/node_modules
    fi
    echo "Installing Playwright chromium..."
    (cd frontend && npx playwright install chromium || true)
fi

# 9. Run alembic migrations
echo "Running database migrations..."
(cd backend && .venv/bin/alembic upgrade head)

# 10. Start MinIO if S3 mode and initialize storage
STORAGE_BACKEND=$(grep -E "^STORAGE_BACKEND=" .env 2>/dev/null | cut -d '=' -f 2 || echo "s3")
if [ "$STORAGE_BACKEND" = "s3" ]; then
    mkdir -p .data/minio
    if ! lsof -nP -iTCP:9000 -sTCP:LISTEN >/dev/null 2>&1; then
        echo "Starting MinIO background server..."
        nohup minio server .data/minio --address :9000 --console-address :9001 > .data/minio.log 2>&1 & echo $! > .data/minio.pid
        sleep 2
    fi
    echo "Initializing storage bucket..."
    backend/.venv/bin/python scripts/init_storage.py || true
else
    echo "Local storage mode: initializing upload directory..."
    backend/.venv/bin/python scripts/init_storage.py || true
fi

# 11. Download whisper model cache
echo "Caching Whisper model..."
backend/.venv/bin/python -c 'import os; from faster_whisper import WhisperModel; model=os.getenv("WHISPER_MODEL", "small"); print(f"Warming Whisper model: {model}..."); WhisperModel(model, device="cpu", compute_type="int8"); print("Whisper model cached.")' || echo "Whisper model download can be retried via make warm-whisper"

echo ""
echo "=== Setup Complete! ==="
echo "Next steps:"
echo "1. If using Anthropic for LLM, set LLM_API_KEY in .env"
echo "2. Run: make check"
echo "3. Run: make dev"
