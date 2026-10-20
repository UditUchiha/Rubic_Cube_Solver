cmake_minimum_required(VERSION 3.20)
project(rubiks_cube_solver)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# The solver is a brute-force tree search; an unoptimised build is roughly
# 5-10x slower, which is the difference between solving a 13-move scramble
# in seconds and timing out. Default to Release when the caller did not pick.
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
    set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS
            Debug Release RelWithDebInfo MinSizeRel)
endif()

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
        Solver/IDAstarSolver.h
        Solver/TwoPhaseSolver.h
        Model/CubeValidation.h
        PatternDatabases/NibbleArray.cpp
        PatternDatabases/NibbleArray.h
        PatternDatabases/PatternDatabase.cpp
        PatternDatabases/PatternDatabase.h
        PatternDatabases/PermutationIndexer.h
        PatternDatabases/CornerPatternDatabase.cpp
        PatternDatabases/CornerPatternDatabase.h
        PatternDatabases/CornerDBMaker.cpp
        PatternDatabases/CornerDBMaker.h
        PatternDatabases/EdgePatternDatabase.cpp
        PatternDatabases/EdgePatternDatabase.h
        PatternDatabases/EdgeDBMaker.cpp
        PatternDatabases/EdgeDBMaker.h
        PatternDatabases/math.cpp
        PatternDatabases/math.h)

add_executable(rubiks_cube_solver
        main.cpp
        ${COMMON_SOURCES})

add_executable(solver_api
        solver_api.cpp
        ${COMMON_SOURCES})

add_executable(generate_dbs
        generate_dbs.cpp
        ${COMMON_SOURCES})

add_executable(test_two_phase
        test_two_phase.cpp
        ${COMMON_SOURCES})

# Statically link libstdc++ and libgcc on every target, not just solver_api.
# On Linux this avoids the GLIBCXX_3.4.32 error when a GCC-13-built binary runs
# inside node:20-slim. On Windows it matters just as much: whichever
# libstdc++-6.dll appears first on PATH wins, and picking up the one shipped
# with Git for Windows instead of the toolchain's own segfaults on startup.
if(NOT MSVC)
    foreach(target rubiks_cube_solver solver_api generate_dbs test_two_phase)
        target_link_options(${target} PRIVATE -static-libstdc++ -static-libgcc)
    endforeach()
endif()
