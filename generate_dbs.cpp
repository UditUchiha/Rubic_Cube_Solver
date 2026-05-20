#include <bits/stdc++.h>
#include "PatternDatabases/CornerDBMaker.h"
#include "PatternDatabases/EdgeDBMaker.h"

using namespace std;

int main(int argc, char *argv[]) {
    string cornerFile = "Databases/corner.db";
    string edge1File  = "Databases/edge1.db";
    string edge2File  = "Databases/edge2.db";

    bool genCorner = true, genEdge1 = true, genEdge2 = true;

    if (argc > 1) {
        string which = argv[1];
        genCorner = (which == "corner" || which == "all");
        genEdge1  = (which == "edge1"  || which == "all");
        genEdge2  = (which == "edge2"  || which == "all");
    }

    if (genCorner) {
        cout << "=== Generating Corner DB ===" << endl;
        CornerDBMaker maker(cornerFile, 0xFF);
        maker.bfsAndStore();
        cout << "Corner DB saved to " << cornerFile << endl << endl;
    }

    if (genEdge1) {
        cout << "=== Generating Edge Group 1 DB (edges 0-5) ===" << endl;
        EdgeDBMaker maker(edge1File, 0, 0xFF);
        maker.bfsAndStore();
        cout << "Edge1 DB saved to " << edge1File << endl << endl;
    }

    if (genEdge2) {
        cout << "=== Generating Edge Group 2 DB (edges 6-11) ===" << endl;
        EdgeDBMaker maker(edge2File, 1, 0xFF);
        maker.bfsAndStore();
        cout << "Edge2 DB saved to " << edge2File << endl << endl;
    }

    cout << "Done!" << endl;
    return 0;
}
