# Deployment — MeetScribe

## Environments
- Local: `docker compose up` (MinIO as S3)
- Production (suggested low-cost path): AWS S3 for storage, one VM (EC2/Lightsail/Hetzner) running Docker Compose, or split services as below.

## Option A: single VM with Docker Compose (simplest)
1. Provision Ubuntu VM (4 GB RAM minimum for `small` Whisper; 8 GB recommended).
2. Install Docker and Compose plugin; clone repo.
3. Create real S3 bucket (private), IAM user with access to that bucket only; set `S3_ENDPOINT_URL` empty, real keys in `.env`.
4. Set strong `JWT_SECRET`, `LLM_API_KEY`, production `DATABASE_URL`.
5. Add S3 bucket CORS: allow `PUT, GET, HEAD` from your frontend origin, expose `ETag`.
6. Use `docker-compose.prod.yml`: no MinIO, no dev volumes, frontend built to static and served by Caddy/Nginx with HTTPS (Let's Encrypt).
7. Run `docker compose -f docker-compose.prod.yml up -d` then `alembic upgrade head`.

## Option B: managed services
- Frontend: Vercel or Netlify
- API + worker: Render / Railway / Fly.io (separate worker service)
- Postgres: Neon or Supabase; Redis: Upstash
- Note: Whisper on CPU needs memory; use the OpenAI Whisper provider (`TRANSCRIBER=openai`) if the host is small.

## Checklist
- [ ] HTTPS everywhere, CORS locked to frontend origin
- [ ] Bucket private, lifecycle rule to delete raw audio after N days (optional)
- [ ] Database backups enabled
- [ ] `/readyz` wired to uptime monitor
- [ ] Secrets only in host env, none in repo
- [ ] CI deploys on merge to `main`

## .env.example (reference)
```
ENV=development
DATABASE_URL=postgresql+asyncpg://meet:meet@postgres:5432/meetscribe
REDIS_URL=redis://redis:6379/0
JWT_SECRET=change-me
S3_ENDPOINT_URL=http://minio:9000
S3_PUBLIC_ENDPOINT_URL=http://localhost:9000
S3_BUCKET=meetscribe
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1
TRANSCRIBER=faster_whisper
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
LLM_PROVIDER=anthropic
LLM_API_KEY=
LLM_MODEL=claude-sonnet-4-6
MAX_UPLOAD_MB=500
CORS_ORIGINS=http://localhost:5173
```
Note: `S3_PUBLIC_ENDPOINT_URL` is the host the browser uses for presigned URLs; it differs from the internal Docker hostname in local dev.
