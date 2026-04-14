CREATE TABLE "issue_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"run_id" uuid,
	"agent_id" uuid,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"detail" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"run_id" uuid,
	"agent_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"file_path" text,
	"content" text,
	"metadata" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"depends_on_issue_id" uuid NOT NULL,
	"type" text DEFAULT 'blocks' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_dependencies_unique" UNIQUE("issue_id","depends_on_issue_id")
);
--> statement-breakpoint
CREATE TABLE "planning_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_question" jsonb,
	"spec" jsonb,
	"spec_markdown" text,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subagent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"parent_run_id" uuid NOT NULL,
	"parent_agent_id" uuid NOT NULL,
	"issue_id" uuid,
	"child_agent_name" text NOT NULL,
	"child_session_id" text,
	"task" text NOT NULL,
	"status" text DEFAULT 'spawned' NOT NULL,
	"result" text,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "planning_session_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "planning_status" text;--> statement-breakpoint
ALTER TABLE "issue_activities" ADD CONSTRAINT "issue_activities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_activities" ADD CONSTRAINT "issue_activities_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_activities" ADD CONSTRAINT "issue_activities_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_activities" ADD CONSTRAINT "issue_activities_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_deliverables" ADD CONSTRAINT "issue_deliverables_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_deliverables" ADD CONSTRAINT "issue_deliverables_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_deliverables" ADD CONSTRAINT "issue_deliverables_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_deliverables" ADD CONSTRAINT "issue_deliverables_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_dependencies" ADD CONSTRAINT "issue_dependencies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_dependencies" ADD CONSTRAINT "issue_dependencies_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_dependencies" ADD CONSTRAINT "issue_dependencies_depends_on_issue_id_issues_id_fk" FOREIGN KEY ("depends_on_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_sessions" ADD CONSTRAINT "planning_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_sessions" ADD CONSTRAINT "planning_sessions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subagent_sessions" ADD CONSTRAINT "subagent_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subagent_sessions" ADD CONSTRAINT "subagent_sessions_parent_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subagent_sessions" ADD CONSTRAINT "subagent_sessions_parent_agent_id_agents_id_fk" FOREIGN KEY ("parent_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subagent_sessions" ADD CONSTRAINT "subagent_sessions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_activities_issue_idx" ON "issue_activities" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_activities_run_idx" ON "issue_activities" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "issue_activities_company_idx" ON "issue_activities" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "issue_deliverables_issue_idx" ON "issue_deliverables" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_deliverables_company_idx" ON "issue_deliverables" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "issue_dependencies_issue_idx" ON "issue_dependencies" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_dependencies_depends_on_idx" ON "issue_dependencies" USING btree ("depends_on_issue_id");--> statement-breakpoint
CREATE INDEX "issue_dependencies_company_idx" ON "issue_dependencies" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "planning_sessions_issue_idx" ON "planning_sessions" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "planning_sessions_company_status_idx" ON "planning_sessions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "subagent_sessions_parent_run_idx" ON "subagent_sessions" USING btree ("parent_run_id");--> statement-breakpoint
CREATE INDEX "subagent_sessions_issue_idx" ON "subagent_sessions" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "subagent_sessions_company_idx" ON "subagent_sessions" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_planning_session_id_planning_sessions_id_fk" FOREIGN KEY ("planning_session_id") REFERENCES "public"."planning_sessions"("id") ON DELETE set null ON UPDATE no action;