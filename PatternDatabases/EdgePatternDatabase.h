#ifndef RUBIKS_CUBE_SOLVER_EDGEPATTERNDATABASE_H
#define RUBIKS_CUBE_SOLVER_EDGEPATTERNDATABASE_H

#include "../Model/RubiksCube.h"
#include "PatternDatabase.h"
#include "PermutationIndexer.h"
using namespace std;

class EdgePatternDatabase : public PatternDatabase {

    PermutationIndexer<12, 6> permIndexer;
    // 0 = track edges 0-5 (UF,UR,UB,UL,DF,DR)
    // 1 = track edges 6-11 (DB,DL,FR,FL,BR,BL)
    int edgeGroup;

public:
    EdgePatternDatabase(int group);
    EdgePatternDatabase(int group, uint8_t init_val);
    uint32_t getDatabaseIndex(const RubiksCube &cube) const;
};

#endif //RUBIKS_CUBE_SOLVER_EDGEPATTERNDATABASE_H
