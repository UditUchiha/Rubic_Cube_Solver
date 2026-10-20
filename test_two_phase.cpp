#undef NDEBUG   // Release builds define it; these asserts are the test
#include <bits/stdc++.h>
#include "Solver/TwoPhaseSolver.h"

using namespace std;

// Self-check for TwoPhaseSolver: fixed-seed deep scrambles must come back
// verified and short, a solved cube must give no moves, and an impossible cube
// must be rejected rather than searched. Exits non-zero on any failure.
int main(int argc, char *argv[]) {
    int count = argc >= 2 ? atoi(argv[1]) : 200;

    auto t0 = chrono::steady_clock::now();
    twophase::tables();
    double tableSeconds = chrono::duration<double>(chrono::steady_clock::now() - t0).count();
    cout << "Tables built in " << fixed << setprecision(3) << tableSeconds << "s" << endl;

    // Solved cube -> empty solution.
    RubiksCubeBitboard solved;
    assert(TwoPhaseSolver<RubiksCubeBitboard>(solved).solve(5).empty());

    // One flipped edge (UF stickers swapped) is unsolvable -> must throw, not search.
    RubiksCubeBitboard flipped;
    flipped.setColor(RubiksCube::FACE::UP, 2, 1, RubiksCube::COLOR::RED);
    flipped.setColor(RubiksCube::FACE::FRONT, 0, 1, RubiksCube::COLOR::WHITE);
    bool threw = false;
    try { TwoPhaseSolver<RubiksCubeBitboard>(flipped).solve(5); }
    catch (const SolverTimeout &) { assert(!"flipped edge should be rejected, not time out"); }
    catch (const runtime_error &) { threw = true; }
    assert(threw);

    mt19937 rng(20261020);
    uniform_int_distribution<int> pickMove(0, 17), pickDepth(20, 25);
    double totalSeconds = 0, maxSeconds = 0;
    int totalLength = 0, maxLength = 0;

    for (int i = 0; i < count; i++) {
        RubiksCubeBitboard cube;
        int depth = pickDepth(rng), lastFace = -1;
        for (int k = 0; k < depth; k++) {
            int m;
            do m = pickMove(rng); while (m / 3 == lastFace);
            lastFace = m / 3;
            cube.move(RubiksCube::MOVE(m));
        }

        auto start = chrono::steady_clock::now();
        auto moves = TwoPhaseSolver<RubiksCubeBitboard>(cube).solve(10);
        double seconds = chrono::duration<double>(chrono::steady_clock::now() - start).count();

        RubiksCubeBitboard check = cube;
        for (auto m: moves) check.move(m);
        assert(check.isSolved());
        assert(moves.size() <= 22);

        totalSeconds += seconds;
        maxSeconds = max(maxSeconds, seconds);
        totalLength += (int)moves.size();
        maxLength = max(maxLength, (int)moves.size());
    }

    cout << count << " scrambles of 20-25 moves solved and verified" << endl;
    cout << "Length: avg " << setprecision(2) << (double)totalLength / count
         << ", max " << maxLength << endl;
    cout << "Time:   avg " << setprecision(1) << totalSeconds / count * 1000
         << "ms, max " << maxSeconds * 1000 << "ms" << endl;
    cout << "PASS" << endl;
    return 0;
}
