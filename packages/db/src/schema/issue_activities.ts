import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { agents } from "./agents.js";

export const issueActivities = pgTable(
  "issue_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    issueId: uuid("issue_id").notNull().references(() => issues.id),
    runId: uuid("run_id").references(() => heartbeatRuns.id),
    agentId: uuid("agent_id").references(() => agents.id),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    detail: text("detail"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueIdx: index("issue_activities_issue_idx").on(table.issueId),
    runIdx: index("issue_activities_run_idx").on(table.runId),
    companyIdx: index("issue_activities_company_idx").on(table.companyId),
  }),
);
