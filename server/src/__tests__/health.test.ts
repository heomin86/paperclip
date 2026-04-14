import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Db } from "@paperclipai/db";
import { healthRoutes } from "../routes/health.js";
import * as devServerStatus from "../dev-server-status.js";
import { serverVersion } from "../version.js";

describe("GET /health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.spyOn(devServerStatus, "readPersistedDevServerStatus").mockReturnValue(undefined);
  });

  afterEach(() => {
    // Don't use vi.restoreAllMocks() as it interferes with hoisted mocks in other test files
    // Only clear the mocks we set up in this file
  });

  it("returns 200 with status ok", async () => {
    const app = express();
    app.use("/health", healthRoutes());

    const res = await request(app).get("/health/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", version: serverVersion });
  });

  it("returns 200 when the database probe succeeds", async () => {
    // Create a mock that handles the Drizzle query builder pattern
    const mockQueryBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      then: vi.fn().mockResolvedValue([{ count: 1 }]),
    };

    const db = {
      execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      select: vi.fn().mockReturnValue(mockQueryBuilder),
    } as unknown as Db;

    const app = express();
    app.use("/health", healthRoutes(db));

    const res = await request(app).get("/health/");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", version: serverVersion });
  });

  it("returns 503 when the database probe fails", async () => {
    const db = {
      execute: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
      select: vi.fn().mockImplementation(() => {
        throw new Error("connect ECONNREFUSED");
      }),
    } as unknown as Db;
    const app = express();
    app.use("/health", healthRoutes(db));

    const res = await request(app).get("/health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: "unhealthy",
      version: serverVersion,
      error: "database_unreachable",
    });
  });
});
