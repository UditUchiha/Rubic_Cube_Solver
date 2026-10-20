#include <bits/stdc++.h>
#include "Model/CubeValidation.h"
#include "Solver/DFSSolver.h"
#include "Solver/BFSSolver.h"
#include "Solver/IDDFSSolver.h"
#include "Solver/IDAstarSolver.h"
#include "Solver/TwoPhaseSolver.h"
#include "PatternDatabases/CornerDBMaker.h"
#include "PatternDatabases/EdgeDBMaker.h"

using namespace std;

int main(int argc, char *argv[]) {
    // "fast" as the first argument swaps Korf's optimal IDA* for two-phase:
    // ~22 moves instead of the fewest, but any depth solves in milliseconds.
    //   rubiks_cube_solver.exe fast 25
    bool fast = argc >= 2 && string(argv[1]) == "fast";
    if (fast) argc--, argv++;

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

    if (fast) {
        auto tableStart = chrono::steady_clock::now();
        twophase::tables();
        cout << "Two-phase tables built in " << fixed << setprecision(2)
             << chrono::duration<double>(chrono::steady_clock::now() - tableStart).count() << "s" << endl;

        auto start = chrono::steady_clock::now();
        auto moves = TwoPhaseSolver<RubiksCubeBitboard>(cube).solve(timeLimitSeconds);
        auto elapsed = chrono::duration<double>(chrono::steady_clock::now() - start).count();

        cout << "Solution (" << moves.size() << " moves): ";
        for (auto move: moves) cout << RubiksCube::getMove(move) << " ";
        cout << "\nSolved in " << setprecision(1) << elapsed * 1000 << "ms (verified)" << endl;
        return 0;
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
