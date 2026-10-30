# Inventory Management

An Express/EJS application using PostgreSQL for inventory records, user accounts, and sessions. Client templates and browser assets live in `client`; backend code, configuration, uploads, and tests live in `server`. Each folder has its own package manifest and lockfile.

The Stockroom Operations interface includes a compact sidebar, live inventory summaries, searchable stock tables, and product details with quick restocking. The overview highlights up to eight recent products with low stock first; the Products page contains the full inventory. Sign-in, editors, reports, and settings share the same light palette and teal accents.

## Structure

```text
client/
  views/                  EJS pages and shared layouts
  public/                 Styles, images, and browser JavaScript
  scripts/check.cjs       Template and browser-script checks
  test/                   Browser behavior regression tests
  package.json
  package-lock.json
server/
  index.js                PostgreSQL initialization and server lifecycle
  app.js                  Express setup and client asset/view paths
  db.js                   PostgreSQL connection pool
  inventory_db.sql        Idempotent PostgreSQL schema
  routes/                 Authentication and inventory routes
  src/config/             Environment and Passport configuration
  src/middleware/         Authentication, CSRF, one-time messages
  src/utils/              Validation and database transactions
  scripts/check.cjs       Server JavaScript checks
  test/                   PostgreSQL integration tests
  uploads/                Generated images, ignored by Git
  .env.example
  .env.local              Private local configuration, ignored by Git
  package.json
  package-lock.json
```

The client and server run as two independent processes on different ports. The client development server listens on http://localhost:5173 and forwards page, asset, and form requests to Express on http://localhost:3002. Express renders the existing EJS templates and handles authentication and PostgreSQL. Existing route URLs stay the same; database credentials remain in `server`. No frontend build step is required.


## Local setup

Use Node.js 22.12+ and PostgreSQL. Install dependencies in each package with `npm --prefix client install` and `npm --prefix server install` from the repository root, or run `npm install` inside each folder. Each package has its own lockfile. The root has no package manifest or lockfile. All `node_modules` folders are ignored by Git.

Create a PostgreSQL database named `inventory_db` using pgAdmin or `createdb inventory_db`. Copy `server/.env.example` to `server/.env.local` and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `SESSION_SECRET`. Alternatively set `DATABASE_URL` instead of the `DB_*` values. Generate the session secret with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The local configuration created in this workspace already points to `inventory_db` on the existing local PostgreSQL installation. `server/.env.local` contains the private connection values and a generated session secret; it is ignored by Git. Never commit it.

Start both processes in separate terminals.

Server terminal:

```powershell
cd server
npm run dev
```

Client terminal:

```powershell
cd client
npm run dev
```

Open [the inventory client](http://localhost:5173). The backend health endpoint is http://localhost:3002/health. `npm start` runs the same entry point without the file watcher. The port is configurable through `PORT`. Startup checks PostgreSQL and applies `server/inventory_db.sql` before accepting requests. `GET /health` verifies the connection. Google OAuth credentials are optional: local email/password authentication works without them. To enable Google sign-in, configure both credentials and the matching `GOOGLE_CALLBACK_URL` in Google Cloud.

## PostgreSQL migration

All runtime SQL uses PostgreSQL parameter placeholders (`$1`, `$2`, and so on), `RETURNING`, and `pg` result objects. The old MySQL driver and native bcrypt dependency were removed; password hashing uses the existing bcryptjs dependency. PostgreSQL stores users, products, suppliers, restock logs, sales history, and sessions.

The new schema uses identity sequences, foreign keys, non-negative prices/stock, integer quantity checks, timestamps, and unique user emails. A restock increases stock and writes the authenticated user's ID to its log in one transaction. Supplier deletion retains products with an empty supplier reference; product deletion removes its restock logs. Monetary values remain decimal in PostgreSQL.

This migration initializes PostgreSQL tables; it does not import historical MySQL records. The original MySQL database is not modified. Existing PostgreSQL records are preserved on startup. If historical MySQL data is needed, export and import it separately, preserving IDs, bcrypt hashes, and relationships, then advance the PostgreSQL sequences.

## Existing behavior and repaired paths

- Products and suppliers support listing, creation, editing, and deletion. Products support zero prices and zero stock.
- Dashboard stock charts count all stock levels and escape category text when embedding chart data.
- Restocking works from reports and `/inventory/restock`, records the real user ID, and rejects invalid quantities.
- Profile, account settings, password changes, bounded profile-image uploads, and session duration use PostgreSQL.
- Preferences are persisted; theme switching, translated content, and email/SMS delivery are not implemented.
- The sales page displays existing sales history. Sales entry and customer-order workflows are not implemented.
- Two-factor authentication and remote logout are not implemented; the security page does not offer nonfunctional controls.
- This remains a shared inventory for authenticated users, matching the original application. It does not provide separate business inventories or role-based access.

Forms use session CSRF tokens. Logout uses POST. Passwords require at least eight characters and at most 72 bytes. Session cookies are HTTP-only and SameSite=Lax; production cookies require HTTPS. Deploy behind one trusted reverse proxy when using `NODE_ENV=production`. The EJS layout supplies one HTML document and one Bootstrap JavaScript bundle.

## Verification

From the repository root:

```powershell
npm --prefix client run check
npm --prefix client test
npm --prefix client audit
npm --prefix server run check
npm --prefix server test
npm --prefix server audit
```

Inside either folder, `npm run check`, `npm test`, and `npm audit` check that package. The client checks cover templates and browser scripts; the server checks cover backend JavaScript. There is no separate frontend build: Express renders the EJS pages directly.

The workflow suite requires the local `inventory_db` database and schema-creation permissions. It creates a uniquely named temporary PostgreSQL schema and temporary upload directory, exercises the real HTTP routes and session store, and removes its own fixtures afterward. Existing inventory tables and records are not used as test fixtures. Coverage includes signup/login, CSRF, page rendering, persistent sessions across app instances, supplier/product CRUD, decimal and zero values, concurrent restocking, rollback, dashboard script escaping, profile settings, image uploads, and logout.


## Separate development ports

From the repository root, run `./start-dev.ps1`. It opens separate Windows terminal windows titled **Inventory - Server** and **Inventory - Client**. Each window runs only its own process. The launcher leaves an occupied port alone to avoid starting duplicate instances. Use Ctrl+C in the relevant window to stop that process. `./start-dev.ps1 -CheckOnly` checks the ports without opening windows.

- Client: `npm run dev` inside `client`, http://localhost:5173.
- Server: `npm run dev` inside `server`, http://localhost:3002.
- Keep one client process and one server process running in separate terminals. The client command does not start another backend instance.
- Set `CLIENT_PORT` and `SERVER_URL` in `client/.env.local` to change frontend settings; use `client/.env.example` as the template. The defaults work without that file. `CLIENT_PORT` must differ from the backend port.
- Set backend `PORT` and PostgreSQL values in `server/.env.local`. If you change that port, update the client `SERVER_URL` as well.
- Google OAuth callbacks should use the browser-facing client URL, by default `http://localhost:5173/auth/google/callback`. Register that callback with Google and set `GOOGLE_CALLBACK_URL` if you choose a different client port.
- A client page showing that the inventory server is unavailable means the backend needs to be started. The client displays a useful error instead of hanging.

The client development server forwards cookies, CSRF form fields, file uploads, redirects, and static assets to the backend. Browser requests stay on the client origin, preserving the existing session-based authentication. This proxy is a local development entry point; deploy the Express server behind your production web server rather than using the client development watcher in production.

Client-side scripts live in `client/public/js`. Product search, category, and stock filters apply together; ten units is consistently considered in stock. Chart.js is installed by the client package and served locally. Profile uploads are removed if their database update fails.

Product editors include a revision token: saving an outdated form returns a conflict page with a link to reload the latest data, preserving intervening edits and restocks. Editing keeps custom categories and allows suppliers to be assigned or removed; descriptions and supplier assignments are optional. Private pages use `Cache-Control: no-store`. Replacing a profile picture removes the previous generated file only after its database update succeeds.

If startup reports `EADDRINUSE`, another process is using that process's port. Stop the duplicate client or server watcher with Ctrl+C and restart the affected process. When switching from the earlier shared-server setup, stop the old terminal processes before starting one process from each folder.
