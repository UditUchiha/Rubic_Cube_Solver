#include <bits/stdc++.h>
#include "PatternDatabases/CornerDBMaker.h"
#include "PatternDatabases/EdgeDBMaker.h"
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

static bool validateCenters(const string &input) {
    const char expected[6] = {'W', 'G', 'R', 'B', 'O', 'Y'};
    for (int face = 0; face < 6; face++) {
        if (toupper((unsigned char)input[face * 9 + 4]) != expected[face]) return false;
    }
    return true;
}

static string solveCube(const string &input, CornerPatternDatabase &cornerDB,
                        EdgePatternDatabase &edge1DB, EdgePatternDatabase &edge2DB) {
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

    if (cube.isSolved()) return "";

    IDAstarSolver<RubiksCubeBitboard, HashBitboard> solver(cube, cornerDB, edge1DB, edge2DB);
    vector<RubiksCube::MOVE> moves = solver.solve();

    string result;
    for (size_t i = 0; i < moves.size(); i++) {
        if (i > 0) result += " ";
        result += RubiksCube::getMove(moves[i]);
    }
    return result;
}

int main(int argc, char *argv[]) {
    string cornerDBPath = "Databases/corner.db";
    string edge1DBPath  = "Databases/edge1.db";
    string edge2DBPath  = "Databases/edge2.db";
    if (argc >= 2) cornerDBPath = argv[1];
    if (argc >= 3) edge1DBPath  = argv[2];
    if (argc >= 4) edge2DBPath  = argv[3];

    for (const auto &path : {cornerDBPath, edge1DBPath, edge2DBPath}) {
        ifstream check(path);
        if (!check.good()) {
            cerr << "Error: Database file not found: " << path << endl;
            return 1;
        }
    }

    CornerPatternDatabase cornerDB;
    EdgePatternDatabase edge1DB(0), edge2DB(1);

    cerr << "Loading corner database..." << endl;
    cornerDB.fromFile(cornerDBPath);
    cerr << "Loading edge1 database..." << endl;
    edge1DB.fromFile(edge1DBPath);
    cerr << "Loading edge2 database..." << endl;
    edge2DB.fromFile(edge2DBPath);
    cerr << "READY" << endl;

    string line;
    while (getline(cin, line)) {
        if (line.empty()) continue;

        if (line.size() != 54) {
            cout << "ERROR: Input must be exactly 54 characters, got " << line.size() << endl;
            cout.flush();
            continue;
        }
        if (!validateColorCounts(line)) {
            cout << "ERROR: Each color (W/G/R/B/O/Y) must appear exactly 9 times." << endl;
            cout.flush();
            continue;
        }
        if (!validateCenters(line)) {
            cout << "ERROR: Center facelets must be W(U) G(L) R(F) B(R) O(B) Y(D)." << endl;
            cout.flush();
            continue;
        }

        try {
            string result = solveCube(line, cornerDB, edge1DB, edge2DB);
            cout << "SOLUTION: " << result << endl;
            cout.flush();
        } catch (const exception &e) {
            cout << "ERROR: " << e.what() << endl;
            cout.flush();
        } catch (...) {
            cout << "ERROR: Unknown error during solve" << endl;
            cout.flush();
        }
    }

    return 0;
}
