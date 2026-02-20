'use strict';

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');

const gm = require('./gameManager');

// ---------------------------------------------------------------------------
// Express + HTTP server
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

// Basic health-check endpoint
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const server = http.createServer(app);

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

// ---------------------------------------------------------------------------
// Helper: emit error to a single socket
// ---------------------------------------------------------------------------
function emitError(socket, message) {
  socket.emit('error', { message });
}

// ---------------------------------------------------------------------------
// Connection handler
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // -------------------------------------------------------------------------
  // createRoom
  // -------------------------------------------------------------------------
  socket.on('createRoom', ({ username } = {}) => {
    if (!username) return emitError(socket, 'username is required');
    try {
      const result = gm.createRoom(username);
      socket.join(result.roomCode);
      socket.emit('roomCreated', {
        roomCode: result.roomCode,
        playerId: result.playerId,
        gameState: result.gameState,
        players: result.players,
      });
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // -------------------------------------------------------------------------
  // joinRoom
  // -------------------------------------------------------------------------
  socket.on('joinRoom', ({ roomCode, username } = {}) => {
    if (!roomCode || !username) return emitError(socket, 'roomCode and username are required');
    try {
      const result = gm.joinRoom(roomCode, username);
      socket.join(roomCode);
      socket.emit('roomJoined', {
        playerId: result.playerId,
        gameState: result.gameState,
        players: result.players,
      });
      // Notify everyone else in the room
      socket.to(roomCode).emit('playerUpdated', { players: result.players });
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // -------------------------------------------------------------------------
  // getOpenRooms
  // -------------------------------------------------------------------------
  socket.on('getOpenRooms', () => {
    socket.emit('openRooms', gm.getOpenRooms());
  });

  // -------------------------------------------------------------------------
  // setReady
  // -------------------------------------------------------------------------
  socket.on('setReady', ({ roomCode, playerId, isReady } = {}) => {
    if (!roomCode || !playerId || isReady === undefined) {
      return emitError(socket, 'roomCode, playerId and isReady are required');
    }
    try {
      const result = gm.setReady(roomCode, playerId, isReady);
      io.to(roomCode).emit('playerUpdated', { players: result.players });
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // -------------------------------------------------------------------------
  // startGame
  // -------------------------------------------------------------------------
  socket.on('startGame', async ({ roomCode, playerId } = {}) => {
    if (!roomCode || !playerId) return emitError(socket, 'roomCode and playerId are required');
    try {
      const result = await gm.startGame(roomCode, playerId);

      // Broadcast gameStarted (hands are sent privately via handUpdated below)
      io.to(roomCode).emit('gameStarted', {
        gameState: result.gameState,
        players: result.players,
        // hands is intentionally omitted from the broadcast; individual handUpdated follows
      });

      // Emit private handUpdated to each player
      // We need a playerId→socketId mapping.  We maintain it via socket.data below.
      const room = gm.getRoom(roomCode);
      if (room) {
        const allSockets = await io.in(roomCode).fetchSockets();
        allSockets.forEach((s) => {
          const pid = s.data && s.data.playerId;
          if (pid && result.hands[pid]) {
            s.emit('handUpdated', { hand: result.hands[pid] });
          }
        });
      }
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // -------------------------------------------------------------------------
  // playCard
  // -------------------------------------------------------------------------
  socket.on('playCard', async ({ roomCode, playerId, cardCode } = {}) => {
    if (!roomCode || !playerId || !cardCode) {
      return emitError(socket, 'roomCode, playerId and cardCode are required');
    }
    try {
      const result = await gm.playCard(roomCode, playerId, cardCode);

      // Broadcast public game update
      io.to(roomCode).emit('gameUpdated', {
        gameState: result.gameState,
        players: result.players,
        lastAction: result.lastAction,
      });

      // Send updated hand to the player who just played
      if (result.handUpdates) {
        const allSockets = await io.in(roomCode).fetchSockets();
        allSockets.forEach((s) => {
          const pid = s.data && s.data.playerId;
          if (pid && result.handUpdates[pid] !== undefined) {
            s.emit('handUpdated', { hand: result.handUpdates[pid] });
          }
        });
      }

      // Announce winner
      if (result.winnerId) {
        const room = gm.getRoom(roomCode);
        const winner = room
          ? room.players.find(p => p.id === result.winnerId) || { username: 'Unknown' }
          : { username: 'Unknown' };
        io.to(roomCode).emit('playerWon', {
          playerId: result.winnerId,
          username: winner.username,
        });
      }
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // -------------------------------------------------------------------------
  // chooseSuit
  // -------------------------------------------------------------------------
  socket.on('chooseSuit', async ({ roomCode, playerId, suit } = {}) => {
    if (!roomCode || !playerId || !suit) {
      return emitError(socket, 'roomCode, playerId and suit are required');
    }
    try {
      const result = gm.chooseSuit(roomCode, playerId, suit);

      io.to(roomCode).emit('gameUpdated', {
        gameState: result.gameState,
        players: result.players,
        lastAction: result.lastAction,
      });

      // noSpecialWin edge case: player had Ace as last card – force a draw
      if (result.lastAction.forcedDraw) {
        const drawResult = await gm.drawCard(roomCode, playerId);
        io.to(roomCode).emit('gameUpdated', {
          gameState: drawResult.gameState,
          players: drawResult.players,
          lastAction: drawResult.lastAction,
        });
        const allSockets = await io.in(roomCode).fetchSockets();
        allSockets.forEach((s) => {
          const pid = s.data && s.data.playerId;
          if (pid && drawResult.handUpdates[pid] !== undefined) {
            s.emit('handUpdated', { hand: drawResult.handUpdates[pid] });
          }
        });
      }

      if (result.winnerId) {
        const room = gm.getRoom(roomCode);
        const winner = room
          ? room.players.find(p => p.id === result.winnerId) || { username: 'Unknown' }
          : { username: 'Unknown' };
        io.to(roomCode).emit('playerWon', {
          playerId: result.winnerId,
          username: winner.username,
        });
      }
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // -------------------------------------------------------------------------
  // drawCard
  // -------------------------------------------------------------------------
  socket.on('drawCard', async ({ roomCode, playerId } = {}) => {
    if (!roomCode || !playerId) return emitError(socket, 'roomCode and playerId are required');
    try {
      const result = await gm.drawCard(roomCode, playerId);

      io.to(roomCode).emit('gameUpdated', {
        gameState: result.gameState,
        players: result.players,
        lastAction: result.lastAction,
      });

      // Send updated hand only to the player who drew
      if (result.handUpdates) {
        const allSockets = await io.in(roomCode).fetchSockets();
        allSockets.forEach((s) => {
          const pid = s.data && s.data.playerId;
          if (pid && result.handUpdates[pid] !== undefined) {
            s.emit('handUpdated', { hand: result.handUpdates[pid] });
          }
        });
      }
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // -------------------------------------------------------------------------
  // setNoSpecialWin (GM toggle)
  // -------------------------------------------------------------------------
  socket.on('setNoSpecialWin', ({ roomCode, playerId, noSpecialWin } = {}) => {
    if (!roomCode || !playerId || noSpecialWin === undefined) {
      return emitError(socket, 'roomCode, playerId and noSpecialWin are required');
    }
    try {
      const result = gm.setNoSpecialWin(roomCode, playerId, noSpecialWin);
      io.to(roomCode).emit('gameUpdated', {
        gameState: result.gameState,
        lastAction: { type: 'ruleChange', noSpecialWin: result.gameState.noSpecialWin },
      });
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // -------------------------------------------------------------------------
  // leaveRoom
  // -------------------------------------------------------------------------
  socket.on('leaveRoom', ({ roomCode, playerId } = {}) => {
    if (!roomCode || !playerId) return emitError(socket, 'roomCode and playerId are required');
    try {
      const result = gm.leaveRoom(roomCode, playerId);
      socket.leave(roomCode);
      if (!result.roomDeleted) {
        io.to(roomCode).emit('playerLeft', { players: result.players });
      }
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // -------------------------------------------------------------------------
  // Store playerId in socket.data when client registers it
  // -------------------------------------------------------------------------
  socket.on('registerPlayer', ({ playerId } = {}) => {
    if (playerId) socket.data.playerId = playerId;
  });

  // -------------------------------------------------------------------------
  // Disconnect: auto-clean if we know the player's room
  // -------------------------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
  });
});

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Kenyan Poker server listening on port ${PORT}`);
});

module.exports = { app, server, io };
