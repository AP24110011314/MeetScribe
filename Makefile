.PHONY: up down logs test lint fmt typecheck migrate seed

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f api worker beat

test:
	cd backend && pytest -q
	cd frontend && npm test

lint:
	cd backend && ruff check . && ruff format --check .
	cd frontend && npm run lint

fmt:
	cd backend && ruff check --fix . && ruff format .
	cd frontend && npm run lint -- --fix

typecheck:
	cd backend && mypy app
	cd frontend && npm run typecheck

migrate:
	cd backend && alembic upgrade head

seed:
	cd backend && python scripts/seed.py
