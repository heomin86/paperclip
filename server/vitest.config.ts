import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    isolate: true,
    // Force sequential execution to avoid mock pollution
    fileParallelism: false,
    // Enable aggressive mock cleanup to prevent pollution between test files
    clearMocks: true, // Auto-clear mocks between test files
    restoreMocks: true, // Auto-restore mocks between test files
    unstubGlobals: true,
    unstubEnvs: true,
    // Reset modules between test files to prevent module mock pollution
    mockReset: true, // Auto-reset mocks between test files
    // Force module cache invalidation to prevent mock pollution
    cache: false,
    // Global test setup for environment variable isolation
    setupFiles: ["./src/test-setup.ts"],
  },
});
