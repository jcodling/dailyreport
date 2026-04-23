# Remote Cron Trigger Refactor

## Summary

This refactor moves daily report generation from macOS `launchd` cron to a remote HTTP trigger system. The local server accepts authenticated POST requests at `/admin/cron/generate`, allowing cron to run from any server (IONOS VPS, Docker container, external host) without requiring the machine to stay awake.

## Branch

`refactor/cron-to-remote-trigger`

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/server.ts` | Modified | Added `/admin/cron/generate` endpoint with API key auth |
| `scripts/cron-trigger.ts` | Created | Helper script for triggering cron via HTTP |
| `.env.example` | Created | Template for environment configuration |

## Setup Steps

### 1. Create `.env` with secure API key

```bash
cp .env.example .env
nano .env  # or your preferred editor
```

Generate a secure API key:
```bash
openssl rand -hex 32
# or
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Add to `.env`:
```env
API_KEY=<your-generated-secret>
```

### 2. Install dependencies (if needed)

No new npm packages required for this refactor.

### 3. Test locally

```bash
# Start the server
bun run serve

# In another terminal, test authentication:

# Should return 401 Unauthorized
curl -s -X POST http://localhost:3001/admin/cron/generate

# Should return 401 Unauthorized
curl -s -X POST http://localhost:3001/admin/cron/generate \
  -H "X-API-Key: wrong-key"

# Should return 200 OK
curl -s -X POST http://localhost:3001/admin/cron/generate \
  -H "X-API-Key: <your-api-key>"
```

Expected responses:
```json
{"error":"Unauthorized"}
{"error":"Unauthorized"}
{"ok":true,"message":"Report generation started"}
```

### 4. Deploy to server

Push the branch to the repository:
```bash
git push origin refactor/cron-to-remote-trigger
```

Then either:
- Merge to master when ready for deployment
- Or checkout on your server and run directly

## Cron Configuration

### Option A: Direct curl (Recommended)

Simplest option — works on any server with `curl` and network access to your server.

```bash
# Edit crontab on remote server
crontab -e

# Add this line:
0 3 * * * curl -s -X POST https://things.jcodling.ca/projects/dailyreport/admin/cron/generate \
  -H "X-API-Key: your-secret-api-key"
```

**Pros:**
- No Bun runtime required on cron server
- Works on any Unix system
- Minimal dependencies

### Option B: scripts/cron-trigger.ts

Use the helper script if you want Bun to handle the trigger.

```bash
# Edit crontab on server with Bun installed
crontab -e

# Add this line (adjust path):
0 3 * * * /usr/bin/bun /full/path/to/dailyreport/scripts/cron-trigger.ts >> /var/log/dailyreport.log 2>&1
```

Or using `SERVER_URL` for remote triggering:
```bash
0 3 * * * SERVER_URL=https://your-server.example.com/admin/cron/generate bun /full/path/to/dailyreport/scripts/cron-trigger.ts
```

**Pros:**
- Consistent environment with local testing
- Can add more logic to the script later

### Option C: Docker container

Run cron inside a Docker container that triggers your server.

```yaml
# docker-compose.yml
services:
  dailyreport-cron:
    image: alpine:latest
    command: >
      sh -c "
        echo '0 3 * * * curl -s -X POST http://server:3001/admin/cron/generate -H \"X-API-Key: secret\"' | crontab - &&
        crontab - &&
        while true; do sleep 86400; done
      "
    restart: unless-stopped
```

## Testing Integration

### Trigger manually

```bash
# Using curl
curl -s -X POST https://your-server.example.com/admin/cron/generate \
  -H "X-API-Key: your-secret-api-key"

# Using helper script
bun scripts/cron-trigger.ts
```

### Verify report generation

```bash
# Check logs
tail -f logs/dailyreport.log

# Verify report was created
ls -la reports/2026-04-*.md

# Check report content
head -50 reports/2026-04-23.md
```

### Monitor for first few runs

- Check reports are generated correctly at 3 AM
- Verify no SFTP upload failures
- Confirm Claude API calls succeed
- Watch for any authentication errors

## Decommission launchd (Optional)

After confirming the new method works reliably (3-7 days), remove launchd:

```bash
# Remove launchd job
launchctl unload ~/Library/LaunchAgents/com.dailyreport.generate.plist
rm ~/Library/LaunchAgents/com.dailyreport.generate.plist

# Disable recurring wake (optional — skip if you need wake for other tasks)
sudo pmset repeat wake MTWRFSU 02:55:00  # re-enable wake as needed
```

## Security Considerations

1. **API Key Security**
   - Use a strong, random API key (32+ characters)
   - Never commit `.env` to git
   - Rotate the key periodically

2. **HTTPS**
   - Always use HTTPS for the cron endpoint
   - Ensure SSL certificate is valid

3. **Firewall**
   - Consider restricting access to `/admin/cron/generate` by IP
   - Only allow known cron server IPs

4. **Logging**
   - All triggers are logged via `log()` and `warn()` in `src/index.ts`
   - Monitor logs for failed attempts

## Troubleshooting

### Cron not triggering

```bash
# Check crontab syntax
crontab -l

# Test manually
curl -s -X POST https://your-server.example.com/admin/cron/generate \
  -H "X-API-Key: your-secret-api-key"

# Verify server is running
curl -s http://your-server.example.com:3001/api/reports
```

### Authentication failures

```bash
# Verify API_KEY in server's .env
cat /path/to/dailyreport/.env | grep API_KEY

# Check X-API-Key header matches
curl -v -X POST https://your-server.example.com/admin/cron/generate \
  -H "X-API-Key: your-secret-api-key"
```

### Server not responding

```bash
# Check server process
ps aux | grep "bun run serve"

# Check server logs
tail -100 /path/to/dailyreport/logs/dailyreport.log

# Restart server
pkill -f "bun run serve"
bun run serve &
```

## Timeline

| Step | Action | Estimated Time |
|------|--------|----------------|
| 1 | Create `.env` with secure API key | 5 min |
| 2 | Test authentication locally | 10 min |
| 3 | Push branch and deploy | 5 min |
| 4 | Set up remote cron | 5 min |
| 5 | Test first trigger | 5 min |
| 6 | Monitor for 3-7 days | Ongoing |
| 7 | Decommission launchd | 5 min |

## Rollback

If issues occur, revert to launchd:

```bash
# Restore launchd (from saved plist or reinstall)
launchctl load ~/Library/LaunchAgents/com.dailyreport.generate.plist

# Or run reports manually:
bun run generate
```

To remove this refactor branch:

```bash
git checkout master
git merge master
git branch -D refactor/cron-to-remote-trigger
```
