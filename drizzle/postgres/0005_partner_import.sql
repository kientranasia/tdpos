ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "source_system" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "source_code" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "source_branch" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "source_imported_at" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "source_raw_data" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_type_raw" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "delivery_area" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "ward" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "birth_date" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "gender" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "facebook" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "group_name" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "buyer_name" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "invoice_province" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "invoice_ward" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "invoice_citizen_id" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "invoice_passport_number" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "invoice_government_id" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "invoice_email" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "invoice_phone" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "bank_name" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "bank_account" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "source_created_by" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "source_created_at" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "last_transaction_at" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "total_sales" real NOT NULL DEFAULT 0;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "total_sales_after_returns" real NOT NULL DEFAULT 0;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "source_status" text;

ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "region" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "ward" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "id_number" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "group_name" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "company_name" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "total_purchases" real NOT NULL DEFAULT 0;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "total_purchases_after_returns" real NOT NULL DEFAULT 0;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "source_system" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "source_code" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "source_imported_at" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "source_raw_data" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "source_created_by" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "source_created_at" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "source_status" text;

CREATE TABLE IF NOT EXISTS "partner_import_batches" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "source_system" text NOT NULL,
  "entity_type" text NOT NULL,
  "file_name" text NOT NULL DEFAULT '',
  "source_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'previewed',
  "total_rows" integer NOT NULL DEFAULT 0,
  "created_count" integer NOT NULL DEFAULT 0,
  "updated_count" integer NOT NULL DEFAULT 0,
  "debt_adjusted_count" integer NOT NULL DEFAULT 0,
  "detail_count" integer NOT NULL DEFAULT 0,
  "error_count" integer NOT NULL DEFAULT 0,
  "created_by" text NOT NULL,
  "created_at" text NOT NULL,
  "completed_at" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "partner_import_batches_tenant_source_hash_uidx" ON "partner_import_batches" USING btree ("tenant_id", "source_system", "entity_type", "source_hash");
CREATE INDEX IF NOT EXISTS "partner_import_batches_tenant_created_at_idx" ON "partner_import_batches" USING btree ("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS "partner_import_issues" (
  "id" text PRIMARY KEY NOT NULL,
  "batch_id" text NOT NULL REFERENCES "partner_import_batches"("id"),
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "row_number" integer NOT NULL,
  "entity_type" text NOT NULL,
  "code" text NOT NULL,
  "message" text NOT NULL,
  "source_code" text NOT NULL DEFAULT '',
  "source_name" text NOT NULL DEFAULT '',
  "created_at" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "partner_import_issues_batch_row_idx" ON "partner_import_issues" USING btree ("batch_id", "row_number");
CREATE INDEX IF NOT EXISTS "partner_import_issues_tenant_created_at_idx" ON "partner_import_issues" USING btree ("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS "partner_debt_import_rows" (
  "id" text PRIMARY KEY NOT NULL,
  "batch_id" text NOT NULL REFERENCES "partner_import_batches"("id"),
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "entity_type" text NOT NULL,
  "partner_id" text NOT NULL,
  "document_no" text NOT NULL DEFAULT '',
  "occurred_at" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "unit" text NOT NULL DEFAULT '',
  "quantity" real,
  "unit_price" real,
  "discount" real,
  "vat" real,
  "purchase_price" real,
  "amount" real NOT NULL DEFAULT 0,
  "debit" real NOT NULL DEFAULT 0,
  "credit" real NOT NULL DEFAULT 0,
  "note" text NOT NULL DEFAULT '',
  "details_json" text NOT NULL DEFAULT '[]',
  "source_row_number" integer NOT NULL DEFAULT 0,
  "source_raw_data" text NOT NULL DEFAULT '{}',
  "created_by" text NOT NULL,
  "created_at" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "partner_debt_rows_tenant_partner_created_at_idx" ON "partner_debt_import_rows" USING btree ("tenant_id", "partner_id", "created_at");
CREATE INDEX IF NOT EXISTS "partner_debt_rows_batch_document_idx" ON "partner_debt_import_rows" USING btree ("batch_id", "document_no");
