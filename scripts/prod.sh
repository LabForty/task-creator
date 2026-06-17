#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$ROOT/.task-creator"
LOG_DIR="$STATE_DIR/logs"
PID_FILE="$STATE_DIR/prod.pid"
LOG_FILE="$LOG_DIR/prod.log"
HOST="${TASK_CREATOR_HOST:-0.0.0.0}"
PORT="${TASK_CREATOR_PORT:-3000}"
HEALTH_HOST="$HOST"
if [[ "$HEALTH_HOST" == "0.0.0.0" || "$HEALTH_HOST" == "::" ]]; then
  HEALTH_HOST="127.0.0.1"
fi
HEALTH_URL="http://$HEALTH_HOST:$PORT/api/health"

mkdir -p "$LOG_DIR"

usage() {
  cat <<EOF
Usage:
  npm run prod                  install, build, start detached, health-check
  npm run prod -- --skip-install
  npm run prod -- --skip-build
  npm run prod:restart          restart and health-check
  npm run prod:status           show process status
  npm run prod:logs             tail logs
  npm run prod:stop             stop process

Environment:
  TASK_CREATOR_HOST=$HOST
  TASK_CREATOR_PORT=$PORT
EOF
}

pid_is_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

current_pid() {
  [[ -f "$PID_FILE" ]] && cat "$PID_FILE"
}

stop_server() {
  local pid
  pid="$(current_pid || true)"
  if ! pid_is_running "$pid"; then
    rm -f "$PID_FILE"
    echo "task-creator is not running."
    return
  fi

  echo "Stopping task-creator pid $pid..."
  kill "$pid" 2>/dev/null || true
  for _ in {1..20}; do
    if ! pid_is_running "$pid"; then
      rm -f "$PID_FILE"
      echo "Stopped."
      return
    fi
    sleep 0.5
  done

  echo "Process did not exit; sending SIGKILL."
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
}

wait_for_health() {
  echo "Waiting for health check: $HEALTH_URL"
  local last=""
  for _ in {1..45}; do
    if last="$(curl -fsS "$HEALTH_URL" 2>&1)" && [[ "$last" == *'"ok":true'* ]]; then
      echo "Health check passed."
      return
    fi
    sleep 1
  done

  echo "Health check failed."
  echo "Last curl output: $last"
  echo "Log file: $LOG_FILE"
  tail -n 80 "$LOG_FILE" || true
  exit 1
}

start_server() {
  stop_server >/dev/null
  : > "$LOG_FILE"
  echo "Starting task-creator on $HOST:$PORT..."
  (
    cd "$ROOT"
    nohup node node_modules/next/dist/bin/next start -H "$HOST" -p "$PORT" >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
  )
  echo "Started pid $(cat "$PID_FILE")."
  wait_for_health
  echo "URL: http://$HEALTH_HOST:$PORT"
  echo "Logs: npm run prod:logs"
}

status_server() {
  local pid
  pid="$(current_pid || true)"
  if pid_is_running "$pid"; then
    echo "task-creator is running: pid $pid"
    echo "Health URL: $HEALTH_URL"
  else
    echo "task-creator is not running."
    rm -f "$PID_FILE"
    exit 3
  fi
}

up() {
  local skip_install=0
  local skip_build=0
  for arg in "$@"; do
    case "$arg" in
      --skip-install) skip_install=1 ;;
      --skip-build) skip_build=1 ;;
      -h|--help) usage; exit 0 ;;
      *) echo "Unknown option: $arg"; usage; exit 2 ;;
    esac
  done

  cd "$ROOT"
  if [[ "$skip_install" == "0" ]]; then
    npm ci
  fi
  if [[ "$skip_build" == "0" ]]; then
    npm run build
  fi
  start_server
}

cmd="${1:-up}"
if [[ $# -gt 0 ]]; then
  shift
fi

case "$cmd" in
  up) up "$@" ;;
  restart) start_server ;;
  stop) stop_server ;;
  status) status_server ;;
  logs) tail -n 80 -f "$LOG_FILE" ;;
  help|-h|--help) usage ;;
  *) echo "Unknown command: $cmd"; usage; exit 2 ;;
esac
