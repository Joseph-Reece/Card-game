# Kenyan Local Poker — Online Card Game

A real-time, web-based multiplayer card game inspired by Kenyan Local Poker.

## Tech Stack
- **Frontend**: React (Vite)
- **Backend**: Node.js + Express + Socket.io
- **Cards**: [Deck of Cards API](https://deckofcardsapi.com/)

## Features
- Private Game Rooms with a 4-character Room Code
- Game Master (GM) controls: starts the game, toggles "No Special Win" rule
- Ready-state lobby before the game begins
- Full Kenyan Poker special-card rules (A, 2, 3, 8, Q, J, K)
- Real-time turn engine with clockwise/counter-clockwise direction
- Draw-penalty stacking (2s and 3s)
- Open Games browser

## Quick Start

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

## Special Card Rules
| Card | Name | Effect |
|------|------|--------|
| A | Shape Shift | Choose any suit. Blocks 2/3 penalties. |
| 2 | Danger | Next player draws 2 (stackable). |
| 3 | Danger | Next player draws 3 (stackable). |
| 8 / Q | Question | Next player must play a matching card or draw 1. |
| J | Jump | Skips the next player. |
| K | Kick Back | Reverses direction of play. |
