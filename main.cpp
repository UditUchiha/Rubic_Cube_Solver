#include <bits/stdc++.h>
#include "Model/CubeValidation.h"
#include "Solver/DFSSolver.h"
#include "Solver/BFSSolver.h"
#include "Solver/IDDFSSolver.h"
#include "Solver/IDAstarSolver.h"
#include "PatternDatabases/CornerDBMaker.h"
#include "PatternDatabases/EdgeDBMaker.h"

using namespace std;

/*
 * `rubiks_cube_solver benchmark`: solve a fixed, seeded set of scrambles so
 * solver changes can be compared run to run. The scrambles never change, so
 * solution lengths must not either -- any difference means lost optimality.
 */
static int runBenchmark(const string &cornerFile, const string &edge1File, const string &edge2File) {
    CornerPatternDatabase cornerDB;
    EdgePatternDatabase edge1DB(0), edge2DB(1);
    if (!cornerDB.fromFile(cornerFile) || !edge1DB.fromFile(edge1File) || !edge2DB.fromFile(edge2File)) {
        cerr << "Could not open the pattern databases" << endl;
        return 1;
    }

    mt19937 rng(12345);
    double totalTime = 0;
    uint64_t totalNodes = 0;
    bool allSolved = true;
    cout << "depth  length       nodes     time(s)\n";
    for (unsigned depth = 10; depth <= 13; depth++) {
        for (int n = 0; n < 3; n++) {
            RubiksCubeBitboard cube;
            int lastFace = -1;
            for (unsigned i = 0; i < depth; i++) {
                int m;
                do { m = (int)(rng() % 18); } while (m / 3 == lastFace);
                lastFace = m / 3;
                cube.move(RubiksCube::MOVE(m));
            }

            IDAstarSolver<RubiksCubeBitboard, HashBitboard> solver(cube, cornerDB, edge1DB, edge2DB);
            auto start = chrono::steady_clock::now();
            auto moves = solver.solve();
            double t = chrono::duration<double>(chrono::steady_clock::now() - start).count();

            RubiksCubeBitboard check = cube;
            for (auto move: moves) check.move(move);
            allSolved = allSolved && check.isSolved();

            totalTime += t;
            totalNodes += solver.getNodesExpanded();
            cout << setw(5) << depth << setw(8) << moves.size() << setw(12) << solver.getNodesExpanded()
                 << setw(12) << fixed << setprecision(3) << t
                 << (check.isSolved() ? "" : "  *** NOT SOLVED ***") << endl;
        }
    }
    cout << "total        " << setw(12) << totalNodes << setw(12) << totalTime << endl;
    return allSolved ? 0 : 1;
}

int main(int argc, char *argv[]) {
    string cornerDBFile = "Databases\\corner.db";
    string edge1DBFile  = "Databases\\edge1.db";
    string edge2DBFile  = "Databases\\edge2.db";

    if (argc >= 2 && string(argv[1]) == "benchmark")
        return runBenchmark(cornerDBFile, edge1DBFile, edge2DBFile);

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

    IDAstarSolver<RubiksCubeBitboard, HashBitboard> solver(
        cube, cornerDBFile, edge1DBFile, edge2DBFile);

    auto start = chrono::steady_clock::now();
    vector<RubiksCube::MOVE> moves;
    try {
        moves = solver.solve(timeLimitSeconds);
    } catch (const SolverTimeout &) {
        auto spent = chrono::duration<double>(chrono::steady_clock::now() - start).count();
        cout << "Gave up after " << fixed << setprecision(1) << spent << "s ("
             << solver.getNodesExpanded() << " nodes). A " << shuffleDepth
             << "-move scramble is beyond this budget - raise it with "
                "SOLVER_TIME_LIMIT or argv[2], or scramble fewer moves." << endl;
        return 2;
    }
    auto elapsed = chrono::duration<double>(chrono::steady_clock::now() - start).count();

    solver.rubiksCube.print();
    cout << "Solution (" << moves.size() << " moves): ";
    for (auto move: moves) cout << RubiksCube::getMove(move) << " ";
    cout << "\n";

    cout << "Solved in " << fixed << setprecision(2) << elapsed << "s, "
         << solver.getNodesExpanded() << " nodes expanded" << endl;

    // Independently confirm the move list really does solve the scramble.
    RubiksCubeBitboard check = cube;
    for (auto move: moves) check.move(move);
    cout << "Verification: " << (check.isSolved() ? "SOLVED" : "*** FAILED ***") << endl;

    return check.isSolved() ? 0 : 1;
}
