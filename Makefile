.PHONY: test lint fmt typecheck migrate backend-dev frontend-dev worker-dev beat-dev

# Backend development commands
backend-dev:
	cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

worker-dev:
	cd backend && source .venv/bin/activate && celery -A app.workers.celery_app:celery_app worker --loglevel=INFO --concurrency=2 --pool=solo

beat-dev:
	cd backend && source .venv/bin/activate && celery -A app.workers.celery_app:celery_app beat --loglevel=INFO

# Frontend development
frontend-dev:
	cd frontend && npm run dev

# Testing and linting
test:
	cd backend && source .venv/bin/activate && pytest -q
	cd frontend && npm test

lint:
	cd backend && source .venv/bin/activate && ruff check . && ruff format --check .
	cd frontend && npm run lint

fmt:
	cd backend && source .venv/bin/activate && ruff check --fix . && ruff format .
	cd frontend && npm run lint -- --fix

typecheck:
	cd backend && source .venv/bin/activate && mypy app
	cd frontend && npm run typecheck

# Database migrations
migrate:
	cd backend && source .venv/bin/activate && alembic upgrade head

migrate-create:
	cd backend && source .venv/bin/activate && alembic revision --autogenerate -m "$(msg)"

# Setup local development environment
setup-backend:
	cd backend && python3.11 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"

setup-frontend:
	cd frontend && npm install

setup: setup-backend setup-frontend
	@echo "Setup complete! Next steps:"
	@echo "1. Start PostgreSQL and Redis (brew services start postgresql@16 redis)"
	@echo "2. Start LocalStack: docker run -d --name localstack -p 4566:4566 -p 4510-4559:4510-4559 -e SERVICES=s3 -e DEFAULT_REGION=us-east-1 -e S3_SKIP_SIGNATURE_VALIDATION=1 localstack/localstack:3.8"
	@echo "3. Create S3 bucket: AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin aws --endpoint-url=http://localhost:4566 s3 mb s3://meetscribe"
	@echo "4. Create backend/.env with your configuration (see README)"
	@echo "5. Run 'make migrate' to apply database migrations"
	@echo "6. Start services: make backend-dev, make worker-dev, make beat-dev, make frontend-dev"