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

    /*
     * Threads split each IDA* iteration by subtree. Every thread walks the top
     * SPLIT_DEPTH plies itself (a few hundred nodes, identical in each thread)
     * and numbers the nodes it reaches at SPLIT_DEPTH in the same order; it
     * expands a node only if it holds that node's ticket from nextTicket. So
     * threads share nothing mutable but the ticket counter and the stop flag,
     * and all of them search the same bound, which keeps the result optimal.
     */
    static const int SPLIT_DEPTH = 2;
    atomic<uint64_t> nextTicket;
    atomic<bool> stop;

    struct Search {
        T cube;
        vector<RubiksCube::MOVE> path;
        uint64_t nodes = 0;
        uint64_t item = 0, ticket = 0;
    };

    // Thrown inside a worker when another thread has already finished.
    struct Aborted {};

    // 0xF is the nibble array's "never written" fill. A complete database
    // never yields it; treat it as 0 so a partially built database only makes
    // the search slower, never wrong (an over-estimate would let IDA* return a
    // non-optimal solution or miss one entirely).
    static int lookup(const PatternDatabase *db, const T& cube) {
        int v = (int)db->getNumMoves(cube);
        return v == 0xF ? 0 : v;
    }

    /*
     * max(corner, edge1, edge2), except that it stops as soon as one database
     * exceeds `limit`: the caller is about to cut that node, and a cut node
     * only needs a value over the limit, not the exact maximum. Most children
     * are cut, usually by the corner database alone, so this skips two of the
     * three lookups (each a cache miss into a 20-40MB table) for most nodes.
     * The returned value is still a lower bound, so optimality is unaffected.
     */
    int heuristic(const T& cube, int limit = numeric_limits<int>::max()) const {
        int h = lookup(cornerDB, cube);
        if (h > limit) return h;
        h = max(h, lookup(edge1DB, cube));
        if (h > limit) return h;
        return max(h, lookup(edge2DB, cube));
    }

    void checkDeadline(Search &s) {
        // Count every node, deadline or not, so getNodesExpanded() is always
        // meaningful; only the clock read is conditional, since it is the
        // expensive part at millions of nodes per second.
        if ((++s.nodes & CLOCK_CHECK_MASK) != 0) return;
        if (stop.load(memory_order_relaxed)) throw Aborted();
        if (!haveDeadline) return;
        if (chrono::steady_clock::now() >= deadline)
            throw SolverTimeout("search exceeded its time budget");
    }

    /*
     * Returns -1 when a solution has been found (and leaves it in `s.path`),
     * otherwise the smallest f-value that exceeded `bound` -- the next bound.
     *
     * `estimate` is this node's heuristic, computed by the caller when it
     * generated the node, so it is never recomputed here.
     */
    int IDAstar(Search &s, int depth, int bound, int estimate) {
        T &cube = s.cube;
        vector<RubiksCube::MOVE> &moves = s.path;
        if (depth + estimate > bound) return depth + estimate;
        if (cube.isSolved()) return -1;

        checkDeadline(s);

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
            const int childEstimate = heuristic(cube, bound - depth - 1);
            const int childF = depth + 1 + childEstimate;

            if (childF > bound) {
                if (childF < next_bound) next_bound = childF;
                cube.invert(curr_move);
                continue;
            }

            // A subtree below the split belongs to whichever thread holds its
            // ticket; the others skip it, and its f-values reach next_bound
            // through the owner.
            const bool split = depth + 1 == SPLIT_DEPTH;
            if (split && s.item++ != s.ticket) {
                cube.invert(curr_move);
                continue;
            }

            moves.push_back(curr_move);
            int t = IDAstar(s, depth + 1, bound, childEstimate);
            if (t == -1) return -1;
            if (t < next_bound) next_bound = t;
            if (split) s.ticket = nextTicket++;

            moves.pop_back();
            cube.invert(curr_move);
        }

        return next_bound;
    }

    /*
     * Run one IDA* iteration at `bound` on `threads` threads (the calling
     * thread is one of them). Returns -1 with `moves` set when solved,
     * otherwise the next bound.
     */
    int searchBound(int bound, unsigned threads) {
        nextTicket = 0;
        stop = false;
        int next_bound = numeric_limits<int>::max();
        exception_ptr error;
        mutex m;

        auto work = [&]() {
            Search s;
            s.cube = rubiksCube;
            s.ticket = nextTicket++;
            try {
                int t = IDAstar(s, 0, bound, heuristic(rubiksCube));
                lock_guard<mutex> lock(m);
                if (t == -1) {
                    if (next_bound != -1) moves = s.path;
                    next_bound = -1;
                    stop = true;
                } else if (next_bound != -1 && t < next_bound) {
                    next_bound = t;
                }
            } catch (const Aborted &) {
            } catch (...) {
                lock_guard<mutex> lock(m);
                if (!error) error = current_exception();
                stop = true;
            }
            lock_guard<mutex> lock(m);
            nodesExpanded += s.nodes;
        };

        vector<thread> pool;
        for (unsigned i = 1; i < threads; i++) pool.emplace_back(work);
        work();
        for (auto &t: pool) t.join();

        // A solution found by one thread outranks another's timeout.
        if (error && next_bound != -1) rethrow_exception(error);
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

    /*
     * Find an optimal solution. `timeLimitSeconds <= 0` means no limit.
     *
     * Throws SolverTimeout if the budget runs out, or runtime_error if the
     * search exhausts every bound up to God's number, which can only happen
     * for a state that is not reachable on a real cube -- check with
     * isCubeSolvable() before calling to get a useful message instead.
     */
    vector<RubiksCube::MOVE> solve(double timeLimitSeconds = 0.0) {
        // One thread per core unless SOLVER_THREADS says otherwise.
        unsigned threads = thread::hardware_concurrency();
        if (const char *env = getenv("SOLVER_THREADS")) threads = (unsigned)atoi(env);
        if (threads == 0) threads = 1;

        moves.clear();
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
            bound = searchBound(bound, threads);
        }

        // Leave rubiksCube solved, as the single-threaded search used to.
        for (auto move: moves) rubiksCube.move(move);
        return moves;
    }
};

#endif //RUBIKS_CUBE_SOLVER_IDASTARSOLVER_H
