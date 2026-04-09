const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '../dist')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, replace with your GitHub Pages URL (e.g., "https://yourusername.github.io")
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

// Room management
const rooms = require('./rooms');

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('createRoom', (username) => {
    const roomId = rooms.createRoom();
    const player = rooms.addPlayer(roomId, socket.id, username);
    if (player) {
      socket.join(roomId);
      socket.emit('roomCreated', { roomId, player });
      console.log(`Room created: ${roomId} by ${username}`);
    }
  });

  socket.on('joinRoom', ({ roomId, username }) => {
    const player = rooms.addPlayer(roomId, socket.id, username);
    if (player) {
      socket.join(roomId);
      const room = rooms.getRoom(roomId);
      socket.emit('joinedRoom', { roomId, player, players: room.players });
      socket.to(roomId).emit('playerJoined', player);
      console.log(`${username} joined room: ${roomId}`);
    } else {
      socket.emit('error', 'Room not found or game already started');
    }
  });

  socket.on('selectRole', ({ roomId, role }) => {
    const player = rooms.getPlayer(roomId, socket.id);
    if (player && !rooms.getRoom(roomId).gameStarted) {
      player.role = role;
      console.log(`Player ${player.username} pre-selected role: ${role}`);
    }
  });

  socket.on('startGame', (roomId) => {
    const room = rooms.getRoom(roomId);
    if (room && room.hostId === socket.id) {
      const gameStarted = rooms.startGame(roomId);
      if (gameStarted) {
        // Send role privately to each player
        room.players.forEach(player => {
          io.to(player.id).emit('gameStarted', {
            roomId: room.id,
            players: room.players.map(p => ({ id: p.id, username: p.username, alive: p.alive })),
            myPlayer: player,
            phase: room.phase
          });
        });
        console.log(`Game started in room: ${roomId}`);
      }
    }
  });

  socket.on('sendMessage', ({ roomId, message }) => {
    const player = rooms.getPlayer(roomId, socket.id);
    if (player && player.alive) {
      io.to(roomId).emit('messageReceived', {
        username: player.username,
        text: message,
        time: new Date().toLocaleTimeString()
      });
    }
  });

  socket.on('nightAction', ({ roomId, action, targetId }) => {
    const result = rooms.handleNightAction(roomId, socket.id, action, targetId);
    if (result && result.allActionsDone) {
      const nightResult = rooms.resolveNight(roomId);
      io.to(roomId).emit('phaseChanged', { phase: 'day', result: nightResult });
      if (nightResult.gameOver) {
        io.to(roomId).emit('gameEnded', nightResult.gameOver);
      }
    }
  });

  socket.on('vote', ({ roomId, targetId }) => {
    const result = rooms.handleVote(roomId, socket.id, targetId);
    if (result && result.allVotesDone) {
      const voteResult = rooms.resolveVote(roomId);
      io.to(roomId).emit('phaseChanged', { phase: 'night', result: voteResult });
      if (voteResult.gameOver) {
        io.to(roomId).emit('gameEnded', voteResult.gameOver);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const result = rooms.removePlayer(socket.id);
    if (result) {
      const { roomId, player } = result;
      io.to(roomId).emit('playerLeft', player.id);
      
      const room = rooms.getRoom(roomId);
      if (room && room.gameStarted) {
        const winCondition = rooms.checkWin(roomId);
        if (winCondition) {
          io.to(roomId).emit('gameEnded', winCondition);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
