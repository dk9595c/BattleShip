const http = require('http');
const url = require('url');
const { randomUUID } = require('crypto'); // For generating unique game IDs

// This Map will store all active game sessions
// Key: gameId (string), Value: { shipLayout: [], aiGuesses: new Set(), lastActivity: Date, shipHealth: [], playerHits: new Set() }
const activeGames = new Map(); //

// --- PASTE YOUR FULL 'recrCode' ARRAY HERE ---
const recrCode = [
    [-60, 5, -62, 4, -35, 3, 27, 3, 24, 2],
    [-60, 5, -53, 4, 12, 3, 21, 3, 76, 2],
    // ...
    // ... (Paste all 500+ of your ship layout arrays here) ...
    // ...
    [96, 5, 84, 4, -71, 3, -2, 3, 53, 2]
];
// --- END OF ARRAY ---

// Game sessions will be removed after 1 day of inactivity
const GAME_TIMEOUT_MS = 1000 * 60 * 60 * 24; // 1 Day

// --- Helper Functions ---

/**
 * Creates a brand new, valid ship layout for the AI.
 * Randomly selects one layout from the predefined recrCode list.
 */
function generateNewShipLayout() {
    const randomIndex = Math.floor(Math.random() * recrCode.length);
    // Return a new copy
    return [...recrCode[randomIndex]]; 
}

/**
 * Checks a player's guess against a specific game's ship layout.
 * This function MODIFIES the game state.
 */
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
        // --- IT'S A HIT! ---
        game.playerHits.add(target); 

        const shipIndex = i / 2; 
        const ship = game.shipHealth[shipIndex];
        
        ship.hits++;
        
        if (ship.hits === ship.size) {
          ship.isSunk = true;
          console.log(`Game ${gameId}: Player SUNK a ship (Size: ${ship.size}, Pos: ${originalPosition})`);
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

/**
 * Gets a unique random guess for a specific game.
 */
function getUniqueRandom(gameGuesses) { //
  if (gameGuesses.size >= 100) { //
    gameGuesses.clear(); //
  }
  let randomNum;
  do {
    randomNum = Math.floor(Math.random() * 100) + 1; // 1-100
  } while (gameGuesses.has(randomNum)); //
  gameGuesses.add(randomNum); //
  return randomNum; //
}

/**
 * Periodically runs to remove inactive game sessions.
 */
function cleanupOldGames() { //
  const now = Date.now(); //
  let deletedCount = 0; //
  for (const [gameId, gameState] of activeGames.entries()) { //
    if (now - gameState.lastActivity > GAME_TIMEOUT_MS) { //
      activeGames.delete(gameId); //
      deletedCount++; //
    }
  }
  if (deletedCount > 0) { //
    console.log(`Cleaned up ${deletedCount} inactive game(s).`); //
  }
}

// Start the cleanup-up timer (runs every 5 minutes)
setInterval(cleanupOldGames, 1000 * 60 * 5); //

//The main server
const server = http.createServer((req, res) => { //
  const { query } = url.parse(req.url, true); //
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*'); //
  
  // --- NEW BLOCK TO HANDLE UPTIME MONITOR ---
  // Listen for a HEAD request to the root URL
  if (req.method === 'HEAD' && req.url === '/') {
    console.log("Uptime monitor ping received (HEAD request).");
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(); // Respond with 200 OK and no body
    return; // Stop processing this request
  }
  // --- END NEW BLOCK ---
  
  // === ROUTE 1: NEW GAME ===
  // Client asks to start a new game
  if (req.method === 'GET' && query.action === 'newGame') {
    const gameId = randomUUID(); //
    const layout = generateNewShipLayout(); 
    
    const newGame = {
      shipLayout: layout,
      aiGuesses: new Set(), //
      lastActivity: Date.now(), //
      shipHealth: [
        { size: layout[1], hits: 0, isSunk: false }, 
        { size: layout[3], hits: 0, isSunk: false }, 
        { size: layout[5], hits: 0, isSunk: false }, 
        { size: layout[7], hits: 0, isSunk: false }, 
        { size: layout[9], hits: 0, isSunk: false }
      ],
      playerHits: new Set()
    };
    
    activeGames.set(gameId, newGame); //
    console.log(`New game started: ${gameId}. Total games: ${activeGames.size}`); //
    
    res.writeHead(200, { 'Content-Type': 'text/plain' }); //
    res.end(gameId); // Send the unique game ID back to the client
  }
  
  // === ROUTE 2: MAKE A GUESS ===
  // Client makes a move, providing their gameId
  else if (req.method === 'GET' && query.target && query.gameId) {
    const game = activeGames.get(query.gameId); //
    
    if (!game) {
      // No game found for this ID
      res.writeHead(404, { 'Content-Type': 'text/plain' }); //
      res.end('Error: Game not found. Your session may have expired.'); //
    } else {
      // Game found, proceed with game logic
      game.lastActivity = Date.now(); // Update last activity time
      
      // Check if the client is reporting a sink (e.g., "SUNK_3_-35")
      if (query.aiSunk && query.aiSunk.startsWith('SUNK_')) {
        const sunkInfo = query.aiSunk.split('_'); 
        const sunkShipSize = sunkInfo[1];
        const sunkShipPos = sunkInfo[2];
        console.log(`Game ${query.gameId}: Client reported AI SUNK a ship (Size: ${sunkShipSize}, Pos: ${sunkShipPos})!`);
      }
      
      const result = checkHit(query.target, game, query.gameId);
      
      const randomNumber = getUniqueRandom(game.aiGuesses); //
      const response = `${result},${randomNumber}`; //
      
      console.log(`Game ${query.gameId}: Target=${query.target}, Response=${response}`); //
      
      res.writeHead(200, { 'Content-Type': 'text/plain' }); //
      res.end(response); //
    }
  }
  
  // === ELSE: INVALID REQUEST ===
  else { //
    res.writeHead(404); //
    res.end('Send a GET request with ?action=newGame or ?target=NUMBER&gameId=YOUR_ID'); //
  }
});

const port = process.env.PORT || 3000; // Use Render's port or 3000 for local
server.listen(port, () => {
    console.log(`Stateful Battleship server running on port ${port}`);
});
