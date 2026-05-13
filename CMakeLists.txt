cmake_minimum_required(VERSION 3.20)
project(rubiks_cube_solver)

set(CMAKE_CXX_STANDARD 14)

include_directories(Model)

set(COMMON_SOURCES
        Model/RubiksCube.cpp
        Model/RubiksCube.h
        Model/RubiksCube3dArray.cpp
        Model/RubiksCube1dArray.cpp
        Model/RubiksCubeBitboard.cpp
        Solver/DFSSolver.h
        Solver/BFSSolver.h
        Solver/IDDFSSolver.h
        Model/PatternDatabase/PatternDatabase.h
        Solver/IDAstarSolver.h
        PatternDatabases/NibbleArray.cpp
        PatternDatabases/NibbleArray.h
        PatternDatabases/PatternDatabase.cpp
        PatternDatabases/PatternDatabase.h
        PatternDatabases/PermutationIndexer.h
        PatternDatabases/CornerPatternDatabase.cpp
        PatternDatabases/CornerPatternDatabase.h
        PatternDatabases/CornerDBMaker.cpp
        PatternDatabases/CornerDBMaker.h
        PatternDatabases/math.cpp
        PatternDatabases/math.h)

add_executable(rubiks_cube_solver
        main.cpp
        ${COMMON_SOURCES})

add_executable(solver_api
        solver_api.cpp
        ${COMMON_SOURCES})

# Statically link libstdc++ and libgcc so the binary has no runtime
# dependency on the host's libstdc++ version (fixes GLIBCXX_3.4.32 error
# when running a GCC-13-built binary inside node:20-slim).
target_link_options(solver_api PRIVATE -static-libstdc++ -static-libgcc)
