const http = require('http');
const url = require('url');
const { randomUUID } = require('crypto'); // For generating unique game IDs

// This Map will store all active game sessions
// Key: gameId (string), Value: { ships: [], aiGuesses: new Set(), lastActivity: Date }
const activeGames = new Map();

// Game sessions will be removed after 15 minutes of inactivity
const GAME_TIMEOUT_MS = 1000 * 60 * 15;

// --- Helper Functions ---

/**
 * Creates a brand new, valid ship layout for the AI.
 * NOTE: This is a placeholder. For a real game, you would
 * implement an algorithm to randomly place these ships without overlap.
 * For this example, we just give every AI the same board,
 * but in a real-world scenario, this function would generate a *different* layout.
 */
function generateNewShipLayout() {
  // We return a new copy of the array so each game has its own instance.
  // Original layout from your server.js
  return [-60, 5, -62, 4, -35, 3, 27, 3, 24, 2];
}

/**
 * Checks a player's guess against a specific game's ship layout.
 * This is your original function, modified to accept a 'gameShips' array.
 */
function checkHit(target, gameShips) {
  target = Number(target);
  if (target < 1 || target > 100) return "INVALID TARGET";

  // Use the game-specific 'gameShips' array, not the global one
  for (let i = 0; i < gameShips.length; i += 2) {
    const position = Math.abs(gameShips[i]);
    const size = gameShips[i + 1];
    const isVertical = gameShips[i] < 0;

    for (let j = 0; j < size; j++) {
      const square = isVertical ? position + j * 10 : position + j;
      if (square === target) return "HIT";
    }
  }
  return "MISS";
}

/**
 * Gets a unique random guess for a specific game.
 * This is your original function, modified to accept a 'gameGuesses' Set.
 */
function getUniqueRandom(gameGuesses) {
  // Use the game-specific 'gameGuesses' Set
  if (gameGuesses.size >= 100) {
    gameGuesses.clear(); //
  }

  let randomNum;
  do {
    randomNum = Math.floor(Math.random() * 100) + 1; // 1-100
  } while (gameGuesses.has(randomNum)); //

  gameGuesses.add(randomNum); //
  return randomNum;
}

/**
 * Periodically runs to remove inactive game sessions.
 * This handles your requirement "when that client goes, his state should be reset."
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
    console.log(`Cleaned up ${deletedCount} inactive game(s).`);
  }
}

// Start the cleanup-up timer (runs every 5 minutes)
setInterval(cleanupOldGames, 1000 * 60 * 5);

//The main server
const server = http.createServer((req, res) => {
  const { query } = url.parse(req.url, true);
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // === ROUTE 1: NEW GAME ===
  // Client asks to start a new game
  if (req.method === 'GET' && query.action === 'newGame') {
    const gameId = randomUUID();
    const newGame = {
      ships: generateNewShipLayout(),
      aiGuesses: new Set(),
      lastActivity: Date.now()
    };
    
    activeGames.set(gameId, newGame);
    console.log(`New game started: ${gameId}. Total games: ${activeGames.size}`);
    
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(gameId); // Send the unique game ID back to the client
  }
  
  // === ROUTE 2: MAKE A GUESS ===
  // Client makes a move, providing their gameId
  else if (req.method === 'GET' && query.target && query.gameId) {
    const game = activeGames.get(query.gameId);
    
    if (!game) {
      // No game found for this ID
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Error: Game not found. Your session may have expired.');
    } else {
      // Game found, proceed with game logic
      game.lastActivity = Date.now(); // Update last activity time
      
      const result = checkHit(query.target, game.ships);
      const randomNumber = getUniqueRandom(game.aiGuesses);
      const response = `${result},${randomNumber}`;
      
      console.log(`Game ${query.gameId}: Target=${query.target}, Response=${response}`);
      
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

server.listen(3000, () => {
  console.log('Stateful Battleship server running on http://localhost:3000');
});
