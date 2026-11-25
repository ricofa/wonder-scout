# Qdrant (local, spike only)

Local Qdrant vector store for the Anvia compatibility spike (prompt 05). Not a production deployment.

- Image: `qdrant/qdrant:v1.20.0`, pinned by digest in `docker-compose.yml`.
- Ports: REST `127.0.0.1:6333`, gRPC `127.0.0.1:6334`. Loopback only.
- Data: named volume `wonderscout-qdrant_qdrant_storage`. Never run `docker compose down -v` or `docker volume rm` on it.
- Auth: every request needs an `api-key` header. `/readyz` and `/healthz` answer without a key (standard probe endpoints).

## Setup

1. Create `infra/qdrant/.env` (gitignored) with two random keys:
   ```
   QDRANT_API_KEY=<openssl rand -hex 32>
   QDRANT_READ_ONLY_API_KEY=<openssl rand -hex 32>
   ```
2. Start: `docker compose -f infra/qdrant/docker-compose.yml up -d`
3. Health: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:6333/readyz` should print `200`.
4. Stop (keeps data): `docker compose -f infra/qdrant/docker-compose.yml down`

The spike reads `QDRANT_URL` and `QDRANT_API_KEY` from the repo-root `.env`. Keep both files out of git.
