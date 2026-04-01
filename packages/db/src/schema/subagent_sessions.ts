import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";

export const subagentSessions = pgTable(
  "subagent_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    parentRunId: uuid("parent_run_id").notNull().references(() => heartbeatRuns.id),
    parentAgentId: uuid("parent_agent_id").notNull().references(() => agents.id),
    issueId: uuid("issue_id").references(() => issues.id),
    childAgentName: text("child_agent_name").notNull(),
    childSessionId: text("child_session_id"),
    task: text("task").notNull(),
    status: text("status").notNull().default("spawned"),
    result: text("result"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    parentRunIdx: index("subagent_sessions_parent_run_idx").on(table.parentRunId),
    issueIdx: index("subagent_sessions_issue_idx").on(table.issueId),
    companyIdx: index("subagent_sessions_company_idx").on(table.companyId),
  }),
);
