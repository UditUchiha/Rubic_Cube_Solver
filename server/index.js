const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const SOLVER_PATH = process.env.SOLVER_PATH || path.join(__dirname, 'solver_api');
const CORNER_DB   = process.env.CORNER_DB_PATH || path.join(__dirname, 'Databases', 'corner.db');
const EDGE1_DB    = process.env.EDGE1_DB_PATH  || path.join(__dirname, 'Databases', 'edge1.db');
const EDGE2_DB    = process.env.EDGE2_DB_PATH  || path.join(__dirname, 'Databases', 'edge2.db');
const TIMEOUT_MS  = parseInt(process.env.SOLVER_TIMEOUT || '60000', 10);
const PORT = process.env.PORT || 3001;

let solverProcess = null;
let solverReady = false;
let pendingRequest = null;

function startSolver() {
  console.log('Starting solver process...');
  solverReady = false;

  solverProcess = spawn(SOLVER_PATH, [CORNER_DB, EDGE1_DB, EDGE2_DB], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';

  solverProcess.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (line && pendingRequest) {
        const { resolve, timer } = pendingRequest;
        clearTimeout(timer);
        pendingRequest = null;
        resolve(line);
      }
    }
  });

  solverProcess.stderr.on('data', (chunk) => {
    const msg = chunk.toString().trim();
    console.log(`[solver] ${msg}`);
    if (msg === 'READY') {
      solverReady = true;
      console.log('Solver databases loaded — ready to accept requests.');
    }
  });

  solverProcess.on('exit', (code) => {
    console.error(`Solver process exited with code ${code}`);
    solverReady = false;
    if (pendingRequest) {
      const { reject, timer } = pendingRequest;
      clearTimeout(timer);
      pendingRequest = null;
      reject(new Error('Solver process crashed'));
    }
    setTimeout(startSolver, 1000);
  });
}

function sendToSolver(cubeState) {
  return new Promise((resolve, reject) => {
    if (!solverProcess || !solverReady) {
      return reject(new Error('Solver not ready — databases still loading'));
    }
    if (pendingRequest) {
      return reject(new Error('Solver is busy with another request'));
    }

    const timer = setTimeout(() => {
      pendingRequest = null;
      reject(new Error('Solver timed out'));
    }, TIMEOUT_MS);

    pendingRequest = { resolve, reject, timer };
    solverProcess.stdin.write(cubeState + '\n');
  });
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', solverReady });
});

app.post('/api/solve', async (req, res) => {
  const { cubeState } = req.body || {};

  if (!cubeState || typeof cubeState !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing cubeState field' });
  }
  if (cubeState.length !== 54) {
    return res.status(400).json({ success: false, error: 'cubeState must be exactly 54 characters' });
  }
  if (!/^[WGRBOYwgrbyo]+$/.test(cubeState)) {
    return res.status(400).json({ success: false, error: 'Invalid characters — use only W G R B O Y' });
  }

  try {
    const line = await sendToSolver(cubeState.toUpperCase());

    if (line.startsWith('ERROR:')) {
      return res.status(400).json({ success: false, error: line.slice(7) });
    }

    const solutionStr = line.startsWith('SOLUTION:') ? line.slice(10).trim() : line.trim();
    const moves = solutionStr ? solutionStr.split(/\s+/).filter(Boolean) : [];
    res.json({ success: true, moves, moveCount: moves.length });
  } catch (err) {
    const status = err.message.includes('not ready') ? 503 :
                   err.message.includes('busy')      ? 429 :
                   err.message.includes('timed out')  ? 408 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

startSolver();

app.listen(PORT, () => {
  console.log(`Rubik's Cube Solver API listening on port ${PORT}`);
  console.log(`  Solver:    ${SOLVER_PATH}`);
  console.log(`  Corner DB: ${CORNER_DB}`);
  console.log(`  Edge1 DB:  ${EDGE1_DB}`);
  console.log(`  Edge2 DB:  ${EDGE2_DB}`);
});
