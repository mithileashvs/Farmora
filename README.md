# 🌾 Farmora — AI Farming Assistant

Farmora is an AI farming assistant for farmers in Tamil Nadu, India, offering
advice on soil, leaf/crop health, weather, government schemes, and market
prices — with full Tamil + English support.

## Stabilization fixes (post-Phase 3)

A round of fixes was applied after Phase 3 to address real issues found by
inspecting the actual codebase (not assumptions from prior reports). Summary
— full detail in each relevant section below:

1. **MongoDB SRV DNS resolution** — `backend/src/config/db.js` now configures
   Node's DNS resolver (`MONGODB_DNS_SERVERS`, default `8.8.8.8,8.8.4.4`)
   before `mongoose.connect()`, fixing `querySrv ECONNREFUSED` on
   `mongodb+srv://` Atlas URIs in environments whose default resolver can't
   handle SRV records. No URI/hostname/credential changes; TLS and network
   rules untouched.
2. **CSP / inline JavaScript** — inspection found **zero inline HTML event
   handlers** (`onclick=`, etc. — the codebase already used
   `addEventListener` throughout), but one large inline `<script>` block.
   Extracted to `frontend/js/app.js`; Helmet's CSP is now explicit
   (`script-src 'self'`, no `unsafe-inline`/`unsafe-eval`) instead of
   implicit-default. See "CSP configuration" below for what this required
   restoring (weather/fonts) so nothing broke.
3. **Farm/crop context → RAG** — a real bug: the chat/analysis controllers
   built farmer context for the Groq prompt but never passed the farmer's
   *saved* crop into RAG retrieval. Fixed by having `farmContext.service.js`
   return structured fields (crop, variety, soil, irrigation) from its
   existing single DB lookup, now passed to `retrieveForQuery()`.
4. Verified the RAG pipeline (query → embed → retrieve → filter → prompt →
   source attribution) matches the intended architecture — no fake/hardcoded
   retrieval found.
5. **Knowledge source transparency** — verified no document or UI text
   overclaims "ICAR verified"/"official" status; sources are labeled as
   organization attribution, not verification (see "Knowledge sources").
6. Confirmed RAG source attribution exposes title/organization/url/relevance
   and (new) a safe content-hash `documentId`, never embeddings or Mongo `_id`s.
7. Verified image analysis (soil/leaf/general, ≤3 images, validation, no raw
   storage) is unaffected and still receives RAG context.
8. Verified chat/diagnosis history, pagination, and ownership checks are
   unaffected by the above.
9. Security audit (see "Security audit results" below).
10. Regenerated `backend/.env.example` (missing from this upload) with real,
    non-duplicate variable names and no secrets; confirmed `backend/.env` is
    gitignored and not present/tracked/staged.

## Architecture (Phase 1: secured backend)

```
Frontend (static HTML/JS)
        │  fetch('/api/chat' | '/api/analyze')
        ▼
Farmora Backend (Node.js + Express)
        │  server-side only — holds GROQ_API_KEY
        ▼
Groq API (vision-capable chat model)
```

Previously this was a **client-side-only** app: the browser called the Groq
API directly with a key stored in `config.js`. That meant anyone inspecting
network requests on a deployed site could see and reuse the key.

As of Phase 1, the browser **never** talks to Groq directly. It calls the
Farmora backend, which holds the Groq key in an environment variable and
proxies the request. The API key never reaches the browser, frontend source,
or README.

```
farmora/
├── frontend/              # existing static frontend (unchanged UI/UX)
│   ├── index.html
│   ├── config.js          # frontend runtime config — no secrets
│   └── config.example.js
├── backend/                # Node.js + Express API
│   ├── src/
│   │   ├── server.js
│   │   ├── routes/         # chat, analyze, health + users, farms, diagnoses, chats (Phase 2)
│   │   ├── controllers/    # chat/analysis (+ context/persistence), user/farm/diagnosisHistory/chatHistory (Phase 2)
│   │   ├── services/       # groq.service.js (only file touching Groq), farmContext.service.js (Phase 2)
│   │   ├── models/         # User.js, Farm.js, Diagnosis.js, Chat.js — Mongoose schemas (Phase 2)
│   │   ├── validators/     # zod request-validation schemas (Phase 2)
│   │   ├── middleware/     # error, rateLimit, requireDb (Phase 2)
│   │   └── config/         # env.js, db.js (Mongo connection, Phase 2)
│   ├── tests/              # node:test unit + API tests
│   ├── package.json
│   └── .env.example
└── README.md
```

## Architecture (Phase 2: database + farmer profiles + farm context)

```
Frontend (static HTML/JS)
        │  anonymous device UUID (farmora_user_id) sent as userId/farmId
        ▼
Farmora Backend (Node.js + Express)
        │             │
        │  Groq calls │  profile/farm/history reads+writes
        ▼             ▼
   Groq API        MongoDB (Mongoose)
```

Phase 2 turns Farmora from a stateless assistant into one that remembers a
farmer's profile, farms, crops, and past diagnoses/chats — **without**
requiring real login. `/api/chat` and `/api/analyze` keep working exactly as
in Phase 1 for anyone who doesn't send a `userId`; when a `userId` is
present, the backend looks up that farmer's saved profile/farm and folds a
short context summary (location, language, primary crop, farm area, soil
type, active crop) into the AI prompt — never the whole database.

## Anonymous identity (⚠️ this is NOT authentication)

There are no passwords, sessions, JWTs, or OAuth in this phase. Instead, the
frontend generates a random UUID once (`crypto.randomUUID()`), stores it in
`localStorage` as `farmora_user_id`, and sends it as `userId` on requests.
The backend uses this string purely as a lookup key to associate a profile,
farms, and history records — it does **not** verify who is making the
request.

**Practical implications:**
- Anyone with access to the browser/device (or who learns the ID) can read
  and modify that profile's data.
- Clearing browser storage creates a brand-new, unlinked profile — unless
  you've signed up (see "Sign Up / Login" below), which gives you a way to
  recover the same `userId` from another device or after clearing storage.
- Ownership checks on farms/crops (`{ _id, userId }` queries — see below) stop
  a request from reading someone else's farm just by guessing an ID in the
  URL, but they do **not** stop someone from reusing another user's ID if
  they somehow obtain it, since the ID itself is the only "credential."

This is intentionally a placeholder ("development-safe identity") so real
authentication (passwords/OAuth/JWT) can be layered on top in a later phase
without rewriting the database schema — every model already keys off a plain
`userId` string rather than assuming a specific auth mechanism.

## Sign Up / Login (⚠️ still NOT authentication — a userId-recovery convenience)

`POST /api/accounts/signup` and `POST /api/accounts/login` (backed by the
`Account` model above) let a farmer attach a phone number + password to
their current anonymous `userId`, so they can recover that same `userId` —
and therefore their farms/diagnoses/chat history — from a different device
or after clearing this one's storage, by logging in again.

**What this actually is:**
- Sign Up: client sends `{ name, phone, password, userId }` (its current
  anonymous id); the backend hashes the password (`scrypt`, salted, via
  Node's built-in `crypto` — no new dependency), stores `{ phone,
  passwordHash, userId, name }`, and upserts a matching `User` profile.
- Login: client sends `{ phone, password }`; on a match, the backend
  returns `{ userId, name }` (never the hash) and the frontend overwrites
  its local `farmora_user_id` with that value, then reloads.

**What this is NOT:**
- No session, token, or JWT is issued. After login, the client just holds
  the plain `userId` string again — exactly like the anonymous mechanism
  above — and every subsequent request still trusts whatever `userId` the
  client sends, unverified. Knowing a `userId` is still equivalent to
  "being" that user for every other endpoint.
- Phone numbers are not verified (no SMS/OTP) — this is a lookup key the
  farmer chooses, not a confirmed identity.
- Rate-limited (10 requests/minute/IP on both routes) against naive
  brute-force guessing, but this is not a substitute for real account
  lockout/backoff or audit logging.

Do not present this to users as "your account is secure" — it is a
convenience for not losing access to your data, using the same honest
framing as the rest of Phase 2's anonymous-identity design.

## Architecture (Phase 3: retrieval-augmented generation / RAG)

```
Farmer question (+ Phase 2 farmer/farm context)
        │
        ▼
Query understanding (crop / topic / category — keyword-based, no extra LLM call)
        │
        ▼
Knowledge retrieval (backend/src/rag/) — embed query, cosine-similarity
search over KnowledgeChunk documents in MongoDB, filter by similarity
threshold + light metadata boost, drop near-duplicates, top-K
        │
        ▼
Prompt assembly — numbered knowledge block + grounding instructions,
appended to the existing Phase 1/2 system prompt (mode + farmer context)
        │
        ▼
Groq (unchanged integration point)
        │
        ▼
Grounded answer + source list (title/organization/url — no internal ids,
no embeddings) returned to the frontend and persisted with the chat/diagnosis
```

RAG grounds Farmora's answers in a small curated agricultural knowledge base
instead of relying purely on the model's own (unverifiable, un-sourced)
training knowledge — and it degrades to the exact Phase 1/2 behavior,
automatically and silently, whenever the knowledge base or its database is
unavailable (see "RAG fallback behavior" below).

### Vector database choice — and why

**Chosen: MongoDB (the same database Phase 2 already uses), with
similarity search done in the application layer**, not a separate vector
database service.

- Phase 2 already added MongoDB/Mongoose to this project. Introducing a
  second database (a dedicated vector DB service, or a hosted vector
  search API) for a knowledge base of a few dozen to a few hundred short
  chunks would be infrastructure the project doesn't need yet, and the
  task explicitly asks to avoid unnecessary new infrastructure.
- `KnowledgeChunk` documents (`backend/src/models/KnowledgeChunk.js`) store
  the chunk text, full metadata, and its embedding as a plain number array.
  `backend/src/rag/retrieval/retriever.js` fetches a metadata-filtered
  candidate set and computes cosine similarity in Node.js, applies the
  similarity threshold, boosts same-category matches slightly, removes
  near-duplicate chunks, and returns the top-K.
- This brute-force approach is genuinely fine at this knowledge-base size
  (tens of milliseconds over a few hundred documents) and keeps the whole
  stack to one database.
- **When to graduate**: once the knowledge base grows past roughly a few
  thousand chunks, or query latency becomes a real concern, the natural
  next step — without changing the `KnowledgeChunk` schema or the
  `retrieveChunks()` interface — is either MongoDB Atlas Vector Search
  (if hosted on Atlas) or a dedicated vector database (e.g. Qdrant,
  Pinecone, Weaviate). The retriever is isolated behind one function
  precisely so that swap doesn't ripple through the rest of the app.

### Embedding model choice — and why

**Default: a lightweight, offline, deterministic "local" embedding**
(`EMBEDDING_PROVIDER=local`, `backend/src/rag/services/embedding.service.js`),
with an optional real semantic-embedding provider (`EMBEDDING_PROVIDER=openai`)
for production use.

- This sandbox/dev environment has no network access to any embedding API
  and no API key, and the task explicitly requires the whole pipeline —
  ingestion, retrieval, tests — to run without a live embedding provider.
  A "local" provider makes that possible: it hashes each token into one of
  256 fixed buckets, weights by term frequency, and L2-normalizes — a
  hashed bag-of-words vector, not a real semantic embedding. Two texts that
  share vocabulary score meaningfully higher cosine similarity than
  unrelated texts, which is enough for reasonable keyword-ish retrieval
  and makes the system fully testable offline (see `backend/tests/rag.test.js`).
  It is **not** semantically aware (e.g. it won't strongly relate "yellowing
  leaves" to "chlorosis" unless the words themselves overlap).
- For production-quality semantic retrieval, set `EMBEDDING_PROVIDER=openai`,
  `EMBEDDING_MODEL` (defaults to `text-embedding-3-small`), and
  `OPENAI_API_KEY` — `embedding.service.js` calls OpenAI's `/v1/embeddings`
  endpoint instead, with the same interface, so nothing else in the RAG
  pipeline needs to change.
- The provider is fully configurable via environment variables (`EMBEDDING_PROVIDER`,
  `EMBEDDING_MODEL`) exactly as required — no hardcoded provider or secrets.

### Knowledge sources

The seed knowledge base (`backend/data/knowledge/*.json`, 12 documents → 40
chunks after ingestion) covers paddy, tomato, groundnut, sugarcane, and
cotton cultivation/disease/pest topics, soil health card interpretation,
drip irrigation, integrated pest management, post-harvest paddy storage,
the PM-KISAN scheme, and Tamil Nadu's monsoon/sowing calendar.

**Important honesty note on these documents**: this sandbox has no network
access to actually fetch and scrape real ICAR/TNAU/government publications.
Each seed document is an **original summary I wrote myself**, describing
well-established, publicly known agricultural practices (crop calendars,
disease symptoms, IPM principles, etc.), attributed to the real
organization whose general subject-matter domain it reflects (ICAR, TNAU,
the Soil Health Card scheme, PM-KISAN), with each `sourceUrl` pointing to
that organization's general public portal — **not** a verified deep link to
a specific source page, since no specific page was actually fetched.
**Before relying on this knowledge base for real farmer advice, replace or
supplement these seed documents with actual ingested text from verified
ICAR/TNAU/government publications** (see "Building a real knowledge base"
below). Treat the current seed set as a structurally-complete example/starter
knowledge base, not as verified agricultural literature.

Each document also carries `category`, `crop`, `cropStage`, `topic`,
`language`, `region`, `publishedDate`, and `lastVerifiedAt` metadata (see
`backend/src/models/KnowledgeChunk.js`) — enough for retrieval filtering and
source attribution without unnecessary complexity.

### Building a real knowledge base

1. Add a new `.json` file to `backend/data/knowledge/` per source document,
   following the shape of the existing files (`title`, `source`,
   `sourceUrl`, `organization`, `category`, `crop`, `topic`, `language`,
   `region`, `content`, ...). Keep `content` to your own summary/excerpt —
   don't paste large verbatim copyrighted blocks.
2. Run `npm run ingest:knowledge` (see below). It's idempotent — re-running
   it after editing a document upserts the changed chunks rather than
   duplicating the knowledge base.
3. For real semantic retrieval quality, switch `EMBEDDING_PROVIDER=openai`
   first (see above) — the default `local` provider is a keyword-ish
   fallback, not a substitute for real embeddings at knowledge-base scale.

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `backend/.env` and set your real Groq API key (and, optionally, MongoDB):

```
GROQ_API_KEY=your_real_key_here
PORT=5000
CLIENT_ORIGIN=http://localhost:3000
MONGODB_URI=mongodb://127.0.0.1:27017/farmora
```

> ⚠️ **If you previously used this repo's old `config.js`, rotate that Groq
> key** in the Groq console before reusing it here. It was never committed to
> git, but it's good practice to treat any key that ever sat in a local file
> outside `backend/.env` as exposed and issue a fresh one.

Start the backend:

```bash
npm run dev     # auto-reloading (nodemon)
# or
npm start       # plain node
```

The backend serves the `frontend/` folder itself, so once it's running, just
open:

```
http://localhost:5000
```

...and the full app (chat, soil/leaf photo analysis, weather, schemes, etc.)
works exactly as before — just backed by the secure API instead of a
browser-side Groq call.

### 2. Frontend on a separate origin (optional)

If you'd rather serve the frontend separately (e.g. `npx serve frontend` on
port 3000) instead of letting the backend serve it:

1. In `backend/.env`, set `CLIENT_ORIGIN=http://localhost:3000` (or wherever
   you're serving it from) so CORS allows it.
2. In `frontend/config.js`, set `API_BASE_URL` to the backend's URL, e.g.
   `"http://localhost:5000"`.

### 3. MongoDB (optional but recommended)

Farmora works with **no database at all** — `/api/chat` and `/api/analyze`
never depend on it. But without `MONGODB_URI` set, profile/farm/history
features (`/api/users`, `/api/farms`, `/api/diagnoses`, `/api/chats`) return
`503` and the frontend's "My Farms", dashboard summary, and history views
show empty/unavailable states.

To enable persistence:

- **Local**: install MongoDB Community Edition, run `mongod`, and set
  `MONGODB_URI=mongodb://127.0.0.1:27017/farmora`.
- **Atlas (hosted, free tier)**: create a cluster at mongodb.com, get a
  connection string, and set
  `MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/farmora`.

No schema setup is needed — Mongoose creates collections/indexes on first
use. If MongoDB is unreachable at startup or goes down later, the server
does **not** crash; `/api/health` reports `"database": "disconnected"` and
the DB-backed routes return a clean `503` until it reconnects.

### 4. Knowledge base (Phase 3 RAG — optional, needs MongoDB from step 3)

Seed the agricultural knowledge base:

```bash
cd backend
npm run ingest:knowledge
```

This reads `backend/data/knowledge/*.json`, chunks and embeds each
document, and upserts the chunks into MongoDB — it's idempotent, so
re-running it after editing a source file just updates the changed chunks.
It reports how many documents/chunks were processed and any failures.

Without this step (or without MongoDB configured), `/api/chat` and
`/api/analyze` still work exactly as in Phase 1/2 — they just proceed
without RAG grounding (see "RAG fallback behavior" below).

## Environment variables (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Your Groq API key. Server-side only. |
| `PORT` | No (default `5000`) | Port the backend listens on. |
| `CLIENT_ORIGIN` | No (default `http://localhost:3000`) | Comma-separated list of origins allowed to call the API cross-origin. Not needed when the backend serves the frontend itself. |
| `GROQ_MODEL` | No (default `qwen/qwen3.6-27b`) | Groq model used for chat + vision. |
| `MONGODB_URI` | No | MongoDB connection string for Phase 2 persistence *and* Phase 3's knowledge-base vector storage. If unset, chat/analyze still work; profile/farm/history routes return `503`, and RAG silently degrades to no-grounding. Never hardcode credentials — this must stay an environment variable. |
| `MONGODB_DNS_SERVERS` | No (default `8.8.8.8,8.8.4.4`) | Comma-separated DNS server IPs used to resolve the MongoDB Atlas `mongodb+srv://` SRV record before connecting. Fixes `querySrv ECONNREFUSED` in environments whose default OS resolver can't resolve SRV records. Only the DNS servers are logged (never the URI/credentials). |
| `EMBEDDING_PROVIDER` | No (default `local`) | `local` (offline, deterministic, no API key needed) or `openai` (real semantic embeddings, needs `OPENAI_API_KEY`). |
| `EMBEDDING_MODEL` | No (default `text-embedding-3-small`) | Only used when `EMBEDDING_PROVIDER=openai`. |
| `OPENAI_API_KEY` | Only if `EMBEDDING_PROVIDER=openai` | Server-side only, same treatment as `GROQ_API_KEY`. |
| `RAG_TOP_K` | No (default `5`) | Max knowledge chunks returned per retrieval. |
| `RAG_SIMILARITY_THRESHOLD` | No (default `0.12`) | Minimum cosine similarity to include a chunk. Tuned for the `local` provider — raise substantially (e.g. `0.75`) if you switch to `openai`. |

## API endpoints

### `GET /api/health`
```json
{ "status": "ok", "service": "farmora-backend", "database": "connected" }
```
`database` is one of `"not_configured"` (no `MONGODB_URI` set — expected,
non-degraded), `"connected"`, or `"disconnected"`. `status` is `"degraded"`
only when `MONGODB_URI` is set but the connection is currently down; the
core chat/analyze features don't need the database, so this never reports a
hard failure just because Mongo is unavailable.

### `POST /api/chat` — text-only chat (JSON)
Request:
```json
{
  "message": "நெல் பயிரிடும் காலம்?",
  "language": "ta-IN",
  "mode": "general",
  "crop": "Paddy",
  "location": "Trichy",
  "userId": "the-anonymous-device-uuid",
  "farmId": "optional-mongo-farm-id"
}
```
`userId`/`farmId` are optional and additive (Phase 2) — omit them and the
endpoint behaves exactly as in Phase 1. When present and MongoDB is
reachable, the backend looks up that farmer/farm and folds a short context
summary into the prompt, then persists the exchange as a `Chat` record
(best-effort — never blocks or fails the response if persistence fails).

Response (additive since Phase 1/2 — existing consumers reading `response`/
`language`/`confidence` are unaffected by the new `sources` field):
```json
{
  "success": true,
  "response": "...",
  "language": "ta-IN",
  "confidence": null,
  "sources": [
    { "title": "Tomato Leaf Curl — Common Causes and Field Management", "organization": "Indian Council of Agricultural Research (ICAR)", "url": "https://icar.org.in", "relevance": 0.31 }
  ]
}
```
`sources` (Phase 3) is `[]` whenever no MongoDB/knowledge base is available,
or nothing relevant was found — it is never fabricated, and always comes
directly from the retrieved `KnowledgeChunk` metadata (see "Source
attribution" below), never invented by the model.

### `POST /api/analyze` — soil / leaf / general photo analysis (`multipart/form-data`)
Fields: `message` (optional text), `mode` (`soil` | `leaf` | `general`),
`language`, `crop`, `location`, `userId`, `farmId` (all optional except
`mode`), and 1–3 `images` files.

Response is the same shape as `/api/chat` (including `sources`). On
success, and only on success, the result is persisted as a `Diagnosis`
record (with its grounding `sources`, if any) if `userId` was sent and
MongoDB is reachable — **raw image bytes are never stored**, only metadata
(filename, MIME type).

Errors for `/api/chat` and `/api/analyze` always look like
`{ "success": false, "error": "..." }` (a string) — unchanged from Phase 1.

| Status | Meaning |
|---|---|
| 400 | Invalid request (bad/missing fields, unsupported file type, too many images) |
| 413 | Image too large |
| 429 | Rate limit exceeded — too many requests |
| 500 | Farmora could not process the request (includes Groq-side failures) |

### Phase 2 database-backed endpoints

These all respond with `{ "success": false, "error": { "code": "...", "message": "..." } }`
(an **object**, not a string) on failure — including `503
DATABASE_UNAVAILABLE` whenever MongoDB isn't reachable. Validation
(malformed IDs, missing/extra fields, bad pagination) is checked **before**
the database check, so a bad request still gets a clean `400` even while the
database is down.

#### Users (`/api/users`) — anonymous farmer profile
| Method & path | Description |
|---|---|
| `POST /api/users` | Create-or-update (upsert) a profile for the given `userId`. Body: `{ userId, name?, language?, location?, primaryCrop? }`. |
| `GET /api/users/:userId` | Fetch a profile. `404 USER_NOT_FOUND` if none exists yet. |
| `PATCH /api/users/:userId` | Update `name` / `language` / `location` / `primaryCrop` only — any other field is rejected with `400` (no arbitrary field writes). |

#### Farms (`/api/farms`) — a user can have multiple farms; each belongs to exactly one user
| Method & path | Description |
|---|---|
| `POST /api/farms` | Create a farm. Body includes `userId`, `name`, and optional `location`, `areaAcres`, `soilType`, `irrigationType`, `crops[]`. |
| `GET /api/farms/:userId` | List all of a user's farms. |
| `GET /api/farms/:userId/:farmId` | Get one farm — `404 FARM_NOT_FOUND` if it doesn't exist **or** belongs to a different user (never distinguishes the two, so ownership can't be probed). |
| `PATCH /api/farms/:userId/:farmId` | Update farm fields. |
| `DELETE /api/farms/:userId/:farmId` | Delete a farm (and its embedded crops). |
| `POST /api/farms/:userId/:farmId/crops` | Add a crop: `{ name, variety?, sowingDate?, expectedHarvestDate?, status? }`. |
| `PATCH /api/farms/:userId/:farmId/crops/:cropId` | Update a crop. |
| `DELETE /api/farms/:userId/:farmId/crops/:cropId` | Remove a crop. |

Every farm/crop route filters by `{ _id: farmId, userId }` together — a
request can't read, edit, or delete another user's farm just by changing the
`:farmId` in the URL, even without real authentication.

#### Diagnosis history (`/api/diagnoses`) — read-only; written automatically by `/api/analyze`
| Method & path | Description |
|---|---|
| `GET /api/diagnoses/:userId?farmId=&page=&limit=` | Paginated list, newest first (`limit` capped at 50). |
| `GET /api/diagnoses/:userId/:diagnosisId` | One diagnosis (ownership-checked). Never returns raw image data — metadata only. |

#### Chat history (`/api/chats`) — read-only; written automatically by `/api/chat`
| Method & path | Description |
|---|---|
| `GET /api/chats/:userId?farmId=&page=&limit=` | Paginated list, newest first. Older messages beyond the most recent 200 per user are pruned automatically (retention). Each record includes its `sources`, if the answer was grounded. |

### Knowledge search (`/api/knowledge/search`) — Phase 3, read-only

| Method & path | Description |
|---|---|
| `GET /api/knowledge/search?q=&crop=&language=&topK=` | Runs the same retrieval used by chat/analyze directly, for standalone lookup/debugging/a future "search the knowledge base" UI. `q` is required (2–300 chars); `topK` capped at 10. |

This is intentionally **not** a general-purpose database query endpoint —
`q` is always a plain string that gets embedded and compared server-side;
there is no way for a client to submit a raw vector, a MongoDB filter, or
otherwise reach into the database directly. Rate-limited (30/min/IP, same
tier as `/api/chat`). Degrades gracefully: if MongoDB is unavailable it
returns `200 { success: true, results: [], databaseAvailable: false }`
rather than a hard failure, since knowledge search is a non-critical,
read-only enhancement.

Response:
```json
{
  "success": true,
  "databaseAvailable": true,
  "results": [
    { "title": "...", "organization": "...", "url": "...", "category": "disease_management", "crop": "tomato", "relevance": 0.31, "snippet": "..." }
  ]
}
```
Never returns embedding vectors or internal chunk/document ids.

## Database models (Mongoose, `backend/src/models/`)

- **User** — `userId` (unique, the anonymous device UUID), `name`,
  `language` (`ta-IN` | `en-IN`), `location { name, latitude, longitude }`,
  `primaryCrop`, timestamps. No unnecessary personal data is collected.
- **Farm** — `userId`, `name`, `location`, `areaAcres`, `soilType`,
  `irrigationType`, `crops[]` (embedded sub-documents: `name`, `variety`,
  `sowingDate`, `expectedHarvestDate`, `status`), timestamps. Indexed on
  `userId` and `userId + createdAt`.
- **Diagnosis** — `userId`, `farmId`, `mode`, `crop`, `diagnosis` (the AI's
  answer text), `confidence`, `symptoms[]`, `recommendations[]`,
  `imageMetadata[]` (filename + MIME type **only — never raw image bytes**),
  `language`, `createdAt`. Indexed on `userId + createdAt` and
  `farmId + createdAt`.
- **Chat** — `userId`, `farmId`, `message`, `response`, `language`, `mode`,
  `sources[]` (Phase 3 grounding sources, if any), `createdAt`. Indexed the
  same way as Diagnosis; pruned to the most recent 200 messages per user.
- **Account** — `phone` (unique), `passwordHash` (`scrypt`, never plain
  text), `name`, `userId` (links to the anonymous `User`/farm/history data
  this account can restore). See "Sign Up / Login" below — this is a
  convenience mechanism for recovering a `userId` across devices, **not**
  authentication in the security sense (no sessions/JWTs are issued).
- **KnowledgeChunk** (Phase 3) — `documentId`/`chunkId` (idempotent
  ingestion keys), `chunkIndex`, `title`, `source`, `sourceUrl`,
  `organization`, `category`, `crop`, `cropStage`, `topic`, `language`,
  `region`, `content`, `version`, `publishedDate`, `lastVerifiedAt`,
  `embedding[]` + `embeddingProvider`/`embeddingModel`/`embeddingDims`
  (internal — never sent to the frontend). Indexed on `documentId`, `crop`,
  `category`, `language`.

## CSP configuration (no inline JavaScript)

`backend/src/server.js` sets an explicit Content-Security-Policy via Helmet:

```
default-src 'self'
script-src 'self'
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
img-src 'self' data: blob:
connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com https://nominatim.openstreetmap.org
font-src 'self' https://fonts.gstatic.com
object-src 'none'
base-uri 'self'
frame-ancestors 'self'
manifest-src 'self' blob:
```

`script-src 'self'` has no `unsafe-inline`/`unsafe-eval` — this is what
actually enforces "no inline JavaScript." Everything else in this policy
exists because removing it would have broken an existing feature:
`connect-src` allows the frontend's existing (unchanged, Phase 1) direct
browser calls to Open-Meteo (weather/geocoding) and Nominatim (reverse
geocoding); `style-src`/`font-src` allow the existing Google Fonts
stylesheet; `manifest-src blob:` allows the PWA manifest, which is built
client-side as a `Blob` URL. `style-src` keeps `'unsafe-inline'` because
inline `style="..."` attributes are a separate, lower-risk concern this fix
round didn't touch (per the task's own scope).

**What changed in the frontend to make this possible**: the previous single
inline `<script>...</script>` block in `frontend/index.html` (~965 lines,
~56KB) was moved verbatim into `frontend/js/app.js`, referenced as
`<script src="js/app.js"></script>` in the same position, preserving load
order after `config.js`. Inspection of the actual HTML found **zero inline
event-handler attributes** (`onclick=`, `onchange=`, etc.) — the codebase
already used `addEventListener()` exclusively — so no handler rewriting was
needed there; only the inline script block itself required externalizing.

## Security audit results

Run as part of this fix round (`grep`-based static checks plus manual
review — see "Testing performed" for the exact commands):

| Check | Result |
|---|---|
| API keys in frontend | ✅ None found |
| MongoDB credentials in source files | ✅ None found (read only from `process.env`) |
| Committed `backend/.env` | ✅ Not present, not tracked in git history, not staged |
| `.gitignore` covers `backend/.env` | ✅ Yes |
| Unsafe console logging (secrets/req bodies) | ✅ None found |
| Wildcard/unsafe CORS | ✅ `CLIENT_ORIGIN`-restricted, unchanged |
| Helmet disabled | ✅ Still enabled, CSP now explicit (see above) |
| `unsafe-inline`/`unsafe-eval` in `script-src` | ✅ Absent |
| Wildcard `script-src` | ✅ Absent |
| Ownership checks (`{ _id, userId }`) | ✅ Present in farm/diagnosis/chat controllers |
| File upload validation (`fileFilter`, `limits`) | ✅ Present, unchanged |
| Raw image storage in MongoDB | ✅ Confirmed absent — metadata only |

- **Groq key isolation**: `GROQ_API_KEY` lives only in `backend/.env`
  (gitignored) and is read once in `backend/src/config/env.js`. Only
  `backend/src/services/groq.service.js` ever uses it. It is never sent to,
  or readable from, the browser.
- **`MONGODB_URI` isolation**: same treatment — environment variable only,
  never hardcoded, never logged, never returned to the client.
- **`OPENAI_API_KEY` isolation** (Phase 3, only relevant if
  `EMBEDDING_PROVIDER=openai`): same treatment as the Groq key — read once
  in `config/env.js`, used only inside `embedding.service.js`, never sent
  to the frontend.
- **helmet** for standard security headers.
- **CORS** restricted to the origin(s) listed in `CLIENT_ORIGIN`.
- **Body size limits**: JSON body capped at 200KB; each uploaded image capped
  at 6MB, max 3 images per request (enforced by `multer`).
- **Input validation**: `/api/chat` and `/api/analyze` validate message
  length, mode, language, file type/count as in Phase 1. Phase 2 routes
  validate every field with `zod` (see `backend/src/validators/`), reject
  malformed Mongo IDs before they ever reach a query, and use `.strict()`
  schemas on `PATCH` bodies so a client can never write an arbitrary
  MongoDB field — only the explicitly whitelisted ones. `/api/knowledge/search`
  (Phase 3) validates `q`/`crop`/`language`/`topK` the same way — the query
  is always a plain, length-capped string turned into an embedding
  server-side, never a raw vector or database filter a client could inject.
- **Ownership enforcement**: every farm/crop/diagnosis lookup filters by
  `{ _id, userId }` (or `{ userId }`) together in a single query — see the
  Farms section above. This holds even though `userId` isn't a verified
  identity (see "Anonymous identity" above) — it stops casual ID-guessing,
  not a user who already knows/controls another user's ID. The Phase 3
  additions don't change this: `userId`/`farmId`/`crop`/`language` sent
  from the client are treated the same way they already were in Phase 2 —
  as hints, always validated, never trusted as identity or as a database
  query.
- **Rate limiting**: 30 requests/minute/IP on `/api/chat`, 12/minute/IP on
  the more expensive `/api/analyze`, 30/minute/IP on `/api/knowledge/search`.
  Returns `429` when exceeded. (Phase 2's other new routes are
  lighter-weight reads/writes and are not separately rate-limited in this
  phase.)
- **Centralized error handling**: no stack traces, keys, connection strings,
  internal prompts, embedding vectors, or raw upstream errors ever reach
  the client, for either the Phase 1 string-error shape or the Phase 2/3
  structured-error shape.
- **Safe logging**: only method/path/status/timing is logged — never request
  bodies, image bytes, the Groq/OpenAI key, or the Mongo connection string.
  RAG failures are logged as a short message only (see `rag.service.js`),
  never a raw stack trace or the failing query's full text.
- **No image persistence**: uploaded photos are analyzed in-memory and
  discarded; only safe metadata (filename, MIME type) is ever written to
  `Diagnosis.imageMetadata`.
- **No embeddings/internal ids exposed**: `backend/src/rag/utils/metadata.js`
  strips every `KnowledgeChunk` down to `{ title, organization, url,
  relevance }` before it's ever included in an API response — the
  embedding vector, `chunkId`, `documentId`, and raw Mongo `_id` never
  leave the server.

## Image upload limits

- Up to **3 images** per `/api/analyze` request (soil = 1, leaf = up to 3,
  general = 1), matching the existing frontend UI.
- **6MB max per image** (the frontend already compresses photos to ~800px
  JPEGs client-side before upload).
- Allowed types: `image/jpeg`, `image/png`, `image/webp`. Anything else is
  rejected with `400`.

## Frontend changes (Phase 2)

- **Anonymous identity**: on first load, the frontend generates a UUID via
  `crypto.randomUUID()` and stores it as `farmora_user_id` in
  `localStorage`. It's sent as `userId` on every chat/analyze/profile/farm
  request. `localStorage` is still used for this ID and light client
  preferences — it is **not** the source of truth for profile data anymore;
  the backend is (see `hydrateProfileFromBackend()`), with `localStorage`
  as the fallback shown instantly while the backend responds, and if the
  backend is unreachable.
- **Profile sync**: onboarding and the Settings screen now `POST`/read
  `/api/users` in addition to `localStorage`, so the profile survives a
  cleared cache (as long as the same `farmora_user_id` persists) and syncs
  across the app instantly.
- **"My Farms" screen** (new nav item): view, add, edit, delete farms; add,
  edit, delete crops per farm; mark one farm "active" (stored locally,
  informs which farm's context reaches the AI as `farmId`). The existing
  visual design/CSS is reused as-is — no redesign.
- **Dashboard**: now shows the active farm's name/location/area/current
  crop (pulled from `/api/farms`), or an "Add your first farm" empty state
  when none exists yet, plus a "Recent Checks" list pulled from
  `/api/diagnoses` (tap an entry to view the full result).
- **Chat history**: a "Recent conversations" toggle in Settings fetches
  `/api/chats` on demand — history is never auto-dumped into the live chat
  window, keeping the chat experience uncluttered as before.
- **Sources (Phase 3)**: when a chat answer was grounded in the knowledge
  base, a small "📚 Based on N agricultural sources" toggle appears beneath
  it (`sourcesBlock()` in `frontend/index.html`); expanding it shows each
  source's title (linked to `url` when available) and organization. When
  `sources` is empty (no grounding available, or the answer used general
  knowledge), nothing extra is shown — no empty/broken-looking UI.

## How farmer context AND retrieved knowledge reach the AI

1. Frontend sends `userId` (and `farmId`, if a farm is marked "active")
   alongside the existing `message`/`mode`/`language`/`crop`/`location`
   fields on `/api/chat` and `/api/analyze`.
2. `backend/src/services/farmContext.service.js` looks up that `User` and
   (optionally) `Farm` — only if MongoDB is connected — and builds a short
   plain-text summary, e.g. `"Location: Trichy, Tamil Nadu. Language: Tamil.
   Primary crop: Paddy. Farm area: 2 acres. Soil: Clay loam. Current crop:
   Paddy."` It never serializes the whole document or dumps unrelated data.
3. **(Phase 3)** In parallel, `backend/src/rag/services/rag.service.js`
   runs lightweight keyword-based query understanding (crop/topic/category
   — no extra LLM call, per the task's own guidance not to over-engineer
   this step) using the message, the explicit `crop` field, and the
   farmer's saved primary crop as a fallback signal; embeds the resulting
   query text; and retrieves the top-K similar `KnowledgeChunk`s above the
   similarity threshold from MongoDB, filtering out near-duplicates.
4. `groq.service.js`'s `buildSystemPrompt()` inserts the farmer-context
   summary, then — as its own clearly separated final block — the RAG
   grounding instructions plus a numbered knowledge excerpt (when any was
   retrieved), or an explicit "no specific reference knowledge was found"
   instruction (when retrieval ran but found nothing relevant), so the
   model never implies it used evidence it doesn't have.
5. If there's no profile yet, or MongoDB is down, farmer context and RAG
   both return empty and the prompt falls back to Phase 1 behavior (plain
   `crop`/`location` fields, or generic advice) — chat/analyze never fail
   because of either step (see "RAG fallback behavior" below).
6. The response includes a `sources` array built directly from the
   retrieved chunks' metadata (never invented by the model — see "Source
   attribution" below) and is persisted alongside the `Chat`/`Diagnosis`
   record.

## Source attribution

`sources` in the `/api/chat`/`/api/analyze` response always comes straight
from the metadata of the `KnowledgeChunk` documents that were actually
retrieved and included in the prompt — `backend/src/rag/utils/metadata.js`'s
`toPublicSource()` maps each one to exactly `{ title, organization, url,
relevance }`, nothing more (no embeddings, no internal chunk/document ids).
The model is explicitly instructed (`rag.prompt.js`) never to fabricate a
source or cite something not in the numbered reference list it was given —
but as with any LLM instruction, this is a strong prompt constraint, not a
cryptographic guarantee; see "Known limitations" below.

## RAG fallback behavior (Phase 3 requirement: RAG failure must not break Farmora)

`rag.service.js`'s `retrieveForQuery()` is the single entrypoint the
controllers call, and it **never throws**:

- No MongoDB connection → returns `{ promptAddition: '', sources: [], usedKnowledge: false }` immediately, no query attempted.
- Empty/whitespace message with no crop context → same empty result, no wasted retrieval attempt.
- Any error during query understanding, embedding, or the database read
  (embedding provider failure, a malformed document in the knowledge base,
  a transient DB error, etc.) is caught, logged as a short message only
  (never a stack trace, key, or connection string), and treated the same
  as "no knowledge found."
- An empty knowledge base (nothing ingested yet) or a query with nothing
  above the similarity threshold both resolve to zero chunks — the model
  is told explicitly that no reference knowledge was found (see
  `RAG_NO_KNOWLEDGE_INSTRUCTIONS` in `rag.prompt.js`), rather than silently
  proceeding as if grounded.

In every one of these cases, `/api/chat` and `/api/analyze` continue
exactly as they did in Phase 1/2 — farmer-context-aware if available, a
normal Groq answer either way. This is verified by
`backend/tests/rag.test.js` (mocked failures) and manually (see "Manual
tests performed" below).

## What was intentionally NOT changed / deferred to Phase 4+

- **No real authentication**: no passwords, JWT, OAuth, or sessions — see
  "Anonymous identity" above. Every model keys off a plain `userId` string
  so a future auth phase can replace how that string is established
  (currently: client-generated UUID) without touching the schema.
- **No live market-price API** — the Market Prices screen is still demo
  data, unchanged.
- **No advanced weather intelligence** — Weather still calls Open-Meteo
  directly from the browser, unchanged from Phase 1.
- **No admin dashboard.**
- **No knowledge-base admin UI** — ingestion is a CLI script
  (`npm run ingest:knowledge`); there is no in-app editor for knowledge
  documents.
- UI visual design/styling is unchanged; Phase 2/3 additions (My Farms
  screen, dashboard farm summary, history toggle, sources toggle) reuse the
  existing CSS classes (`card`, `quick-btn`, `danger-btn`, `setting-group`,
  `tag`, etc.) rather than introducing a new design system.

## Development

```bash
cd backend
npm install
cp .env.example .env   # then add your GROQ_API_KEY, and optionally MONGODB_URI
npm run dev
```
Visit `http://localhost:5000`.

Run tests:
```bash
cd backend
npm test
```

## Testing performed (actually executed)

This sandbox has **no live MongoDB and no network access to install or run
one** (e.g. `mongodb-memory-server` needs a binary download that this
environment's network allowlist doesn't permit), and no real
`GROQ_API_KEY`. Everything below was verified within those constraints —
nothing here is claimed without having actually been run.

1. ✅ `npm install` in `backend/` — succeeded (162 packages, including
   `mongoose` and `zod`).
2. ✅ `npm test` — **87/87 tests pass** (`backend/tests/api.test.js`,
   `groq.service.test.js`, `phase2.test.js`, `rag.test.js`, `db.test.js`,
   `csp.test.js`, `farmContext-rag.test.js`), covering:
   - Phase 1: health check, chat/analyze input validation, unknown-route
     404, prompt-building/language-detection/reply-parsing unit tests.
   - Phase 2: validation (missing/invalid fields, malformed Mongo IDs,
     excessive pagination, `.strict()` rejection of unexpected `PATCH`
     fields) for users, farms, crops, diagnoses, and chats — all verified
     to return `400 VALIDATION_ERROR` **before** the database is touched.
   - Phase 2 graceful degradation: every database-backed route verified to
     return `503 DATABASE_UNAVAILABLE` (not a crash, not a 500, not a
     hang) when `MONGODB_URI` is unset — this is the actual condition of
     this sandbox, so it's exercised directly rather than mocked.
   - **Phase 3 (37 tests)**: chunking (size limits, sentence-boundary
     splitting, empty input), knowledge-base loader (every seed document
     has required metadata; malformed source file throws a clear error),
     the `local` embedding provider (deterministic; related texts score
     higher similarity than unrelated ones; correct similarity math),
     keyword-based query understanding (crop/category detection, crop
     aliasing, farmer-profile-crop fallback, image-mode defaults),
     prompt assembly (numbered citations, grounding/no-fabrication/expert-
     referral instructions present, correct "no knowledge found" fallback
     text), source attribution (`toPublicSource` strips embeddings/internal
     ids), retrieval scoring (mocked `KnowledgeChunk.find` — threshold
     filtering, top-K, near-duplicate removal, relevant-over-unrelated
     ranking), RAG-service fallback (mocked DB-down and mocked
     retrieval-throws scenarios both degrade to an empty result, never
     throw), and `/api/knowledge/search` validation + graceful
     `databaseAvailable: false` degradation through the real Express app.
   - **DNS fix (6 tests, `db.test.js`)**: `MONGODB_DNS_SERVERS` parsing
     (custom list, trimming, empty-entry filtering), default fallback to
     `8.8.8.8,8.8.4.4`, idempotency (only calls `dns.setServers` once),
     never throwing even if `dns.setServers` itself throws, `connectDb()`
     skipping DNS setup entirely when no `MONGODB_URI` is set, and —
     importantly — a test that mocks a connection failure and asserts the
     MongoDB username/password never appear in anything logged.
   - **CSP fix (9 tests, `csp.test.js`)**: no inline event-handler
     attributes in `index.html`, no inline `<script>` block with code in
     it, `frontend/js/app.js` exists with valid syntax, the real Express
     app's CSP header has no `unsafe-inline`/`unsafe-eval` in `script-src`,
     the header still allows the existing weather/geocoding domains,
     Helmet headers remain present, and both external scripts are actually
     served with `200`.
   - **Farm-context-to-RAG fix (9 tests, `farmContext-rag.test.js`)**:
     `buildFarmerContext` returns the farmer's saved crop; an active farm
     crop overrides the profile's general primary crop; ownership is still
     enforced (`Farm.findOne` always called with both `_id` and `userId`);
     empty/error/no-userId cases all degrade to an empty context rather
     than throwing; and, end-to-end, a farmer's saved crop demonstrably
     reaches `understandQuery()`'s crop detection when the request itself
     names no crop — while an explicit request crop still takes priority.
3. ✅ Started the backend directly (`node src/server.js`, no Mongo, no Groq
   key) and smoke-tested with `curl`:
   - `GET /api/health` → `{"status":"ok","service":"farmora-backend","database":"not_configured"}`
   - `GET /` → serves `frontend/index.html`.
   - `POST /api/users` with a valid body → `503 DATABASE_UNAVAILABLE` as
     expected (no DB configured).
4. ✅ `node --check` on every backend file (including all of
   `backend/src/rag/`) and on `frontend/js/app.js` and `frontend/config.js`
   — no syntax errors.
5. ✅ Manual code review of ownership enforcement (`{ _id, userId }` query
   pattern) in `farm.controller.js`, `diagnosisHistory.controller.js`, and
   `chatHistory.controller.js`.
6. ✅ Confirmed no Groq/OpenAI key appears anywhere under `frontend/` (`grep
   -ri groq frontend/`) — only comments explaining it's server-side.
7. ✅ Confirmed `backend/.env` is gitignored, does not exist in this
   checkout (only `.env.example` does, which I regenerated since it was
   missing from this upload), and is not tracked or staged in git history
   (`git log --all -- backend/.env` returns nothing). Confirmed
   `MONGODB_URI`, `MONGODB_DNS_SERVERS`, and `OPENAI_API_KEY` are read
   exclusively from `process.env` in `backend/src/config/env.js`, never
   hardcoded.
8. ✅ **Ran the ingestion script** (`node scripts/ingest-knowledge.js`)
   with no `MONGODB_URI` set — confirmed it fails with a clear message and
   exit code 1, rather than crashing or hanging.
9. ✅ **Full RAG pipeline dry run** using an in-memory fake `KnowledgeChunk`
   collection (monkey-patched `find`/`findOneAndUpdate` — real MongoDB is
   not available in this sandbox, so this is not a live-database test, but
   it does exercise the *real* ingestion, chunking, embedding, retrieval,
   query-understanding, and prompt-assembly code end-to-end together,
   which the mocked unit tests above don't do in combination):
   - Ingested all 12 seed documents → 40 chunks.
   - **Re-ran ingestion** → still 40 chunks (idempotency confirmed —
     no duplicates from a second run).
   - An English tomato leaf-curl question correctly retrieved the Tomato
     Leaf Curl and IPM-related chunks with sensible relevance scores.
   - An English soil-health-card question correctly retrieved the Soil
     Health Card chunk.
   - **A gibberish/low-relevance question correctly retrieved zero chunks**
     (similarity threshold filtering working as intended).
   - A Tamil-language question about paddy leaf spots only retrieved
     correctly *when an explicit `crop: 'paddy'` hint was supplied* — see
     "Known limitations" below, this surfaced a real gap I'm flagging
     rather than glossing over.

### Not live-tested (requires resources unavailable in this sandbox)
- **MongoDB Atlas SRV DNS resolution against a real cluster.** This
  sandbox's network egress is restricted to a fixed allowlist that does not
  include `mongodb.net` or public DNS ports, so `dns.setServers([...])`
  followed by an actual `_mongodb._tcp.<cluster>` SRV lookup and connection
  could **not** be exercised end-to-end here — only the resolver
  *configuration logic itself* (`configureMongoDns()`) is tested, via
  mocking `dns.setServers`. **You must verify the actual fix** (i.e. that it
  resolves the specific `querySrv ECONNREFUSED` error) against your real
  Atlas cluster — see "Exact commands to run locally" below.
- An actual successful `/api/chat` or `/api/analyze` round trip to Groq —
  meaning **no real grounded answer has been generated and read by a
  human**; only the retrieval/prompt-assembly machinery feeding into that
  call has been verified.
- Retrieval against a **real** MongoDB (the dry run above used an in-memory
  fake collection, not real Mongoose/MongoDB query execution) — index
  behavior, query performance at scale, and Mongoose validation on actual
  writes are untested against a live database.
- The `openai` embedding provider (no `OPENAI_API_KEY`/network access here)
  — only the `local` provider has been exercised.
- CRUD against a **real** MongoDB instance for users/farms/crops/diagnoses/
  chats (same limitation carried over from Phase 2).
- **The CSP fix in an actual browser.** I verified the `Content-Security-
  Policy` header's exact content via `curl`/supertest against the real
  running server (see the CSP test results above), and statically confirmed
  `index.html` has no inline scripts or event handlers left — but I did not
  open the page in an actual browser and check DevTools Console for zero
  CSP violations, since no browser is available in this sandbox. **Please
  verify this yourself** (see below) — a header being correct is strong
  evidence, but not identical to confirming zero console errors across
  every feature (speech recognition, camera capture, PWA install, etc.).
- End-to-end frontend ↔ backend integration in an actual browser, including
  the new sources toggle UI actually rendering/expanding in a browser.
- Rate limiting and oversized-request (413) rejection under real repeated
  requests.

**Before deploying, please verify these yourself:**
```bash
cd backend
npm install
cp .env.example .env      # add your real GROQ_API_KEY and MONGODB_URI
npm run dev
npm run ingest:knowledge  # in another terminal, once the DB is reachable
# then open http://localhost:5000 and try:
#  - Watch the server's startup log for exactly one line:
#      "MongoDB DNS servers configured: 8.8.8.8,8.8.4.4"
#    followed by "MongoDB connected." (not a querySrv ECONNREFUSED error).
#    If you still see the DNS error, try setting MONGODB_DNS_SERVERS to a
#    different resolver (e.g. your ISP's or another public DNS).
#  - GET /api/health should report {"database":"connected"} once the above works.
#  - Open DevTools Console on the loaded page — there should be ZERO
#    "Content Security Policy" violation messages, and the Network tab
#    should show js/app.js and config.js loading with 200 status.
#  - chat + soil/leaf photo uploads, and check the "Based on N agricultural
#    sources" toggle appears and expands correctly under grounded answers
#  - onboarding a new profile, then reloading — profile should persist
#  - My Farms: add a farm, add a crop, mark active, edit, delete
#  - Dashboard: confirm active farm/crop/recent checks show correctly
#  - Settings → "Recent conversations"
#  - Ask a Tamil-language question and confirm retrieval still finds
#    relevant knowledge (see the Tamil-retrieval limitation below)
npm test                  # runs the automated tests above
```

## Known limitations

- Anonymous `userId` is not authentication (see "Anonymous identity" above)
  — do not treat any data behind it as private/secure.
- No rate limiting on the new Phase 2 routes (`/api/users`, `/api/farms`,
  `/api/diagnoses`, `/api/chats`) — only `/api/chat` and `/api/analyze` are
  rate-limited in this phase.
- Chat history retention is a simple "most recent 200 per user" cap, not a
  time-based policy.
- Diagnosis `symptoms` extraction is not implemented in this phase — the
  field exists in the schema but is currently always saved empty;
  `recommendations` is populated by pulling `- bullet` lines out of the AI's
  answer text, which is a heuristic, not structured AI output.
- Farm/crop editing in the frontend uses simple `prompt()` dialogs for crop
  fields rather than a full inline form, to keep the existing visual design
  unchanged — functional but minimal.
- **RAG improves grounding but does not guarantee that every agricultural
  answer is correct.** The model can still misapply retrieved knowledge,
  the knowledge base itself may be incomplete or (in this seed set) not yet
  independently re-verified against the original source publications (see
  "Knowledge sources" above), and the `local` embedding provider's
  retrieval quality is meaningfully weaker than a real semantic embedding
  model. Treat RAG-grounded answers as better-informed, not authoritative.
- **Image-based diagnosis remains advisory** and should not replace
  professional/local agricultural diagnosis — this was already true in
  Phase 1/2 (see the existing confidence-badge hedging language in the
  frontend) and RAG's grounding instructions reinforce it (never claim
  certainty a photo alone can't support), but RAG cannot make an inherently
  uncertain visual diagnosis certain.
- **Tamil-language retrieval is weaker than English retrieval.** Query
  understanding (`rag/retrieval/query.js`) matches crop/topic keywords
  against an English word list, and the seed knowledge base content is
  currently English-only (`language: "en-IN"` on every seed document, even
  though the schema supports `ta-IN`). A Tamil-language question without an
  explicit `crop` field or a saved farmer profile crop may fail to detect
  the right crop/category and retrieve less relevant knowledge — this was
  directly observed in the manual dry run above. Two concrete next steps: (1)
  add a small Tamil keyword list to `query.js` alongside the English one,
  and (2) ingest Tamil-language versions of the knowledge documents (the
  schema and pipeline already support this via each document's `language`
  field — no schema change needed).
- The `local` embedding provider is a hashed bag-of-words vector, not a
  real semantic embedding — it can miss conceptually related but
  differently-worded content (e.g. won't strongly relate "yellowing
  leaves" to "chlorosis" unless the words themselves overlap). Switch to
  `EMBEDDING_PROVIDER=openai` for production-quality retrieval.
- `/api/knowledge/search` and the retrieval pipeline generally have no
  per-source-document access control — the entire knowledge base is
  treated as public agricultural information, appropriate for its current
  ICAR/TNAU/government-sourced content, but this would need reconsidering
  if private or farm-specific documents were ever added to it.

## Deployment

Not covered in this phase — the goal was the `frontend → backend →
Groq`/`MongoDB` architecture and correct graceful degradation, not
production deployment. Do not consider this production-ready yet
(see "Known limitations" and "Anonymous identity" above).

## License

Add your preferred license here (e.g. MIT).
