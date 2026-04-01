import {
  type AnyPgColumn,
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";

export interface PlanningMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface PlanningQuestion {
  question: string;
  options: Array<{ id: string; label: string }>;
}

export interface PlanningSpec {
  title: string;
  summary: string;
  deliverables: string[];
  success_criteria: string[];
  constraints: Record<string, unknown>;
  execution_plan?: {
    approach: string;
    steps: string[];
  };
}

export const planningSessions = pgTable(
  "planning_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    issueId: uuid("issue_id").notNull().references((): AnyPgColumn => issues.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    // "active" | "completed" | "cancelled"
    messages: jsonb("messages").$type<PlanningMessage[]>().notNull().default([]),
    currentQuestion: jsonb("current_question").$type<PlanningQuestion | null>(),
    spec: jsonb("spec").$type<PlanningSpec | null>(),
    specMarkdown: text("spec_markdown"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueIdx: index("planning_sessions_issue_idx").on(table.issueId),
    companyStatusIdx: index("planning_sessions_company_status_idx").on(table.companyId, table.status),
  }),
);
