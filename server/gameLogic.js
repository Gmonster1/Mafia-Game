function assignRoles(players) {
  const roles = ['Mafia', 'Doctor', 'Police'];
  const playersWithoutRoles = players.filter(p => !p.role);
  const remainingPlayers = [...playersWithoutRoles];
  
  // Players who already picked a role are kept as is
  // We only shuffle and assign roles to those who didn't pick or if there are conflicts
  // But to keep it simple and respect the prompt "persists the chosen role":
  
  // Shuffle unassigned players
  for (let i = remainingPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remainingPlayers[i], remainingPlayers[j]] = [remainingPlayers[j], remainingPlayers[i]];
  }

  // Count existing roles to see what's missing
  const assignedRoles = players.filter(p => p.role).map(p => p.role);
  const missingRoles = roles.filter(r => !assignedRoles.includes(r));

  // Assign missing special roles to players who haven't picked one
  missingRoles.forEach(role => {
    if (remainingPlayers.length > 0) {
      const player = remainingPlayers.pop();
      player.role = role;
    }
  });

  // Assign Civilian role to the rest of unassigned players
  remainingPlayers.forEach(player => {
    player.role = 'Civilian';
  });
}

function checkWinCondition(room) {
  const mafiaCount = room.mafiaCount;
  const civilianCount = room.aliveCount - mafiaCount;

  if (mafiaCount === 0) {
    return { winner: 'Town', message: 'All Mafia eliminated! Town wins!' };
  }

  if (mafiaCount >= civilianCount) {
    return { winner: 'Mafia', message: 'Mafia outnumbers or equals the Town! Mafia wins!' };
  }

  return null;
}

module.exports = {
  assignRoles,
  checkWinCondition
};
