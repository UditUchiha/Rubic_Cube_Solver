//
// Created by Lakshya Mittal on 01-02-2022.
//

#include<bits/stdc++.h>
#include "../Model/RubiksCube.h"
#include "../PatternDatabases/CornerPatternDatabase.h"

#ifndef RUBIKS_CUBE_SOLVER_IDASTARSOLVER_H
#define RUBIKS_CUBE_SOLVER_IDASTARSOLVER_H

template<typename T, typename H>
class IDAstarSolver {
private:
    CornerPatternDatabase cornerDB;
    vector<RubiksCube::MOVE> moves;
    H hash_func;

    struct TTEntry {
        T cube;
        int depth;
    };
    vector<TTEntry> tt;

    // Returns the next bound, or -1 if solved.
    int IDAstar(T& cube, int depth, int bound) {
        int estimate = cornerDB.getNumMoves(cube);
        if (estimate > 8) estimate = 8; // The database only went to depth 8. 15 breaks admissibility!
        int f = depth + estimate;
        if (f > bound) return f;
        if (cube.isSolved()) return -1;

        // Bounded Transposition Table lookup
        size_t idx = hash_func(cube) % tt.size();
        if (tt[idx].depth != -1 && tt[idx].cube == cube) {
            if (tt[idx].depth <= depth) {
                return 1e9; // Prune! We already reached this exact state via a shorter or equal path
            }
        }
        // Save state to TT
        tt[idx] = {cube, depth};

        int next_bound = 1e9;
        for (int i = 0; i < 18; i++) {
            auto curr_move = RubiksCube::MOVE(i);
            
            // Optimization: avoid consecutive moves on the same face,
            // and enforce ordering for opposite faces (e.g., L R is allowed, R L is pruned)
            if (!moves.empty()) {
                auto last_move = moves.back();
                int current_face = i / 3;
                int last_face = (int)last_move / 3;
                
                // Same face? Prune.
                if (current_face == last_face) continue;
                
                // Opposite faces? (L=0/R=1, U=2/D=3, F=4/B=5)
                // If they are opposite, only allow if last_face < current_face.
                if ((current_face / 2) == (last_face / 2)) {
                    if (current_face < last_face) continue;
                }
            }

            cube.move(curr_move);
            moves.push_back(curr_move);
            
            int t = IDAstar(cube, depth + 1, bound);
            if (t == -1) return -1; // Solved
            if (t < next_bound) next_bound = t;
            
            moves.pop_back();
            cube.invert(curr_move);
        }
        return next_bound;
    }

public:
    T rubiksCube;

    IDAstarSolver(T _rubiksCube, string fileName) {
        rubiksCube = _rubiksCube;
        cornerDB.fromFile(fileName);
    }

    vector<RubiksCube::MOVE> solve() {
        moves.clear();
        // Initialize 2 Million entry Transposition Table (~100 MB RAM)
        tt.resize(1 << 21);
        
        int bound = cornerDB.getNumMoves(rubiksCube);
        while (bound != -1) {
            // Reset TT for each depth iteration
            for (auto& entry : tt) entry.depth = -1;
            
            bound = IDAstar(rubiksCube, 0, bound);
        }
        return moves;
    }
};

#endif //RUBIKS_CUBE_SOLVER_IDASTARSOLVER_H
