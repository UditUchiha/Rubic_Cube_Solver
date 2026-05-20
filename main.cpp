#include <bits/stdc++.h>
#include "Solver/DFSSolver.h"
#include "Solver/BFSSolver.h"
#include "Solver/IDDFSSolver.h"
#include "Solver/IDAstarSolver.h"
#include "PatternDatabases/CornerDBMaker.h"
#include "PatternDatabases/EdgeDBMaker.h"

using namespace std;

int main() {
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

    RubiksCubeBitboard cube;
    auto shuffleMoves = cube.randomShuffleCube(20);
    cube.print();
    for (auto move: shuffleMoves) cout << cube.getMove(move) << " ";
    cout << "\n";

    IDAstarSolver<RubiksCubeBitboard, HashBitboard> solver(
        cube, cornerDBFile, edge1DBFile, edge2DBFile);
    auto moves = solver.solve();

    solver.rubiksCube.print();
    for (auto move: moves) cout << cube.getMove(move) << " ";
    cout << "\n";

    return 0;
}
