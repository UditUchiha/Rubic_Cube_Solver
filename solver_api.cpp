#include <bits/stdc++.h>
#include "PatternDatabases/CornerDBMaker.h"
#include "Solver/IDAstarSolver.h"

using namespace std;

static bool charToColor(char c, RubiksCube::COLOR &out) {
    switch (toupper((unsigned char)c)) {
        case 'W': out = RubiksCube::COLOR::WHITE;  return true;
        case 'G': out = RubiksCube::COLOR::GREEN;  return true;
        case 'R': out = RubiksCube::COLOR::RED;    return true;
        case 'B': out = RubiksCube::COLOR::BLUE;   return true;
        case 'O': out = RubiksCube::COLOR::ORANGE; return true;
        case 'Y': out = RubiksCube::COLOR::YELLOW; return true;
        default:  return false;
    }
}

static bool validateColorCounts(const string &input) {
    int counts[6] = {0};
    for (char c : input) {
        RubiksCube::COLOR clr;
        if (!charToColor(c, clr)) return false;
        counts[(int)clr]++;
    }
    for (int i = 0; i < 6; i++) {
        if (counts[i] != 9) return false;
    }
    return true;
}

// Centers at string positions 4,13,22,31,40,49 must be W,G,R,B,O,Y
static bool validateCenters(const string &input) {
    const char expected[6] = {'W', 'G', 'R', 'B', 'O', 'Y'};
    for (int face = 0; face < 6; face++) {
        if (toupper((unsigned char)input[face * 9 + 4]) != expected[face]) return false;
    }
    return true;
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        cerr << "Usage: solver_api <54-char-cube-string> [database-path]" << endl;
        cerr << "  Face order: U L F R B D (9 chars each, row-major)" << endl;
        cerr << "  Colors: W=White G=Green R=Red B=Blue O=Orange Y=Yellow" << endl;
        cerr << "  Solved: WWWWWWWWWGGGGGGGGGRRRRRRRRRBBBBBBBBBOOOOOOOOOYYYYYYYYY" << endl;
        return 1;
    }

    string input = argv[1];

    if (input.size() != 54) {
        cerr << "Error: Input must be exactly 54 characters, got " << input.size() << endl;
        return 1;
    }

    if (!validateColorCounts(input)) {
        cerr << "Error: Each color (W/G/R/B/O/Y) must appear exactly 9 times." << endl;
        return 1;
    }

    if (!validateCenters(input)) {
        cerr << "Error: Center facelets must be W(U) G(L) R(F) B(R) O(B) Y(D)." << endl;
        return 1;
    }

    string dbPath = "Databases\\cornerDepth5V1.txt";
    if (argc >= 3) {
        dbPath = argv[2];
    }

    // Verify the database file exists before constructing the solver
    {
        ifstream dbCheck(dbPath);
        if (!dbCheck.good()) {
            cerr << "Error: Database file not found: " << dbPath << endl;
            return 1;
        }
    }

    // Build the cube from the 54-char string
    RubiksCubeBitboard cube;
    for (int face = 0; face < 6; face++) {
        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 3; col++) {
                int strIdx = face * 9 + row * 3 + col;
                RubiksCube::COLOR clr;
                charToColor(input[strIdx], clr);
                cube.setColor(RubiksCube::FACE(face), (unsigned)row, (unsigned)col, clr);
            }
        }
    }

    // Already solved — return empty solution
    if (cube.isSolved()) {
        cout << endl;
        return 0;
    }

    try {
        IDAstarSolver<RubiksCubeBitboard, HashBitboard> solver(cube, dbPath);
        vector<RubiksCube::MOVE> moves = solver.solve();

        for (size_t i = 0; i < moves.size(); i++) {
            if (i > 0) cout << " ";
            cout << RubiksCube::getMove(moves[i]);
        }
        cout << endl;
    } catch (const char *msg) {
        cerr << "Error: " << msg << endl;
        return 1;
    } catch (const exception &e) {
        cerr << "Error: " << e.what() << endl;
        return 1;
    } catch (...) {
        cerr << "Error: Unknown error during solve" << endl;
        return 1;
    }

    return 0;
}
