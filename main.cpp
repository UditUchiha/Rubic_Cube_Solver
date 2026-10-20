#include <bits/stdc++.h>
#include "Model/CubeValidation.h"
#include "Solver/DFSSolver.h"
#include "Solver/BFSSolver.h"
#include "Solver/IDDFSSolver.h"
#include "Solver/IDAstarSolver.h"
#include "Solver/BestFirstSolver.h"
#include "PatternDatabases/CornerDBMaker.h"
#include "PatternDatabases/EdgeDBMaker.h"

using namespace std;

int main(int argc, char *argv[]) {
    string cornerDBFile = "Databases\\corner.db";
    string edge1DBFile  = "Databases\\edge1.db";
    string edge2DBFile  = "Databases\\edge2.db";

    // --- Uncomment to generate databases (run once, takes hours) ---
    // CornerDBMaker cornerMaker(cornerDBFile, 0xFF);
    // cornerMaker.bfsAndStore();
    //
    // EdgeDBMaker edge1Maker(edge1DBFile, 0, 0xFF);
    // edge1Maker.bfsAndStore();
    //
    // EdgeDBMaker edge2Maker(edge2DBFile, 1, 0xFF);
    // edge2Maker.bfsAndStore();

    // Scramble depth. Korf's IDA* returns an optimal solution, but its cost
    // grows roughly 5-8x per extra move: 11 moves solves in ~0.1s, 12 in a
    // couple of seconds, and by 15 it runs longer than anything downstream is
    // willing to wait. 12 is the deepest default that finishes reliably.
    // Pass a different depth as argv[1] to go deeper.
    unsigned shuffleDepth = 12;
    if (argc >= 2) {
        int requested = atoi(argv[1]);
        if (requested > 0) shuffleDepth = (unsigned)requested;
    }

    // Deep scrambles have no useful upper bound on runtime, so give the search
    // a budget rather than letting it sit there apparently hung. argv[2] or
    // SOLVER_TIME_LIMIT override it; pass 0 to run without a limit.
    double timeLimitSeconds = 60.0;
    if (const char *env = getenv("SOLVER_TIME_LIMIT")) {
        double parsed = atof(env);
        if (parsed >= 0.0) timeLimitSeconds = parsed;
    }
    if (argc >= 3) {
        double parsed = atof(argv[2]);
        if (parsed >= 0.0) timeLimitSeconds = parsed;
    }

    RubiksCubeBitboard cube;
    auto shuffleMoves = cube.randomShuffleCube(shuffleDepth);
    cube.print();
    cout << "Scramble (" << shuffleMoves.size() << " moves): ";
    for (auto move: shuffleMoves) cout << RubiksCube::getMove(move) << " ";
    cout << "\n";

    string why;
    if (!isCubeSolvable(cube, why)) {
        cerr << "Internal error: shuffled cube is not solvable: " << why << endl;
        return 1;
    }

    // argv[3] picks the search: ida (default), bestfirst, or both on the same
    // scramble. SOLVER_MAX_STATES caps best-first memory (default 20M states,
    // roughly 3 GB); 0 removes the cap.
    string algo = argc >= 4 ? argv[3] : "ida";
    size_t maxStates = 20000000;
    if (const char *env = getenv("SOLVER_MAX_STATES")) maxStates = (size_t)atoll(env);

    CornerPatternDatabase cornerDB;
    EdgePatternDatabase edge1DB(0), edge2DB(1);
    cornerDB.fromFile(cornerDBFile);
    edge1DB.fromFile(edge1DBFile);
    edge2DB.fromFile(edge2DBFile);

    bool allOk = true;
    for (string name : {string("ida"), string("bestfirst")}) {
        if (algo != name && algo != "both") continue;
        cout << "\n== " << (name == "ida" ? "IDA* (recursive DFS)" : "Best-first (priority queue + hash map)")
             << " ==" << endl;

        IDAstarSolver<RubiksCubeBitboard, HashBitboard> ida(cube, cornerDB, edge1DB, edge2DB);
        BestFirstSolver<RubiksCubeBitboard, HashBitboard> bestFirst(cube, cornerDB, edge1DB, edge2DB);

        auto start = chrono::steady_clock::now();
        vector<RubiksCube::MOVE> moves;
        try {
            moves = name == "ida" ? ida.solve(timeLimitSeconds)
                                  : bestFirst.solve(timeLimitSeconds, maxStates);
        } catch (const exception &e) {
            auto spent = chrono::duration<double>(chrono::steady_clock::now() - start).count();
            cout << "Gave up after " << fixed << setprecision(1) << spent << "s: " << e.what() << endl;
            allOk = false;
            continue;
        }
        auto elapsed = chrono::duration<double>(chrono::steady_clock::now() - start).count();

        cout << "Solution (" << moves.size() << " moves): ";
        for (auto move: moves) cout << RubiksCube::getMove(move) << " ";
        cout << "\n";
        cout << "Solved in " << fixed << setprecision(2) << elapsed << "s, "
             << (name == "ida" ? ida.getNodesExpanded() : bestFirst.getNodesExpanded())
             << " nodes expanded";
        if (name == "bestfirst") cout << ", peak " << bestFirst.getPeakStates() << " states stored";
        cout << endl;

        // Independently confirm the move list really does solve the scramble.
        RubiksCubeBitboard check = cube;
        for (auto move: moves) check.move(move);
        cout << "Verification: " << (check.isSolved() ? "SOLVED" : "*** FAILED ***") << endl;
        allOk = allOk && check.isSolved();
    }

    return allOk ? 0 : 1;
}
