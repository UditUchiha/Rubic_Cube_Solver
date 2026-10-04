#ifndef RUBIKS_CUBE_SOLVER_CUBEVALIDATION_H
#define RUBIKS_CUBE_SOLVER_CUBEVALIDATION_H

#include "RubiksCube.h"

/*
 * Solvability checking.
 *
 * Counting nine stickers per colour and pinning the six centres is NOT enough
 * to know a cube can be solved. Only 1/12 of the states that pass those two
 * checks are reachable by turning a real cube; the rest need a piece prised out
 * and pushed back in. Three invariants separate them:
 *
 *   1. Corner twists sum to 0 (mod 3)   -- no single corner may be rotated.
 *   2. Edge flips sum to 0 (mod 2)      -- no single edge may be flipped.
 *   3. Corner and edge permutations have equal parity -- no two pieces swapped.
 *
 * This matters far more than it looks. Handed an unsolvable cube, IDA* cannot
 * fail fast: it deepens to the God's-number bound, and the last few iterations
 * take longer than every earlier one combined. In the web app that shows up as
 * a request that burns the full solver timeout, gets SIGKILLed, and then blocks
 * every other user for the ~30s it takes to reload the databases. Rejecting the
 * cube up front turns that into an instant, explanatory error.
 */

/*
 * getCornerIndex() identifies a corner by its colours: bit2 = has yellow,
 * bit1 = has orange, bit0 = has green. That ordering is NOT the slot ordering
 * used by getCornerColorString(), which runs UFR, UFL, UBL, UBR, ...
 *
 *   slot 2 = UBL = white+orange+green -> id 3
 *   slot 3 = UBR = white+orange+blue  -> id 2
 *
 * so the two differ by a single 2<->3 transposition. Mapping ids back to their
 * home slots is what makes a solved cube come out as the identity permutation;
 * without it the solved cube reads as one transposition away from identity and
 * every legal cube is rejected for "opposite parity".
 *
 * getEdgeIndex() already returns home slots directly, so edges need no remap.
 */
static const uint8_t CORNER_ID_TO_HOME_SLOT[8] = {0, 1, 3, 2, 4, 5, 6, 7};

/*
 * getCornerOrientation() returns the position (0, 1 or 2) of the white/yellow
 * sticker within the slot's facelet triple. Those triples are not all listed in
 * the same rotational direction: taking the face normals in the order
 * getCornerColorString() emits them,
 *
 *   UFR[U,F,R] UBL[U,B,L] DFL[D,F,L] DBR[D,B,R]  are right-handed  (+1)
 *   UFL[U,F,L] UBR[U,B,R] DFR[D,F,R] DBL[D,B,L]  are left-handed   (-1)
 *
 * so on the left-handed slots the value counts twists the opposite way round.
 * Summed raw, the total is uniformly spread over 0/1/2 and carries no
 * information; negating the left-handed slots (o -> (3-o)%3) makes the sum
 * exactly 0 for every reachable state, verified over 30000 random scrambles.
 *
 * The pattern database is unaffected and must not be changed: per-corner
 * relabelling is a bijection on {0,1,2}, so the raw values still index corner
 * states uniquely and the stored heuristic stays admissible.
 */
static const int CORNER_CHIRALITY[8] = {+1, -1, +1, -1, -1, +1, +1, -1};

inline int correctedCornerTwist(uint8_t slot, uint8_t orientation) {
    return CORNER_CHIRALITY[slot] > 0 ? orientation : (3 - orientation) % 3;
}

inline bool isCubeSolvable(const RubiksCube &cube, std::string &error) {
    // ---- Corners: identity, completeness, twist ----
    int cornerSeen[8] = {0};
    int cornerPerm[8];
    int twistSum = 0;

    for (uint8_t i = 0; i < 8; i++) {
        uint8_t id = cube.getCornerIndex(i);
        uint8_t ori = cube.getCornerOrientation(i);

        if (id == RubiksCube::INVALID_PIECE || id >= 8 ||
            ori == RubiksCube::INVALID_PIECE) {
            error = "Corner piece " + std::to_string(i + 1) +
                    " (" + cube.getCornerColorString(i) + ") is not a real corner.";
            return false;
        }
        if (cornerSeen[id]++) {
            error = "Two corners have the same three colours (" +
                    cube.getCornerColorString(i) + ").";
            return false;
        }
        cornerPerm[i] = CORNER_ID_TO_HOME_SLOT[id];
        twistSum += correctedCornerTwist(i, ori);
    }

    if (twistSum % 3 != 0) {
        error = "A corner is twisted in place - one corner needs rotating "
                "(corner twists must sum to a multiple of 3).";
        return false;
    }

    // ---- Edges: identity, completeness, flip ----
    int edgeSeen[12] = {0};
    int edgePerm[12];
    int flipSum = 0;

    for (uint8_t i = 0; i < 12; i++) {
        uint8_t id = cube.getEdgeIndex(i);
        if (id == RubiksCube::INVALID_PIECE || id >= 12) {
            error = "Edge piece " + std::to_string(i + 1) +
                    " (" + cube.getEdgeColorString(i) + ") is not a real edge.";
            return false;
        }
        if (edgeSeen[id]++) {
            error = "Two edges have the same two colours (" +
                    cube.getEdgeColorString(i) + ").";
            return false;
        }
        edgePerm[i] = id;
        flipSum += cube.getEdgeOrientation(i);
    }

    if (flipSum % 2 != 0) {
        error = "An edge is flipped in place - one edge needs turning around "
                "(edge flips must sum to an even number).";
        return false;
    }

    // ---- Permutation parity: corners and edges must agree ----
    // Parity of a permutation = (number of elements - number of cycles) mod 2.
    auto parityOf = [](const int *perm, int n) {
        std::vector<bool> visited(n, false);
        int transpositions = 0;
        for (int i = 0; i < n; i++) {
            if (visited[i]) continue;
            int len = 0;
            for (int j = i; !visited[j]; j = perm[j]) {
                visited[j] = true;
                len++;
            }
            transpositions += len - 1;
        }
        return transpositions % 2;
    };

    if (parityOf(cornerPerm, 8) != parityOf(edgePerm, 12)) {
        error = "Two pieces are swapped - the corner and edge permutations "
                "have opposite parity.";
        return false;
    }

    error.clear();
    return true;
}

#endif //RUBIKS_CUBE_SOLVER_CUBEVALIDATION_H
