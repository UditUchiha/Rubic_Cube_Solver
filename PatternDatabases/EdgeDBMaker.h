#ifndef RUBIKS_CUBE_SOLVER_EDGEDBMAKER_H
#define RUBIKS_CUBE_SOLVER_EDGEDBMAKER_H

#include "EdgePatternDatabase.h"
#include "../Model/RubiksCubeBitboard.cpp"
using namespace std;

class EdgeDBMaker {
private:
    string fileName;
    EdgePatternDatabase edgeDB;

public:
    EdgeDBMaker(string _fileName, int edgeGroup);
    EdgeDBMaker(string _fileName, int edgeGroup, uint8_t init_val);

    bool bfsAndStore();
};

#endif //RUBIKS_CUBE_SOLVER_EDGEDBMAKER_H
