CREATE TABLE "cashbook_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cashbook_categories" ADD CONSTRAINT "cashbook_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cashbook_categories_tenant_type_name_uidx" ON "cashbook_categories" USING btree ("tenant_id","type","name");--> statement-breakpoint
CREATE INDEX "cashbook_categories_tenant_type_active_idx" ON "cashbook_categories" USING btree ("tenant_id","type","active");