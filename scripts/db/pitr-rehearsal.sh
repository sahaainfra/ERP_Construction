#!/usr/bin/env bash
# Point-in-time recovery rehearsal (Part 03 REQ-DBF-F11; CF-016). Builds a throwaway PostgreSQL cluster, archives WAL,
# takes a base backup, deletes rows, and restores to a moment just before the delete. Passes only if the rows come back.
# Needs the PostgreSQL server binaries and permission to run them as the OS user "postgres" (sudo). Never touches the dev cluster.
set -euo pipefail

BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
WORK="${PITR_WORK:-$(mktemp -d)}"
PORT="${PITR_PORT:-5455}"
RUN_AS=(sudo -n -u postgres)

mkdir -p "$WORK"/{src,base,restore,archive,sock}
chmod 755 "$WORK"
chown -R postgres "$WORK"
psql_src() { "${RUN_AS[@]}" "$BIN/psql" -h "$WORK/sock" -p "$PORT" -d postgres -v ON_ERROR_STOP=1 -Atqc "$1"; }

cleanup() {
  "${RUN_AS[@]}" "$BIN/pg_ctl" -D "$WORK/src" stop -m immediate >/dev/null 2>&1 || true
  "${RUN_AS[@]}" "$BIN/pg_ctl" -D "$WORK/restore" stop -m immediate >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${RUN_AS[@]}" "$BIN/initdb" -D "$WORK/src" -U postgres --auth=trust >/dev/null
cat >> "$WORK/src/postgresql.conf" <<CONF
port = $PORT
unix_socket_directories = '$WORK/sock'
listen_addresses = ''
wal_level = replica
archive_mode = on
archive_command = 'cp %p $WORK/archive/%f'
CONF
"${RUN_AS[@]}" "$BIN/pg_ctl" -D "$WORK/src" -l "$WORK/src.log" -w start >/dev/null

psql_src "CREATE TABLE ledger (id int PRIMARY KEY, note text); INSERT INTO ledger SELECT g, 'row ' || g FROM generate_series(1, 5) g;"
"${RUN_AS[@]}" "$BIN/pg_basebackup" -h "$WORK/sock" -p "$PORT" -U postgres -D "$WORK/base" -X stream >/dev/null
psql_src "INSERT INTO ledger VALUES (6, 'after backup');"
psql_src "SELECT pg_switch_wal();" >/dev/null
sleep 1
TARGET=$(psql_src "SELECT clock_timestamp()::text;")
sleep 1
psql_src "DELETE FROM ledger;"
psql_src "SELECT pg_switch_wal();" >/dev/null
sleep 2
psql_src "CHECKPOINT;" >/dev/null
"${RUN_AS[@]}" "$BIN/pg_ctl" -D "$WORK/src" stop -m fast >/dev/null

# Restore: start from the base backup, replay archived WAL up to TARGET, then promote.
"${RUN_AS[@]}" cp -a "$WORK/base/." "$WORK/restore/"
"${RUN_AS[@]}" chmod 700 "$WORK/restore"
cat >> "$WORK/restore/postgresql.conf" <<CONF
port = $((PORT + 1))
unix_socket_directories = '$WORK/sock'
listen_addresses = ''
restore_command = 'cp $WORK/archive/%f %p'
recovery_target_time = '$TARGET'
recovery_target_action = 'promote'
CONF
touch "$WORK/restore/recovery.signal"
"${RUN_AS[@]}" "$BIN/pg_ctl" -D "$WORK/restore" -l "$WORK/restore.log" -w start >/dev/null

COUNT=$("${RUN_AS[@]}" "$BIN/psql" -h "$WORK/sock" -p "$((PORT + 1))" -d postgres -Atqc "SELECT count(*) FROM ledger;")
echo "target time: $TARGET"
echo "rows after restore: $COUNT (expected 6: the rows that existed before the delete)"
if [ "$COUNT" = "6" ]; then
  echo "PITR rehearsal: PASS"
else
  echo "PITR rehearsal: FAIL"
  exit 1
fi
