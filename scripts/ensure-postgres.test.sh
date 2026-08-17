#!/usr/bin/env bash
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ENSURE="$SCRIPT_DIR/ensure-postgres.sh"

TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/multica-ensure-postgres.XXXXXX")
cleanup() {
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

pass() {
  echo "  ok: $1"
}

fail() {
  echo "  FAIL: $1" >&2
  if [ -f "$TEST_DIR/output.log" ]; then
    echo "---- output ----" >&2
    cat "$TEST_DIR/output.log" >&2
  fi
  if [ -f "$TEST_DIR/calls.log" ]; then
    echo "---- calls ----" >&2
    cat "$TEST_DIR/calls.log" >&2
  fi
  exit 1
}

write_env() {
  local path=$1
  cat >"$path" <<EOF
POSTGRES_DB=multica
POSTGRES_USER=multica
POSTGRES_PASSWORD=multica
POSTGRES_PORT=5432
DATABASE_URL=postgres://multica:multica@localhost:5432/multica?sslmode=disable
EOF
}

setup_bin() {
  local bin_dir=$1
  mkdir -p "$bin_dir"
  : >"$TEST_DIR/calls.log"

  cat >"$bin_dir/pg_isready" <<'EOF'
#!/usr/bin/env bash
echo "pg_isready $*" >>"${MULTICA_TEST_CALLS}"
if [ "${MULTICA_TEST_PG_READY:-0}" = "1" ]; then
  exit 0
fi
exit 2
EOF

  cat >"$bin_dir/psql" <<'EOF'
#!/usr/bin/env bash
echo "psql $*" >>"${MULTICA_TEST_CALLS}"
query=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-Atqc" ] || [ "$prev" = "-c" ]; then
    query=$arg
  fi
  prev=$arg
done
if [ "${MULTICA_TEST_DB_EXISTS:-0}" = "1" ] && [[ "$query" == *"pg_database"* ]]; then
  printf '1\n'
  exit 0
fi
exit 0
EOF

  cat >"$bin_dir/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >>"${MULTICA_TEST_CALLS}"
if [ "${1:-}" = "compose" ] && [ "${2:-}" = "version" ]; then
  echo "2.29.0"
  exit 0
fi
if [ "${1:-}" = "compose" ] && [ "${2:-}" = "exec" ]; then
  shift 2
  # docker compose exec -T postgres <cmd> ...
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -T|postgres) shift ;;
      *) break ;;
    esac
  done
  if [ "${1:-}" = "pg_isready" ]; then
    exit 0
  fi
  if [ "${1:-}" = "psql" ]; then
    echo "docker-psql $*" >>"${MULTICA_TEST_CALLS}"
    if [ "${MULTICA_TEST_DB_EXISTS:-0}" = "1" ]; then
      printf '1\n'
    fi
    exit 0
  fi
fi
exit 0
EOF

  chmod 755 "$bin_dir/pg_isready" "$bin_dir/psql" "$bin_dir/docker"
}

run_ensure() {
  local bin_dir=$1
  shift
  env -i \
    PATH="$bin_dir:/usr/bin:/bin" \
    HOME="$TEST_DIR" \
    MULTICA_TEST_CALLS="$TEST_DIR/calls.log" \
    MULTICA_TEST_PG_READY="${MULTICA_TEST_PG_READY:-0}" \
    MULTICA_TEST_DB_EXISTS="${MULTICA_TEST_DB_EXISTS:-0}" \
    bash "$ENSURE" "$@" >"$TEST_DIR/output.log" 2>&1
}

echo "ensure-postgres.test.sh"

# --- missing env file ---
set +e
run_ensure "$TEST_DIR/empty-bin" "$TEST_DIR/missing.env"
status=$?
set -e
if [ "$status" -eq 0 ]; then
  fail "missing env file should fail"
fi
if ! grep -q "Missing env file" "$TEST_DIR/output.log"; then
  fail "missing env file should mention the env file"
fi
pass "missing env file fails"

# --- host Postgres already listening: do not start Docker ---
host_bin="$TEST_DIR/host-bin"
setup_bin "$host_bin"
write_env "$TEST_DIR/host.env"
: >"$TEST_DIR/calls.log"
MULTICA_TEST_PG_READY=1
MULTICA_TEST_DB_EXISTS=1
set +e
run_ensure "$host_bin" "$TEST_DIR/host.env"
status=$?
set -e
if [ "$status" -ne 0 ]; then
  fail "host Postgres ready should succeed"
fi
if grep -q '^docker ' "$TEST_DIR/calls.log"; then
  fail "host Postgres ready should not invoke docker"
fi
if ! grep -q '^psql ' "$TEST_DIR/calls.log"; then
  fail "host Postgres ready should use host psql to ensure the database"
fi
if ! grep -q 'local' "$TEST_DIR/output.log"; then
  fail "host Postgres ready should report a local (non-Docker) backend"
fi
pass "uses already-running local Postgres without Docker"

# --- host listening, database missing: create it via psql ---
: >"$TEST_DIR/calls.log"
MULTICA_TEST_PG_READY=1
MULTICA_TEST_DB_EXISTS=0
set +e
run_ensure "$host_bin" "$TEST_DIR/host.env"
status=$?
set -e
if [ "$status" -ne 0 ]; then
  fail "host Postgres with missing database should create it"
fi
if ! grep -q 'CREATE DATABASE' "$TEST_DIR/calls.log"; then
  fail "missing local database should be created via host psql"
fi
if grep -q '^docker ' "$TEST_DIR/calls.log"; then
  fail "creating a local database should not invoke docker"
fi
pass "creates missing database on host Postgres"

# --- nothing listening, Docker available: start the shared container ---
docker_bin="$TEST_DIR/docker-bin"
setup_bin "$docker_bin"
write_env "$TEST_DIR/docker.env"
: >"$TEST_DIR/calls.log"
MULTICA_TEST_PG_READY=0
MULTICA_TEST_DB_EXISTS=1
set +e
run_ensure "$docker_bin" "$TEST_DIR/docker.env"
status=$?
set -e
if [ "$status" -ne 0 ]; then
  fail "Docker fallback should succeed when host Postgres is down"
fi
if ! grep -q 'docker compose up -d postgres' "$TEST_DIR/calls.log"; then
  fail "Docker fallback should start the shared postgres container"
fi
if ! grep -q 'local Docker' "$TEST_DIR/output.log"; then
  fail "Docker fallback should report local Docker"
fi
pass "starts Docker Postgres when nothing is listening"

# --- nothing listening, Docker missing: fail with an actionable error ---
no_docker_bin="$TEST_DIR/no-docker-bin"
setup_bin "$no_docker_bin"
rm -f "$no_docker_bin/docker"
write_env "$TEST_DIR/none.env"
: >"$TEST_DIR/calls.log"
MULTICA_TEST_PG_READY=0
set +e
run_ensure "$no_docker_bin" "$TEST_DIR/none.env"
status=$?
set -e
if [ "$status" -eq 0 ]; then
  fail "missing host Postgres and Docker should fail"
fi
if ! grep -Eqi 'docker|PostgreSQL' "$TEST_DIR/output.log"; then
  fail "failure should mention Docker or PostgreSQL"
fi
pass "fails clearly when neither host Postgres nor Docker is available"

# --- remote DATABASE_URL: never start Docker ---
remote_bin="$TEST_DIR/remote-bin"
setup_bin "$remote_bin"
cat >"$TEST_DIR/remote.env" <<EOF
POSTGRES_DB=multica
POSTGRES_USER=multica
POSTGRES_PASSWORD=multica
POSTGRES_PORT=5432
DATABASE_URL=postgres://multica:multica@db.example.com:5432/multica?sslmode=disable
EOF
: >"$TEST_DIR/calls.log"
MULTICA_TEST_PG_READY=1
set +e
run_ensure "$remote_bin" "$TEST_DIR/remote.env"
status=$?
set -e
if [ "$status" -ne 0 ]; then
  fail "remote DATABASE_URL should succeed when pg_isready works"
fi
if grep -q 'docker compose up' "$TEST_DIR/calls.log"; then
  fail "remote DATABASE_URL should not start Docker"
fi
if ! grep -q 'Remote database detected' "$TEST_DIR/output.log"; then
  fail "remote DATABASE_URL should keep the remote path"
fi
pass "remote DATABASE_URL still skips Docker"

# --- contract: make dev must not require Docker up front ---
if grep -Fq 'missing+=("docker")' "$ROOT_DIR/scripts/dev.sh"; then
  fail "scripts/dev.sh must not treat Docker as a hard prerequisite"
fi
pass "dev.sh does not require Docker unconditionally"

echo "ensure-postgres.test.sh: PASS"
