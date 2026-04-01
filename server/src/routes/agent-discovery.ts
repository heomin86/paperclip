import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agentDiscoveryService } from "../services/agent-discovery.js";
import { assertCompanyAccess } from "./authz.js";

export function agentDiscoveryRoutes(db: Db) {
  const router = Router();
  const discovery = agentDiscoveryService(db);

  // GET /companies/:companyId/discover-agents - scan for available agents
  router.get("/companies/:companyId/discover-agents", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    try {
      const gatewayUrl = (req.query.gatewayUrl as string) || undefined;

      const [localAgents, gatewayAgents] = await Promise.all([
        discovery.scanLocalAgents(companyId),
        gatewayUrl ? discovery.discoverGatewayAgents(companyId, gatewayUrl) : Promise.resolve([]),
      ]);

      const agents = [...localAgents, ...gatewayAgents];

      res.json({
        agents,
        total: agents.length,
        available: agents.filter((a) => a.status === "available").length,
        alreadyImported: agents.filter((a) => a.alreadyImported).length,
      });
    } catch (err) {
      console.error("Failed to discover agents:", err);
      res.status(500).json({ error: "Failed to discover agents" });
    }
  });

  // POST /companies/:companyId/discover-agents/import - import a discovered agent
  router.post("/companies/:companyId/discover-agents/import", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { adapterType, name, role, reportsTo, suggestedConfig } = req.body as {
      adapterType: string;
      name?: string;
      role?: string;
      reportsTo?: string;
      suggestedConfig?: Record<string, unknown>;
    };

    if (!adapterType) {
      res.status(400).json({ error: "adapterType is required" });
      return;
    }

    try {
      const agent = await discovery.importAgent(
        companyId,
        {
          adapterType,
          name: name || adapterType,
          version: null,
          status: "available",
          capabilities: [],
          suggestedConfig: suggestedConfig || {},
          alreadyImported: false,
        },
        { name, role, reportsTo },
      );

      res.status(201).json(agent);
    } catch (err) {
      console.error("Failed to import discovered agent:", err);
      res.status(500).json({ error: "Failed to import discovered agent" });
    }
  });

  return router;
}
