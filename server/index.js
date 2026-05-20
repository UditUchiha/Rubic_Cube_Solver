const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const SOLVER_PATH = process.env.SOLVER_PATH || path.join(__dirname, 'solver_api');
const CORNER_DB   = process.env.CORNER_DB_PATH || path.join(__dirname, 'Databases', 'corner.db');
const EDGE1_DB    = process.env.EDGE1_DB_PATH  || path.join(__dirname, 'Databases', 'edge1.db');
const EDGE2_DB    = process.env.EDGE2_DB_PATH  || path.join(__dirname, 'Databases', 'edge2.db');
const TIMEOUT_MS  = parseInt(process.env.SOLVER_TIMEOUT || '120000', 10);
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
    [cubeState.toUpperCase(), CORNER_DB, EDGE1_DB, EDGE2_DB],
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
  console.log(`  Solver:    ${SOLVER_PATH}`);
  console.log(`  Corner DB: ${CORNER_DB}`);
  console.log(`  Edge1 DB:  ${EDGE1_DB}`);
  console.log(`  Edge2 DB:  ${EDGE2_DB}`);
});
