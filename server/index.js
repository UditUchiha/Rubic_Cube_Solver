const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const SOLVER_PATH = process.env.SOLVER_PATH || path.join(__dirname, 'solver_api');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'Databases', 'cornerDepth5V1.txt');
const TIMEOUT_MS = parseInt(process.env.SOLVER_TIMEOUT || '120000', 10);
const PORT = process.env.PORT || 3001;

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/solve', (req, res) => {
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

  execFile(
    SOLVER_PATH,
    [cubeState.toUpperCase(), DB_PATH],
    { timeout: TIMEOUT_MS },
    (error, stdout, stderr) => {
      if (error) {
        if (error.killed || error.code === null) {
          return res.status(408).json({ success: false, error: 'Solver timed out' });
        }
        const msg = (stderr || error.message || 'Solver error').trim();
        return res.status(500).json({ success: false, error: msg });
      }
      const moves = stdout.trim().split(/\s+/).filter(Boolean);
      res.json({ success: true, moves, moveCount: moves.length });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Rubik's Cube Solver API listening on port ${PORT}`);
  console.log(`  Solver: ${SOLVER_PATH}`);
  console.log(`  DB:     ${DB_PATH}`);
});
