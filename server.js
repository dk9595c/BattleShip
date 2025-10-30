const http = require('http');
const url = require('url');

// Your ships configuration
const ships = [-60, 5, -62, 4, -35, 3, 27, 3, 24, 2];

// Track used random numbers
const usedNumbers = new Set();

function checkHit(target) {
  target = Number(target);
  if (target < 1 || target > 100) return "INVALID TARGET";

  for (let i = 0; i < ships.length; i += 2) {
    const position = Math.abs(ships[i]);
    const size = ships[i + 1];
    const isVertical = ships[i] < 0;

    for (let j = 0; j < size; j++) {
      const square = isVertical ? position + j * 10 : position + j;
      if (square === target) return "HIT";
    }
  }
  return "MISS";
}

function getUniqueRandom() {
  if (usedNumbers.size >= 100) {
    // Reset if all numbers have been used
    usedNumbers.clear();
  }

  let randomNum;
  do {
    randomNum = Math.floor(Math.random() * 100) + 1; // 1-100
  } while (usedNumbers.has(randomNum));

  usedNumbers.add(randomNum);
  return randomNum;
}

const server = http.createServer((req, res) => {
  const { query } = url.parse(req.url, true);
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'GET' && query.target) {
    const result = checkHit(query.target);
    const randomNumber = getUniqueRandom();
    const response = `${result},${randomNumber}`;
    console.log(response);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(response);
  } else {
    res.writeHead(404);
    res.end('Send a GET request with ?target=NUMBER');
  }
});

server.listen(3000, () => {
  console.log('Battleship server running on http://localhost:3000');
});
