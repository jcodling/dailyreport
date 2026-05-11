# ============================================================
# DailyReport — Dockerfile
# ============================================================
# Built for Synology Container Station and any standard Docker
# runtime.  Alpine-based Bun image keeps the image ~80 MB.
# ============================================================

FROM oven/bun:1-alpine

# Install git (needed for feedback git commit workflow)
# and curl (useful for health checks or the deploy script)
RUN apk add --no-cache git curl

# Create non-root user for security
RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -D appuser

WORKDIR /app

# --- Dependency install (layer-cached: changes when these change) ---
COPY package.json bun.lock ./
RUN bun install --production

# --- Application source ---
COPY . .

# Create runtime directories with correct ownership
RUN mkdir -p /app/reports /app/logs /app/config && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Default: run the curation pipeline (one-shot, exits when done)
CMD ["bun", "run", "generate"]
