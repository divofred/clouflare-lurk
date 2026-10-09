CREATE TABLE "provider_budget" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"provider" text NOT NULL,
	"amount_usd" numeric(12, 6) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "provider_budget_at_idx" ON "provider_budget" USING btree ("at");