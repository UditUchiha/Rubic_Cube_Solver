#include <bits/stdc++.h>
#include "Model/CubeValidation.h"
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

static RubiksCubeBitboard parseCube(const string &input) {
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
    return cube;
}

typedef IDAstarSolver<RubiksCubeBitboard, HashBitboard> Solver;

// One-line JSON for the "how the search went" panel. Takes the scrambled cube
// because the search leaves solver.rubiksCube solved. Hand-formatted: C++14,
// no JSON library, and every value is a number.
static string statsJson(const Solver &solver, const RubiksCubeBitboard &scrambled) {
    int c, e1, e2;
    solver.heuristicParts(scrambled, c, e1, e2);
    ostringstream out;
    out << "{\"h\":{\"corner\":" << c << ",\"edge1\":" << e1 << ",\"edge2\":" << e2
        << "},\"iterations\":[";
    const auto &its = solver.getIterations();
    for (size_t i = 0; i < its.size(); i++) {
        if (i > 0) out << ",";
        out << "[" << its[i].first << "," << its[i].second << "]";
    }
    out << "],\"nodes\":" << solver.getNodesExpanded() << "}";
    return out.str();
}

// Prints a STATS: line before returning or timing out, so the server can
// attach it to either the solution or the timeout error.
static string solveCube(const string &input, CornerPatternDatabase &cornerDB,
                        EdgePatternDatabase &edge1DB, EdgePatternDatabase &edge2DB,
                        double timeLimitSeconds) {
    RubiksCubeBitboard cube = parseCube(input);

    if (cube.isSolved()) return "";

    Solver solver(cube, cornerDB, edge1DB, edge2DB);
    vector<RubiksCube::MOVE> moves;
    try {
        moves = solver.solve(timeLimitSeconds);
    } catch (const SolverTimeout &) {
        cout << "STATS: " << statsJson(solver, cube) << endl;
        throw;
    }
    cout << "STATS: " << statsJson(solver, cube) << endl;

    // Never hand back a solution we have not checked. A wrong move list is far
    // worse than an error: the user would turn a real cube into a worse mess.
    RubiksCubeBitboard verify = cube;
    for (size_t i = 0; i < moves.size(); i++) verify.move(moves[i]);
    if (!verify.isSolved())
        throw runtime_error("internal error: solver returned a move list that "
                            "does not solve the cube");

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

    // Give up on a cube that is too deep rather than letting the supervisor
    // kill us. Being killed costs every other user the ~30s it takes to reload
    // 86 MB of databases; answering "too hard" costs nothing and keeps the
    // process warm. Default sits under a typical 60s request timeout.
    double timeLimitSeconds = 50.0;
    if (const char *env = getenv("SOLVER_TIME_LIMIT")) {
        double parsed = atof(env);
        if (parsed > 0.0) timeLimitSeconds = parsed;
    }

    for (const auto &path : {cornerDBPath, edge1DBPath, edge2DBPath}) {
        ifstream check(path, ios::in | ios::binary);
        if (!check.good()) {
            cerr << "FATAL: Database file not found: " << path << endl;
            return 1;
        }
    }

    // Roughly 86 MB of nibble arrays. Heap-allocate so a constrained container
    // fails here with a clear message rather than blowing the stack later.
    unique_ptr<CornerPatternDatabase> cornerDB;
    unique_ptr<EdgePatternDatabase> edge1DB, edge2DB;

    try {
        cerr << "Loading corner database..." << endl;
        cornerDB.reset(new CornerPatternDatabase());
        cornerDB->fromFile(cornerDBPath);

        cerr << "Loading edge1 database..." << endl;
        edge1DB.reset(new EdgePatternDatabase(0));
        edge1DB->fromFile(edge1DBPath);

        cerr << "Loading edge2 database..." << endl;
        edge2DB.reset(new EdgePatternDatabase(1));
        edge2DB->fromFile(edge2DBPath);
    } catch (const exception &e) {
        // Previously an unreadable or truncated database threw past main and
        // aborted the process, which the supervisor read as a crash and
        // respawned forever. Exit deliberately instead.
        cerr << "FATAL: " << e.what() << endl;
        return 1;
    }

    cerr << "Per-request time limit: " << timeLimitSeconds << "s" << endl;
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

        // Reject physically impossible cubes here, before the search starts.
        // IDA* cannot fail fast on an unsolvable state -- it would deepen all
        // the way to the God's-number bound, hold the single solver slot for
        // minutes, and then be killed by the request timeout.
        {
            string why;
            if (!isCubeSolvable(parseCube(line), why)) {
                cout << "ERROR: " << why << endl;
                cout.flush();
                continue;
            }
        }

        try {
            string result = solveCube(line, *cornerDB, *edge1DB, *edge2DB, timeLimitSeconds);
            cout << "SOLUTION: " << result << endl;
            cout.flush();
        } catch (const SolverTimeout &) {
            // Deliberately not fatal: the process stays up with its databases
            // loaded and is ready for the next request immediately.
            cout << "ERROR: This scramble is too deep to solve within "
                 << (int)timeLimitSeconds << "s. Try a shallower scramble." << endl;
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
