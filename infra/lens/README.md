# Anvia Lens — local self-hosted deployment

Local-only observability backend for the WonderScout AI spike (TDD §2.3, §10.4, §11.3).
Based on the **official** Anvia Lens Docker Compose deployment:
<https://docs.anvia.dev/lens/install-and-setup>.

> Tracing integration and project credentials are **not** configured yet (see "Next steps").

## Files

| File | Origin | Tracked in Git |
|---|---|---|
| `docker-compose.yml` | **Unmodified** official template from `anvia-hq/lens` tag `v0.19.0` (sha256 `fd10e38641ae62f09f6fb690f6975b36913e65c7b7f05464115573cf38b9877a`) | yes |
| `docker-compose.override.yml` | Local Docker Desktop/WSL2 fix for the `monitor` mounts (see Troubleshooting). Auto-loaded by `docker compose` | yes |
| `.env.example` | Official `.env.example` (v0.19.0) with local changes marked `WONDERSCOUT:` | yes |
| `.env` | Your real values (generated secrets). **Never commit.** Ignored by the root `.gitignore` (`.env`) | **no** |

## Deployment choices

| Setting | Value | Why |
|---|---|---|
| Lens release | `LENS_VERSION=0.19.0` (published 2026-10-27) | Newest release satisfying the repo's 14-day release-age policy. The docs currently pin `0.20.1`, published 2026-11-23 (see "Upgrading") |
| Compose project | `COMPOSE_PROJECT_NAME=wonderscout-lens` | This machine already has other Lens stacks in projects `lens` and `harness-lens`. The template's `name: lens` would otherwise attach to the existing `lens` project and its volumes. The env var overrides `name:` without editing the template |
| Dashboard binding | `WEB_PORT=127.0.0.1:3080` → `web:8080` | Loopback only; not reachable from the LAN/WSL network IP. Only `web` publishes a port (official template); API, DBs and Redis stay on the private Compose network |
| Origin | `PUBLIC_APP_URL=WEB_ORIGIN=http://localhost:3080` | Must match the browser URL exactly. Use `http://localhost:3080`, not `127.0.0.1` |
| Pull policy | `LENS_PULL_POLICY=missing` | The tag is pinned; avoids re-pulling on every `up` |
| Persistence | named volumes `wonderscout-lens_lens-postgres`, `wonderscout-lens_lens-clickhouse`, `wonderscout-lens_lens-redis` | Survive `down`/`up` and restarts |

### Images (verified at deploy time, 2026-11-24)

| Service(s) | Image | Digest |
|---|---|---|
| api, worker, migrate, monitor | `ghcr.io/anvia-hq/lens:0.19.0` | `sha256:17a8c215b3e112201f3bbf32016bf866a7337212221ef179718e473d8b3ab229` |
| web | `ghcr.io/anvia-hq/lens-web:0.19.0` | `sha256:6b9a9480d66647b8e1e3510eebf80eacc5ed71f740b5b2a4167332274bbd3876` |
| postgres | `postgres:17-alpine` | `sha256:f9cf3e1f0066f0eb0c48707d864f0ac5941e9ff454a072077d97a4d278d07d73` |
| redis | `redis:8-alpine` | `sha256:5af80107c1eeecb484a2269b80a26d12bfa6521787da4663bd9f19f60a163483` |
| clickhouse | `clickhouse/clickhouse-server:26.4-alpine` | `sha256:2964fa4690a6fdfd942e7d9e84aaabb82a85cc3d848e191a2bd8b94e1ff641a8` |

The third-party tags (`17-alpine`, `8-alpine`, `26.4-alpine`) come from the official template and are floating tags. The digests above record exactly what was deployed.

## Prerequisites

- Docker Desktop with WSL2 integration (verified: Docker 28.3.3, Compose v2.39.2-desktop.1), or Docker Engine + Compose v2.24+ (needed for `!override` in the override file).
- `openssl` to generate secrets.
- About 1 GB of free disk for images, plus storage for ClickHouse/Postgres data.

## First-time setup

Run everything from this directory:

```sh
cd infra/lens
cp .env.example .env
chmod 600 .env
# Replace each replace-with-* value with an independent random value:
for k in POSTGRES_PASSWORD CLICKHOUSE_PASSWORD REDIS_PASSWORD BETTER_AUTH_SECRET INGESTION_KEY_PEPPER; do
  sed -i "s|^$k=.*|$k=$(openssl rand -hex 32)|" .env
done
grep '^[A-Z_]*=replace-with' .env   # only OIDC_CLIENT_SECRET should remain (OIDC is disabled)

docker compose config --quiet   # validate (prints nothing on success)
docker compose pull
docker compose up -d
docker compose ps -a
```

Then open **<http://localhost:3080>**:
1. The first account you create becomes the workspace **owner**, and public sign-up closes after that.
2. Create a project (e.g. `wonderscout-spike`).
3. Open **Connect** and create an ingestion key. Copy the public and secret keys immediately; the secret is shown once.
4. Store the keys **outside Git**. This step and the tracing integration belong to the next prompt.

> **Never** run `docker compose config` without `--quiet` in shared logs or screen-shares: it prints the expanded secrets.

## Daily operations

```sh
cd infra/lens
docker compose up -d                 # start (idempotent; re-runs the one-shot migrate)
docker compose ps -a                 # status; migrate should be "Exited (0)"
docker compose stop                  # stop, keeping containers and data
docker compose start                 # start stopped containers
docker compose restart api worker web
docker compose down                  # remove containers + networks; volumes (data) are KEPT
docker compose logs -f api worker    # follow logs
```

**Do not** use `docker compose down -v` or `docker volume rm`: these delete all Lens data.

Health checks:

```sh
curl -s http://localhost:3080/health/live                          # {"status":"ok"}
docker compose exec -T api wget -qO- http://127.0.0.1:3001/health/ready  # {"status":"ready"}
docker inspect -f '{{.State.Health.Status}}' wonderscout-lens-web-1
```

The worker has no Compose healthcheck (upstream design). Check `docker compose logs worker` for `Anvia Lens worker started`, and the owner/admin **System Health** page in the dashboard.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Error response from daemon: path / is mounted on / but it is not a shared mount` when creating `monitor` | The v0.19.0 template mounts `/` and the Docker data dir with `bind.propagation: rslave`; Docker Desktop's WSL2 VM root is not a shared mount | Handled by `docker-compose.override.yml` (same read-only binds without propagation). On a Linux host with a shared `/`, you can delete the override |
| `migrate` exits `1` on the **first** start with `connect ECONNREFUSED <ip>:8123` | v0.19.0's ClickHouse healthcheck uses the native client and can pass before ClickHouse's HTTP port accepts connections (upstream hardened this check in v0.20.x) | Wait until ClickHouse is healthy and run `docker compose up -d` again; `migrate` is a one-shot and re-runs safely. Observed once on first boot, 2026-11-24 |
| Dashboard login/redirect or CORS errors | Browser URL differs from `PUBLIC_APP_URL`/`WEB_ORIGIN` | Use exactly `http://localhost:3080`, or change both variables and `docker compose up -d` |
| `bind: address already in use` for 3080 | Another process uses the port | Change `WEB_PORT=127.0.0.1:<port>` **and** both origins, then `up -d` |
| Containers named `lens-*` / `harness-lens-*` appear in `docker ps -a` | Other projects' Lens stacks on this machine | Not part of this deployment; leave them alone. This stack's containers are `wonderscout-lens-*` |
| Need to inspect a failing service | — | `docker compose logs <service> --no-log-prefix \| tail -100` (logs do not print the `.env` secrets; still review before sharing) |

## Upgrading

1. Pick the new release, consistent with the 14-day policy.
2. Download that tag's `docker-compose.yml` and `.env.example` from `https://raw.githubusercontent.com/anvia-hq/lens/<tag>/`.
3. Diff them against the files here and carry over new required variables. For example, v0.20.x adds a required `LENS_ALERT_SECRET_KEY` (`kid:base64 of 32 bytes`).
4. Update `LENS_VERSION`, then run `docker compose pull && docker compose up -d`. Back up the volumes first.

## Next steps (not done here)

- Create the owner account, project and ingestion key in the dashboard (manual; the secret is shown once).
- Point the spike's `createLensClient()` at `baseUrl: http://localhost:3080` with those keys, then re-run the Prompt 04 tracing tests against this backend.
