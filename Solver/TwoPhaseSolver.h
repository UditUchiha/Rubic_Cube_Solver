#ifndef RUBIKS_CUBE_SOLVER_TWOPHASESOLVER_H
#define RUBIKS_CUBE_SOLVER_TWOPHASESOLVER_H

#include<bits/stdc++.h>
#include "../Model/RubiksCube.h"
#include "../Model/CubeValidation.h"
#include "../Model/RubiksCubeBitboard.cpp"
#include "IDAstarSolver.h"   // SolverTimeout

/*
 * Kociemba's two-phase algorithm.
 *
 * IDA* with pattern databases (IDAstarSolver) proves its answer is the
 * shortest, which costs ~5-8x per extra move and makes a random cube take
 * hours. Two-phase gives up that proof. It splits the solve in two:
 *
 *   phase 1: reach G1 = <U, D, R2, L2, F2, B2> - every corner and edge
 *            oriented, the four E-slice edges inside the E slice (<= 12 moves)
 *   phase 2: solve within G1 using only those moves              (<= 18 moves)
 *
 * Each phase is its own IDA* over a few small coordinates with exact-ish
 * pruning tables, so either finishes in microseconds to milliseconds. Phase 1
 * solutions are enumerated in increasing length and each is extended by an
 * optimal phase 2; the search stops at the first total <= targetLength.
 *
 * Internally the cube is a cubie cube (corner/edge permutation + orientation)
 * in Kociemba's numbering, read from the facelets via centre colours, so the
 * colour scheme is irrelevant. The 18 move cubies are not hand-written: they
 * are read off this project's own move implementations applied to a solved
 * cube, so the search and RubiksCube::move() cannot disagree about what a
 * move does. Move indices are RubiksCube::MOVE values throughout.
 */

namespace twophase {

    struct CubieCube {
        uint8_t cp[8], co[8], ep[12], eo[12];
    };

    inline CubieCube identityCubie() {
        CubieCube c;
        for (uint8_t i = 0; i < 8; i++) c.cp[i] = i, c.co[i] = 0;
        for (uint8_t i = 0; i < 12; i++) c.ep[i] = i, c.eo[i] = 0;
        return c;
    }

    // a then b, in "replaced-by" form: cp[i] is the corner sitting in slot i.
    inline CubieCube multiply(const CubieCube &a, const CubieCube &b) {
        CubieCube r;
        for (int i = 0; i < 8; i++) {
            r.cp[i] = a.cp[b.cp[i]];
            r.co[i] = (uint8_t)((a.co[b.cp[i]] + b.co[i]) % 3);
        }
        for (int i = 0; i < 12; i++) {
            r.ep[i] = a.ep[b.ep[i]];
            r.eo[i] = (uint8_t)((a.eo[b.ep[i]] + b.eo[i]) % 2);
        }
        return r;
    }

    // Faces as RubiksCube::FACE values: U=0 L=1 F=2 R=3 B=4 D=5.
    enum { U = 0, L = 1, F = 2, R = 3, B = 4, D = 5 };

    struct Facelet { uint8_t face, row, col; };

    // Kociemba's corners URF UFL ULB UBR DFR DLF DBL DRB, facelets listed
    // clockwise starting from the U/D one - the order twist arithmetic relies on.
    static const Facelet CORNER_FACELET[8][3] = {
        {{U, 2, 2}, {R, 0, 0}, {F, 0, 2}},
        {{U, 2, 0}, {F, 0, 0}, {L, 0, 2}},
        {{U, 0, 0}, {L, 0, 0}, {B, 0, 2}},
        {{U, 0, 2}, {B, 0, 0}, {R, 0, 2}},
        {{D, 0, 2}, {F, 2, 2}, {R, 2, 0}},
        {{D, 0, 0}, {L, 2, 2}, {F, 2, 0}},
        {{D, 2, 0}, {B, 2, 2}, {L, 2, 0}},
        {{D, 2, 2}, {R, 2, 2}, {B, 2, 0}},
    };
    static const uint8_t CORNER_COLOR[8][3] = {
        {U, R, F}, {U, F, L}, {U, L, B}, {U, B, R},
        {D, F, R}, {D, L, F}, {D, B, L}, {D, R, B},
    };

    // Edges UR UF UL UB DR DF DL DB FR FL BL BR; U/D facelet first, F/B first
    // for the slice edges, which is what makes <U,D,R2,L2,F2,B2> flip-free.
    static const Facelet EDGE_FACELET[12][2] = {
        {{U, 1, 2}, {R, 0, 1}}, {{U, 2, 1}, {F, 0, 1}},
        {{U, 1, 0}, {L, 0, 1}}, {{U, 0, 1}, {B, 0, 1}},
        {{D, 1, 2}, {R, 2, 1}}, {{D, 0, 1}, {F, 2, 1}},
        {{D, 1, 0}, {L, 2, 1}}, {{D, 2, 1}, {B, 2, 1}},
        {{F, 1, 2}, {R, 1, 0}}, {{F, 1, 0}, {L, 1, 2}},
        {{B, 1, 2}, {L, 1, 0}}, {{B, 1, 0}, {R, 1, 2}},
    };
    static const uint8_t EDGE_COLOR[12][2] = {
        {U, R}, {U, F}, {U, L}, {U, B}, {D, R}, {D, F},
        {D, L}, {D, B}, {F, R}, {F, L}, {B, L}, {B, R},
    };

    inline CubieCube toCubie(const RubiksCube &cube) {
        // Map each sticker colour to the face whose centre carries it.
        int faceOf[6];
        for (int f = 0; f < 6; f++)
            faceOf[(int)cube.getColor(RubiksCube::FACE(f), 1, 1)] = f;
        auto at = [&](const Facelet &x) {
            return faceOf[(int)cube.getColor(RubiksCube::FACE(x.face), x.row, x.col)];
        };

        CubieCube c;
        for (int i = 0; i < 8; i++) {
            int ori = 0;
            while (ori < 3 && at(CORNER_FACELET[i][ori]) != U && at(CORNER_FACELET[i][ori]) != D) ori++;
            int c1 = ori < 3 ? at(CORNER_FACELET[i][(ori + 1) % 3]) : -1;
            int c2 = ori < 3 ? at(CORNER_FACELET[i][(ori + 2) % 3]) : -1;
            int j = 0;
            while (j < 8 && !(CORNER_COLOR[j][1] == c1 && CORNER_COLOR[j][2] == c2)) j++;
            if (j == 8) throw runtime_error("two-phase: corner " + to_string(i) + " is not a real corner");
            c.cp[i] = (uint8_t)j;
            c.co[i] = (uint8_t)ori;
        }
        for (int i = 0; i < 12; i++) {
            int a = at(EDGE_FACELET[i][0]), b = at(EDGE_FACELET[i][1]);
            int j = 0;
            for (; j < 12; j++) {
                if (EDGE_COLOR[j][0] == a && EDGE_COLOR[j][1] == b) { c.eo[i] = 0; break; }
                if (EDGE_COLOR[j][0] == b && EDGE_COLOR[j][1] == a) { c.eo[i] = 1; break; }
            }
            if (j == 12) throw runtime_error("two-phase: edge " + to_string(i) + " is not a real edge");
            c.ep[i] = (uint8_t)j;
        }
        return c;
    }

    // ---- Coordinates. Every one is 0 on the solved cube. ----

    inline int twistCoord(const CubieCube &c) {      // 0..2186
        int r = 0;
        for (int i = 0; i < 7; i++) r = r * 3 + c.co[i];
        return r;
    }

    inline int flipCoord(const CubieCube &c) {       // 0..2047
        int r = 0;
        for (int i = 0; i < 11; i++) r = r * 2 + c.eo[i];
        return r;
    }

    inline int choose(int n, int k) {
        if (k < 0 || k > n) return 0;
        int r = 1;
        for (int i = 0; i < k; i++) r = r * (n - i) / (i + 1);
        return r;
    }

    // Which 4 of the 12 slots hold the E-slice edges (FR FL BL BR = 8..11).
    inline int sliceCoord(const CubieCube &c) {      // 0..494
        int a = 0, x = 0;
        for (int j = 11; j >= 0; j--)
            if (c.ep[j] >= 8) a += choose(11 - j, ++x);
        return a;
    }

    // Lehmer rank of p[0..n), identity -> 0.
    inline int permCoord(const uint8_t *p, int n) {
        int r = 0;
        for (int i = 0; i < n; i++) {
            int smaller = 0;
            for (int j = i + 1; j < n; j++) if (p[j] < p[i]) smaller++;
            r = r * (n - i) + smaller;
        }
        return r;
    }

    // Phase 2 only: inside G1 the U/D edges stay in slots 0..7, slice edges in 8..11.
    inline int cornerPermCoord(const CubieCube &c) { return permCoord(c.cp, 8); }      // 0..40319
    inline int udEdgePermCoord(const CubieCube &c) { return permCoord(c.ep, 8); }      // 0..40319
    inline int slicePermCoord(const CubieCube &c)  { return permCoord(c.ep + 8, 4); }  // 0..23

    inline bool isPhase2Move(int m) {
        int face = m / 3;
        return face == 2 || face == 3 || m % 3 == 2;   // any U/D turn, or a half turn
    }

    struct Tables {
        CubieCube moveCube[18];
        vector<int> phase1Moves, phase2Moves;
        vector<uint16_t> twistMove, flipMove, sliceMove;          // [coord * 18 + move]
        vector<uint16_t> cornerPermMove, udEdgePermMove, slicePermMove;
        vector<int8_t> sliceTwistPrune, sliceFlipPrune;            // phase 1
        vector<int8_t> sliceCornerPrune, sliceEdgePrune;           // phase 2

        Tables();
    };

    /*
     * Move table by BFS from the solved cube: a representative cubie is kept for
     * every coordinate value reached, and the move result read off it. Valid
     * because each coordinate's image under a move depends only on that
     * coordinate (for phase 2 coordinates, only under phase 2 moves).
     */
    template<typename Get>
    vector<uint16_t> buildMoveTable(int size, Get get, const vector<int> &moves, const CubieCube *moveCube) {
        vector<uint16_t> table((size_t)size * 18, 0);
        vector<CubieCube> rep(size);
        vector<char> seen(size, 0);
        queue<int> q;
        rep[0] = identityCubie();
        seen[0] = 1;
        q.push(0);
        int reached = 1;
        while (!q.empty()) {
            int x = q.front(); q.pop();
            for (int m: moves) {
                CubieCube n = multiply(rep[x], moveCube[m]);
                int y = get(n);
                table[(size_t)x * 18 + m] = (uint16_t)y;
                if (!seen[y]) { seen[y] = 1; rep[y] = n; q.push(y); reached++; }
            }
        }
        if (reached != size) throw logic_error("two-phase: move table did not cover its coordinate");
        return table;
    }

    // Exact distance to (0, 0) in the product of two coordinates, index a * sizeB + b.
    inline vector<int8_t> buildPruneTable(const vector<uint16_t> &moveA, int sizeA,
                                          const vector<uint16_t> &moveB, int sizeB,
                                          const vector<int> &moves) {
        vector<int8_t> dist((size_t)sizeA * sizeB, -1);
        vector<uint32_t> q;
        q.reserve(dist.size());
        dist[0] = 0;
        q.push_back(0);
        for (size_t head = 0; head < q.size(); head++) {
            uint32_t idx = q[head];
            int a = idx / sizeB, b = idx % sizeB;
            for (int m: moves) {
                uint32_t n = (uint32_t)moveA[(size_t)a * 18 + m] * sizeB + moveB[(size_t)b * 18 + m];
                if (dist[n] < 0) { dist[n] = (int8_t)(dist[idx] + 1); q.push_back(n); }
            }
        }
        if (q.size() != dist.size()) throw logic_error("two-phase: pruning table did not cover its coordinates");
        return dist;
    }

    inline Tables::Tables() {
        for (int m = 0; m < 18; m++) {
            // Read the move straight off the project's own implementation.
            RubiksCubeBitboard solved;
            solved.move(RubiksCube::MOVE(m));
            moveCube[m] = toCubie(solved);
            phase1Moves.push_back(m);
            if (isPhase2Move(m)) phase2Moves.push_back(m);
        }

        twistMove = buildMoveTable(2187, twistCoord, phase1Moves, moveCube);
        flipMove = buildMoveTable(2048, flipCoord, phase1Moves, moveCube);
        sliceMove = buildMoveTable(495, sliceCoord, phase1Moves, moveCube);
        cornerPermMove = buildMoveTable(40320, cornerPermCoord, phase2Moves, moveCube);
        udEdgePermMove = buildMoveTable(40320, udEdgePermCoord, phase2Moves, moveCube);
        slicePermMove = buildMoveTable(24, slicePermCoord, phase2Moves, moveCube);

        sliceTwistPrune = buildPruneTable(sliceMove, 495, twistMove, 2187, phase1Moves);
        sliceFlipPrune = buildPruneTable(sliceMove, 495, flipMove, 2048, phase1Moves);
        sliceCornerPrune = buildPruneTable(slicePermMove, 24, cornerPermMove, 40320, phase2Moves);
        sliceEdgePrune = buildPruneTable(slicePermMove, 24, udEdgePermMove, 40320, phase2Moves);
    }

    // Built once per process (~8 MB) on first use; thread-safe static init.
    inline const Tables &tables() {
        static const Tables t;
        return t;
    }
}

template<typename T>
class TwoPhaseSolver {
private:
    static const int MAX_LENGTH = 30;
    static const uint64_t CLOCK_CHECK_MASK = 4095;

    const twophase::Tables &t;
    twophase::CubieCube start;
    int path[MAX_LENGTH + 1];
    vector<RubiksCube::MOVE> best;
    int bestLength;
    int targetLength;
    bool stopped;
    uint64_t nodesExpanded;
    bool haveDeadline;
    chrono::steady_clock::time_point deadline;

    // Same face twice is never needed, and of two commuting opposite faces
    // (L/R, U/D, F/B share face / 2) only one order is searched.
    static bool redundant(int last, int m) {
        if (last < 0) return false;
        int lf = last / 3, f = m / 3;
        return f == lf || (f / 2 == lf / 2 && f < lf);
    }

    bool outOfTime() {
        if (stopped) return true;
        if (haveDeadline && (++nodesExpanded & CLOCK_CHECK_MASK) == 0 &&
            chrono::steady_clock::now() >= deadline)
            stopped = true;
        return stopped;
    }

    bool phase2(int cp, int ud, int sp, int depth, int togo, int last) {
        if (togo == 0) return cp == 0 && ud == 0 && sp == 0;
        if (outOfTime()) return false;
        for (int m: t.phase2Moves) {
            if (redundant(last, m)) continue;
            int ncp = t.cornerPermMove[cp * 18 + m];
            int nud = t.udEdgePermMove[ud * 18 + m];
            int nsp = t.slicePermMove[sp * 18 + m];
            int h = max(t.sliceCornerPrune[nsp * 40320 + ncp], t.sliceEdgePrune[nsp * 40320 + nud]);
            if (h > togo - 1) continue;
            path[depth] = m;
            if (phase2(ncp, nud, nsp, depth + 1, togo - 1, m)) return true;
        }
        return false;
    }

    void startPhase2(int depth1) {
        twophase::CubieCube c = start;
        for (int i = 0; i < depth1; i++) c = twophase::multiply(c, t.moveCube[path[i]]);
        int cp = twophase::cornerPermCoord(c);
        int ud = twophase::udEdgePermCoord(c);
        int sp = twophase::slicePermCoord(c);
        int h = max(t.sliceCornerPrune[sp * 40320 + cp], t.sliceEdgePrune[sp * 40320 + ud]);
        int last = depth1 > 0 ? path[depth1 - 1] : -1;

        // Only a strictly shorter total is worth finding.
        for (int depth2 = h; depth1 + depth2 < bestLength && !stopped; depth2++) {
            if (phase2(cp, ud, sp, depth1, depth2, last)) {
                bestLength = depth1 + depth2;
                best.clear();
                for (int i = 0; i < bestLength; i++) best.push_back(RubiksCube::MOVE(path[i]));
                if (bestLength <= targetLength) stopped = true;
                return;
            }
        }
    }

    void phase1(int tw, int fl, int sl, int depth, int togo, int last) {
        if (togo == 0) {
            // Ending on a phase 2 move means a shorter phase 1 already reached G1.
            if (tw == 0 && fl == 0 && sl == 0 && (depth == 0 || !twophase::isPhase2Move(last)))
                startPhase2(depth);
            return;
        }
        if (outOfTime()) return;
        for (int m = 0; m < 18; m++) {
            if (redundant(last, m)) continue;
            int ntw = t.twistMove[tw * 18 + m];
            int nfl = t.flipMove[fl * 18 + m];
            int nsl = t.sliceMove[sl * 18 + m];
            int h = max(t.sliceTwistPrune[nsl * 2187 + ntw], t.sliceFlipPrune[nsl * 2048 + nfl]);
            if (h > togo - 1) continue;
            path[depth] = m;
            phase1(ntw, nfl, nsl, depth + 1, togo - 1, m);
            if (stopped) return;
        }
    }

public:
    T rubiksCube;

    explicit TwoPhaseSolver(const T &cube) : t(twophase::tables()), rubiksCube(cube) {}

    /*
     * Returns a solution of at most targetLength moves if one is found within
     * the budget, otherwise the shortest found so far. Throws runtime_error for
     * an unsolvable cube and SolverTimeout if the budget ran out before any
     * solution at all (not expected in practice - the first takes milliseconds).
     * timeLimitSeconds == 0 means no limit.
     */
    vector<RubiksCube::MOVE> solve(double timeLimitSeconds = 0, int target = 22) {
        if (rubiksCube.isSolved()) return {};
        string why;
        if (!isCubeSolvable(rubiksCube, why)) throw runtime_error(why);

        start = twophase::toCubie(rubiksCube);
        best.clear();
        bestLength = MAX_LENGTH + 1;
        targetLength = target;
        stopped = false;
        nodesExpanded = 0;
        haveDeadline = timeLimitSeconds > 0;
        if (haveDeadline)
            deadline = chrono::steady_clock::now() +
                       chrono::duration_cast<chrono::steady_clock::duration>(
                               chrono::duration<double>(timeLimitSeconds));

        int tw = twophase::twistCoord(start);
        int fl = twophase::flipCoord(start);
        int sl = twophase::sliceCoord(start);
        int h = max(t.sliceTwistPrune[sl * 2187 + tw], t.sliceFlipPrune[sl * 2048 + fl]);
        for (int depth1 = h; depth1 < bestLength && !stopped; depth1++)
            phase1(tw, fl, sl, 0, depth1, -1);

        if (best.empty()) throw SolverTimeout("two-phase search exceeded its time budget");

        // Never hand back an unchecked move list; replay it on the real model.
        T check = rubiksCube;
        for (auto m: best) check.move(m);
        if (!check.isSolved())
            throw runtime_error("internal error: two-phase returned a move list that does not solve the cube");
        return best;
    }
};

#endif //RUBIKS_CUBE_SOLVER_TWOPHASESOLVER_H
