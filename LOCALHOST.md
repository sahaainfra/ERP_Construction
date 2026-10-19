# Run the application locally

Verified on 2026-10-19 in this repository (commit recorded in the PR). Node.js 22 is required (`.nvmrc`).

## 1. Install
```bash
# Node 22 (any manager). With nvm:  nvm install && nvm use
node -v            # must print v22.x
npm ci             # installs the locked dependency versions
```

## 2. Start
```bash
npm run dev        # development server with hot reload
```
Open **http://localhost:3000** (Next.js default port). The run was verified at this address: HTTP 200, page title "ERP Construction", heading "Home".

If port 3000 is busy, use another port and open that one instead:
```bash
npm run dev -- --port 3100     # then open http://localhost:3100
```

## 3. Production-style run
```bash
npm run build
npm start          # serves the built app on http://localhost:3000
```

## 4. What you should see
- Shell bar with the company switcher (shows "No company selected": no company is configured yet).
- Theme and density selectors. Choices persist in the browser.
- Side navigation with one live entry: Home › Launchpad.
- Launchpad with an empty state. No sample numbers are shown (N7).
- Unknown addresses return 404.

## 5. Configuration
- No environment variables are required.
- **Database and API URL:** none yet. The application has no database and no API. These come with Parts 03 and 05. Nothing is configured, and nothing is faked.
- **Authentication:** none yet (Part 08A). Anyone who can reach the server can open the page. Run it on your own machine only.

## 6. Quality checks
```bash
npm run arch:check       # import boundaries and dependency allow-list
npm run lint
npx tsc --noEmit
npm test                 # 141 tests
npm run baseline:check   # golden outputs: destructive changes fail
npm run check:design     # currently fails: CF-004 (four contrast pairings)
```

## 7. Troubleshooting
| Symptom | Cause | Fix |
|---|---|---|
| `Unsupported engine` on install | Node is not 22 | `nvm use` (reads `.nvmrc`) |
| `EADDRINUSE :3000` | Another process holds the port | Use `--port`, or stop the other process |
| Blank page or a font warning when offline | Google Fonts are fetched at build time | Build once with network access; the built output then serves the fonts |
| `npm run check:design` exits 1 | Known contrast failures (CF-004) | Expected until the design owner decides |

## 8. Visible from where?
The URL `http://localhost:3000` refers to the machine that runs the server. In the cloud session where this was verified, it is reachable only inside that container. To use it from your own computer, run steps 1 and 2 there.
