const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
app.use(cors());
// Cap the body: the only field we accept is 54 characters long.
app.use(express.json({ limit: '16kb' }));

const SOLVER_PATH = process.env.SOLVER_PATH || path.join(__dirname, 'solver_api');
const CORNER_DB = process.env.CORNER_DB_PATH || path.join(__dirname, 'Databases', 'corner.db');
const EDGE1_DB = process.env.EDGE1_DB_PATH || path.join(__dirname, 'Databases', 'edge1.db');
const EDGE2_DB = process.env.EDGE2_DB_PATH || path.join(__dirname, 'Databases', 'edge2.db');

// The solver gives up on its own at SOLVER_TIME_LIMIT and stays alive. This is
// only a backstop for a genuinely wedged process, so it sits comfortably above
// the solver's own budget.
const SOLVER_TIME_LIMIT = parseInt(process.env.SOLVER_TIME_LIMIT || '50', 10);
const TIMEOUT_MS = parseInt(process.env.SOLVER_TIMEOUT || String((SOLVER_TIME_LIMIT + 15) * 1000), 10);

// One solver process handles one cube at a time, so extra arrivals queue rather
// than being turned away. Bounded, because a queue longer than this means every
// waiting user is past caring anyway.
const MAX_QUEUE = parseInt(process.env.SOLVER_MAX_QUEUE || '8', 10);
const PORT = process.env.PORT || 3001;

let solverProcess = null;
let solverReady = false;
let pendingRequest = null;
let requestCount = 0;
let restartAttempts = 0;
const queue = [];

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
    env: { ...process.env, SOLVER_TIME_LIMIT: String(SOLVER_TIME_LIMIT) },
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
        drainQueue();
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
        restartAttempts = 0;
        log('Solver databases loaded - ready to accept requests.');
        drainQueue();
      } else if (line.startsWith('FATAL:')) {
        // A missing or corrupt database is not transient. Restarting on a loop
        // just hides the message, so stop and let the platform surface it.
        log('Solver reported a fatal startup error; not restarting.');
        restartAttempts = Number.MAX_SAFE_INTEGER;
      }
    }
  });

  solverProcess.on('error', (err) => {
    log(`[ERROR] Failed to start solver: ${err.message}`);
  });

  solverProcess.on('exit', (code, signal) => {
    log(`Solver process exited - code: ${code}, signal: ${signal}`);
    solverReady = false;
    solverProcess = null;

    if (pendingRequest) {
      const { reject, timer, reqId } = pendingRequest;
      clearTimeout(timer);
      pendingRequest = null;
      log(`[req #${reqId}] Rejecting - solver crashed`);
      reject(new Error('Solver process crashed'));
    }

    if (restartAttempts >= 10) {
      log('Giving up on restarting the solver.');
      failQueue(new Error('Solver is unavailable'));
      return;
    }

    // Exponential backoff, capped. A tight 2s respawn loop against a missing
    // binary produced thousands of log lines a minute and never recovered.
    const delay = Math.min(30000, 1000 * 2 ** restartAttempts);
    restartAttempts++;
    log(`Restarting solver in ${delay}ms (attempt ${restartAttempts})...`);
    setTimeout(startSolver, delay);
  });
}

function failQueue(err) {
  while (queue.length) queue.shift().reject(err);
}

function drainQueue() {
  if (pendingRequest || !solverReady || !solverProcess || queue.length === 0) return;

  const job = queue.shift();
  const reqId = job.reqId;

  const timer = setTimeout(() => {
    log(`[req #${reqId}] Backstop timeout after ${TIMEOUT_MS}ms - restarting solver`);
    pendingRequest = null;
    if (solverProcess) solverProcess.kill('SIGKILL');
    job.reject(new Error(`Solver timed out after ${Math.round(TIMEOUT_MS / 1000)}s`));
  }, TIMEOUT_MS);

  pendingRequest = { resolve: job.resolve, reject: job.reject, timer, reqId };
  solverProcess.stdin.write(job.cubeState + '\n');
  log(`[req #${reqId}] Sent to solver stdin (queue depth now ${queue.length})`);
}

function sendToSolver(cubeState) {
  return new Promise((resolve, reject) => {
    const reqId = ++requestCount;
    log(`[req #${reqId}] cubeState=${cubeState} (ready=${solverReady}, queued=${queue.length})`);

    if (restartAttempts >= 10) {
      return reject(new Error('Solver is unavailable'));
    }
    if (queue.length >= MAX_QUEUE) {
      log(`[req #${reqId}] REJECTED - queue full`);
      return reject(new Error('Solver is busy - too many requests queued'));
    }

    queue.push({ cubeState, resolve, reject, reqId });
    drainQueue();
  });
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    solverReady,
    queueDepth: queue.length,
    busy: Boolean(pendingRequest),
  });
});

app.post('/api/solve', async (req, res) => {
  // mode: "optimal" (default, Korf IDA*) or "fast" (two-phase, ~22 moves, any depth).
  const { cubeState, mode = 'optimal' } = req.body || {};
  log(`POST /api/solve - mode=${mode} cubeState=${cubeState}`);

  if (mode !== 'optimal' && mode !== 'fast') {
    return res.status(400).json({ success: false, error: 'mode must be "optimal" or "fast"' });
  }

  if (!cubeState || typeof cubeState !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing cubeState field' });
  }
  if (cubeState.length !== 54) {
    return res.status(400).json({ success: false, error: 'cubeState must be exactly 54 characters' });
  }
  if (!/^[WGRBOYwgrboy]{54}$/.test(cubeState)) {
    return res.status(400).json({ success: false, error: 'Invalid characters - use only W G R B O Y' });
  }

  try {
    const start = Date.now();
    const line = await sendToSolver((mode === 'fast' ? 'FAST ' : '') + cubeState.toUpperCase());
    const elapsed = Date.now() - start;

    if (line.startsWith('ERROR:')) {
      const message = line.slice('ERROR:'.length).trim();
      log(`Solve failed (${elapsed}ms): ${message}`);
      return res.status(400).json({ success: false, error: message });
    }

    const solutionStr = line.startsWith('SOLUTION:') ? line.slice('SOLUTION:'.length).trim() : line.trim();
    const moves = solutionStr ? solutionStr.split(/\s+/).filter(Boolean) : [];
    log(`Solved in ${elapsed}ms - ${moves.length} moves: ${solutionStr}`);
    res.json({ success: true, moves, moveCount: moves.length, elapsedMs: elapsed });
  } catch (err) {
    log(`Solve error: ${err.message}`);
    const status =
      err.message.includes('unavailable') ? 503 :
      err.message.includes('busy') ? 429 :
      err.message.includes('timed out') ? 504 :
      err.message.includes('crashed') ? 503 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

startSolver();

const server = app.listen(PORT, () => {
  log(`Rubik's Cube Solver API listening on port ${PORT}`);
  log(`  Solver time limit: ${SOLVER_TIME_LIMIT}s, backstop timeout: ${TIMEOUT_MS}ms, max queue: ${MAX_QUEUE}`);
});

// Shut down cleanly so the solver child does not outlive the server.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log(`Received ${signal}, shutting down.`);
    restartAttempts = Number.MAX_SAFE_INTEGER; // stop the restart loop
    if (solverProcess) solverProcess.kill();
    server.close(() => process.exit(0));
  });
}
