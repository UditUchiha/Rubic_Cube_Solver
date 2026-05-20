#ifndef RUBIKS_CUBE_SOLVER_IDASTARSOLVER_H
#define RUBIKS_CUBE_SOLVER_IDASTARSOLVER_H

#include<bits/stdc++.h>
#include "../Model/RubiksCube.h"
#include "../PatternDatabases/CornerPatternDatabase.h"
#include "../PatternDatabases/EdgePatternDatabase.h"

template<typename T, typename H>
class IDAstarSolver {
private:
    CornerPatternDatabase *cornerDB;
    EdgePatternDatabase *edge1DB;
    EdgePatternDatabase *edge2DB;
    bool ownsDBs;
    vector<RubiksCube::MOVE> moves;

    int heuristic(const T& cube) {
        int c = (int)cornerDB->getNumMoves(cube);
        int e1 = (int)edge1DB->getNumMoves(cube);
        int e2 = (int)edge2DB->getNumMoves(cube);
        if (c == 0xF) c = 0;
        if (e1 == 0xF) e1 = 0;
        if (e2 == 0xF) e2 = 0;
        return max({c, e1, e2});
    }

    int IDAstar(T& cube, int depth, int bound) {
        int estimate = heuristic(cube);
        int f = depth + estimate;
        if (f > bound) return f;
        if (cube.isSolved()) return -1;

        int next_bound = 1e9;
        for (int i = 0; i < 18; i++) {
            auto curr_move = RubiksCube::MOVE(i);

            if (!moves.empty()) {
                auto last_move = moves.back();
                int current_face = i / 3;
                int last_face = (int)last_move / 3;

                if (current_face == last_face) continue;

                if ((current_face / 2) == (last_face / 2)) {
                    if (current_face < last_face) continue;
                }
            }

            cube.move(curr_move);
            moves.push_back(curr_move);

            int t = IDAstar(cube, depth + 1, bound);
            if (t == -1) return -1;
            if (t < next_bound) next_bound = t;

            moves.pop_back();
            cube.invert(curr_move);
        }
        return next_bound;
    }

public:
    T rubiksCube;

    IDAstarSolver(T _rubiksCube, string cornerFile, string edge1File, string edge2File)
        : ownsDBs(true)
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
        : cornerDB(&cDB), edge1DB(&e1DB), edge2DB(&e2DB), ownsDBs(false)
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

    // God's number: any solvable cube is ≤20 moves from solved
    static const int MAX_DEPTH = 20;

    vector<RubiksCube::MOVE> solve() {
        moves.clear();
        int bound = heuristic(rubiksCube);

        while (bound != -1) {
            if (bound > MAX_DEPTH) {
                throw runtime_error("Cube state is unsolvable (exceeded depth 20)");
            }
            bound = IDAstar(rubiksCube, 0, bound);
        }
        return moves;
    }
};

#endif //RUBIKS_CUBE_SOLVER_IDASTARSOLVER_H
