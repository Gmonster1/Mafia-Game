const gameLogic = require('./gameLogic');

const rooms = new Map();

function createRoom() {
  const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
  rooms.set(roomId, {
    id: roomId,
    players: [],
    hostId: null,
    phase: 'lobby', // lobby, night, day, voting
    gameStarted: false,
    nightActions: {
      mafia: null,
      doctor: null,
      police: null
    },
    votes: {}, // playerId -> targetId
    aliveCount: 0,
    mafiaCount: 0
  });
  return roomId;
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function addPlayer(roomId, socketId, username) {
  const room = rooms.get(roomId);
  if (room && !room.gameStarted) {
    const player = {
      id: socketId,
      username: username,
      role: null,
      alive: true
    };
    if (room.players.length === 0) {
      room.hostId = socketId;
    }
    room.players.push(player);
    return player;
  }
  return null;
}

function getPlayer(roomId, socketId) {
  const room = rooms.get(roomId);
  if (room) {
    return room.players.find(p => p.id === socketId);
  }
  return null;
}

function startGame(roomId) {
  const room = rooms.get(roomId);
  if (room && room.players.length >= 4) { // Minimum 4 players for a good game
    gameLogic.assignRoles(room.players);
    room.gameStarted = true;
    room.phase = 'night';
    room.aliveCount = room.players.length;
    room.mafiaCount = room.players.filter(p => p.role === 'Mafia').length;
    return true;
  }
  return false;
}

function handleNightAction(roomId, playerId, action, targetId) {
  const room = rooms.get(roomId);
  if (!room || room.phase !== 'night') return null;

  const player = room.players.find(p => p.id === playerId);
  if (!player || !player.alive) return null;

  if (player.role.toLowerCase() === action.toLowerCase()) {
    room.nightActions[action.toLowerCase()] = targetId;
  }

  // Check if all active night roles have acted
  const activeRoles = new Set(room.players.filter(p => p.alive && p.role !== 'Civilian').map(p => p.role.toLowerCase()));
  const actionsDone = Object.keys(room.nightActions).filter(role => room.nightActions[role] !== null);
  
  const allActionsDone = Array.from(activeRoles).every(role => actionsDone.includes(role));

  return { allActionsDone };
}

function resolveNight(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const { mafia, doctor, police } = room.nightActions;
  let eliminatedId = null;
  let investigationResult = null;

  if (mafia && mafia !== doctor) {
    eliminatedId = mafia;
    const eliminatedPlayer = room.players.find(p => p.id === eliminatedId);
    if (eliminatedPlayer) {
      eliminatedPlayer.alive = false;
      room.aliveCount--;
      if (eliminatedPlayer.role === 'Mafia') room.mafiaCount--;
    }
  }

  if (police) {
    const target = room.players.find(p => p.id === police);
    investigationResult = {
      targetId: police,
      role: target ? target.role : 'Unknown'
    };
  }

  // Reset actions for next night
  room.nightActions = { mafia: null, doctor: null, police: null };
  room.phase = 'day';

  return {
    eliminatedId,
    investigationResult,
    gameOver: gameLogic.checkWinCondition(room)
  };
}

function handleVote(roomId, voterId, targetId) {
  const room = rooms.get(roomId);
  if (!room || room.phase !== 'day') return null;

  const voter = room.players.find(p => p.id === voterId);
  if (!voter || !voter.alive) return null;

  room.votes[voterId] = targetId;

  const activePlayers = room.players.filter(p => p.alive).length;
  const votesCount = Object.keys(room.votes).length;

  return { allVotesDone: votesCount === activePlayers };
}

function resolveVote(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const voteCounts = {};
  Object.values(room.votes).forEach(targetId => {
    if (targetId) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }
  });

  let eliminatedId = null;
  let maxVotes = 0;
  for (const id in voteCounts) {
    if (voteCounts[id] > maxVotes) {
      maxVotes = voteCounts[id];
      eliminatedId = id;
    } else if (voteCounts[id] === maxVotes) {
      eliminatedId = null; // Tie
    }
  }

  if (eliminatedId) {
    const eliminatedPlayer = room.players.find(p => p.id === eliminatedId);
    if (eliminatedPlayer) {
      eliminatedPlayer.alive = false;
      room.aliveCount--;
      if (eliminatedPlayer.role === 'Mafia') room.mafiaCount--;
    }
  }

  room.votes = {};
  room.phase = 'night';

  return {
    eliminatedId,
    gameOver: gameLogic.checkWinCondition(room)
  };
}

function removePlayer(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    const playerIndex = room.players.findIndex(p => p.id === socketId);
    if (playerIndex !== -1) {
      const player = room.players[playerIndex];
      room.players.splice(playerIndex, 1);
      
      if (player.alive) {
        room.aliveCount--;
        if (player.role === 'Mafia') room.mafiaCount--;
      }

      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else if (room.hostId === socketId) {
        room.hostId = room.players[0].id;
      }
      return { roomId, player };
    }
  }
  return null;
}

function checkWin(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return gameLogic.checkWinCondition(room);
}

module.exports = {
  createRoom,
  getRoom,
  addPlayer,
  getPlayer,
  removePlayer,
  startGame,
  handleNightAction,
  resolveNight,
  handleVote,
  resolveVote,
  checkWin
};
