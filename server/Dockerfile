# Stage 1: Compile C++ solver
FROM gcc:13 AS builder

RUN apt-get update && apt-get install -y cmake && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY CMakeLists.txt .
COPY solver_api.cpp .
COPY main.cpp .
COPY Model/ Model/
COPY PatternDatabases/ PatternDatabases/
COPY Solver/ Solver/

RUN cmake -B out -DCMAKE_BUILD_TYPE=Release && \
    cmake --build out --target solver_api --config Release

# Stage 2: Node.js runtime
FROM node:20-slim

WORKDIR /app

COPY --from=builder /build/out/solver_api ./solver_api
RUN chmod +x ./solver_api

COPY Databases/cornerDepth5V1.txt ./Databases/cornerDepth5V1.txt

COPY server/package.json server/package-lock.json* server/index.js ./
RUN npm ci --omit=dev || npm install --omit=dev

ENV SOLVER_PATH=/app/solver_api
ENV DB_PATH=/app/Databases/cornerDepth5V1.txt

EXPOSE 3001

CMD ["node", "index.js"]
