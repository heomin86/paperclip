import { and, eq, inArray, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issueDependencies, issues } from "@paperclipai/db";
import { notFound, unprocessable } from "../errors.js";

export type DependencyType = "blocks" | "relates_to";

export function issueDependencyService(db: Db) {
  /** Fetch a single issue row or null. */
  async function getIssue(issueId: string) {
    return db
      .select()
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0] ?? null);
  }

  /**
   * Detect whether adding an edge issueId->dependsOnIssueId would create a
   * cycle in the "blocks" DAG.  We do a BFS from dependsOnIssueId following
   * existing "blocks" edges to see if we can reach issueId.
   */
  async function wouldCreateCycle(
    companyId: string,
    issueId: string,
    dependsOnIssueId: string,
  ): Promise<boolean> {
    if (issueId === dependsOnIssueId) return true;

    // BFS: starting from dependsOnIssueId, follow its own blockers
    const visited = new Set<string>();
    const queue = [dependsOnIssueId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      // Get all issues that `current` depends on (current is blocked by them)
      const edges = await db
        .select({ dependsOnIssueId: issueDependencies.dependsOnIssueId })
        .from(issueDependencies)
        .where(
          and(
            eq(issueDependencies.companyId, companyId),
            eq(issueDependencies.issueId, current),
            eq(issueDependencies.type, "blocks"),
          ),
        );

      for (const edge of edges) {
        if (edge.dependsOnIssueId === issueId) return true;
        if (!visited.has(edge.dependsOnIssueId)) {
          queue.push(edge.dependsOnIssueId);
        }
      }
    }

    return false;
  }

  return {
    /**
     * Add a dependency.  issueId is blocked by dependsOnIssueId (when type = "blocks").
     * Validates both issues exist, belong to the same company, and no cycle would be created.
     */
    addDependency: async (
      companyId: string,
      issueId: string,
      dependsOnIssueId: string,
      type: DependencyType = "blocks",
    ) => {
      if (issueId === dependsOnIssueId) {
        throw unprocessable("An issue cannot depend on itself");
      }

      const issue = await getIssue(issueId);
      if (!issue) throw notFound("Issue not found");
      if (issue.companyId !== companyId) throw notFound("Issue not found");

      const dependsOn = await getIssue(dependsOnIssueId);
      if (!dependsOn) throw notFound("Dependency issue not found");
      if (dependsOn.companyId !== companyId) throw notFound("Dependency issue not found");

      if (type === "blocks") {
        const cycle = await wouldCreateCycle(companyId, issueId, dependsOnIssueId);
        if (cycle) {
          throw unprocessable("Adding this dependency would create a cycle");
        }
      }

      const [row] = await db
        .insert(issueDependencies)
        .values({
          companyId,
          issueId,
          dependsOnIssueId,
          type,
        })
        .onConflictDoNothing()
        .returning();

      return row ?? null;
    },

    /** Remove a dependency by its id. */
    removeDependency: async (id: string) => {
      const [deleted] = await db
        .delete(issueDependencies)
        .where(eq(issueDependencies.id, id))
        .returning();
      if (!deleted) throw notFound("Dependency not found");
      return deleted;
    },

    /**
     * Get all dependencies for an issue, grouped by relationship direction.
     * - blockedBy: issues that this issue depends on (type = "blocks", issueId = this issue)
     * - blocks: issues that depend on this issue (type = "blocks", dependsOnIssueId = this issue)
     * - relatesTo: issues with relates_to relationship in either direction
     */
    getDependencies: async (issueId: string) => {
      // Edges where this issue is the blocked one (this issue depends on others)
      const blockedByEdges = await db
        .select({
          id: issueDependencies.id,
          issueId: issueDependencies.dependsOnIssueId,
          type: issueDependencies.type,
          createdAt: issueDependencies.createdAt,
        })
        .from(issueDependencies)
        .where(
          and(
            eq(issueDependencies.issueId, issueId),
            eq(issueDependencies.type, "blocks"),
          ),
        );

      // Edges where this issue blocks others
      const blocksEdges = await db
        .select({
          id: issueDependencies.id,
          issueId: issueDependencies.issueId,
          type: issueDependencies.type,
          createdAt: issueDependencies.createdAt,
        })
        .from(issueDependencies)
        .where(
          and(
            eq(issueDependencies.dependsOnIssueId, issueId),
            eq(issueDependencies.type, "blocks"),
          ),
        );

      // Relates-to edges in either direction
      const relatesToEdges = await db
        .select({
          id: issueDependencies.id,
          issueId: issueDependencies.issueId,
          dependsOnIssueId: issueDependencies.dependsOnIssueId,
          type: issueDependencies.type,
          createdAt: issueDependencies.createdAt,
        })
        .from(issueDependencies)
        .where(
          and(
            or(
              eq(issueDependencies.issueId, issueId),
              eq(issueDependencies.dependsOnIssueId, issueId),
            ),
            eq(issueDependencies.type, "relates_to"),
          ),
        );

      // Collect all referenced issue ids so we can hydrate them
      const referencedIds = new Set<string>();
      for (const e of blockedByEdges) referencedIds.add(e.issueId);
      for (const e of blocksEdges) referencedIds.add(e.issueId);
      for (const e of relatesToEdges) {
        const otherId = e.issueId === issueId ? e.dependsOnIssueId : e.issueId;
        referencedIds.add(otherId);
      }

      let issueMap = new Map<string, { id: string; identifier: string | null; title: string; status: string }>();
      if (referencedIds.size > 0) {
        const rows = await db
          .select({
            id: issues.id,
            identifier: issues.identifier,
            title: issues.title,
            status: issues.status,
          })
          .from(issues)
          .where(inArray(issues.id, [...referencedIds]));
        issueMap = new Map(rows.map((r) => [r.id, r]));
      }

      function hydrate(id: string, depId: string, createdAt: Date) {
        const issue = issueMap.get(id);
        return {
          dependencyId: depId,
          issueId: id,
          identifier: issue?.identifier ?? null,
          title: issue?.title ?? "",
          status: issue?.status ?? "unknown",
          createdAt,
        };
      }

      return {
        blockedBy: blockedByEdges.map((e) => hydrate(e.issueId, e.id, e.createdAt)),
        blocks: blocksEdges.map((e) => hydrate(e.issueId, e.id, e.createdAt)),
        relatesTo: relatesToEdges.map((e) => {
          const otherId = e.issueId === issueId ? e.dependsOnIssueId : e.issueId;
          return hydrate(otherId, e.id, e.createdAt);
        }),
      };
    },

    /**
     * Check if all blocking dependencies for an issue are completed (done/cancelled).
     * Returns true if the issue has no unfinished blockers.
     */
    checkDependenciesMet: async (issueId: string) => {
      const blockerEdges = await db
        .select({ dependsOnIssueId: issueDependencies.dependsOnIssueId })
        .from(issueDependencies)
        .where(
          and(
            eq(issueDependencies.issueId, issueId),
            eq(issueDependencies.type, "blocks"),
          ),
        );

      if (blockerEdges.length === 0) return { ready: true, unmetCount: 0, unmetIssues: [] };

      const blockerIds = blockerEdges.map((e) => e.dependsOnIssueId);
      const blockerIssues = await db
        .select({ id: issues.id, identifier: issues.identifier, title: issues.title, status: issues.status })
        .from(issues)
        .where(inArray(issues.id, blockerIds));

      const doneStatuses = new Set(["done", "cancelled"]);
      const unmet = blockerIssues.filter((i) => !doneStatuses.has(i.status));

      return {
        ready: unmet.length === 0,
        unmetCount: unmet.length,
        unmetIssues: unmet,
      };
    },

    /**
     * Topological sort of the given issue ids based on their "blocks" dependencies.
     * Returns an ordered array where blockers come before the issues that depend on them.
     */
    getExecutionOrder: async (issueIds: string[]) => {
      if (issueIds.length === 0) return [];

      const idSet = new Set(issueIds);

      // Fetch all block edges within the given issue set
      const edges = await db
        .select({
          issueId: issueDependencies.issueId,
          dependsOnIssueId: issueDependencies.dependsOnIssueId,
        })
        .from(issueDependencies)
        .where(
          and(
            inArray(issueDependencies.issueId, issueIds),
            inArray(issueDependencies.dependsOnIssueId, issueIds),
            eq(issueDependencies.type, "blocks"),
          ),
        );

      // Build adjacency list and in-degree count
      const inDegree = new Map<string, number>();
      const adj = new Map<string, string[]>();
      for (const id of issueIds) {
        inDegree.set(id, 0);
        adj.set(id, []);
      }

      for (const edge of edges) {
        // dependsOnIssueId -> issueId (blocker must come first)
        if (idSet.has(edge.dependsOnIssueId) && idSet.has(edge.issueId)) {
          adj.get(edge.dependsOnIssueId)!.push(edge.issueId);
          inDegree.set(edge.issueId, (inDegree.get(edge.issueId) ?? 0) + 1);
        }
      }

      // Kahn's algorithm
      const queue: string[] = [];
      for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id);
      }

      const sorted: string[] = [];
      while (queue.length > 0) {
        const current = queue.shift()!;
        sorted.push(current);
        for (const neighbour of adj.get(current) ?? []) {
          const newDeg = (inDegree.get(neighbour) ?? 1) - 1;
          inDegree.set(neighbour, newDeg);
          if (newDeg === 0) queue.push(neighbour);
        }
      }

      // If there's a cycle, some nodes won't be in sorted – append them at the end
      for (const id of issueIds) {
        if (!sorted.includes(id)) sorted.push(id);
      }

      return sorted;
    },
  };
}
