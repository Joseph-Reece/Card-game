# Kenyan Local Poker — Next.js (Vercel-ready)

This is the **Next.js 14 App Router** version of Kenyan Local Poker, designed for full deployment on **Vercel**.

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router, React 18 |
| Real-time | [Pusher](https://pusher.com) (replaces Socket.io) |
| State | [Upstash Redis](https://upstash.com) (replaces in-memory Map) |
| API | Next.js Route Handlers (13 POST endpoints + GET + Pusher auth) |
| Cards | [Deck of Cards API](https://deckofcardsapi.com/) |

## Local Development

### 1. Copy the environment template

```bash
cp .env.local.example .env.local
```

### 2. Fill in credentials

**Pusher** (free Sandbox plan at https://pusher.com):
- Create an app, select a cluster (e.g. `eu`)
- Copy App ID, Key, Secret, Cluster into `.env.local`

**Upstash Redis** (free at https://upstash.com):
- Create a Redis database
- Copy REST URL and REST Token into `.env.local`

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push the repository to GitHub.
2. Import the project in [Vercel](https://vercel.com/new) — set the **Root Directory** to `nextjs-app`.
3. Add the following **Environment Variables** in the Vercel dashboard:

| Variable | Description |
|----------|-------------|
| `PUSHER_APP_ID` | Pusher App ID |
| `NEXT_PUBLIC_PUSHER_KEY` | Pusher Key (public) |
| `PUSHER_SECRET` | Pusher Secret |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Pusher Cluster (e.g. `eu`) |
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST Token |

4. Deploy — all API routes, Pusher auth, and the frontend are served from a single Vercel project.

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/game/create` | Create a room |
| POST | `/api/game/join` | Join a room |
| GET | `/api/game/rooms` | List open rooms |
| POST | `/api/game/ready` | Toggle ready state |
| POST | `/api/game/start` | GM starts the game |
| POST | `/api/game/play-card` | Play a card |
| POST | `/api/game/draw-card` | Draw a card |
| POST | `/api/game/end-turn` | End turn voluntarily |
| POST | `/api/game/choose-suit` | Choose suit after Ace |
| POST | `/api/game/choose-card` | Choose card after Ace of Clubs |
| POST | `/api/game/announce` | Announce last card |
| POST | `/api/game/leave` | Leave a room |
| POST | `/api/game/rules` | GM rule toggles |
| POST | `/api/pusher/auth` | Pusher private channel auth |

