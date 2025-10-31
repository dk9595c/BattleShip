const http = require('http');
const url = require('url');
const { randomUUID } = require('crypto'); // For generating unique game IDs

// This Map will store all active game sessions
// Key: gameId (string), Value: { ships: [], aiGuesses: new Set(), lastActivity: Date }
const activeGames = new Map();

// --- ADD YOUR FULL ARRAY HERE ---
// This contains the ship positions
const recrCode = [
    [-60, 5, -62, 4, -35, 3, 27, 3, 24, 2],
    [-60, 5, -53, 4, 12, 3, 21, 3, 76, 2],
    [-60, 5, -43, 4, -49, 3, 44, 3, 24, 2],
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
    // Get a random index from 0 to (recrCode.length - 1)
    const randomIndex = Math.floor(Math.random() * recrCode.length);
    
    // Return the ship layout array at that random index
    // We return a new copy so any modifications don't affect the original
    return [...recrCode[randomIndex]]; 
}

/**
 * Checks a player's guess against a specific game's ship layout.
 */
function checkHit(target, gameShips) {
    target = Number(target);
    if (target < 1 || target > 100) return "INVALID TARGET";

    // Use the game-specific 'gameShips' array
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
 */
function getUniqueRandom(gameGuesses) {
    // Use the game-specific 'gameGuesses' Set
    if (gameGuesses.size >= 100) {
        gameGuesses.clear();
    }

    let randomNum;
    do {
        randomNum = Math.floor(Math.random() * 100) + 1; // 1-100
    } while (gameGuesses.has(randomNum));

    gameGuesses.add(randomNum);
    return randomNum;
}

/**
 * Periodically runs to remove inactive game sessions.
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

const port = process.env.PORT || 3000; // Use Render's port or 3000 for local
server.listen(port, () => {
    console.log(`Stateful Battleship server running on port ${port}`);
});
