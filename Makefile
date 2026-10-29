.PHONY: setup check dev dev-local minio minio-bg stop bucket warm-whisper migrate test-backend test-frontend e2e test smoke lint reset

SHELL := /bin/bash
VENV := backend/.venv
PYTHON := $(VENV)/bin/python
HONCHO := $(VENV)/bin/honcho

setup:
	@chmod +x scripts/*.sh
	@./scripts/setup_mac.sh

check:
	@$(PYTHON) scripts/check_env.py

dev:
	@mkdir -p .data/minio
	@$(HONCHO) start -f Procfile.dev

dev-local:
	@$(HONCHO) start -f Procfile.local

minio:
	@mkdir -p .data/minio
	@source .env 2>/dev/null || true && minio server .data/minio --address :9000 --console-address :9001

minio-bg:
	@mkdir -p .data/minio
	@if [ -f .data/minio.pid ] && kill -0 $$(cat .data/minio.pid) 2>/dev/null; then \
		echo "MinIO already running (pid $$(cat .data/minio.pid))"; \
	else \
		nohup minio server .data/minio --address :9000 --console-address :9001 > .data/minio.log 2>&1 & echo $$! > .data/minio.pid; \
		echo "MinIO started in background (pid $$(cat .data/minio.pid))"; \
		sleep 1; \
	fi

stop:
	@if [ -f .data/minio.pid ]; then \
		kill $$(cat .data/minio.pid) 2>/dev/null || true; \
		rm -f .data/minio.pid; \
		echo "MinIO stopped"; \
	else \
		echo "MinIO pid file not found"; \
	fi

bucket:
	@$(PYTHON) scripts/init_storage.py

warm-whisper:
	@$(PYTHON) -c 'import os; from faster_whisper import WhisperModel; model=os.getenv("WHISPER_MODEL", "small"); print(f"Warming Whisper model: {model}..."); WhisperModel(model, device="cpu", compute_type="int8"); print("Whisper model cached.")'

migrate:
	@cd backend && .venv/bin/alembic upgrade head

test-backend:
	@cd backend && .venv/bin/pytest -q

test-frontend:
	@cd frontend && npm test -- --run

e2e:
	@cd frontend && npx playwright test

test: test-backend test-frontend e2e

smoke:
	@$(PYTHON) scripts/smoke_test.py

lint:
	@echo "--- Python Linting & Type Checking ---"
	@cd backend && .venv/bin/ruff check app tests
	@cd backend && .venv/bin/ruff format --check app tests
	@cd backend && .venv/bin/mypy app
	@echo "--- Frontend Linting & Type Checking ---"
	@cd frontend && npm run lint
	@cd frontend && npm run typecheck

reset:
	@read -p "Are you sure you want to reset meetscribe database and .data/ directory? [y/N] " ans; \
	if [ "$$ans" = "y" ] || [ "$$ans" = "Y" ]; then \
		dropdb meetscribe 2>/dev/null || true; \
		createdb -O meet meetscribe; \
		cd backend && .venv/bin/alembic upgrade head; \
		rm -rf .data/uploads/* .data/minio/*; \
		echo "Reset complete."; \
	else \
		echo "Reset aborted."; \
	fi

