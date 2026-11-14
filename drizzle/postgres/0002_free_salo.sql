ALTER TABLE "cashbook_entries" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD COLUMN "actor_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD COLUMN "counterparty_type" text;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD COLUMN "counterparty_id" text;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD COLUMN "counterparty_name" text DEFAULT '' NOT NULL;