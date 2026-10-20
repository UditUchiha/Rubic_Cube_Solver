#ifndef RUBIKS_CUBE_SOLVER_BESTFIRSTSOLVER_H
#define RUBIKS_CUBE_SOLVER_BESTFIRSTSOLVER_H

#include<bits/stdc++.h>
#include "../Model/RubiksCube.h"
#include "../PatternDatabases/CornerPatternDatabase.h"
#include "../PatternDatabases/EdgePatternDatabase.h"
#include "IDAstarSolver.h"  // SolverTimeout

/*
 * The original project's "IDA*": an f-bounded best-first search that keeps a
 * priority queue of frontier nodes and a hash map of every state it has seen.
 * Restored from commit e0fc630, where it used the corner database only, and
 * replaced on `cpp` by the recursive IDAstarSolver because it ran out of memory.
 *
 * The trade-off against IDAstarSolver, in one line: this never expands a state
 * twice (transpositions are caught by the map), IDA* stores nothing but the
 * current path. Each stored state costs ~100+ bytes, so memory, not time, is
 * what stops this search on deep scrambles.
 *
 * Changes from the original:
 *  - heuristic is max(corner, edge1, edge2), as in IDAstarSolver;
 *  - `visited` and `move_done` are one map (presence means visited), and
 *    children are tested with find() -- the original's `visited[child]` inserted
 *    a `false` entry for every generated child, ~18 entries per expansion;
 *  - a time budget (SolverTimeout) and a stored-state cap, so it fails with an
 *    error instead of taking the machine down.
 *
 * The heuristic is consistent (one move changes each database value by at most
 * one, and a max of consistent heuristics is consistent), so the first time a
 * state is popped it has its shortest depth and the solution is optimal.
 */
template<typename T, typename H>
class BestFirstSolver {
private:
    CornerPatternDatabase &cornerDB;
    EdgePatternDatabase &edge1DB;
    EdgePatternDatabase &edge2DB;
    vector<RubiksCube::MOVE> moves;
    unordered_map<T, RubiksCube::MOVE, H> move_done;

    struct Node {
        T cube;
        int depth;
        int estimate;

        Node(T _cube, int _depth, int _estimate) : cube(_cube), depth(_depth), estimate(_estimate) {};
    };

    struct compareCube {
        bool operator()(pair<Node, int> const &p1, pair<Node, int> const &p2) {
            auto n1 = p1.first, n2 = p2.first;
            if (n1.depth + n1.estimate == n2.depth + n2.estimate) {
                return n1.estimate > n2.estimate;
            } else return n1.depth + n1.estimate > n2.depth + n2.estimate;
        }
    };

    uint64_t nodesExpanded;
    size_t peakStates;
    size_t maxStates;
    bool haveDeadline;
    chrono::steady_clock::time_point deadline;

    int heuristic(const T &cube) const {
        int c  = (int)cornerDB.getNumMoves(cube);
        int e1 = (int)edge1DB.getNumMoves(cube);
        int e2 = (int)edge2DB.getNumMoves(cube);
        // 0xF = never written; see IDAstarSolver::heuristic.
        if (c  == 0xF) c  = 0;
        if (e1 == 0xF) e1 = 0;
        if (e2 == 0xF) e2 = 0;
        return max({c, e1, e2});
    }

    void checkLimits(size_t frontier) {
        size_t stored = move_done.size() + frontier;
        if (stored > peakStates) peakStates = stored;
        if (maxStates && stored > maxStates)
            throw runtime_error("This scramble needs more memory than the best-first "
                                "search is allowed (" + to_string(maxStates) +
                                " stored states). Try a shallower scramble.");
        if ((++nodesExpanded & 4095) == 0 && haveDeadline &&
            chrono::steady_clock::now() >= deadline)
            throw SolverTimeout("search exceeded its time budget");
    }

// returns {solved cube, bound}: if the cube was solved
// returns {rubiksCube, next_bound}, if the cube was not solved
    pair<T, int> search(int bound) {
//        priority_queue contains pair(Node, move done to reach that)
        priority_queue<pair<Node, int>, vector<pair<Node, int>>, compareCube> pq;
        Node start = Node(rubiksCube, 0, heuristic(rubiksCube));
        pq.push(make_pair(start, 0));
        int next_bound = 100;
        while (!pq.empty()) {
            auto p = pq.top();
            Node node = p.first;
            pq.pop();

            if (move_done.count(node.cube)) continue;
            move_done[node.cube] = RubiksCube::MOVE(p.second);
            checkLimits(pq.size());

            if (node.cube.isSolved()) return make_pair(node.cube, bound);
            node.depth++;
            for (int i = 0; i < 18; i++) {
                auto curr_move = RubiksCube::MOVE(i);
                node.cube.move(curr_move);
                if (!move_done.count(node.cube)) {
                    node.estimate = heuristic(node.cube);
                    if (node.estimate + node.depth > bound) {
                        next_bound = min(next_bound, node.estimate + node.depth);
                    } else {
                        pq.push(make_pair(node, i));
                    }
                }
                node.cube.invert(curr_move);
            }

        }
        return make_pair(rubiksCube, next_bound);
    }

public:
    T rubiksCube;

    BestFirstSolver(T _rubiksCube, CornerPatternDatabase &cDB,
                    EdgePatternDatabase &e1DB, EdgePatternDatabase &e2DB)
        : cornerDB(cDB), edge1DB(e1DB), edge2DB(e2DB),
          nodesExpanded(0), peakStates(0), maxStates(0), haveDeadline(false)
    {
        rubiksCube = _rubiksCube;
    }

    uint64_t getNodesExpanded() const { return nodesExpanded; }

    // Largest number of states held at once (map + queue): the memory story.
    size_t getPeakStates() const { return peakStates; }

    /*
     * `timeLimitSeconds <= 0` and `stateCap == 0` each mean no limit. Throws
     * SolverTimeout on the time budget, runtime_error on the state cap or on a
     * cube that is not solvable (check with isCubeSolvable() first).
     */
    vector<RubiksCube::MOVE> solve(double timeLimitSeconds = 0.0, size_t stateCap = 0) {
        moves.clear();
        nodesExpanded = 0;
        peakStates = 0;
        maxStates = stateCap;
        haveDeadline = timeLimitSeconds > 0.0;
        if (haveDeadline) {
            deadline = chrono::steady_clock::now() +
                       chrono::milliseconds((long long)(timeLimitSeconds * 1000.0));
        }

        int bound = heuristic(rubiksCube);
        pair<T, int> p;
        while (true) {
            if (bound > IDAstarSolver<T, H>::MAX_DEPTH)
                throw runtime_error("no solution within " +
                                    to_string(IDAstarSolver<T, H>::MAX_DEPTH) +
                                    " moves - this cube state is not reachable");
            move_done.clear();
            p = search(bound);
            if (p.first.isSolved()) break;
            bound = p.second;
        }

        // Walk back from the solved cube to the start through the parent moves.
        T curr_cube = p.first;
        while (!(curr_cube == rubiksCube)) {
            RubiksCube::MOVE m = move_done[curr_cube];
            moves.push_back(m);
            curr_cube.invert(m);
        }
        reverse(moves.begin(), moves.end());
        move_done.clear();
        return moves;
    }
};

#endif //RUBIKS_CUBE_SOLVER_BESTFIRSTSOLVER_H
