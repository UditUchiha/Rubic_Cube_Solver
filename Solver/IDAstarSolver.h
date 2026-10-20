#ifndef RUBIKS_CUBE_SOLVER_IDASTARSOLVER_H
#define RUBIKS_CUBE_SOLVER_IDASTARSOLVER_H

#include<bits/stdc++.h>
#include "../Model/RubiksCube.h"
#include "../PatternDatabases/CornerPatternDatabase.h"
#include "../PatternDatabases/EdgePatternDatabase.h"

/*
 * Thrown when solve() hits its wall-clock budget. Distinct from runtime_error
 * so a caller can tell "this cube is too deep for the time I allowed" apart
 * from "something is broken", and keep the process (and its ~30s of loaded
 * databases) alive either way.
 */
class SolverTimeout : public std::runtime_error {
public:
    explicit SolverTimeout(const std::string &what) : std::runtime_error(what) {}
};

template<typename T, typename H>
class IDAstarSolver {
private:
    CornerPatternDatabase *cornerDB;
    EdgePatternDatabase *edge1DB;
    EdgePatternDatabase *edge2DB;
    bool ownsDBs;
    vector<RubiksCube::MOVE> moves;

    // Deadline support. Reading the clock at every node is itself measurable at
    // millions of nodes/second, so only sample it every CLOCK_CHECK_MASK+1 nodes.
    static const uint64_t CLOCK_CHECK_MASK = 4095;
    uint64_t nodesExpanded;
    bool haveDeadline;
    chrono::steady_clock::time_point deadline;

    // (bound, nodes expanded) for each IDA* iteration of the last solve().
    vector<pair<int, uint64_t>> iterations;

    int heuristic(const T& cube) const {
        int c, e1, e2;
        heuristicParts(cube, c, e1, e2);
        return max({c, e1, e2});
    }

    void checkDeadline() {
        // Count every node, deadline or not, so getNodesExpanded() is always
        // meaningful; only the clock read is conditional, since it is the
        // expensive part at millions of nodes per second.
        if ((++nodesExpanded & CLOCK_CHECK_MASK) != 0) return;
        if (!haveDeadline) return;
        if (chrono::steady_clock::now() >= deadline)
            throw SolverTimeout("search exceeded its time budget");
    }

    /*
     * Returns -1 when a solution has been found (and leaves it in `moves`),
     * otherwise the smallest f-value that exceeded `bound` -- the next bound.
     *
     * `estimate` is this node's heuristic, computed by the caller when it
     * generated the node, so it is never recomputed here.
     */
    int IDAstar(T& cube, int depth, int bound, int estimate) {
        if (depth + estimate > bound) return depth + estimate;
        if (cube.isSolved()) return -1;

        checkDeadline();

        int next_bound = numeric_limits<int>::max();

        for (int i = 0; i < 18; i++) {
            auto curr_move = RubiksCube::MOVE(i);

            if (!moves.empty()) {
                auto last_move = moves.back();
                int current_face = i / 3;
                int last_face = (int)last_move / 3;

                // Two turns of the same face are always expressible as one.
                if (current_face == last_face) continue;

                // Turns of opposite faces commute (L and R never interact), so
                // both orderings reach the same state. Keep only one of them.
                // Face indices are L,R,U,D,F,B, so face/2 identifies the axis.
                if ((current_face / 2) == (last_face / 2)) {
                    if (current_face < last_face) continue;
                }
            }

            cube.move(curr_move);

            // Evaluate the child before recursing. Most children are cut here,
            // and cutting them without a call saves the frame, the push/pop of
            // the move stack, and a redundant heuristic lookup.
            const int childEstimate = heuristic(cube);
            const int childF = depth + 1 + childEstimate;

            if (childF > bound) {
                if (childF < next_bound) next_bound = childF;
                cube.invert(curr_move);
                continue;
            }

            moves.push_back(curr_move);
            int t = IDAstar(cube, depth + 1, bound, childEstimate);
            if (t == -1) return -1;
            if (t < next_bound) next_bound = t;

            moves.pop_back();
            cube.invert(curr_move);
        }

        return next_bound;
    }

public:
    T rubiksCube;

    IDAstarSolver(T _rubiksCube, string cornerFile, string edge1File, string edge2File)
        : ownsDBs(true), nodesExpanded(0), haveDeadline(false)
    {
        rubiksCube = _rubiksCube;
        cornerDB = new CornerPatternDatabase();
        edge1DB = new EdgePatternDatabase(0);
        edge2DB = new EdgePatternDatabase(1);
        cornerDB->fromFile(cornerFile);
        edge1DB->fromFile(edge1File);
        edge2DB->fromFile(edge2File);
    }

    IDAstarSolver(T _rubiksCube, CornerPatternDatabase &cDB,
                  EdgePatternDatabase &e1DB, EdgePatternDatabase &e2DB)
        : cornerDB(&cDB), edge1DB(&e1DB), edge2DB(&e2DB), ownsDBs(false),
          nodesExpanded(0), haveDeadline(false)
    {
        rubiksCube = _rubiksCube;
    }

    ~IDAstarSolver() {
        if (ownsDBs) {
            delete cornerDB;
            delete edge1DB;
            delete edge2DB;
        }
    }

    // Copying would double-free the owned databases.
    IDAstarSolver(const IDAstarSolver&) = delete;
    IDAstarSolver& operator=(const IDAstarSolver&) = delete;

    // God's number: every solvable cube is <= 20 moves from solved in the
    // half-turn metric, so no bound above 20 can ever be productive.
    static const int MAX_DEPTH = 20;

    uint64_t getNodesExpanded() const { return nodesExpanded; }

    // Per-iteration stats of the last solve(), including a timed-out one.
    const vector<pair<int, uint64_t>> &getIterations() const { return iterations; }

    // The three pattern-database estimates whose max is the heuristic.
    void heuristicParts(const T& cube, int &c, int &e1, int &e2) const {
        c  = (int)cornerDB->getNumMoves(cube);
        e1 = (int)edge1DB->getNumMoves(cube);
        e2 = (int)edge2DB->getNumMoves(cube);
        // 0xF is the nibble array's "never written" fill. A complete database
        // never yields it; treat it as 0 so a partially built database only
        // makes the search slower, never wrong (an over-estimate would let
        // IDA* return a non-optimal solution or miss one entirely).
        if (c  == 0xF) c  = 0;
        if (e1 == 0xF) e1 = 0;
        if (e2 == 0xF) e2 = 0;
    }

    /*
     * Find an optimal solution. `timeLimitSeconds <= 0` means no limit.
     *
     * Throws SolverTimeout if the budget runs out, or runtime_error if the
     * search exhausts every bound up to God's number, which can only happen
     * for a state that is not reachable on a real cube -- check with
     * isCubeSolvable() before calling to get a useful message instead.
     */
    vector<RubiksCube::MOVE> solve(double timeLimitSeconds = 0.0) {
        moves.clear();
        iterations.clear();
        nodesExpanded = 0;
        haveDeadline = timeLimitSeconds > 0.0;
        if (haveDeadline) {
            deadline = chrono::steady_clock::now() +
                       chrono::milliseconds((long long)(timeLimitSeconds * 1000.0));
        }

        int bound = heuristic(rubiksCube);

        while (bound != -1) {
            if (bound > MAX_DEPTH) {
                throw runtime_error(
                        "no solution within " + to_string(MAX_DEPTH) +
                        " moves - this cube state is not reachable by turning "
                        "a real cube");
            }
            iterations.push_back(make_pair(bound, (uint64_t)0));
            const uint64_t start = nodesExpanded;
            try {
                bound = IDAstar(rubiksCube, 0, bound, heuristic(rubiksCube));
            } catch (...) {
                iterations.back().second = nodesExpanded - start;
                throw;
            }
            iterations.back().second = nodesExpanded - start;
        }

        return moves;
    }
};

#endif //RUBIKS_CUBE_SOLVER_IDASTARSOLVER_H
