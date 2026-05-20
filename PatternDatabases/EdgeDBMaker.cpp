#include "EdgeDBMaker.h"
using namespace std;

EdgeDBMaker::EdgeDBMaker(string _fileName, int edgeGroup)
    : fileName(_fileName), edgeDB(edgeGroup) {}

EdgeDBMaker::EdgeDBMaker(string _fileName, int edgeGroup, uint8_t init_val)
    : fileName(_fileName), edgeDB(edgeGroup, init_val) {}

struct CompactCubeE {
    uint64_t bitboard[6];
};

bool EdgeDBMaker::bfsAndStore() {
    RubiksCubeBitboard cube;

    CompactCubeE start{};
    memcpy(start.bitboard, cube.bitboard, sizeof(start.bitboard));

    queue<CompactCubeE> q;
    q.push(start);
    edgeDB.setNumMoves(cube, 0);
    int curr_depth = 0;

    while (!q.empty()) {
        int n = q.size();
        curr_depth++;
        cout << "Edge DB depth " << curr_depth
             << " | queue size: " << n
             << " | filled: " << edgeDB.getNumItems()
             << "/" << edgeDB.getSize() << endl;

        for (int counter = 0; counter < n; counter++) {
            CompactCubeE compact = q.front();
            q.pop();

            RubiksCubeBitboard node;
            memcpy(node.bitboard, compact.bitboard, sizeof(node.bitboard));

            for (int i = 0; i < 18; i++) {
                auto curr_move = RubiksCube::MOVE(i);
                node.move(curr_move);
                if ((int)edgeDB.getNumMoves(node) > curr_depth) {
                    edgeDB.setNumMoves(node, curr_depth);
                    CompactCubeE next{};
                    memcpy(next.bitboard, node.bitboard, sizeof(next.bitboard));
                    q.push(next);
                }
                node.invert(curr_move);
            }
        }
    }

    edgeDB.toFile(fileName);
    return true;
}
