// Global test setup for environment variable isolation
import { afterEach, beforeEach, vi } from 'vitest';

// Store original environment variables to restore them after each test
let originalEnv: NodeJS.ProcessEnv;
let originalCwd: string;

beforeEach(() => {
  // Capture the original environment state
  originalEnv = { ...process.env };
  originalCwd = process.cwd();
  
  // Clear timers and unstub globals/envs
  vi.clearAllTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  
  // Note: vitest.config.ts now handles mock cleanup automatically between files
  // Individual test files still need to manage their own mock clearing in beforeEach/afterEach
  // This ensures test isolation within files while vitest handles inter-file isolation
});

afterEach(() => {
  // Restore original working directory
  try {
    process.chdir(originalCwd);
  } catch (e) {
    // Ignore if original directory no longer exists
  }
  
  // Restore original environment to prevent pollution between tests
  // Clear any new environment variables that were added
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  
  // Restore original values
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  
  // Additional cleanup for better test isolation
  vi.clearAllTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});