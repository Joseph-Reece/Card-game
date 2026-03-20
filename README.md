# Kenyan Local Poker — Online Card Game

A real-time, web-based multiplayer card game inspired by Kenyan Local Poker.

## Tech Stack

### Original (React/Vite + Node.js/Socket.io)
- **Frontend**: React (Vite)
- **Backend**: Node.js + Express + Socket.io
- **Cards**: [Deck of Cards API](https://deckofcardsapi.com/)

### Next.js / Vercel version (`nextjs-app/`)
- **Framework**: Next.js 14 App Router (TypeScript)
- **Real-time**: [Pusher](https://pusher.com/) channels
- **State storage**: [Upstash Redis](https://upstash.com/) (serverless-compatible)
- **Hosting**: Vercel (zero-config)

## Features
- Private Game Rooms with a 4-character Room Code
- Game Master (GM) controls: starts the game, toggles "No Special Win" rule
- Ready-state lobby before the game begins
- Full Kenyan Poker special-card rules (A, 2, 3, 8, Q, J, K)
- Real-time turn engine with clockwise/counter-clockwise direction
- Draw-penalty stacking (2s and 3s)
- Open Games browser

## Quick Start (Original)

### 1. Install dependencies
```bash
npm run install:all
```

### 2. Start the backend server (port 3001)
```bash
npm run dev:server
```

### 3. Start the frontend (port 5173)
```bash
npm run dev:client
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Deploying the Next.js version to Vercel

### Prerequisites
- A free [Pusher](https://pusher.com/) account — create an app and note your App ID, Key, Secret, and Cluster
- A free [Upstash](https://upstash.com/) Redis database — note your REST URL and token

### 1. Set up environment variables

Copy `nextjs-app/.env.local.example` to `nextjs-app/.env.local` and fill in your credentials:

```bash
cp nextjs-app/.env.local.example nextjs-app/.env.local
```

```env
PUSHER_APP_ID=your_app_id
NEXT_PUBLIC_PUSHER_KEY=your_key
PUSHER_SECRET=your_secret
NEXT_PUBLIC_PUSHER_CLUSTER=eu

UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token
```

### 2. Run locally

```bash
cd nextjs-app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Deploy to Vercel

1. Push the repo to GitHub.
2. Import the repo in [Vercel](https://vercel.com/new).
3. Set the **Root Directory** to `nextjs-app`.
4. Add the environment variables from `.env.local` in the Vercel project settings.
5. Deploy — Vercel handles the rest.

---

## Special Card Rules
| Card | Name | Effect |
|------|------|--------|
| A | Shape Shift | Choose any suit. Blocks 2/3 penalties. |
| 2 | Danger | Next player draws 2 (stackable). |
| 3 | Danger | Next player draws 3 (stackable). |
| 8 / Q | Question | Next player must play a matching card or draw 1. |
| J | Jump | Skips the next player. |
| K | Kick Back | Reverses direction of play. |

