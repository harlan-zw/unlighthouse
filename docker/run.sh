#!/bin/sh
# Example: run Unlighthouse in Docker with a locked-down container.
#   docker build -t unlighthouse .
#   docker/run.sh scan https://example.com
#   docker/run.sh serve --host 0.0.0.0
# The current directory is mounted at /data: unlighthouse.config.ts is read from it,
# scans are stored in ./.unlighthouse and exports land in ./unlighthouse-report.
set -eu

tty=""
[ -t 0 ] && tty="-t"

exec docker run --rm -i $tty \
  --init \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,size=2g,mode=1777 \
  --tmpfs /home/bun:rw,nosuid,nodev,size=64m,mode=1777 \
  --shm-size=1g \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 512 \
  --memory 4g \
  --user "$(id -u):$(id -g)" \
  -e HOME=/home/bun \
  -v "$PWD:/data" \
  -p 127.0.0.1:5678:5678 \
  "${UNLIGHTHOUSE_IMAGE:-unlighthouse}" "$@"
