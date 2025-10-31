const http = require('http');
const url = require('url');
const { randomUUID } = require('crypto');
const { AI, createInitialHeatmap } = require('./ai_strategy.js');

// This Map will store all active game sessions
const activeGames = new Map();

// --- PASTE YOUR FULL 'recrCode' ARRAY HERE ---
const recrCode = [
    [-60, 5, -62, 4, -35, 3, 27, 3, 24, 2],
    // ...
    // ... (Your full array of 500+ layouts) ...
    // ...
    [96, 5, 84, 4, -71, 3, -2, 3, 53, 2]
];
// --- END OF ARRAY ---

// Run the heatmap generator (silently)
createInitialHeatmap();

// Game sessions will be removed after 1 day of inactivity
const GAME_TIMEOUT_MS = 1000 * 60 * 60 * 24; // 1 Day

// --- Helper Functions ---

function generateNewShipLayout() {
    const randomIndex = Math.floor(Math.random() * recrCode.length);
    return [...recrCode[randomIndex]];
}

function checkHit(target, game, gameId) {
  target = Number(target);
  if (target < 1 || target > 100) return "INVALID TARGET";
  
  if (game.playerHits.has(target)) {
    return "MISS";
  }

  const gameShips = game.shipLayout;
  for (let i = 0; i < gameShips.length; i += 2) {
    const originalPosition = gameShips[i];
    const position = Math.abs(originalPosition);
    const size = gameShips[i + 1];
    const isVertical = originalPosition < 0;

    for (let j = 0; j < size; j++) {
      const square = isVertical ? position + j * 10 : position + j;
      if (square === target) {
        game.playerHits.add(target);

        const shipIndex = i / 2;
        const ship = game.shipHealth[shipIndex];
        
        ship.hits++;
        
        if (ship.hits === ship.size) {
          ship.isSunk = true;
          // --- LOG REMOVED ---
          // console.log(`Game ${gameId}: Player SUNK a ship...`);
          return `SUNK_${ship.size}_${originalPosition}`;
        } else {
          return "HIT";
        }
      }
    }
  }
  
  game.playerHits.add(target);
  return "MISS";
}

// This function is part of the AI strategy, no logs here.
function getUniqueRandom(gameGuesses) {
  if (gameGuesses.size >= 100) {
    gameGuesses.clear();
  }
  let randomNum;
  do {
    randomNum = Math.floor(Math.random() * 100) + 1;
  } while (gameGuesses.has(randomNum));
  gameGuesses.add(randomNum);
  return randomNum;
}

/**
 * Periodically runs to remove inactive game sessions (user leaves).
 */
function cleanupOldGames() {
  const now = Date.now();
  let deletedCount = 0;
  for (const [gameId, gameState] of activeGames.entries()) {
    if (now - gameState.lastActivity > GAME_TIMEOUT_MS) {
      activeGames.delete(gameId);
      deletedCount++;
    }
  }
  if (deletedCount > 0) {
    // --- THIS IS THE "USER LEAVES" LOG ---
    console.log(`Cleaned up ${deletedCount} inactive game(s). Total games remaining: ${activeGames.size}`);
  }
}

// Start the cleanup-up timer (runs every 5 minutes)
setInterval(cleanupOldGames, 1000 * 60 * 5);

//The main server
const server = http.createServer((req, res) => {
  const { query } = url.parse(req.url, true);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Uptime monitor ping (silent)
  if (req.method === 'HEAD' && req.url === '/') {
    // console.log("Uptime monitor ping received (HEAD request).");
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end();
    return;
  }
  
  // === ROUTE 1: NEW GAME (User Joins) ===
  if (req.method === 'GET' && query.action === 'newGame') {
    const gameId = randomUUID();
    const layout = generateNewShipLayout();
    
    const newGame = {
      shipLayout: layout,
      aiGuesses: new Set(),
      lastActivity: Date.now(),
      shipHealth: [
        { size: layout[1], hits: 0, isSunk: false },
        { size: layout[3], hits: 0, isSunk: false },
        { size: layout[5], hits: 0, isSunk: false },
        { size: layout[7], hits: 0, isSunk: false },
        { size: layout[9], hits: 0, isSunk: false }
      ],
      playerHits: new Set(),
      ai: new AI(),
      lastAiGuess: -1
    };
    
    activeGames.set(gameId, newGame);
    
    // --- THIS IS THE "USER JOINS" LOG ---
    console.log(`New game started: ${gameId}. Total games: ${activeGames.size}`);
    
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(gameId);
  }
  
  // === ROUTE 2: MAKE A GUESS ===
  else if (req.method === 'GET' && query.target && query.gameId) {
    const game = activeGames.get(query.gameId);
    
    if (!game) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Error: Game not found. Your session may have expired.');
    } else {
      game.lastActivity = Date.now();
      
      let aiGuessResult = 'MISS';
      if (query.aiSunk) {
        if (query.aiSunk.startsWith('SUNK_')) {
            aiGuessResult = 'SUNK';
            // --- LOG REMOVED ---
            // const sunkInfo = query.aiSunk.split('_');
            // const sunkShipSize = sunkInfo[1];
            // const sunkShipPos = sunkInfo[2];
            // console.log(`Game ${query.gameId}: Client reported AI SUNK a ship...`);
        } else if (query.aiSunk === 'HIT') {
            aiGuessResult = 'HIT';
        }
      }

      if (game.lastAiGuess !== -1) {
          game.ai.updateState(game.lastAiGuess, aiGuessResult);
      }
      
      const playerResult = checkHit(query.target, game, query.gameId);
      
      let aiGuess;
      do {
          aiGuess = game.ai.getGuess();
      } while (game.aiGuesses.has(aiGuess));
      
      game.aiGuesses.add(aiGuess);
      game.lastAiGuess = aiGuess;
      
      const response = `${playerResult},${aiGuess}`;
      
      // --- LOG REMOVED ---
      // console.log(`Game ${query.gameId}: Target=${query.target}, Response=${response}`);
      
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(response);
    }
  }
  
  // === ELSE: INVALID REQUEST ===
  else {
    res.writeHead(404);
    res.end('Send a GET request with ?action=newGame or ?target=NUMBER&gameId=YOUR_ID');
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    // This log is useful to know the server started correctly.
    console.log(`Stateful Battleship server running on port ${port}`);
});
