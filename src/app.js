// Backend URL - Change this to your hosted backend URL (e.g., https://your-app.onrender.com)
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? '' 
    : 'https://mafia-game-backend.onrender.com'; // Replace with your actual backend URL

const socket = io(BACKEND_URL);

// State
let currentRoomId = null;
let myPlayer = null;
let players = [];
let currentPhase = 'lobby';
let selectedRole = null;
let roleFinalized = false;

// DOM Elements
const homeScreen = document.getElementById('home-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const overlay = document.getElementById('overlay');

// Role Chooser Elements
const roleOptBtns = document.querySelectorAll('.role-opt-btn');
const confirmRoleBtn = document.getElementById('confirm-role-btn');
const roleFinalizedMsg = document.getElementById('role-finalized-msg');

// Home Inputs
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('room-id-input');

// Lobby Elements
const displayRoomId = document.getElementById('display-room-id');
const playerList = document.getElementById('lobby-player-list');
const playerCount = document.getElementById('player-count');
const startGameBtn = document.getElementById('start-game-btn');
const waitingMsg = document.getElementById('waiting-msg');

// Game Elements
const phaseIndicator = document.getElementById('phase-indicator');
const phaseIcon = document.getElementById('phase-icon');
const roleDisplay = document.querySelector('#role-display span');
const gamePlayerList = document.getElementById('game-player-list');
const gameStatusMsg = document.getElementById('game-status-msg');
const actionPanel = document.getElementById('action-panel');
const actionPrompt = document.getElementById('action-prompt');
const targetList = document.getElementById('target-list');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendMsgBtn = document.getElementById('send-msg-btn');

// Overlay Elements
const overlayTitle = document.getElementById('overlay-title');
const overlayMsg = document.getElementById('overlay-msg');
const closeOverlayBtn = document.getElementById('close-overlay-btn');

// --- Role Chooser Logic ---
function initRoleChooser() {
    const btns = document.querySelectorAll('.role-opt-btn');
    const confirmBtn = document.getElementById('confirm-role-btn');
    
    if (!btns.length || !confirmBtn) return;

    btns.forEach(btn => {
        btn.onclick = () => {
            if (roleFinalized) return;
            
            btns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedRole = btn.dataset.role;
            confirmBtn.disabled = false;
            confirmBtn.classList.add('bg-rose-600');
        };
    });

    confirmBtn.onclick = () => {
        if (!selectedRole || roleFinalized) return;
        
        roleFinalized = true;
        const finalizedMsg = document.getElementById('role-finalized-msg');
        if (finalizedMsg) finalizedMsg.classList.remove('hidden');
        confirmBtn.classList.add('hidden');
        btns.forEach(btn => btn.disabled = true);
        
        // Persist role selection to server for the session
        socket.emit('selectRole', { roomId: currentRoomId, role: selectedRole });
        
        showOverlay('Identity Encrypted', `You have finalized your role as ${selectedRole}. This cannot be changed.`, 'lock');
    };
}

function resetRoleChooser() {
    selectedRole = null;
    roleFinalized = false;
    const btns = document.querySelectorAll('.role-opt-btn');
    const confirmBtn = document.getElementById('confirm-role-btn');
    const finalizedMsg = document.getElementById('role-finalized-msg');

    if (btns.length) {
        btns.forEach(btn => {
            btn.classList.remove('selected');
            btn.disabled = false;
        });
    }
    
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.classList.remove('hidden', 'bg-rose-600');
    }
    
    if (finalizedMsg) finalizedMsg.classList.add('hidden');
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    initRoleChooser();
    refreshIcons();
});

// --- Navigation ---
function showView(view) {
    [homeScreen, lobbyScreen, gameScreen].forEach(v => v.classList.add('hidden'));
    view.classList.remove('hidden');
    refreshIcons();
}

function refreshIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// --- Socket Events ---
socket.on('roomCreated', ({ roomId, player }) => {
    currentRoomId = roomId;
    myPlayer = player;
    players = [player];
    displayRoomId.textContent = roomId;
    resetRoleChooser();
    updateLobbyUI();
    showView(lobbyScreen);
    startGameBtn.classList.remove('hidden');
    waitingMsg.classList.add('hidden');
});

socket.on('joinedRoom', ({ roomId, player, players: roomPlayers }) => {
    currentRoomId = roomId;
    myPlayer = player;
    players = roomPlayers;
    displayRoomId.textContent = roomId;
    resetRoleChooser();
    updateLobbyUI();
    showView(lobbyScreen);
});

socket.on('playerJoined', (player) => {
    players.push(player);
    updateLobbyUI();
});

socket.on('playerLeft', (playerId) => {
    players = players.filter(p => p.id !== playerId);
    if (currentPhase === 'lobby') {
        updateLobbyUI();
    } else {
        updateGameUI();
    }
});

socket.on('gameStarted', (data) => {
    players = data.players;
    myPlayer = data.myPlayer;
    currentPhase = data.phase;
    showView(gameScreen);
    updateGameUI();
});

socket.on('messageReceived', (msg) => {
    const isMe = msg.username === myPlayer.username;
    const msgElement = document.createElement('div');
    msgElement.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1 mb-2`;
    msgElement.innerHTML = `
        <div class="flex items-center gap-2 px-1">
            <span class="text-[9px] font-black uppercase tracking-widest text-slate-500">${msg.username}</span>
            <span class="text-[8px] text-slate-600 font-mono">${msg.time}</span>
        </div>
        <div class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${isMe ? 'bg-rose-600 text-white rounded-tr-none shadow-rose-900/20' : 'bg-white/5 text-slate-300 rounded-tl-none border border-white/5'}">
            ${msg.text}
        </div>
    `;
    chatMessages.appendChild(msgElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('phaseChanged', ({ phase, result }) => {
    currentPhase = phase;
    if (result && result.eliminatedId) {
        const eliminated = players.find(p => p.id === result.eliminatedId);
        if (eliminated) {
            eliminated.alive = false;
            showOverlay('Elimination', `${eliminated.username} has been neutralized.`, 'skull');
        }
    } else if (result && phase === 'day') {
        showOverlay('Quiet Night', 'The night passed without incident. All agents are accounted for.', 'shield-check');
    }

    if (result && result.investigationResult && myPlayer.role === 'Police') {
        const target = players.find(p => p.id === result.investigationResult.targetId);
        showOverlay('Intelligence Report', `Target ${target.username} has been identified as: ${result.investigationResult.role}`, 'search');
    }

    updateGameUI();
});

socket.on('gameEnded', (result) => {
    const isWinner = (myPlayer.role === 'Mafia' && result.winner === 'Mafia') || 
                     (myPlayer.role !== 'Mafia' && result.winner === 'Town');
    
    showOverlay(
        isWinner ? 'Mission Success' : 'Mission Failed',
        result.message,
        isWinner ? 'trophy' : 'frown'
    );
    
    setTimeout(() => {
        location.reload();
    }, 8000);
});

socket.on('error', (msg) => {
    showOverlay('System Error', msg, 'alert-circle');
});

// --- UI Updates ---
function updateLobbyUI() {
    playerList.innerHTML = '';
    players.forEach(p => {
        const isMe = p.id === socket.id;
        const li = document.createElement('li');
        li.className = `flex items-center justify-between p-4 rounded-2xl border transition-all ${isMe ? 'bg-rose-500/10 border-rose-500/30' : 'bg-white/5 border-white/5'}`;
        li.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-white/10">
                    <i data-lucide="user" class="w-5 h-5 ${isMe ? 'text-rose-500' : 'text-slate-400'}"></i>
                </div>
                <span class="font-bold ${isMe ? 'text-white' : 'text-slate-300'}">${p.username} ${isMe ? '<span class="text-[10px] ml-2 px-2 py-1 rounded-md bg-rose-500 text-white uppercase tracking-tighter">You</span>' : ''}</span>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Ready</span>
            </div>
        `;
        playerList.appendChild(li);
    });
    playerCount.textContent = players.length;
    refreshIcons();
}

function updateGameUI() {
    const isNight = currentPhase === 'night';
    phaseIndicator.textContent = isNight ? 'Night Infiltration' : 'Day Discussion';
    phaseIcon.setAttribute('data-lucide', isNight ? 'moon' : 'sun');
    
    roleDisplay.textContent = myPlayer.role;
    roleDisplay.className = `text-2xl font-black uppercase tracking-tighter ${getRoleColor(myPlayer.role)}`;
    
    gamePlayerList.innerHTML = '';
    players.forEach(p => {
        const isMe = p.id === socket.id;
        const li = document.createElement('li');
        li.className = `group flex items-center justify-between p-3 rounded-xl border transition-all ${!p.alive ? 'opacity-40 grayscale bg-black/40 border-transparent' : isMe ? 'bg-rose-500/10 border-rose-500/30' : 'bg-white/5 border-white/5'}`;
        li.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="relative">
                    <div class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-white/10">
                        <i data-lucide="${p.alive ? 'user' : 'skull'}" class="w-4 h-4 ${p.alive ? (isMe ? 'text-rose-500' : 'text-slate-400') : 'text-slate-600'}"></i>
                    </div>
                    ${p.alive ? '<div class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-900"></div>' : ''}
                </div>
                <span class="text-sm font-bold ${p.alive ? (isMe ? 'text-white' : 'text-slate-300') : 'text-slate-600 line-through'}">${p.username}</span>
            </div>
            ${isMe ? '<i data-lucide="star" class="w-3 h-3 text-rose-500 fill-current"></i>' : ''}
        `;
        gamePlayerList.appendChild(li);
    });

    if (myPlayer.alive) {
        if (currentPhase === 'night') {
            handleNightPhase();
        } else if (currentPhase === 'day') {
            handleDayPhase();
        }
    } else {
        gameStatusMsg.textContent = "Your cover was blown. You are now spectating from the shadows...";
        actionPanel.classList.add('hidden');
    }
    refreshIcons();
}

function getRoleColor(role) {
    switch(role) {
        case 'Mafia': return 'text-rose-500';
        case 'Doctor': return 'text-emerald-500';
        case 'Police': return 'text-blue-500';
        default: return 'text-slate-400';
    }
}

function handleNightPhase() {
    actionPanel.classList.remove('hidden');
    targetList.innerHTML = '';
    
    if (myPlayer.role === 'Mafia') {
        gameStatusMsg.textContent = "Eliminate a high-value target to weaken the resistance.";
        actionPrompt.textContent = "Select Target for Neutralization";
        createTargetButtons(p => p.id !== socket.id && p.alive, 'mafia', 'crosshair');
    } else if (myPlayer.role === 'Doctor') {
        gameStatusMsg.textContent = "Deploy medical support to an agent in danger.";
        actionPrompt.textContent = "Select Agent to Protect";
        createTargetButtons(p => p.alive, 'doctor', 'shield');
    } else if (myPlayer.role === 'Police') {
        gameStatusMsg.textContent = "Investigate an agent to uncover their true allegiance.";
        actionPrompt.textContent = "Select Agent for Investigation";
        createTargetButtons(p => p.id !== socket.id && p.alive, 'police', 'search');
    } else {
        gameStatusMsg.textContent = "The operation is in progress. Maintain radio silence and wait for daybreak...";
        actionPanel.classList.add('hidden');
    }
}

function handleDayPhase() {
    actionPanel.classList.remove('hidden');
    gameStatusMsg.textContent = "The sun has risen. Discuss the findings and vote to exile a suspect.";
    actionPrompt.textContent = "Cast Your Vote for Exile";
    targetList.innerHTML = '';
    createTargetButtons(p => p.id !== socket.id && p.alive, 'vote', 'vote');
}

function createTargetButtons(filterFn, actionType, icon) {
    players.filter(filterFn).forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'group flex flex-col items-center justify-center p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all active:scale-95 space-y-2';
        btn.innerHTML = `
            <div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-white/10 group-hover:border-rose-500/30 transition-colors">
                <i data-lucide="${icon}" class="w-5 h-5 text-slate-500 group-hover:text-rose-500 transition-colors"></i>
            </div>
            <span class="text-xs font-bold text-slate-400 group-hover:text-white transition-colors uppercase tracking-widest">${p.username}</span>
        `;
        btn.onclick = () => {
            if (actionType === 'vote') {
                socket.emit('vote', { roomId: currentRoomId, targetId: p.id });
            } else {
                socket.emit('nightAction', { roomId: currentRoomId, action: actionType, targetId: p.id });
            }
            actionPanel.classList.add('hidden');
            gameStatusMsg.textContent = "Action submitted. Waiting for other agents to finalize their moves...";
        };
        targetList.appendChild(btn);
    });
    refreshIcons();
}

function showOverlay(title, msg, icon = 'alert-triangle') {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    
    const iconContainer = document.getElementById('overlay-icon-container');
    iconContainer.innerHTML = `<i data-lucide="${icon}" class="w-16 h-16 text-rose-500"></i>`;
    
    overlay.classList.remove('hidden');
    refreshIcons();
}

// --- Event Listeners ---
document.getElementById('create-room-btn').onclick = () => {
    const username = usernameInput.value.trim();
    if (username) {
        socket.emit('createRoom', username);
    } else {
        showOverlay('Identification Required', 'Please enter your agent name before initializing the operation.', 'user-x');
    }
};

document.getElementById('join-room-btn').onclick = () => {
    const username = usernameInput.value.trim();
    const roomId = roomIdInput.value.trim().toUpperCase();
    if (username && roomId) {
        socket.emit('joinRoom', { roomId, username });
    } else {
        showOverlay('Intel Missing', 'Both agent name and operation ID are required to join the mission.', 'fingerprint');
    }
};

startGameBtn.onclick = () => {
    if (players.length >= 4) {
        socket.emit('startGame', currentRoomId);
    } else {
        showOverlay('Insufficient Personnel', 'We need at least 4 agents to begin the infiltration. Recruitment is ongoing...', 'users');
    }
};

sendMsgBtn.onclick = () => {
    const msg = chatInput.value.trim();
    if (msg) {
        socket.emit('sendMessage', { roomId: currentRoomId, message: msg });
        chatInput.value = '';
    }
};

chatInput.onkeypress = (e) => {
    if (e.key === 'Enter') sendMsgBtn.click();
};

closeOverlayBtn.onclick = () => {
    overlay.classList.add('hidden');
};

// Initial icon refresh
// (Removed duplicated DOMContentLoaded listener to prevent initialization race conditions)
