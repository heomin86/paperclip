import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { agents } from "./agents.js";

export const issueDeliverables = pgTable(
  "issue_deliverables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    issueId: uuid("issue_id").notNull().references(() => issues.id),
    runId: uuid("run_id").references(() => heartbeatRuns.id),
    agentId: uuid("agent_id").references(() => agents.id),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    filePath: text("file_path"),
    content: text("content"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueIdx: index("issue_deliverables_issue_idx").on(table.issueId),
    companyIdx: index("issue_deliverables_company_idx").on(table.companyId),
  }),
);
