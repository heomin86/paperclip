import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { findServerAdapter, listServerAdapters } from "../adapters/index.js";
import type { AdapterEnvironmentTestResult } from "../adapters/types.js";
import { logger } from "../middleware/logger.js";

const execAsync = promisify(exec);

export interface DiscoveredAgent {
  adapterType: string;
  name: string;
  version: string | null;
  status: "available" | "unavailable" | "error";
  capabilities: string[];
  suggestedConfig: Record<string, unknown>;
  alreadyImported: boolean;
  existingAgentId?: string;
  environmentTest?: AdapterEnvironmentTestResult;
}

interface LocalAgentSpec {
  command: string;
  adapterType: string;
  name: string;
  versionFlag?: string;
}

const LOCAL_AGENT_SPECS: LocalAgentSpec[] = [
  { command: "hermes", adapterType: "hermes_local", name: "Hermes Agent", versionFlag: "--version" },
  { command: "claude", adapterType: "claude_local", name: "Claude Code", versionFlag: "--version" },
  { command: "codex", adapterType: "codex_local", name: "Codex", versionFlag: "--version" },
  { command: "opencode", adapterType: "opencode_local", name: "OpenCode", versionFlag: "--version" },
  { command: "gemini", adapterType: "gemini_local", name: "Gemini CLI", versionFlag: "--version" },
  { command: "cursor", adapterType: "cursor", name: "Cursor", versionFlag: "--version" },
];

async function whichCommand(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`which ${cmd}`, { timeout: 5000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getVersion(cmd: string, flag: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`${cmd} ${flag} 2>/dev/null`, { timeout: 10000 });
    // Extract version-like string from output
    const match = stdout.trim().match(/[\d]+\.[\d]+\.[\d]+[\w.-]*/);
    return match ? match[0] : stdout.trim().split("\n")[0] || null;
  } catch {
    return null;
  }
}

export function agentDiscoveryService(db: Db) {
  async function scanLocalAgents(companyId: string): Promise<DiscoveredAgent[]> {
    // Get already-imported agents for this company
    const existingAgents = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.companyId, companyId));

    const importedAdapterTypes = new Map(
      existingAgents.map((a) => [a.adapterType, a.id]),
    );

    const results: DiscoveredAgent[] = [];

    await Promise.all(
      LOCAL_AGENT_SPECS.map(async (spec) => {
        const path = await whichCommand(spec.command);
        if (!path) return;

        let version: string | null = null;
        let envTest: AdapterEnvironmentTestResult | undefined;
        let status: DiscoveredAgent["status"] = "available";
        const capabilities: string[] = [];

        // Get version info
        if (spec.versionFlag) {
          version = await getVersion(spec.command, spec.versionFlag);
        }

        // Run testEnvironment via adapter registry
        const adapter = findServerAdapter(spec.adapterType);
        if (adapter?.testEnvironment) {
          try {
            envTest = await adapter.testEnvironment({
              companyId,
              adapterType: spec.adapterType,
              config: {},
            });
            status = envTest.status === "pass" ? "available" : "unavailable";
          } catch {
            status = "error";
          }
        }

        // Detect capabilities
        if (adapter?.listSkills) capabilities.push("skills");
        if (adapter?.syncSkills) capabilities.push("skill_sync");
        if (adapter?.sessionCodec) capabilities.push("sessions");
        if (adapter?.sessionManagement) capabilities.push("session_management");
        if (adapter?.getQuotaWindows) capabilities.push("quota");
        if (adapter?.supportsLocalAgentJwt) capabilities.push("jwt_auth");

        const alreadyImported = importedAdapterTypes.has(spec.adapterType);

        results.push({
          adapterType: spec.adapterType,
          name: spec.name,
          version,
          status,
          capabilities,
          suggestedConfig: {},
          alreadyImported,
          existingAgentId: alreadyImported ? importedAdapterTypes.get(spec.adapterType) : undefined,
          environmentTest: envTest,
        });
      }),
    );

    // Sort: available first, then by name
    results.sort((a, b) => {
      if (a.status === "available" && b.status !== "available") return -1;
      if (a.status !== "available" && b.status === "available") return 1;
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  async function discoverGatewayAgents(
    companyId: string,
    gatewayUrl: string,
  ): Promise<DiscoveredAgent[]> {
    try {
      const response = await fetch(`${gatewayUrl}/agents`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Gateway responded with ${response.status}`);
      }

      const data = (await response.json()) as {
        agents?: Array<{
          id?: string;
          name?: string;
          model?: string;
          status?: string;
        }>;
      };

      if (!data.agents || !Array.isArray(data.agents)) {
        return [];
      }

      const existingAgents = await db
        .select()
        .from(agentsTable)
        .where(eq(agentsTable.companyId, companyId));

      const importedGatewayIds = new Map(
        existingAgents
          .filter((a) => a.adapterType === "openclaw_gateway")
          .map((a) => {
            const config = (a.adapterConfig ?? {}) as Record<string, unknown>;
            return [config.gatewayAgentId as string, a.id];
          }),
      );

      return data.agents.map((ga) => {
        const gatewayId = ga.id || ga.name || "";
        const alreadyImported = importedGatewayIds.has(gatewayId);
        return {
          adapterType: "openclaw_gateway",
          name: ga.name || gatewayId,
          version: null,
          status: (ga.status === "ready" ? "available" : "unavailable") as DiscoveredAgent["status"],
          capabilities: ["gateway"],
          suggestedConfig: {
            gatewayUrl,
            gatewayAgentId: gatewayId,
            model: ga.model || undefined,
          },
          alreadyImported,
          existingAgentId: alreadyImported ? importedGatewayIds.get(gatewayId) : undefined,
        };
      });
    } catch (err) {
      logger.error({ err }, "Failed to discover gateway agents");
      return [];
    }
  }

  async function importAgent(
    companyId: string,
    discovery: DiscoveredAgent,
    options?: {
      name?: string;
      role?: string;
      reportsTo?: string;
    },
  ) {
    const agentService = await import("./agents.js");
    const svc = agentService.agentService(db);

    const name = options?.name || discovery.name;
    const role = options?.role || "engineer";

    const agent = await svc.create(companyId, {
      name,
      role,
      adapterType: discovery.adapterType,
      adapterConfig: discovery.suggestedConfig,
      reportsTo: options?.reportsTo ?? null,
      status: "idle",
      spentMonthlyCents: 0,
      lastHeartbeatAt: null,
    });

    return agent;
  }

  return {
    scanLocalAgents,
    discoverGatewayAgents,
    importAgent,
  };
}
