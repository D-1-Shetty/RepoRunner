# RepoRunner

RepoRunner is a self‑hosted deployment platform. You import a GitHub repository, and RepoRunner clones it, analyses the project, generates a Dockerfile, builds a Docker image, runs the container(s), verifies the app responds over HTTP, and streams the whole process to the browser in real time. It supports repositories that contain more than one deployable application (for example a `client/` + `backend/` layout).

---

## 1. Overview

- Import a GitHub repo → automatic clone, analyse, Dockerise, build, run, health‑check.
- One repository can produce **multiple applications**, each with its own image, container, and dynamically allocated host port.
- Per‑repository **environment variables**, encrypted at rest (AES‑256‑GCM) and delivered to backend containers via `docker run --env-file`.
- **Live deployment logs and status** over Socket.IO, plus a per‑deployment history.
- **Safe redeployment**: the currently running deployment stays up until the new one has cloned, analysed, built, started, and passed its health checks; if the new deployment fails, the old one is left running and only the new deployment is marked failed.
- Background **status synchronisation** that reconciles stored application/repository status with the real Docker container state.
- Per‑application **Stop / Restart / Recover** actions.

---

## 2. Key features

- **GitHub import** – validates the URL, fetches repo metadata from the GitHub REST API, and stores the repository record.
- **Project analysis** – looks for `package.json` at the repository root and in `client/`, `frontend/`, `backend/`, `server/`, `admin/`; detects framework (Next.js, Vite, React, Express, or generic Node.js), project type (frontend / backend / unknown), package manager (npm / yarn / pnpm from the lockfile), install/build/start commands, and a container port.
- **Dockerfile generation** – produces a `node:22-alpine` based Dockerfile per application (install → copy → optional frontend build → `EXPOSE` → `CMD`).
- **Multi‑application deployment** – backends are deployed before frontends so a frontend build can be pointed at the new backend's host port.
- **Dynamic host ports** – each container is published on the next free host port starting at `40000`.
- **HTTP health check** – after a container starts, RepoRunner polls `http://localhost:<hostPort>` and treats *any* HTTP response as "reachable"; only "nothing is listening" fails the deployment.
- **Encrypted environment configuration** – saved values are AES‑256‑GCM encrypted; the API never returns decrypted values or ciphertext, only `{ key, secret, hasValue }`.
- **Real‑time deployment view** – `deployment-log`, `deployment-history` (backlog on join/reconnect), and `deployment-status` events.
- **Container lifecycle** – Stop / Restart existing containers; Recover recreates a failed application's container from its stored image.
- **Rollback‑safe redeploys** and a background reconciliation loop (see sections 10 and 12).

---

## 3. Architecture / high‑level flow

```
Browser (React + Vite)                Backend (Express + Socket.IO)              Docker / Git / GitHub
─────────────────────────             ────────────────────────────────           ──────────────────────
Import repository        ──POST──►    validate URL, fetch GitHub metadata  ──►   api.github.com
Deploy (optional env)    ──POST──►    create Deployment, respond 202
                                      run deployment workflow (async):
                                        1. capture the previous deployment (untouched)
                                        2. git clone ──────────────────────────►  git clone <url> <dir-<deploymentId>>
                                        3. analyse project (package.json scan)
                                        4. for each app (backends first):
                                             generate Dockerfile
                                             docker build ────────────────────►  docker build -t reporunner-<repo>-<app>-<deploymentId>
                                             pick free host port (from 40000)
                                             docker run  ─────────────────────►  docker run -d -p <hostPort>:<containerPort> \
                                                                                   --add-host=host.docker.internal:host-gateway \
                                                                                   [--env-file <tmp>] <image>
                                             HTTP health check on localhost:<hostPort>
                                        5. all healthy  → remove previous containers/images + previous clone dir,
                                                          persist new applications, repo = RUNNING, deployment = SUCCESS
                                           any failure  → clean only the new resources, keep the previous deployment
                                                          running, deployment = FAILED
   live log / status  ◄──socket──     emit deployment-log / deployment-status to room deployment-<id>

Background loop:                       every ~30s: docker ps -a --filter name=reporunner-  ──►
                                        reconcile applications[].status and repository.status with real state
```

---

## 4. Tech stack

**Backend (`server/`)**
- Node.js (ES modules), Express 5
- MongoDB via Mongoose 9
- Socket.IO 4 (real‑time logs/status)
- Authentication: `jsonwebtoken`, `bcrypt`
- `axios` (GitHub API), `morgan`, `cors`, `dotenv`, `colors`
- Git via the `git` CLI (`child_process`); Docker via the `docker` CLI (`child_process`)
- Encryption: Node's built‑in `crypto` (AES‑256‑GCM) — `server/utils/secretbox.js`
- Dev tooling: `nodemon`

**Frontend (`client/`)**
- React 19, React Router 7
- Vite 8, Tailwind CSS 4 (`@tailwindcss/vite`)
- `axios`, `socket.io-client`
- Lint: `oxlint`

**Deployed application images**
- `node:22-alpine` base image, built and run with the local Docker daemon

> Note: `socket.io` and `jsonwebtoken` are declared in the **root** `package.json`; the rest of the backend dependencies are in `server/package.json`. Both installs are required to run the backend.

---

## 5. Project structure

```
RepoRunner/
├── package.json                 # root deps: socket.io, jsonwebtoken
├── server/
│   ├── server.js                # Express app, Socket.IO, route mounting, background sync bootstrap
│   ├── config/
│   │   ├── env.js               # PORT, MONGO_URI, JWT_SECRET, CONFIG_ENCRYPTION_KEY
│   │   └── path.js              # REPOSITORY_STORAGE_PATH (server/storage/repositories)
│   ├── database/db.js           # Mongoose connection
│   ├── routes/                  # auth, repositories, deployments, dashboard
│   ├── controllers/             # request handlers
│   ├── services/
│   │   ├── repository.workflow.js   # the deployment pipeline
│   │   ├── analysis.service.js      # package.json scan + framework/command detection
│   │   ├── docker.service.js        # docker build/run/stop/restart/rm/rmi/ps wrappers
│   │   ├── github.service.js        # GitHub metadata fetch + git clone
│   │   ├── healthCheck.service.js   # HTTP health check with retries
│   │   ├── statusSync.service.js    # background Docker ↔ DB status reconciliation
│   │   ├── deployment.service.js
│   │   ├── dashboard.service.js
│   │   └── repository.service.js
│   ├── models/                  # Repository, Deployment, User
│   ├── middleware/              # auth.middleware.js (protect), error.middleware.js
│   ├── utils/                   # secretbox.js (AES-256-GCM), token/url helpers, AppError, asyncHandler
│   ├── storage/repositories/    # cloned repos + generated Dockerfiles (created at runtime)
│   ├── .env.example
│   └── nodemon.json
└── client/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx, App.jsx    # routing
        ├── api/                 # api.js (axios base), auth/repository/deployment/dashboard API modules
        ├── services/socket.js   # socket.io-client instance
        ├── context/AuthContext.jsx
        ├── layouts/DashboardLayout.jsx
        ├── components/          # RepositoryCard, DeployModal, EnvironmentPanel, modals, Sidebar, Navbar, ...
        └── pages/               # Login, Dashboard, RepositoryDetails, Deployments, DeploymentDetails, RunningApplications
```

---

## 6. Prerequisites

- **Node.js 20 or newer** (developed on Node 22; deployed application images use `node:22-alpine`).
- **MongoDB** – a local or remote instance. If `MONGO_URI` is not set the server starts but skips the database connection (nothing is persisted).
- **Docker** – the Docker daemon running and the `docker` CLI on `PATH`. RepoRunner shells out to `docker build`, `docker run`, `docker ps`, etc.
- **Git** – the `git` CLI on `PATH` (repositories are cloned with `git clone`).
- **Internet access** to `api.github.com` and to GitHub for cloning.
- The generated `docker run` command uses `--add-host=host.docker.internal:host-gateway`, which resolves the host on Linux; deployed containers can reach services on the host (for example a local MongoDB) via `host.docker.internal`.

---

## 7. Local setup

From the repository root:

```bash
# 1. Root dependencies (socket.io, jsonwebtoken)
npm install

# 2. Backend dependencies
cd server
npm install
cd ..

# 3. Frontend dependencies
cd client
npm install
cd ..
```

---

## 8. Environment configuration

Environment variables are read by the backend only (`server/config/env.js` via `dotenv`). Copy the template and fill it in:

```bash
cp server/.env.example server/.env
```

`server/.env`:

| Variable | Purpose |
|---|---|
| `PORT` | Port the backend listens on. The client is hard‑coded to call `http://localhost:5000`, so use **`PORT=5000`** for the default setup to work. |
| `MONGO_URI` | MongoDB connection string. If omitted, the server runs but does not connect to a database. |
| `JWT_SECRET` | Secret used to sign/verify authentication JWTs. |
| `CONFIG_ENCRYPTION_KEY` | Base64‑encoded **32‑byte** key used to encrypt saved deployment environment values (AES‑256‑GCM). |

Optional tuning variables (all have defaults; set them in `server/.env` only if you need to change them):

| Variable | Default | Effect |
|---|---|---|
| `STATUS_SYNC_INTERVAL_MS` | `30000` | Interval of the background status‑sync loop. `0` (or a non‑positive value) disables it. |
| `HEALTHCHECK_RETRIES` | `10` | Health‑check attempts per application. |
| `HEALTHCHECK_DELAY_MS` | `2000` | Delay between health‑check attempts. |
| `HEALTHCHECK_TIMEOUT_MS` | `3000` | Per‑request health‑check timeout. |

### Generating `CONFIG_ENCRYPTION_KEY`

Generate a random base64 32‑byte key and paste it into `server/.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

- If this key is **missing or invalid**, RepoRunner will fail clearly when you try to **save** a repository environment value, and a deployment that relies on saved environment values will fail rather than run with a partial configuration.
- Do **not** commit `server/.env` or any real key/secret values.

---

## 9. Running the application

Run the backend and the frontend in separate terminals.

**Backend (development):**

```bash
cd server
npm run dev        # nodemon server.js
```

The server listens on `PORT` (use `5000`). It initialises Socket.IO, connects to MongoDB (if configured), and starts the background status‑sync loop.

**Frontend (development):**

```bash
cd client
npm run dev        # Vite dev server
```

Open the URL Vite prints (Vite's default is `http://localhost:5173`).

Other client scripts that exist: `npm run build`, `npm run preview`, `npm run lint`.

> There is no automated test suite; `npm test` in `server/` is a placeholder.

---

## 10. How RepoRunner deployment works

1. **Import** – `POST /api/repositories` validates the GitHub URL, fetches metadata from `https://api.github.com/repos/:owner/:repo`, and creates a `Repository` record.
2. **Trigger** – `POST /api/repositories/:id/clone` (optionally with a one‑time `{ env }` body) creates a `Deployment` record, responds `202`, and runs the deployment workflow asynchronously.
3. **Preserve the current deployment** – the workflow captures the previous deployment's Docker resources and clone directory but does **not** touch them yet.
4. **Clone** – `git clone <cloneUrl>` into a fresh directory named `storage/repositories/<repoId>-<deploymentId>`.
5. **Analyse** – scan for `package.json` at the root and in `client/ frontend/ backend/ server/ admin/`; determine framework, project type, package manager, commands, and container port for each application.
6. **Build & run each application** (backends first):
   - generate and write a Dockerfile,
   - `docker build -t reporunner-<repoId>-<app>-<deploymentId> <buildDir>`,
   - allocate the next free host port from `40000`,
   - `docker run -d -p <hostPort>:<containerPort> --name reporunner-<repoId>-<app>-<deploymentId> --add-host=host.docker.internal:host-gateway [--env-file <tmp>] <image>`,
   - run the HTTP health check against `http://localhost:<hostPort>`.
7. **Success** – once every new application is built, started, and health‑checked: remove the previous deployment's containers and images, remove the previous clone directory, persist the new `repository.applications` and `repository.localPath`, set the repository to `RUNNING`, and mark the `Deployment` `SUCCESS`.
8. **Failure** (during clone, analysis, build, container start, or health check) – tear down only the resources this deployment created and its new clone directory, leave the previous deployment's containers/images running, keep `repository.applications` / `repository.localPath` pointing at the previous deployment, set the repository back to `RUNNING` (or `FAILED` if there was no previous deployment), and mark only the new `Deployment` `FAILED` with the log line `Deployment failed; previous deployment left running.`

Throughout, each step is appended to the deployment's `logs` and emitted over Socket.IO (`deployment-log`); a terminal `deployment-status` event is emitted on completion; joining a deployment room replays the backlog via `deployment-history`.

---

## 11. Environment variable management

- **Persistent, per‑repository configuration** – managed from the Repository Details page (`EnvironmentPanel`) and via:
  - `GET /api/repositories/:id/env` → returns `{ key, secret, hasValue }` for each variable — **never** the decrypted value or the ciphertext.
  - `PUT /api/repositories/:id/env` → replaces the configuration. Each entry is `{ key, value?, secret?, keep? }`:
    - `keep: true` → retain the existing encrypted value unchanged,
    - a non‑empty `value` → encrypt and store it,
    - `value: ""` → clear the stored value,
    - omitting a key removes it,
    - a new key with no value is rejected.
- **Storage** – non‑empty values are encrypted with AES‑256‑GCM (`server/utils/secretbox.js`) using `CONFIG_ENCRYPTION_KEY`; only the encrypted payload is written to MongoDB. Decrypted values are never logged.
- **One‑time override** – the `POST /api/repositories/:id/clone` body may include `{ env: { KEY: "value", ... } }`. When present it is used for that deployment only and does not modify the saved configuration; when absent, the saved (encrypted) configuration is decrypted in memory and used.
- **Where variables are applied**:
  - **Backend** applications receive the resolved variables (plus a `PORT`) at runtime via `docker run --env-file` (a temporary `0600` file that is deleted after the container is created).
  - **Frontend** applications get `VITE_API_BASE_URL` / `VITE_SOCKET_URL` written to `.env.production.local` **before the image is built** (so Vite can inline them), pointed at the newly deployed backend's host port; the file is removed after the build. Frontend containers do not receive an env file at runtime.

---

## 12. Docker / deployment behavior

- **Images & containers** are named `reporunner-<repositoryId>-<applicationName>-<deploymentId>`; a new deployment's resources therefore never collide with the previous deployment's, and both can exist at the same time.
- **Base image**: generated Dockerfiles use `FROM node:22-alpine`.
- **Ports**: host ports are allocated dynamically starting at `40000`; the container port comes from analysis (Vite defaults to `4173`, others to `3000`) or from a configured `PORT`.
- **Host access**: every deployed container is started with `--add-host=host.docker.internal:host-gateway`.
- **Health check**: `GET http://localhost:<hostPort>` — any HTTP status (including 3xx/4xx/5xx) counts as healthy; connection refused / reset / timeout across all retries fails the deployment.
- **Status synchronisation** (`statusSync.service.js`): every `STATUS_SYNC_INTERVAL_MS` (default 30s, first run ~5s after startup) it runs `docker ps -a --filter "name=reporunner-"` and:
  - `running` / `restarting` → application `RUNNING`
  - other existing states → application `STOPPED`
  - container missing → application `FAILED`
  - then aggregates to `repository.status`: any application `RUNNING` → `RUNNING`; otherwise any `FAILED` → `FAILED`; otherwise all `STOPPED` → `STOPPED`; ambiguous (e.g. `PENDING`) leaves it unchanged.
  - Repositories in `CLONING` / `BUILDING` are skipped.
- **Per‑application actions** (`POST /api/repositories/:id/applications/:name/{stop,restart}`):
  - **Stop** → `docker stop` the container, status `STOPPED`.
  - **Restart** → `docker restart` the existing container, status `RUNNING`.
  - **Recover** (a `FAILED` application) → verify the stored image still exists, then `docker run` a replacement container from it (no rebuild); if the image is gone, the action returns an error rather than rebuilding.
- **Cleanup**: deleting a repository stops and removes its containers and images and deletes its clone directory.

---

## 13. Important notes / limitations

- **Single‑machine, single‑user oriented.** The backend, the Docker daemon, and the deployed containers are assumed to be on the same host. There is no multi‑node or concurrent‑deployment coordination.
- **Client configuration is hard‑coded.** `client/src/api/api.js` and `client/src/services/socket.js` point at `http://localhost:5000`; run the backend on `PORT=5000` (or change those files, which is outside this document's scope).
- **Deployment routes are not authenticated.** `GET /api/deployments/...` has no auth middleware; the repository, auth, and dashboard routes are protected with a JWT.
- **All‑or‑nothing deployments.** If one application in a multi‑application repository fails to build/start/health‑check, the whole deployment is treated as failed (and rolled back to the previous deployment).
- **Health check is shallow.** It only confirms that *something* answers HTTP on the mapped port; an application that boots but is functionally broken (for example, cannot reach its database) can still pass. `statusSync` later reflects a crashed container.
- **`FAILED → Recover` needs the original image.** If the image was removed, recovery fails and a full redeploy is required.
- **Environment variables are backend‑only at runtime.** Frontend `VITE_*` values are build‑time; only `VITE_API_BASE_URL` / `VITE_SOCKET_URL` are auto‑injected.
- **No database migrations / seeding tooling** is included; MongoDB collections are created on demand by Mongoose.
- **Host ports can change** between deployments, since they are re‑allocated each run.
- **Disk usage grows** with cloned repositories and built images under `server/storage/` and in Docker; there is no automatic pruning.
- **No automated tests.**

---

## 14. Future improvements

- Authenticate the deployment (`/api/deployments`) routes and add per‑owner authorization checks there.
- Make the client API/socket base URL configurable (build‑time env or a Vite proxy) instead of hard‑coded.
- Partial‑success handling for multi‑application repositories instead of all‑or‑nothing.
- Deeper health checks (configurable path, expected status, readiness vs. liveness).
- Stable / user‑assignable host ports and optional reverse‑proxy routing by hostname.
- Support for external secret stores and rotation of `CONFIG_ENCRYPTION_KEY`.
- Automatic pruning of old clone directories, images, and dangling layers.
- An automated test suite and CI.
- Per‑application logs/metrics (container `stdout`/`stderr` streaming) in the UI.
