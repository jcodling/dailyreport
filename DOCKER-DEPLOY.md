# Docker Deployment to Synology NAS

This project can run entirely inside a lightweight Docker container on your Synology NAS via **Container Station** (the free Docker plugin for DSM). The entire pipeline runs inside an Alpine-based Bun container — no need for your Mac to be on.

## Quick Deploy (CLI — Recommended)

One deployment script, zero NAS CLI knowledge needed:

```bash
# One-time setup on your Mac
brew install --cask docker
brew install rsync

# One-time: enable password-less SSH to the NAS (auth by key, never a password)
ssh-keygen -t ed25519      # only if you have no SSH key yet
ssh-copy-id admin@192.168.1.100

# Deploy
export NAS_IP=192.168.1.100
export NAS_USER=admin
./scripts/deploy-nas.sh
```

> **Security:** this script authenticates by SSH key only (no `sshpass`, no
> password on the command line, so nothing sensitive lands in local `ps`). It
> pins the NAS host key on first connect with `StrictHostKeyChecking=accept-new`
> rather than disabling verification, and copies `.env` with `chmod 600`.
> Assumes a trusted home LAN.

This script:

1. Builds the Docker image locally on your Mac
2. Saves and SSH-transfers the image to your NAS
3. Loads the image on the NAS
4. Copies config files and source code
5. Starts the container with all volumes and env files mounted

## Manual Deployment via Container Station GUI

If you prefer the Container Station GUI instead of the CLI script:

1. **Transfer files via File Station:**
   - Copy the entire project folder to `/docker/dailyreport/` on your NAS

2. **Build image via Container Station:**
   - Open **Container Station** -> **Image** -> **Create**
   - Set the **build context / Dockerfile path** to the copied folder
     (`/docker/dailyreport/`, which contains the `Dockerfile`)
   - Container Station builds the image

3. **Create container** (or run `docker run` with the same flags the script uses):
   - Open **Container Station** -> **Image** -> **Create / run**
   - Select image: `dailyreport:latest`
   - Set scheduling: **Daily at 03:00**, task: **Start**
   - Advanced settings:
      - **Volume:** Mount `/volume1/docker/dailyreport/` -> `/app` (Read/Write)
      - **Environment:** load the `.env` file via `--env-file /app/.env` (the
        image entrypoint reads `/app/.env`; do **not** set an `ENV_FILE_PATH`
        variable — the pipeline does not read one). Keep the file at `chmod 600`.
      - **Network:** Use `bridge` (default)
   - Start the container

## Architecture

```
+-------------------------+           +----------------------------+
|   Your Mac              |           |  Synology NAS                |
|                         |    scp    |                              |
|   ./scripts/            | ----------> |   /volume1/docker/dailyreport|
|  deploy-nas.sh -------> |           |   +-- reports/ (persisted)   |
|                         |   rsync |   +-- config/ (persisted)    |
|  local docker build     |           |   +-- logs/ (persisted)    |
|   + image save          |           |   +-- src/ (application)   |
|                         |           |                              |
|                         |           |  Container Station           |
|                         |           |   +--------------------+     |
|                         |           |   | dailyreport_daily      |     |
|                         |           |   | oven/bun:1-alpine      |     |
|                         |           |   | bun run generate       |     |
|                         |           |   +--------------------+     |
|                         |           |            ^                 |
|                         |           |       scheduled task         |
+-------------------------+           +----------------------------+
                                        |
                                        | SFTP
                                        v
                               +-----------------+
                               |  IONOS SFTP      |
                               |   (web UI host)   |
                               +-----------------+
```

## File Persistence

All state persists across container recreations via bind mounts:

| Path (inside container) | NAS Host Path | Purpose |
|---|---|---|
| `/app/reports/` | `/volume1/docker/dailyreport/reports/` | Generated Markdown reports (YYYY-MM-DD.md) |
| `/app/config/` | `/volume1/docker/dailyreport/config/` | interests.yaml, seen-urls.json, feedback-weights.json, blacklist.json |
| `/app/logs/` | `/volume1/docker/dailyreport/logs/` | dailyreport.log, access.log |
| `/app/.env` | `/volume1/docker/dailyreport/.env` | SFTP and OAuth credentials (DO NOT commit to git) |
| `/app/` | `/volume1/docker/dailyreport/` | Application source code |

> **Keep secrets out of reach.** `deploy-nas.sh` copies `.env` in a single pass and
> runs `chmod 600` on it. It holds SFTP + OAuth credentials, so keep it on the NAS
> under a path that is **not** served by any web/container web root, and don't loosen
> its permissions. It should also never be committed — it is already excluded by
> `.dockerignore` and rsync.

## Managing the Container

### View logs

```bash
ssh admin@192.168.1.100
docker logs dailyreport_daily --tail 50
```

Follow in real time:

```bash
docker logs -f dailyreport_daily
```

### View generated reports

```bash
ssh admin@192.168.1.100
ls /volume1/docker/dailyreport/reports/
cat /volume1/docker/dailyreport/reports/2025-05-08.md
```

### Re-deploy after code changes

```bash
export NAS_IP=192.168.1.100
export NAS_USER=admin
./scripts/deploy-nas.sh
```
Stops the old container, builds and loads the new image, and starts fresh.

### Manual full rebuild

`deploy-nas.sh` already stops and removes the container before redeploying, so a
plain re-run is the full rebuild. If you must wipe a stored image by hand, run
the cleanup **on the NAS**, then redeploy **from your Mac**:

```bash
# On NAS (SSH session, or Container Station):
ssh admin@192.168.1.100 "docker rm -f dailyreport_daily; docker rmi dailyreport:latest"

# On your Mac:
export NAS_IP=192.168.1.100 NAS_USER=admin
./scripts/deploy-nas.sh
```

## Scheduling via Container Station (One-Time Setup)

The container exits after completing its task. For it to run daily, you need a **Scheduled Task**:

1. Open DSM -> **Container Station**
2. Click **Scheduled Task** in the left sidebar
3. Click **Create**
4. Select container: **dailyreport_daily**
5. Schedule: **Every day** at **03:00**
6. Task: **Start**
7. Save

The container will start at 03:00, run for ~3-5 seconds, then exit. Container Station restarts it at the next daily trigger.

## Troubleshooting

### Container exits immediately with an error

```bash
ssh admin@192.168.1.100
docker logs dailyreport_daily --tail 50
```

Common causes: missing `.env` on NAS, wrong SFTP credentials, NAS cannot reach the internet.

### Cannot reach SFTP host from NAS

The NAS needs outbound HTTPS and SFTP access:

```bash
ssh admin@192.168.1.100
curl -Is https://google.com
curl -Is https://home554762802.1and1-data.host
```

### .env not being read by the container

Verify the `.env` file exists on the NAS:

```bash
ssh admin@192.168.1.100
cat /volume1/docker/dailyreport/.env
```

It must have the FTP variables: `FTP_HOST`, `FTP_USER`, `FTP_PASS`, optionally `TARGET_DIR`.

### Container reports "image not found"

```bash
ssh admin@192.168.1.100
docker images | grep dailyreport
```

If missing, re-run `./scripts/deploy-nas.sh`.

### Logs show permission errors

The `Dockerfile` creates an `appuser` (UID 1000) with proper ownership. If your NAS has different UID/GID mappings, you may need to adjust the Dockerfile's `USER` directive or set appropriate file permissions on the NAS host directories.

## What is Inside the Container

| Path | Purpose |
|---|---|
| `/app/` | Application root directory |
| `/app/src/` | TypeScript source files |
| `/app/src/fetchers/` | HN, Reddit, RSS fetcher modules |
| `/app/config/` | `interests.yaml`, `seen-urls.json`, `feedback-weights.json` |
| `/app/reports/` | Generated Markdown reports (YYYY-MM-DD.md) |
| `/app/logs/` | `dailyreport.log`, `access.log` |
| `/app/node_modules/` | Production dependencies (fast-xml-parser, js-yaml, ssh2-sftp-client) |

The container is Alpine-based (~80 MB image) running Bun under a non-root user for security.
