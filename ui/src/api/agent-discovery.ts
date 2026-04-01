import { api } from "./client";

export interface DiscoveredAgent {
  adapterType: string;
  name: string;
  version: string | null;
  status: "available" | "unavailable" | "error";
  capabilities: string[];
  suggestedConfig: Record<string, unknown>;
  alreadyImported: boolean;
  existingAgentId?: string;
  environmentTest?: {
    status: string;
    checks: Array<{ label: string; level: string; ok: boolean; message?: string }>;
  };
}

export interface DiscoverAgentsResponse {
  agents: DiscoveredAgent[];
  total: number;
  available: number;
  alreadyImported: number;
}

export const agentDiscoveryApi = {
  discover: (companyId: string, gatewayUrl?: string) => {
    const params = gatewayUrl ? `?gatewayUrl=${encodeURIComponent(gatewayUrl)}` : "";
    return api.get<DiscoverAgentsResponse>(
      `/companies/${companyId}/discover-agents${params}`,
    );
  },

  import: (
    companyId: string,
    agent: {
      adapterType: string;
      name?: string;
      role?: string;
      reportsTo?: string;
      suggestedConfig?: Record<string, unknown>;
    },
  ) =>
    api.post<unknown>(`/companies/${companyId}/discover-agents/import`, agent),
};
