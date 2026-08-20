#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POSTGRES_FORMULA="${HARNESSHUB_POSTGRES_FORMULA:-postgresql@17}"
if [[ -n "${HARNESSHUB_POSTGRES_PREFIX:-}" ]]; then
  POSTGRES_PREFIX="$HARNESSHUB_POSTGRES_PREFIX"
else
  POSTGRES_PREFIX="$(brew --prefix "$POSTGRES_FORMULA")"
fi
POSTGRES_BIN="$POSTGRES_PREFIX/bin"
POSTGRES_DATA="${HARNESSHUB_POSTGRES_DATA:-$PROJECT_ROOT/work/postgres-data}"
POSTGRES_LOG="$POSTGRES_DATA/server.log"
POSTGRES_PORT="${HARNESSHUB_POSTGRES_PORT:-54329}"
POSTGRES_USER="harnesshub"
POSTGRES_DB="harnesshub"

start_postgres() {
  mkdir -p "$POSTGRES_DATA"
  if [[ ! -f "$POSTGRES_DATA/PG_VERSION" ]]; then
    "$POSTGRES_BIN/initdb" \
      --pgdata="$POSTGRES_DATA" \
      --username="$POSTGRES_USER" \
      --auth=trust \
      --encoding=UTF8 \
      --no-locale
  fi

  if ! "$POSTGRES_BIN/pg_ctl" --pgdata="$POSTGRES_DATA" status >/dev/null 2>&1; then
    "$POSTGRES_BIN/pg_ctl" \
      --pgdata="$POSTGRES_DATA" \
      --log="$POSTGRES_LOG" \
      --options="-p $POSTGRES_PORT -h 127.0.0.1" \
      start
  fi

  if ! "$POSTGRES_BIN/psql" \
    --host=127.0.0.1 \
    --port="$POSTGRES_PORT" \
    --username="$POSTGRES_USER" \
    --dbname=postgres \
    --tuples-only \
    --command="SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB'" | grep -q 1; then
    "$POSTGRES_BIN/createdb" \
      --host=127.0.0.1 \
      --port="$POSTGRES_PORT" \
      --username="$POSTGRES_USER" \
      "$POSTGRES_DB"
  fi

  printf 'PostgreSQL is ready at 127.0.0.1:%s/%s\n' "$POSTGRES_PORT" "$POSTGRES_DB"
}

stop_postgres() {
  if [[ -f "$POSTGRES_DATA/PG_VERSION" ]] && \
    "$POSTGRES_BIN/pg_ctl" --pgdata="$POSTGRES_DATA" status >/dev/null 2>&1; then
    "$POSTGRES_BIN/pg_ctl" --pgdata="$POSTGRES_DATA" stop --mode=fast
  else
    printf 'PostgreSQL is not running.\n'
  fi
}

case "${1:-}" in
  start) start_postgres ;;
  stop) stop_postgres ;;
  status) "$POSTGRES_BIN/pg_ctl" --pgdata="$POSTGRES_DATA" status ;;
  *)
    printf 'Usage: %s {start|stop|status}\n' "$0" >&2
    exit 2
    ;;
esac
