// This is a 100-element array (0-99)
// It's pre-calculated once and shared by all AI instances.
let GLOBAL_HUNT_STACK = [];

/**
 * Creates the master heatmap and sorted hunt stack.
 * Runs ONLY ONCE when the server starts.
 */
function createInitialHeatmap() {
    console.log("AI: Generating initial heatmap...");
    const heatmap = new Array(100).fill(0);
    const shipSizes = [5, 4, 3, 3, 2];

    const isValid = (sq) => sq >= 0 && sq < 100;

    for (const size of shipSizes) {
        // Horizontal placements
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c <= 10 - size; c++) {
                for (let i = 0; i < size; i++) {
                    heatmap[r * 10 + c + i]++;
                }
            }
        }
        // Vertical placements
        for (let c = 0; c < 10; c++) {
            for (let r = 0; r <= 10 - size; r++) {
                for (let i = 0; i < size; i++) {
                    heatmap[(r + i) * 10 + c]++;
                }
            }
        }
    }

    // Create a "checkerboard" hunt list, sorted by heat
    // This is the most efficient way to find the first ship.
    const sortedHeat = heatmap
        .map((heat, square) => ({ square, heat }))
        .filter(item => (item.square % 2) === (Math.floor(item.square / 10) % 2)) // Checkerboard
        .sort((a, b) => a.heat - b.heat); // Sort from coldest to hottest

    // GLOBAL_HUNT_STACK is now an array of square numbers, from hottest to coldest.
    GLOBAL_HUNT_STACK = sortedHeat.map(item => item.square);
    console.log("AI: Heatmap generated. Hunt stack ready.");
}

/**
 * AI class to manage the state for a single game.
 */
class AI {
    constructor() {
        // Each AI gets its own *copy* of the hunt stack
        this.huntStack = [...GLOBAL_HUNT_STACK];
        this.targetQueue = []; // Squares to hit in "TARGET" mode
        this.mode = 'HUNT';
        this.firstHit = -1; // The first square we hit of a new ship
        this.lastHit = -1; // The most recent hit
    }

    /**
     * The server calls this to get the AI's next guess.
     * @returns {number} The square to guess (1-100)
     */
    getGuess() {
        let guess = -1;
        if (this.targetQueue.length > 0) {
            // We are in TARGET mode, pop from the priority queue
            guess = this.targetQueue.shift();
        } else {
            // We are in HUNT mode, pop from the heatmap stack
            this_mode = 'HUNT';
            if (this.huntStack.length > 0) {
                guess = this.huntStack.pop();
            } else {
                // Failsafe: if heatmap is empty, guess randomly
                guess = Math.floor(Math.random() * 100);
            }
        }
        return guess + 1; // Convert from 0-99 to 1-100
    }

    /**
     * The server calls this to tell the AI the result of its last guess.
     * @param {number} guess - The guess the AI just made (1-100)
     * @param {string} result - "HIT", "MISS", or "SUNK"
     */
    updateState(guess, result) {
        const guessIdx = guess - 1; // Convert from 1-100 to 0-99

        if (result === 'SUNK') {
            this.mode = 'HUNT';
            this.targetQueue = []; // Clear queue
            this.firstHit = -1;
            this.lastHit = -1;
        } else if (result === 'HIT') {
            this.mode = 'TARGET';
            this.lastHit = guessIdx;

            if (this.firstHit === -1) {
                // This is the first hit on this ship
                this.firstHit = guessIdx;
                this._addNeighborsToQueue(guessIdx);
            } else {
                // This is the second+ hit. We know the orientation.
                this._pruneTargetQueue(guessIdx);
            }
        }
    }
    
    // --- Private Helper Methods ---

    _addNeighborsToQueue(square) {
        const neighbors = [];
        const r = Math.floor(square / 10);
        const c = square % 10;
        
        if (c > 0) neighbors.push(square - 1); // Left
        if (c < 9) neighbors.push(square + 1); // Right
        if (r > 0) neighbors.push(square - 10); // Up
        if (r < 9) neighbors.push(square + 10); // Down
        
        // Add valid neighbors to the front of the queue
        this.targetQueue.unshift(...neighbors);
    }

    _pruneTargetQueue(hitSquare) {
        const orientation = (this.firstHit % 10 === hitSquare % 10) ? 'VERTICAL' : 'HORIZONTAL';
        
        // Clear any neighbors that don't match the new orientation
        this.targetQueue = this.targetQueue.filter(sq => {
            if (orientation === 'VERTICAL') {
                return sq % 10 === hitSquare % 10; // Keep only squares in the same column
            } else {
                return Math.floor(sq / 10) === Math.floor(hitSquare / 10); // Keep only squares in the same row
            }
        });

        // Add the *next* square in the-line
        let nextGuess = -1;
        if (orientation === 'VERTICAL') {
            nextGuess = (hitSquare > this.firstHit) ? hitSquare + 10 : hitSquare - 10;
        } else {
            nextGuess = (hitSquare > this.firstHit) ? hitSquare + 1 : hitSquare - 1;
        }
        
        if (nextGuess >= 0 && nextGuess < 100 && !this.targetQueue.includes(nextGuess)) {
            this.targetQueue.unshift(nextGuess); // Add to front
        }
    }
}

// Export the class and the initialization function
module.exports = {
    AI,
    createInitialHeatmap
};
