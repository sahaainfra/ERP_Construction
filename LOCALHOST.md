# Run the application locally

Verified on 2026-10-19 in this repository. Requirements: Node.js 22 (`.nvmrc`) and PostgreSQL 16 (15 or later is supported by the design).

The application has two parts: the web app (Next.js, port 3000) and the database (PostgreSQL, port 5432). The web app reaches the database through its own role, which has no schema-changing rights.

## 1. Install Node.js 22
```bash
node -v            # must print v22.x
# With nvm:  nvm install && nvm use   (reads .nvmrc)
```

## 2. Install PostgreSQL 16
- Ubuntu / Debian: `sudo apt install postgresql` (the default version is 16 on Ubuntu 24.04).
- macOS: `brew install postgresql@16 && brew services start postgresql@16`.
- Windows: install PostgreSQL 16 from the official installer, and keep the default port 5432.
- Check it runs: `pg_isready -h localhost -p 5432` must print "accepting connections".
- The `pg_dump` and `pg_restore` tools must match the server version (16). They come with the same package.

## 3. Create the local roles and databases
Choose two passwords and run once as the PostgreSQL superuser. On Linux the superuser connects through the local socket:
```bash
sudo -u postgres psql \
  -v migrator_password='CHOOSE-MIGRATOR-PASSWORD' \
  -v app_password='CHOOSE-APP-PASSWORD' \
  -f scripts/db/setup-local.sql
```
On macOS or Windows, if the `postgres` user has a password, use `psql -U postgres -h localhost` with the same `-v` options and enter it when asked.
This creates `erp_migrator` (owns the schema), `erp_app` (application role, DML only), and the databases `erp_dev` and `erp_test`.

## 4. Install dependencies and configure
```bash
npm ci
cp .env.example .env.local        # then replace CHANGE_ME with the passwords from step 3
cp .env.test.example .env.test    # for the database tests
```
`.env.local` holds `MIGRATOR_DATABASE_URL` and `APP_DATABASE_URL`. Both are ignored by git. Never commit them.

## 5. Apply the database schema
```bash
npm run db:lint       # migration rules: must report 0 violations
npm run db:status     # shows pending migrations
npm run db:migrate    # applies them (uses MIGRATOR_DATABASE_URL)
```

## 6. Start the application
```bash
npm run dev           # development server with hot reload
```
Open **http://localhost:3000**. Check the database link:
```bash
curl -s http://localhost:3000/api/v1/health      # {"status":"ok","database":"ok"}
```
The URL was verified at this address: the page loads with title "ERP Construction" and heading "Home", and the health endpoint returns `{"status":"ok","database":"ok"}` with HTTP 200.

If port 3000 is busy, use another port: `npm run dev -- --port 3100`, then open http://localhost:3100.

Production-style run: `npm run build && npm start`.

## 7. Checks
```bash
npm run arch:check          # import boundaries and dependency allow-list
npm run lint
npx tsc --noEmit
npm test                    # all unit tests and the database tests (needs .env.test)
npm run db:backup           # dump to backups/ (git-ignored)
npm run db:restore-check    # dump, restore to a separate database, compare sys tables
npm run db:backfill-rehearsal   # 1,000,000-row back-fill with a forced stop and resume
npm run baseline:check      # golden outputs: destructive changes fail
npm run check:design        # currently fails: CF-004 (four contrast pairings)
```

## 8. Configuration reference
| Variable | Used by | Purpose |
|---|---|---|
| `MIGRATOR_DATABASE_URL` | migrate, backup, restore check | Schema owner (DDL) |
| `APP_DATABASE_URL` | the running server (health endpoint) | Application role (DML only) |
| `TEST_DATABASE_URL`, `TEST_APP_DATABASE_URL` | database tests | A database that the tests reset. Use `erp_test` only. |
| `APP_ENV` | tests and reset helper | `production` refuses the reset |
| `TOKEN_SIGNING_KEY` | sign-in (Part 07) | 32 random bytes, base64. Signs access tokens. Generate with `openssl rand -base64 32`. Never commit it. |
| `MFA_ENCRYPTION_KEY` | sign-in (Part 07) | 32 random bytes, base64. Encrypts TOTP secrets. Generate with `openssl rand -base64 32`. Losing it makes enrolled factors unusable. |

No cloud or external services are needed. Authentication, sessions and the business API do not exist yet (Parts 07, 05).

## 9. Troubleshooting
| Symptom | Cause | Fix |
|---|---|---|
| `Unsupported engine` on install | Node is not 22 | `nvm use` |
| `EADDRINUSE :3000` | Another process holds the port | Use `--port`, or stop the other process |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL is not running | Start the service (`sudo systemctl start postgresql` or `brew services start postgresql@16`) |
| `password authentication failed` | Wrong password in `.env.local` | Re-run step 3 with `ALTER ROLE`, or fix the URL |
| `MIGRATOR_DATABASE_URL is not set` | `.env.local` missing | Step 4 |
| `Migration file name ... does not match` | A file was renamed | Restore the name; migrations are never renamed after they are applied |
| `checksum` drift error on `db:migrate` | An applied migration file was edited | Revert the edit and add a new migration |
| `/api/v1/health` returns 503 | Database unreachable or wrong `APP_DATABASE_URL` | Check the server log; the response never shows the reason |
| `npm run check:design` exits 1 | Known contrast failures (CF-004) | Expected until the design owner decides |

## 10. Where the database is visible
`localhost` refers to the machine that runs the server. In the cloud session where this was verified, the app and the database run inside that container and are reachable only there. To use them on your computer, run steps 1 to 6 on that computer.
