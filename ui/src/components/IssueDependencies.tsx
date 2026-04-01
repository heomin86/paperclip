import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  issueDependenciesApi,
  type IssueDependencyRef,
  type IssueDependencies as IssueDependenciesData,
} from "../api/issue-dependencies";
import type { Issue } from "@paperclipai/shared";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Link2, Plus, Trash2, X } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Props {
  issue: Issue;
  /** Available issues to pick from when adding a dependency. */
  availableIssues?: Pick<Issue, "id" | "identifier" | "title" | "status">[];
}

const DONE_STATUSES = new Set(["done", "cancelled"]);

/* -------------------------------------------------------------------------- */
/*  Dependency row                                                             */
/* -------------------------------------------------------------------------- */

function DepRow({
  dep,
  onRemove,
  removing,
}: {
  dep: IssueDependencyRef;
  onRemove: (depId: string) => void;
  removing: boolean;
}) {
  const met = DONE_STATUSES.has(dep.status);
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
      {met ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      )}
      <span className="font-mono text-xs text-muted-foreground">{dep.identifier ?? dep.issueId.slice(0, 8)}</span>
      <span className="truncate">{dep.title}</span>
      <span
        className={cn(
          "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
          met ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
        )}
      >
        {dep.status}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        disabled={removing}
        onClick={() => onRemove(dep.dependencyId)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Add dependency form                                                        */
/* -------------------------------------------------------------------------- */

function AddDependencyForm({
  issueId,
  availableIssues,
  onAdd,
  adding,
  error,
}: {
  issueId: string;
  availableIssues: Pick<Issue, "id" | "identifier" | "title" | "status">[];
  onAdd: (dependsOnIssueId: string, type: "blocks" | "relates_to") => void;
  adding: boolean;
  error: string | null;
}) {
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [type, setType] = useState<"blocks" | "relates_to">("blocks");

  const filteredIssues = availableIssues.filter((i) => i.id !== issueId);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
          value={selectedIssueId}
          onChange={(e) => setSelectedIssueId(e.target.value)}
        >
          <option value="">Select an issue…</option>
          {filteredIssues.map((i) => (
            <option key={i.id} value={i.id}>
              {i.identifier ?? i.id.slice(0, 8)} — {i.title}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value as "blocks" | "relates_to")}
        >
          <option value="blocks">Blocked by</option>
          <option value="relates_to">Relates to</option>
        </select>
        <Button
          size="sm"
          disabled={!selectedIssueId || adding}
          onClick={() => {
            onAdd(selectedIssueId, type);
            setSelectedIssueId("");
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                             */
/* -------------------------------------------------------------------------- */

export function IssueDependencies({ issue, availableIssues = [] }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["issue-dependencies", issue.id];

  const { data: deps, isLoading } = useQuery<IssueDependenciesData>({
    queryKey,
    queryFn: () => issueDependenciesApi.list(issue.id),
  });

  const { data: readiness } = useQuery({
    queryKey: ["issue-dependencies-ready", issue.id],
    queryFn: () => issueDependenciesApi.checkReady(issue.id),
  });

  const [addError, setAddError] = useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: ({ dependsOnIssueId, type }: { dependsOnIssueId: string; type: "blocks" | "relates_to" }) =>
      issueDependenciesApi.add(issue.id, dependsOnIssueId, type),
    onSuccess: () => {
      setAddError(null);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["issue-dependencies-ready", issue.id] });
    },
    onError: (err: Error) => {
      setAddError(err.message ?? "Failed to add dependency");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (depId: string) => issueDependenciesApi.remove(issue.id, depId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["issue-dependencies-ready", issue.id] });
    },
  });

  const handleAdd = useCallback(
    (dependsOnIssueId: string, type: "blocks" | "relates_to") => {
      addMutation.mutate({ dependsOnIssueId, type });
    },
    [addMutation],
  );

  const handleRemove = useCallback(
    (depId: string) => {
      removeMutation.mutate(depId);
    },
    [removeMutation],
  );

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading dependencies…</div>;
  }

  const blockedBy = deps?.blockedBy ?? [];
  const blocks = deps?.blocks ?? [];
  const relatesTo = deps?.relatesTo ?? [];
  const hasDeps = blockedBy.length > 0 || blocks.length > 0 || relatesTo.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Readiness indicator */}
      {readiness && blockedBy.length > 0 && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
            readiness.ready
              ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
              : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
          )}
        >
          {readiness.ready ? (
            <>
              <Check className="h-4 w-4" />
              All dependencies met — ready to execute
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4" />
              {readiness.unmetCount} blocking {readiness.unmetCount === 1 ? "dependency" : "dependencies"} unmet
            </>
          )}
        </div>
      )}

      {/* Blocked by */}
      {blockedBy.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">Blocked by</h4>
          {blockedBy.map((dep) => (
            <DepRow key={dep.dependencyId} dep={dep} onRemove={handleRemove} removing={removeMutation.isPending} />
          ))}
        </div>
      )}

      {/* Blocks */}
      {blocks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">Blocks</h4>
          {blocks.map((dep) => (
            <DepRow key={dep.dependencyId} dep={dep} onRemove={handleRemove} removing={removeMutation.isPending} />
          ))}
        </div>
      )}

      {/* Relates to */}
      {relatesTo.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">
            <Link2 className="mr-1 inline h-3 w-3" />
            Related
          </h4>
          {relatesTo.map((dep) => (
            <DepRow key={dep.dependencyId} dep={dep} onRemove={handleRemove} removing={removeMutation.isPending} />
          ))}
        </div>
      )}

      {!hasDeps && (
        <p className="text-sm text-muted-foreground">No dependencies yet.</p>
      )}

      {/* Add dependency form */}
      {availableIssues.length > 0 && (
        <AddDependencyForm
          issueId={issue.id}
          availableIssues={availableIssues}
          onAdd={handleAdd}
          adding={addMutation.isPending}
          error={addError}
        />
      )}
    </div>
  );
}
