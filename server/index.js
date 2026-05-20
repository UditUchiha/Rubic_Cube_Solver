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
let requestCount = 0;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function startSolver() {
  log(`Starting solver process: ${SOLVER_PATH}`);
  log(`  Corner DB: ${CORNER_DB}`);
  log(`  Edge1 DB:  ${EDGE1_DB}`);
  log(`  Edge2 DB:  ${EDGE2_DB}`);
  solverReady = false;

  solverProcess = spawn(SOLVER_PATH, [CORNER_DB, EDGE1_DB, EDGE2_DB], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  log(`Solver process spawned with PID ${solverProcess.pid}`);

  let stdoutBuffer = '';
  let stderrBuffer = '';

  solverProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    let newlineIdx;
    while ((newlineIdx = stdoutBuffer.indexOf('\n')) !== -1) {
      const line = stdoutBuffer.slice(0, newlineIdx).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
      if (!line) continue;

      log(`[solver stdout] ${line}`);

      if (pendingRequest) {
        const { resolve, timer, reqId } = pendingRequest;
        clearTimeout(timer);
        pendingRequest = null;
        log(`[req #${reqId}] Got response from solver`);
        resolve(line);
      } else {
        log(`[WARNING] Solver output with no pending request: ${line}`);
      }
    }
  });

  solverProcess.stderr.on('data', (chunk) => {
    stderrBuffer += chunk.toString();
    let newlineIdx;
    while ((newlineIdx = stderrBuffer.indexOf('\n')) !== -1) {
      const line = stderrBuffer.slice(0, newlineIdx).trim();
      stderrBuffer = stderrBuffer.slice(newlineIdx + 1);
      if (!line) continue;

      log(`[solver stderr] ${line}`);

      if (line === 'READY') {
        solverReady = true;
        log('Solver databases loaded — ready to accept requests.');
      }
    }
  });

  solverProcess.on('error', (err) => {
    log(`[ERROR] Failed to start solver: ${err.message}`);
  });

  solverProcess.on('exit', (code, signal) => {
    log(`Solver process exited — code: ${code}, signal: ${signal}`);
    solverReady = false;
    solverProcess = null;
    if (pendingRequest) {
      const { reject, timer, reqId } = pendingRequest;
      clearTimeout(timer);
      pendingRequest = null;
      log(`[req #${reqId}] Rejecting — solver crashed`);
      reject(new Error('Solver process crashed'));
    }
    log('Restarting solver in 2s...');
    setTimeout(startSolver, 2000);
  });
}

function sendToSolver(cubeState) {
  return new Promise((resolve, reject) => {
    const reqId = ++requestCount;
    log(`[req #${reqId}] cubeState=${cubeState}`);
    log(`[req #${reqId}] solverReady=${solverReady}, hasPending=${!!pendingRequest}, pid=${solverProcess?.pid}`);

    if (!solverProcess) {
      log(`[req #${reqId}] REJECTED — solver process is null`);
      return reject(new Error('Solver not ready — process not started'));
    }
    if (!solverReady) {
      log(`[req #${reqId}] REJECTED — databases still loading`);
      return reject(new Error('Solver not ready — databases still loading'));
    }
    if (pendingRequest) {
      log(`[req #${reqId}] REJECTED — busy with req #${pendingRequest.reqId}`);
      return reject(new Error('Solver is busy with another request'));
    }

    const timer = setTimeout(() => {
      log(`[req #${reqId}] TIMED OUT after ${TIMEOUT_MS}ms`);
      pendingRequest = null;
      reject(new Error(`Solver timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    pendingRequest = { resolve, reject, timer, reqId };
    solverProcess.stdin.write(cubeState + '\n');
    log(`[req #${reqId}] Sent to solver stdin`);
  });
}

app.get('/health', (_req, res) => {
  log(`GET /health — solverReady=${solverReady}, pid=${solverProcess?.pid}`);
  res.json({ status: 'ok', solverReady });
});

app.post('/api/solve', async (req, res) => {
  const { cubeState } = req.body || {};
  log(`POST /api/solve — cubeState=${cubeState}`);

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
    const start = Date.now();
    const line = await sendToSolver(cubeState.toUpperCase());
    const elapsed = Date.now() - start;

    if (line.startsWith('ERROR:')) {
      log(`Solve failed (${elapsed}ms): ${line}`);
      return res.status(400).json({ success: false, error: line.slice(7) });
    }

    const solutionStr = line.startsWith('SOLUTION:') ? line.slice(10).trim() : line.trim();
    const moves = solutionStr ? solutionStr.split(/\s+/).filter(Boolean) : [];
    log(`Solved in ${elapsed}ms — ${moves.length} moves: ${solutionStr}`);
    res.json({ success: true, moves, moveCount: moves.length });
  } catch (err) {
    log(`Solve error: ${err.message}`);
    const status = err.message.includes('not ready') ? 503 :
                   err.message.includes('busy')      ? 429 :
                   err.message.includes('timed out')  ? 408 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

startSolver();

app.listen(PORT, () => {
  log(`Rubik's Cube Solver API listening on port ${PORT}`);
  log(`  Solver timeout: ${TIMEOUT_MS}ms`);
});
