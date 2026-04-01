import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { agentDiscoveryApi, type DiscoveredAgent } from "../api/agent-discovery";
import { queryKeys } from "../lib/queryKeys";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Check,
  Code,
  Gem,
  Loader2,
  MousePointer2,
  Radar,
  Sparkles,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OpenCodeLogoIcon } from "./OpenCodeLogoIcon";
import { HermesIcon } from "./HermesIcon";
import type { ComponentType } from "react";

const ADAPTER_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  claude_local: Sparkles,
  codex_local: Code,
  gemini_local: Gem,
  opencode_local: OpenCodeLogoIcon,
  hermes_local: HermesIcon,
  cursor: MousePointer2,
  pi_local: Terminal,
  openclaw_gateway: Bot,
};

interface DiscoverAgentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DiscoverAgentsDialog({ open, onOpenChange }: DiscoverAgentsDialogProps) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [importingAdapterType, setImportingAdapterType] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["agent-discovery", selectedCompanyId],
    queryFn: () => agentDiscoveryApi.discover(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
    staleTime: 0,
  });

  const importMutation = useMutation({
    mutationFn: (agent: DiscoveredAgent) => {
      setImportingAdapterType(agent.adapterType);
      return agentDiscoveryApi.import(selectedCompanyId!, {
        adapterType: agent.adapterType,
        name: agent.name,
        suggestedConfig: agent.suggestedConfig,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      refetch();
      setImportingAdapterType(null);
    },
    onError: () => {
      setImportingAdapterType(null);
    },
  });

  const agents = data?.agents ?? [];
  const scanning = isLoading || isFetching;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg p-0 gap-0 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <span className="text-sm text-muted-foreground">Discover Agents</span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {/* Description + scan button */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Scan your system for installed CLI agents.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={scanning}
            >
              {scanning ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Radar className="h-3.5 w-3.5 mr-1.5" />
              )}
              {scanning ? "Scanning…" : "Scan"}
            </Button>
          </div>

          {/* Results */}
          {scanning && agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <p className="text-sm">Scanning for installed agents…</p>
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Radar className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No agents found on this system.</p>
              <p className="text-xs mt-1">
                Install a CLI agent (claude, codex, gemini, etc.) and scan again.
              </p>
            </div>
          ) : (
            <>
              {data && (
                <div className="text-xs text-muted-foreground">
                  Found {data.total} agent{data.total !== 1 ? "s" : ""} ·{" "}
                  {data.available} available ·{" "}
                  {data.alreadyImported} already imported
                </div>
              )}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {agents.map((agent) => {
                  const Icon = ADAPTER_ICONS[agent.adapterType] ?? Bot;
                  const isImporting = importingAdapterType === agent.adapterType && importMutation.isPending;

                  return (
                    <div
                      key={agent.adapterType}
                      className={cn(
                        "flex items-center gap-3 rounded-md border border-border p-3 transition-colors",
                        agent.status === "available" && !agent.alreadyImported
                          ? "hover:bg-accent/50"
                          : "opacity-70",
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent">
                        <Icon className="h-4.5 w-4.5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{agent.name}</span>
                          {agent.version && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              v{agent.version}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={cn(
                              "text-[10px] font-medium",
                              agent.status === "available"
                                ? "text-green-600 dark:text-green-400"
                                : agent.status === "error"
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-yellow-600 dark:text-yellow-400",
                            )}
                          >
                            {agent.status === "available"
                              ? "Ready"
                              : agent.status === "error"
                                ? "Error"
                                : "Not configured"}
                          </span>
                          {agent.capabilities.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              · {agent.capabilities.slice(0, 3).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {agent.alreadyImported ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Check className="h-3.5 w-3.5" />
                            Imported
                          </span>
                        ) : agent.status === "available" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isImporting}
                            onClick={() => importMutation.mutate(agent)}
                          >
                            {isImporting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Import"
                            )}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unavailable</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
