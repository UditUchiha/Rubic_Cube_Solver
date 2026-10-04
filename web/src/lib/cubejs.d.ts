declare module 'cubejs' {
  class Cube {
    /**
     * Build the Kociemba pruning tables. Takes roughly 1.5-3s and must be
     * called once before solve(). Blocks the thread it runs on, which is why
     * this project only ever calls it inside a worker.
     */
    static initSolver(): void;
    static fromString(state: string): Cube;
    static random(): Cube;
    /** Returns a space-separated move list, or null if none within maxDepth. */
    solve(maxDepth?: number): string | null;
    isSolved(): boolean;
    asString(): string;
  }
  export default Cube;
}
