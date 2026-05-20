#include "CornerDBMaker.h"
using namespace std;

CornerDBMaker::CornerDBMaker(string _fileName) {
    fileName = _fileName;
}

CornerDBMaker::CornerDBMaker(string _fileName, uint8_t init_val) {
    fileName = _fileName;
    cornerDB = CornerPatternDatabase(init_val);
}

struct CompactCubeC {
    uint64_t bitboard[6];
};

bool CornerDBMaker::bfsAndStore() {
    RubiksCubeBitboard cube;

    CompactCubeC start{};
    memcpy(start.bitboard, cube.bitboard, sizeof(start.bitboard));

    queue<CompactCubeC> q;
    q.push(start);
    cornerDB.setNumMoves(cube, 0);
    int curr_depth = 0;

    while (!q.empty()) {
        int n = q.size();
        curr_depth++;
        cout << "Corner DB depth " << curr_depth
             << " | queue size: " << n
             << " | filled: " << cornerDB.getNumItems()
             << "/" << cornerDB.getSize() << endl;

        for (int counter = 0; counter < n; counter++) {
            CompactCubeC compact = q.front();
            q.pop();

            RubiksCubeBitboard node;
            memcpy(node.bitboard, compact.bitboard, sizeof(node.bitboard));

            for (int i = 0; i < 18; i++) {
                auto curr_move = RubiksCube::MOVE(i);
                node.move(curr_move);
                if ((int)cornerDB.getNumMoves(node) > curr_depth) {
                    cornerDB.setNumMoves(node, curr_depth);
                    CompactCubeC next{};
                    memcpy(next.bitboard, node.bitboard, sizeof(next.bitboard));
                    q.push(next);
                }
                node.invert(curr_move);
            }
        }
    }

    cornerDB.toFile(fileName);
    return true;
}
