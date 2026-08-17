#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create .env from .env.example, or run 'make worktree-env' and use .env.worktree."
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

POSTGRES_DB="${POSTGRES_DB:-multica}"
POSTGRES_USER="${POSTGRES_USER:-multica}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-multica}"
DATABASE_URL="${DATABASE_URL:-}"

export PGPASSWORD="$POSTGRES_PASSWORD"

db_host=""
db_port="${POSTGRES_PORT:-5432}"
db_name="$POSTGRES_DB"

parse_database_url() {
  local rest authority hostport path port_part

  rest="${DATABASE_URL#*://}"
  rest="${rest%%\?*}"
  authority="${rest%%/*}"
  path="${rest#*/}"

  if [ "$authority" = "$rest" ]; then
    path=""
  fi

  hostport="${authority##*@}"

  if [[ "$hostport" == \[* ]]; then
    db_host="${hostport#\[}"
    db_host="${db_host%%]*}"
    port_part="${hostport#*\]}"
    if [[ "$port_part" == :* ]] && [ -n "${port_part#:}" ]; then
      db_port="${port_part#:}"
    fi
  else
    db_host="${hostport%%:*}"
    if [[ "$hostport" == *:* ]] && [ -n "${hostport##*:}" ]; then
      db_port="${hostport##*:}"
    fi
  fi

  if [ -n "$path" ]; then
    db_name="${path%%/*}"
  fi
}

if [ -n "$DATABASE_URL" ]; then
  parse_database_url
fi

is_local() {
  [ -z "$DATABASE_URL" ] || [ "$db_host" = "localhost" ] || [ "$db_host" = "127.0.0.1" ] || [ "$db_host" = "::1" ]
}

has_docker() {
  command -v docker >/dev/null 2>&1
}

host_postgres_ready() {
  local host=$1
  local port=$2
  command -v pg_isready >/dev/null 2>&1 && pg_isready -h "$host" -p "$port" >/dev/null 2>&1
}

ensure_host_database() {
  local host=$1
  local port=$2

  echo "==> Ensuring database '$POSTGRES_DB' exists..."

  if ! command -v psql >/dev/null 2>&1; then
    if host_postgres_ready "$host" "$port"; then
      echo "✓ PostgreSQL ready (local). Database: $POSTGRES_DB"
      echo "  psql not found; skipped CREATE DATABASE. Create '$POSTGRES_DB' if it does not exist."
      return
    fi
    echo "PostgreSQL is reachable on $host:$port, but psql is not installed."
    echo "Install the PostgreSQL client tools, or install Docker so make can start the shared container."
    exit 1
  fi

  db_exists="$(psql -h "$host" -p "$port" -U "$POSTGRES_USER" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB'")"

  if [ "$db_exists" != "1" ]; then
    psql -h "$host" -p "$port" -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
      -c "CREATE DATABASE \"$POSTGRES_DB\"" \
      >/dev/null
  fi

  echo "✓ PostgreSQL ready (local). Database: $POSTGRES_DB"
}

ensure_docker_database() {
  echo "==> Ensuring shared PostgreSQL container is running on localhost:5432..."
  docker compose up -d postgres

  echo "==> Waiting for PostgreSQL to be ready..."
  until docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d postgres > /dev/null 2>&1; do
    sleep 1
  done

  echo "==> Ensuring database '$POSTGRES_DB' exists..."
  db_exists="$(docker compose exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB'")"

  if [ "$db_exists" != "1" ]; then
    docker compose exec -T postgres \
      psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
      -c "CREATE DATABASE \"$POSTGRES_DB\"" \
      > /dev/null
  fi

  echo "✓ PostgreSQL ready (local Docker). Database: $POSTGRES_DB"
}

if is_local; then
  local_host="${db_host:-localhost}"

  if host_postgres_ready "$local_host" "$db_port"; then
    echo "==> Local PostgreSQL already accepting connections on $local_host:$db_port."
    ensure_host_database "$local_host" "$db_port"
  elif has_docker; then
    ensure_docker_database
  else
    echo "PostgreSQL is not running on $local_host:$db_port, and Docker is not available to start it."
    echo "Start a local PostgreSQL 17 that accepts connections as '$POSTGRES_USER',"
    echo "or install Docker so make can start the shared container."
    exit 1
  fi
else
  # ---------- Remote: skip Docker, verify connectivity ----------
  echo "==> Remote database detected (host: $db_host). Skipping Docker."
  if command -v pg_isready > /dev/null 2>&1; then
    echo "==> Waiting for PostgreSQL at $db_host:$db_port to be ready..."
    until pg_isready -d "$DATABASE_URL" > /dev/null 2>&1; do
      sleep 1
    done
    echo "✓ PostgreSQL ready (remote: $db_host:$db_port). Database: $db_name"
  else
    echo "==> pg_isready not found. Skipping remote connectivity preflight."
    echo "✓ PostgreSQL configured (remote: $db_host:$db_port). Database: $db_name"
  fi
fi
