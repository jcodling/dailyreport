#!/bin/bash
# ============================================================
# deploy-nas.sh — Deploy DailyReport to Synology NAS
#
# Method: Build locally -> save image -> SSH to NAS -> load image
#         -> run container -> one-time guide for Container Station
#         scheduling.
#
# Prerequisites (install once on your Mac):
#     brew install --cask docker
#     brew install sshpass rsync jq
#
# Usage:
#     export NAS_IP=192.168.1.100
#     export NAS_USER=admin
#     export NAS_PASS=yourpassword
#     ./scripts/deploy-nas.sh
#
# ============================================================

set -euo pipefail

NAS_IP="${NAS_IP:-"192.168.1.100"}"
NAS_USER="${NAS_USER:-"admin"}"
NAS_PASS="${NAS_PASS:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_TAG="dailyreport:latest"
IMAGE_FILE="/tmp/dailyreport-image.tar"
CONTAINER_NAME="dailyreport_daily"
DOCKER_DIR="/docker/dailyreport"

# --- Helpers ---------------------------------------------------
info()     { echo -e "\033[32m[DEPLOY]\033[0m $*"; }
warn()     { echo -e "\033[33m[DEPLOY]\033[0m $*"; }
error()    { echo -e "\033[31m[DEPLOY]\033[0m $*" >&2; exit 1; }

# --- Pre-flight checks ----------------------------------------
[ -z "$NAS_PASS" ] && error "Set NAS_PASS or export NAS_PASS=your-password"
command -v docker   || error "docker not found — run: brew install --cask docker"
command -v sshpass  || warn   "sshpass not found — run: brew install sshpass"
command -v rsync    || warn   "rsync not found — run: brew install rsync"

# --- Clean up previous deploy state --------------------------
info "Cleaning up previous deploy artifacts..."
sshpass -p "$NAS_PASS" ssh -o StrictHostKeyChecking=no "$NAS_USER@$NAS_IP" \
    "docker stop $CONTAINER_NAME 2>/dev/null || true; docker rm $CONTAINER_NAME 2>/dev/null || true"
rm -f "$IMAGE_FILE"

# --- Step 1: Build image locally ------------------------------
info "Building Docker image locally..."
pushd "$PROJECT_DIR" >/dev/null
docker build -t "$IMAGE_TAG" . 2>&1 | tail -5
IMG_SIZE=$(docker image inspect --format '{{.Size}}' "$IMAGE_TAG")
popd >/dev/null
info "Image built: $IMAGE_TAG ($(( IMG_SIZE / 1024 / 1024 ))MB)"

# --- Step 2: Save image and transfer to NAS -------------------
info "Saving and transferring image to NAS ($NAS_IP)..."
docker save -o "$IMAGE_FILE" "$IMAGE_TAG"
sshpass -p "$NAS_PASS" scp -o StrictHostKeyChecking=no "$IMAGE_FILE" "${NAS_USER}@${NAS_IP}:/tmp/"
rm -f "$IMAGE_FILE"
info "Image transferred to NAS."

# --- Step 3: Load image on NAS --------------------------------
info "Loading image on NAS..."
sshpass -p "$NAS_PASS" ssh -o StrictHostKeyChecking=no "$NAS_USER@$NAS_IP" \
    "docker load -i /tmp/dailyreport-image.tar && rm /tmp/dailyreport-image.tar"
info "Image loaded on NAS: $IMAGE_TAG"

# --- Step 4: Prepare host directories on NAS ------------------
info "Preparing storage folders on NAS..."
sshpass -p "$NAS_PASS" ssh -o StrictHostKeyChecking=no "$NAS_USER@$NAS_IP" \
    "mkdir -p /volume1${DOCKER_DIR}/{reports,logs,config}"

# --- Step 5: Copy application source to NAS -------------------
info "Copying application source to NAS..."
rsync -avz --progress \
    -e "sshpass -p '$NAS_PASS' ssh -o StrictHostKeyChecking=no" \
    --exclude='.git/' \
    --exclude='node_modules/' \
    --exclude='.DS_Store' \
    --exclude='reports/' \
    --exclude='logs/' \
    --exclude='feedback-historical/' \
    "$PROJECT_DIR/" "${NAS_USER}@${NAS_IP}:/volume1${DOCKER_DIR}/"

# Copy .env separately (excluded by rsync .dockerignore pattern)
sshpass -p "$NAS_PASS" scp -o StrictHostKeyChecking=no \
    "$PROJECT_DIR/.env" "${NAS_USER}@${NAS_IP}:${DOCKER_DIR}/.env"

info "Files copied. Starting container..."

# --- Step 6: Start container with env vars baked in -----------
# Note: We pass env vars directly rather than --env-file for max
# compatibility with Synology Container Station (some versions
# have quirks with --env-file relative paths).
info "Starting container on NAS..."

sshpass -p "$NAS_PASS" ssh -o StrictHostKeyChecking=no "$NAS_USER@$NAS_IP" <<HEREDOC
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

docker run -d \
     --name $CONTAINER_NAME \
     --restart no \
     --env-file /volume1${DOCKER_DIR}/.env \
     -v /volume1${DOCKER_DIR}:/app \
     $IMAGE_TAG
HEREDOC
# --- Step 7: Verify -------------------------------------------
echo ""
WAIT=0
CONTAINER_STATUS="unknown"
while [ $WAIT -lt 10 ]; do
    CONTAINER_STATUS=$(sshpass -p "$NAS_PASS" ssh -o StrictHostKeyChecking=no "$NAS_USER@$NAS_IP" \
        "docker inspect --format '{{.State.Status}}' $CONTAINER_NAME" 2>/dev/null || echo "unknown")

    if [ "$CONTAINER_STATUS" = "running" ]; then
        info "Container is running on NAS!"
        echo ""
        info "Recent container logs:"
        sshpass -p "$NAS_PASS" ssh -o StrictHostKeyChecking=no "$NAS_USER@$NAS_IP" \
            "docker logs --tail 10 $CONTAINER_NAME"
        break
    elif [ "$CONTAINER_STATUS" = "exited" ]; then
        warn "Container exited (expected — it runs then exits after curation). Check this for errors:"
        sshpass -p "$NAS_PASS" ssh -o StrictHostKeyChecking=no "$NAS_USER@$NAS_IP" \
            "docker logs --tail 20 $CONTAINER_NAME"
        break
    fi

    WAIT=$((WAIT + 1))
    echo "  Waiting for container to start... ($WAIT/10)"
    sleep 2
done

[ $WAIT -eq 10 ] && warn "Could not verify container status. Check manually:"
[ $WAIT -eq 10 ] && echo "  docker ps -a --filter name=$CONTAINER_NAME"

# ======================================================================
# PRINT NEXT STEPS
# ======================================================================
echo ""
echo "============================================================="
echo " DEPLOYMENT COMPLETE"
echo "============================================================="
echo ""
echo "Container status on NAS ($NAS_IP):"
echo "  docker ps -a --filter name=$CONTAINER_NAME"
echo ""
echo "IMPORTANT: Schedule the container to run daily:"
echo ""
echo "  1. Open DSM -> Container Station"
echo "  2. Find the project named \"docker\" containing $CONTAINER_NAME"
echo "  3. Click \"Scheduled Task\" (left sidebar)"
echo "  4. Click \"Create\""
echo "  5. Container:    $CONTAINER_NAME"
echo "  6. Schedule:   Every day at 03:00"
echo "  7. Task:       Start"
echo "  8. Save"
echo ""
echo "Verify a run:"
echo "  docker exec ${CONTAINER_NAME} ls /app/reports/"
echo "  docker logs ${CONTAINER_NAME} --tail 30"
echo ""
echo "Re-deploy after source changes:"
echo "  ./scripts/deploy-nas.sh"
echo "============================================================="
