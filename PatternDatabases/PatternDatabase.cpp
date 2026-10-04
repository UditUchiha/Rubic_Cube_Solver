//
// Created by Lakshya Mittal on 17-02-2022.
//

#include "PatternDatabase.h"

using namespace std;

PatternDatabase::PatternDatabase(const size_t size) :
        database(size, 0xFF), size(size), numItems(0) {
}

PatternDatabase::PatternDatabase(const size_t size, uint8_t init_val) :
        database(size, init_val), size(size), numItems(0) {
}

// If the index is already set, it does nothing and returns false
// Else it sets ind and returns true

bool PatternDatabase::setNumMoves(const uint32_t ind, const uint8_t numMoves) {
    uint8_t oldMoves = this->getNumMoves(ind);

//    New item is getting added
    if(oldMoves == 0xF){
        ++this->numItems;
    }

    if(oldMoves > numMoves){
        this->database.set(ind, numMoves);
        return true;
    }
    return false;

}

bool PatternDatabase::setNumMoves(const RubiksCube &cube, const uint8_t numMoves) {
    return this->setNumMoves(this->getDatabaseIndex(cube), numMoves);
}

uint8_t PatternDatabase::getNumMoves(const uint32_t ind) const {
    return this->database.get(ind);
}

uint8_t PatternDatabase::getNumMoves(const RubiksCube &cube) const {
    return this->getNumMoves(this->getDatabaseIndex(cube));
}

size_t PatternDatabase::getSize() const {
    return this->size;
}

size_t PatternDatabase::getNumItems() const {
    return this->numItems;
}

bool PatternDatabase::isFull() const {
    return this->numItems == this->size;
}

void PatternDatabase::toFile(const string &filePath) const {

    ofstream writer(filePath, ios::out | ios::binary | ios::trunc);

    if(!writer.is_open())
        throw runtime_error("Failed to open '" + filePath + "' for writing");

    writer.write(
            reinterpret_cast<const char*>(this->database.data()),
            this->database.storageSize()
            );

    if(!writer.good())
        throw runtime_error("Failed while writing '" + filePath + "'");

    writer.close();
}

// Returns true of database is loaded successfully
// else return false

bool PatternDatabase::fromFile(const string &filePath) {
    // ios::binary is REQUIRED. Without it the stream opens in text mode on
    // Windows, where the CRT stops at the first 0x1A (Ctrl-Z) byte and
    // collapses CRLF pairs. The corner database contains a 0x1A at offset
    // 18108360, so a text-mode read silently returned only 41% of the file
    // and left the rest at the 0xFF "unknown" fill -- which the IDA*
    // heuristic reads as 0, degrading the search to uninformed IDDFS.
    ifstream reader(filePath, ios::in | ios::binary | ios::ate);

    if(!reader.is_open())
        return false;

    const size_t expected = this->database.storageSize();
    const streamoff fileSize = reader.tellg();

    if(fileSize < 0 || (size_t)fileSize != expected){
        reader.close();
        throw runtime_error(
                "Database '" + filePath + "' is corrupt: expected " +
                to_string(expected) + " bytes, found " + to_string(fileSize));
    }

    reader.seekg(0, ios::beg);
    reader.read(
            reinterpret_cast<char*> (this->database.data()),
            expected
            );

    const size_t got = (size_t)reader.gcount();
    reader.close();

    if(got != expected)
        throw runtime_error(
                "Database '" + filePath + "' was truncated on read: got " +
                to_string(got) + " of " + to_string(expected) + " bytes");

    this->numItems = this->size;
    return true;
}

vector<uint8_t> PatternDatabase::inflate() const {
    vector<uint8_t> inflated;
    this->database.inflate(inflated);
    return inflated;
}

void PatternDatabase::reset() {
    if(this->numItems != 0){
        this->database.reset(0xFF);
        this->numItems = 0;
    }
}