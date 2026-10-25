#include "RubiksCube.h"

//
//Given a color return it's first letter
//

char RubiksCube::getColorLetter(COLOR color) {
    switch (color) {
        case COLOR::BLUE:
            return 'B';
        case COLOR::GREEN:
            return 'G';
        case COLOR::RED:
            return 'R';
        case COLOR::YELLOW:
            return 'Y';
        case COLOR::WHITE:
            return 'W';
        case COLOR::ORANGE:
            return 'O';
    }
    return '?';   // unreachable for a valid COLOR; keeps the function total
}

/*
 * Describe a move using an index
 */
string RubiksCube::getMove(MOVE ind) {
    switch (ind) {
        case MOVE::L:
            return "L";
        case MOVE::LPRIME:
            return "L'";
        case MOVE::L2:
            return "L2";
        case MOVE::R:
            return "R";
        case MOVE::RPRIME:
            return "R'";
        case MOVE::R2:
            return "R2";
        case MOVE::U:
            return "U";
        case MOVE::UPRIME:
            return "U'";
        case MOVE::U2:
            return "U2";
        case MOVE::D:
            return "D";
        case MOVE::DPRIME:
            return "D'";
        case MOVE::D2:
            return "D2";
        case MOVE::F:
            return "F";
        case MOVE::FPRIME:
            return "F'";
        case MOVE::F2:
            return "F2";
        case MOVE::B:
            return "B";
        case MOVE::BPRIME:
            return "B'";
        case MOVE::B2:
            return "B2";
    }
    throw invalid_argument("getMove: move index out of range");
}

/*
 * Perform a move operation on using a Move index.
 */
RubiksCube &RubiksCube::move(MOVE ind) {
    switch (ind) {
        case MOVE::L:
            return this->l();
        case MOVE::LPRIME:
            return this->lPrime();
        case MOVE::L2:
            return this->l2();
        case MOVE::R:
            return this->r();
        case MOVE::RPRIME:
            return this->rPrime();
        case MOVE::R2:
            return this->r2();
        case MOVE::U:
            return this->u();
        case MOVE::UPRIME:
            return this->uPrime();
        case MOVE::U2:
            return this->u2();
        case MOVE::D:
            return this->d();
        case MOVE::DPRIME:
            return this->dPrime();
        case MOVE::D2:
            return this->d2();
        case MOVE::F:
            return this->f();
        case MOVE::FPRIME:
            return this->fPrime();
        case MOVE::F2:
            return this->f2();
        case MOVE::B:
            return this->b();
        case MOVE::BPRIME:
            return this->bPrime();
        case MOVE::B2:
            return this->b2();
    }
    throw invalid_argument("move: move index out of range");
}

/*
 * Invert a move.
 */
RubiksCube &RubiksCube::invert(MOVE ind) {
    switch (ind) {
        case MOVE::L:
            return this->lPrime();
        case MOVE::LPRIME:
            return this->l();
        case MOVE::L2:
            return this->l2();
        case MOVE::R:
            return this->rPrime();
        case MOVE::RPRIME:
            return this->r();
        case MOVE::R2:
            return this->r2();
        case MOVE::U:
            return this->uPrime();
        case MOVE::UPRIME:
            return this->u();
        case MOVE::U2:
            return this->u2();
        case MOVE::D:
            return this->dPrime();
        case MOVE::DPRIME:
            return this->d();
        case MOVE::D2:
            return this->d2();
        case MOVE::F:
            return this->fPrime();
        case MOVE::FPRIME:
            return this->f();
        case MOVE::F2:
            return this->f2();
        case MOVE::B:
            return this->bPrime();
        case MOVE::BPRIME:
            return this->b();
        case MOVE::B2:
            return this->b2();
    }
    throw invalid_argument("invert: move index out of range");
}

void RubiksCube::print() const {
    cout << "Rubik's Cube:\n\n";

    for (int row = 0; row <= 2; row++) {
        for (unsigned i = 0; i < 7; i++) cout << " ";
        for (int col = 0; col <= 2; col++) {
            cout << getColorLetter(getColor(FACE::UP, row, col)) << " ";
        }
        cout << "\n";
    }

    cout << "\n";

    for (int row = 0; row <= 2; row++) {

        for (int col = 0; col <= 2; col++) {
            cout << getColorLetter(getColor(FACE::LEFT, row, col)) << " ";
        }
        cout << " ";

        for (int col = 0; col <= 2; col++) {
            cout << getColorLetter(getColor(FACE::FRONT, row, col)) << " ";
        }
        cout << " ";

        for (int col = 0; col <= 2; col++) {
            cout << getColorLetter(getColor(FACE::RIGHT, row, col)) << " ";
        }
        cout << " ";

        for (int col = 0; col <= 2; col++) {
            cout << getColorLetter(getColor(FACE::BACK, row, col)) << " ";
        }
        cout << "\n";
    }

    cout << "\n";

    for (int row = 0; row <= 2; row++) {
        for (unsigned i = 0; i < 7; i++) cout << " ";
        for (int col = 0; col <= 2; col++) {
            cout << getColorLetter(getColor(FACE::DOWN, row, col)) << " ";
        }
        cout << "\n";
    }
    cout << "\n";
}

vector<RubiksCube::MOVE> RubiksCube::randomShuffleCube(unsigned int times) {
    // Seeded once per process. The previous implementation called srand(time(0))
    // on every invocation, so two shuffles inside the same second produced the
    // identical scramble.
    static mt19937 rng(
            (unsigned)chrono::high_resolution_clock::now().time_since_epoch().count());
    static uniform_int_distribution<int> pick(0, 17);

    vector<MOVE> moves_performed;
    moves_performed.reserve(times);

    // Never turn the same face twice in a row: "R R'" cancels outright and
    // "R R" is just "R2", so unfiltered random moves make the scramble
    // shallower than the requested depth and the reported difficulty a lie.
    int lastFace = -1;
    for (unsigned int i = 0; i < times; i++) {
        int selectMove;
        do {
            selectMove = pick(rng);
        } while (selectMove / 3 == lastFace);
        lastFace = selectMove / 3;

        moves_performed.push_back(static_cast<MOVE>(selectMove));
        this->move(static_cast<MOVE>(selectMove));
    }
    return moves_performed;
}

//Helper function returns string of corner
string RubiksCube::getCornerColorString(uint8_t ind) const {
    string str = "";

    switch (ind) {
//        UFR
        case 0:
            str += getColorLetter(getColor(FACE::UP, 2, 2));
            str += getColorLetter(getColor(FACE::FRONT, 0, 2));
            str += getColorLetter(getColor(FACE::RIGHT, 0, 0));
            break;

//            UFL
        case 1:
            str += getColorLetter(getColor(FACE::UP, 2, 0));
            str += getColorLetter(getColor(FACE::FRONT, 0, 0));
            str += getColorLetter(getColor(FACE::LEFT, 0, 2));
            break;

//            UBL
        case 2:
            str += getColorLetter(getColor(FACE::UP, 0, 0));
            str += getColorLetter(getColor(FACE::BACK, 0, 2));
            str += getColorLetter(getColor(FACE::LEFT, 0, 0));
            break;

//            UBR
        case 3:
            str += getColorLetter(getColor(FACE::UP, 0, 2));
            str += getColorLetter(getColor(FACE::BACK, 0, 0));
            str += getColorLetter(getColor(FACE::RIGHT, 0, 2));
            break;

//            DFR
        case 4:
            str += getColorLetter(getColor(FACE::DOWN, 0, 2));
            str += getColorLetter(getColor(FACE::FRONT, 2, 2));
            str += getColorLetter(getColor(FACE::RIGHT, 2, 0));
            break;

//            DFL
        case 5:
            str += getColorLetter(getColor(FACE::DOWN, 0, 0));
            str += getColorLetter(getColor(FACE::FRONT, 2, 0));
            str += getColorLetter(getColor(FACE::LEFT, 2, 2));
            break;

//            DBR
        case 6:
            str += getColorLetter(getColor(FACE::DOWN, 2, 2));
            str += getColorLetter(getColor(FACE::BACK, 2, 0));
            str += getColorLetter(getColor(FACE::RIGHT, 2, 2));
            break;

//            DBL
        case 7:
            str += getColorLetter(getColor(FACE::DOWN, 2, 0));
            str += getColorLetter(getColor(FACE::BACK, 2, 2));
            str += getColorLetter(getColor(FACE::LEFT, 2, 0));
            break;
    }
    return str;
}

// Facelets of each corner slot, in getCornerColorString() order. The index
// functions below read colours straight from these instead of building a
// string per call: they run three times per IDA* node, so the strings were
// most of the solver's time.
struct Facelet { RubiksCube::FACE face; unsigned row, col; };
typedef RubiksCube::FACE FC;

static const Facelet CORNER_FACELETS[8][3] = {
        {{FC::UP, 2, 2}, {FC::FRONT, 0, 2}, {FC::RIGHT, 0, 0}}, // UFR
        {{FC::UP, 2, 0}, {FC::FRONT, 0, 0}, {FC::LEFT, 0, 2}},  // UFL
        {{FC::UP, 0, 0}, {FC::BACK, 0, 2},  {FC::LEFT, 0, 0}},  // UBL
        {{FC::UP, 0, 2}, {FC::BACK, 0, 0},  {FC::RIGHT, 0, 2}}, // UBR
        {{FC::DOWN, 0, 2}, {FC::FRONT, 2, 2}, {FC::RIGHT, 2, 0}}, // DFR
        {{FC::DOWN, 0, 0}, {FC::FRONT, 2, 0}, {FC::LEFT, 2, 2}},  // DFL
        {{FC::DOWN, 2, 2}, {FC::BACK, 2, 0},  {FC::RIGHT, 2, 2}}, // DBR
        {{FC::DOWN, 2, 0}, {FC::BACK, 2, 2},  {FC::LEFT, 2, 0}},  // DBL
};

static const Facelet EDGE_FACELETS[12][2] = {
        {{FC::UP, 2, 1},    {FC::FRONT, 0, 1}}, // UF
        {{FC::UP, 1, 2},    {FC::RIGHT, 0, 1}}, // UR
        {{FC::UP, 0, 1},    {FC::BACK, 0, 1}},  // UB
        {{FC::UP, 1, 0},    {FC::LEFT, 0, 1}},  // UL
        {{FC::DOWN, 0, 1},  {FC::FRONT, 2, 1}}, // DF
        {{FC::DOWN, 1, 2},  {FC::RIGHT, 2, 1}}, // DR
        {{FC::DOWN, 2, 1},  {FC::BACK, 2, 1}},  // DB
        {{FC::DOWN, 1, 0},  {FC::LEFT, 2, 1}},  // DL
        {{FC::FRONT, 1, 2}, {FC::RIGHT, 1, 0}}, // FR
        {{FC::FRONT, 1, 0}, {FC::LEFT, 1, 2}},  // FL
        {{FC::BACK, 1, 0},  {FC::RIGHT, 1, 2}}, // BR
        {{FC::BACK, 1, 2},  {FC::LEFT, 1, 0}},  // BL
};

static inline int faceletColor(const RubiksCube &cube, const Facelet &f) {
    return (int)cube.getColor(f.face, f.row, f.col);
}

// Colour values: W=0 G=1 R=2 B=3 O=4 Y=5, so opposite pairs are W/Y, G/B, R/O.
static inline bool isWY(int c) { return c == 0 || c == 5; }
static inline bool isRO(int c) { return c == 2 || c == 4; }

// Corner id and orientation for every (colour, colour, colour) triple in slot
// order, indexed a*36 + b*6 + c. Deciding them sticker by sticker branched
// unpredictably on every corner of every node; a table lookup does not.
struct CornerTables {
    uint8_t id[216], ori[216];
    CornerTables() {
        for (int k = 0; k < 216; k++) {
            const int col[3] = {k / 36, (k / 6) % 6, k % 6};
            // Exactly one sticker from each opposite-colour pair must be present.
            int nWY = 0, nRO = 0, nBG = 0, wyPos = 0;
            uint8_t ret = 0;
            for (int i = 0; i < 3; i++) {
                int c = col[i];
                if (isWY(c)) { nWY++; wyPos = i; if (c == 5) ret |= (1 << 2); }
                else if (isRO(c)) { nRO++; if (c == 4) ret |= (1 << 1); }
                else { nBG++; if (c == 1) ret |= (1 << 0); }
            }
            id[k] = (nWY == 1 && nRO == 1 && nBG == 1) ? ret : RubiksCube::INVALID_PIECE;
            // The orientation is the position of the single W/Y sticker.
            ori[k] = nWY == 1 ? (uint8_t)wyPos : RubiksCube::INVALID_PIECE;
        }
    }
};
static const CornerTables CORNER_TABLES;

// Index into CORNER_TABLES, or -1 for a sticker that holds no valid colour.
static inline int cornerKey(const RubiksCube &cube, uint8_t ind) {
    const int a = faceletColor(cube, CORNER_FACELETS[ind][0]);
    const int b = faceletColor(cube, CORNER_FACELETS[ind][1]);
    const int c = faceletColor(cube, CORNER_FACELETS[ind][2]);
    if ((unsigned)a > 5 || (unsigned)b > 5 || (unsigned)c > 5) return -1;
    return a * 36 + b * 6 + c;
}

uint8_t RubiksCube::getCornerIndex(uint8_t ind) const {
    const int k = cornerKey(*this, ind);
    return k < 0 ? INVALID_PIECE : CORNER_TABLES.id[k];
}

uint8_t RubiksCube::getCornerOrientation(uint8_t ind) const {
    // A physically valid corner carries exactly one W/Y sticker; anything else
    // is reported as invalid so callers can reject the cube.
    const int k = cornerKey(*this, ind);
    return k < 0 ? INVALID_PIECE : CORNER_TABLES.ori[k];
}

// 12 edges: primary facelet listed first (U/D for UD-layer, F/B for E-layer)
string RubiksCube::getEdgeColorString(uint8_t ind) const {
    string str = "";
    switch (ind) {
        case 0: // UF
            str += getColorLetter(getColor(FACE::UP, 2, 1));
            str += getColorLetter(getColor(FACE::FRONT, 0, 1));
            break;
        case 1: // UR
            str += getColorLetter(getColor(FACE::UP, 1, 2));
            str += getColorLetter(getColor(FACE::RIGHT, 0, 1));
            break;
        case 2: // UB
            str += getColorLetter(getColor(FACE::UP, 0, 1));
            str += getColorLetter(getColor(FACE::BACK, 0, 1));
            break;
        case 3: // UL
            str += getColorLetter(getColor(FACE::UP, 1, 0));
            str += getColorLetter(getColor(FACE::LEFT, 0, 1));
            break;
        case 4: // DF
            str += getColorLetter(getColor(FACE::DOWN, 0, 1));
            str += getColorLetter(getColor(FACE::FRONT, 2, 1));
            break;
        case 5: // DR
            str += getColorLetter(getColor(FACE::DOWN, 1, 2));
            str += getColorLetter(getColor(FACE::RIGHT, 2, 1));
            break;
        case 6: // DB
            str += getColorLetter(getColor(FACE::DOWN, 2, 1));
            str += getColorLetter(getColor(FACE::BACK, 2, 1));
            break;
        case 7: // DL
            str += getColorLetter(getColor(FACE::DOWN, 1, 0));
            str += getColorLetter(getColor(FACE::LEFT, 2, 1));
            break;
        case 8: // FR
            str += getColorLetter(getColor(FACE::FRONT, 1, 2));
            str += getColorLetter(getColor(FACE::RIGHT, 1, 0));
            break;
        case 9: // FL
            str += getColorLetter(getColor(FACE::FRONT, 1, 0));
            str += getColorLetter(getColor(FACE::LEFT, 1, 2));
            break;
        case 10: // BR
            str += getColorLetter(getColor(FACE::BACK, 1, 0));
            str += getColorLetter(getColor(FACE::RIGHT, 1, 2));
            break;
        case 11: // BL
            str += getColorLetter(getColor(FACE::BACK, 1, 2));
            str += getColorLetter(getColor(FACE::LEFT, 1, 0));
            break;
    }
    return str;
}

uint8_t RubiksCube::getEdgeIndex(uint8_t ind) const {
    // lookup[color1][color2] = edge identity (0-11)
    static const uint8_t lookup[6][6] = {
      // W    G    R    B    O    Y
        {255,  3,  0,  1,  2, 255}, // W
        {  3,255,  9,255, 11,   7}, // G
        {  0,  9,255,  8, 255,  4}, // R
        {  1,255,  8,255, 10,   5}, // B
        {  2, 11,255, 10, 255,  6}, // O
        {255,  7,  4,  5,  6, 255}, // Y
    };
    const int a = faceletColor(*this, EDGE_FACELETS[ind][0]);
    const int b = faceletColor(*this, EDGE_FACELETS[ind][1]);
    if (a < 0 || a > 5 || b < 0 || b > 5) return INVALID_PIECE;
    const uint8_t id = lookup[a][b];
    // 255 marks an impossible pair (two identical or two opposite colours).
    return id == 255 ? INVALID_PIECE : id;
}

uint8_t RubiksCube::getEdgeOrientation(uint8_t ind) const {
    // c1 is the primary facelet (U/D face for UD-layer, F/B face for E-layer).
    const int c1 = faceletColor(*this, EDGE_FACELETS[ind][0]);
    const int c2 = faceletColor(*this, EDGE_FACELETS[ind][1]);

    // UD-type edge (contains W or Y): reference sticker is W/Y
    if (isWY(c1) || isWY(c2)) return isWY(c1) ? 0 : 1;
    // E-type edge (no W/Y): reference sticker is R/O
    return isRO(c1) ? 0 : 1;
}
