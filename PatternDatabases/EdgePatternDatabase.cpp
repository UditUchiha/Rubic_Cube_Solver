#include "EdgePatternDatabase.h"

// P(12,6) * 2^6 = 665280 * 64 = 42577920
static const uint32_t EDGE_DB_SIZE = 42577920;

EdgePatternDatabase::EdgePatternDatabase(int group)
    : PatternDatabase(EDGE_DB_SIZE), edgeGroup(group) {}

EdgePatternDatabase::EdgePatternDatabase(int group, uint8_t init_val)
    : PatternDatabase(EDGE_DB_SIZE, init_val), edgeGroup(group) {}

uint32_t EdgePatternDatabase::getDatabaseIndex(const RubiksCube &cube) const {
    // Find positions of the 6 tracked edges among all 12 positions
    array<uint8_t, 6> edgePerm{};
    array<uint8_t, 6> edgeOri{};
    int found = 0;

    int lo = edgeGroup * 6; // 0 for group 0, 6 for group 1
    int hi = lo + 6;

    for (int pos = 0; pos < 12 && found < 6; pos++) {
        uint8_t edgeId = cube.getEdgeIndex(pos);
        if ((int)edgeId >= lo && (int)edgeId < hi) {
            edgePerm[edgeId - lo] = pos;
            edgeOri[edgeId - lo] = cube.getEdgeOrientation(pos);
            found++;
        }
    }

    uint32_t rank = permIndexer.rank(edgePerm);

    uint32_t orientationNum = 0;
    for (int i = 0; i < 6; i++) {
        orientationNum = orientationNum * 2 + edgeOri[i];
    }

    return rank * 64 + orientationNum;
}
