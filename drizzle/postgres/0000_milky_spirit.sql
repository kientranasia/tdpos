CREATE TABLE "admin_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_type" text DEFAULT 'admin' NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"tenant_id" text,
	"meta" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"instance_id" text,
	"file_path" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"checksum_sha256" text,
	"schema_version" integer,
	"verified" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'cash' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashbook_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" real NOT NULL,
	"category" text DEFAULT 'Khác' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reference_id" text,
	"account_id" text,
	"created_at" text NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "customer_care_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"channel" text DEFAULT 'zalo' NOT NULL,
	"template_type" text DEFAULT 'due_today' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"due_date" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"responded" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"tenant_id" text NOT NULL,
	"created_by" text,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"tax_code" text,
	"company_name" text,
	"invoice_address" text,
	"shipping_address" text,
	"credit_limit" real DEFAULT 0 NOT NULL,
	"payment_days" integer DEFAULT 0 NOT NULL,
	"allow_debt" integer DEFAULT 1 NOT NULL,
	"contact_name" text,
	"note" text DEFAULT '' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"total_debt" real DEFAULT 0 NOT NULL,
	"type" text DEFAULT 'retail' NOT NULL,
	"tags" text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debt_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"invoice_id" text,
	"amount" real NOT NULL,
	"type" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"document_type" text NOT NULL,
	"prefix" text NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"quantity" real NOT NULL,
	"price" real NOT NULL,
	"tax_rate" real DEFAULT 0 NOT NULL,
	"total" real NOT NULL,
	"ordered_quantity" real,
	"picked_quantity" real,
	"confirmed_quantity" real,
	"line_status" text DEFAULT 'ordered' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"unit_name" text,
	"unit_factor" real DEFAULT 1 NOT NULL,
	"base_quantity" real DEFAULT 0 NOT NULL,
	"price_list_id" text,
	"price_list_name" text
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"document_no" text DEFAULT '' NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_id" text,
	"created_by" text NOT NULL,
	"total_amount" real NOT NULL,
	"discount" real DEFAULT 0 NOT NULL,
	"tax_amount" real DEFAULT 0 NOT NULL,
	"final_amount" real NOT NULL,
	"paid_amount" real NOT NULL,
	"debt_amount" real DEFAULT 0 NOT NULL,
	"previous_debt_amount" real DEFAULT 0 NOT NULL,
	"change_amount" real DEFAULT 0 NOT NULL,
	"payment_method" text NOT NULL,
	"account_id" text,
	"status" text NOT NULL,
	"workflow_status" text DEFAULT 'closed' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"checked_by" text,
	"checked_at" text,
	"picked_by" text,
	"picked_at" text,
	"closed_by" text,
	"closed_at" text,
	"cancelled_by" text,
	"cancelled_at" text,
	"version" integer DEFAULT 1 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"license_code" text NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"machine_hash" text NOT NULL,
	"issued_at" text,
	"expires_at" text,
	"status" text DEFAULT 'unlicensed' NOT NULL,
	"payload" text,
	"last_validated_at" text,
	"created_at" text NOT NULL,
	CONSTRAINT "license_instances_instance_id_unique" UNIQUE("instance_id")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"max_users" integer NOT NULL,
	"price_monthly" real NOT NULL,
	"is_default" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "packages_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payable_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"purchase_id" text,
	"amount" real NOT NULL,
	"type" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"payment_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount" real NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_id" text,
	"account_id" text,
	"amount" real NOT NULL,
	"payment_method" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"payment_date" text NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"module" text NOT NULL,
	"action" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "permissions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "price_list_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"price_list_id" text NOT NULL,
	"product_id" text NOT NULL,
	"unit_name" text NOT NULL,
	"unit_factor" real DEFAULT 1 NOT NULL,
	"price" real NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"customer_type" text DEFAULT 'all' NOT NULL,
	"markup_percent" real DEFAULT 0 NOT NULL,
	"markup_mode" text DEFAULT 'percent' NOT NULL,
	"markup_value" real DEFAULT 0 NOT NULL,
	"is_default" integer DEFAULT 0 NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_components" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"combo_product_id" text NOT NULL,
	"component_product_id" text NOT NULL,
	"quantity" real NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"source_system" text NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"source_hash" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"product_rows" integer DEFAULT 0 NOT NULL,
	"unit_rows" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"unit_count" integer DEFAULT 0 NOT NULL,
	"combo_count" integer DEFAULT 0 NOT NULL,
	"component_count" integer DEFAULT 0 NOT NULL,
	"combo_with_components" integer DEFAULT 0 NOT NULL,
	"combo_missing_components" integer DEFAULT 0 NOT NULL,
	"component_warning_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "product_import_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"row_number" integer NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"sku" text DEFAULT '' NOT NULL,
	"barcode" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_units" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"product_id" text NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"factor" real DEFAULT 1 NOT NULL,
	"barcode" text,
	"purchase_price" real DEFAULT 0 NOT NULL,
	"attributes" text,
	"source_system" text,
	"source_code" text,
	"source_related_code" text,
	"source_imported_at" text,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"purchase_price" real NOT NULL,
	"selling_price" real NOT NULL,
	"tax_rate" real DEFAULT 0 NOT NULL,
	"stock" real DEFAULT 0 NOT NULL,
	"track_stock" integer DEFAULT 1 NOT NULL,
	"low_stock_threshold" real DEFAULT 10 NOT NULL,
	"max_stock_threshold" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"barcode" text,
	"image_url" text,
	"product_type" text DEFAULT 'standard' NOT NULL,
	"attributes" text,
	"attributes_json" text,
	"source_system" text,
	"source_code" text,
	"source_related_code" text,
	"source_imported_at" text
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"unit" text NOT NULL,
	"quantity" real NOT NULL,
	"price" real NOT NULL,
	"tax_rate" real DEFAULT 0 NOT NULL,
	"total" real NOT NULL,
	"unit_factor" real DEFAULT 1 NOT NULL,
	"base_quantity" real DEFAULT 0 NOT NULL,
	"is_gift" integer DEFAULT 0 NOT NULL,
	"selling_price" real DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_return_items" (
	"id" text PRIMARY KEY NOT NULL,
	"return_id" text NOT NULL,
	"purchase_item_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"unit" text NOT NULL,
	"quantity" real NOT NULL,
	"unit_factor" real DEFAULT 1 NOT NULL,
	"base_quantity" real DEFAULT 0 NOT NULL,
	"price" real NOT NULL,
	"total" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"document_no" text DEFAULT '' NOT NULL,
	"tenant_id" text NOT NULL,
	"purchase_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"total_amount" real NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"document_no" text DEFAULT '' NOT NULL,
	"tenant_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"created_by" text NOT NULL,
	"total_amount" real NOT NULL,
	"tax_amount" real DEFAULT 0 NOT NULL,
	"final_amount" real NOT NULL,
	"paid_amount" real DEFAULT 0 NOT NULL,
	"payable_amount" real DEFAULT 0 NOT NULL,
	"payment_method" text NOT NULL,
	"account_id" text,
	"status" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"permission_code" text NOT NULL,
	"allowed" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_profile_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"role_profile_id" text NOT NULL,
	"permission_code" text NOT NULL,
	"allowed" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_return_items" (
	"id" text PRIMARY KEY NOT NULL,
	"return_id" text NOT NULL,
	"invoice_item_id" text,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"unit_name" text NOT NULL,
	"quantity" real NOT NULL,
	"unit_factor" real DEFAULT 1 NOT NULL,
	"base_quantity" real DEFAULT 0 NOT NULL,
	"price" real NOT NULL,
	"total" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"document_no" text DEFAULT '' NOT NULL,
	"tenant_id" text NOT NULL,
	"invoice_id" text,
	"customer_id" text,
	"total_amount" real NOT NULL,
	"debt_reduction" real DEFAULT 0 NOT NULL,
	"refund_amount" real DEFAULT 0 NOT NULL,
	"refund_account_id" text,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"product_id" text NOT NULL,
	"type" text NOT NULL,
	"quantity" real NOT NULL,
	"before_stock" real NOT NULL,
	"after_stock" real NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reference_id" text,
	"created_at" text NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" real NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"created_at" text NOT NULL,
	"released_at" text
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"plan" text DEFAULT 'yearly' NOT NULL,
	"price_monthly" real DEFAULT 150000 NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"note" text,
	"start_at" text,
	"end_at" text,
	"reviewed_by" text,
	"reviewed_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_credit_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"purchase_return_id" text,
	"purchase_id" text,
	"amount" real NOT NULL,
	"type" text NOT NULL,
	"account_id" text,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"tax_code" text,
	"address" text DEFAULT '' NOT NULL,
	"current_payable" real DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text DEFAULT 'Mặc định' NOT NULL,
	"tax_method" text DEFAULT 'Chưa cấu hình' NOT NULL,
	"default_tax_rate" real DEFAULT 0 NOT NULL,
	"tax_code" text,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"address" text NOT NULL,
	"province" text,
	"district" text,
	"ward" text,
	"phone" text NOT NULL,
	"email" text,
	"tax_info" text,
	"logo_url" text,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"currency" text DEFAULT 'VND' NOT NULL,
	"invoice_prefix" text DEFAULT 'INV' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"trial_start_at" text,
	"trial_end_at" text,
	"subscription_status" text DEFAULT 'trial' NOT NULL,
	"subscription_plan" text DEFAULT 'yearly' NOT NULL,
	"subscription_price_monthly" real DEFAULT 150000 NOT NULL,
	"package_code" text DEFAULT 'starter_1' NOT NULL,
	"package_name" text DEFAULT 'Starter 1' NOT NULL,
	"max_users" integer DEFAULT 1 NOT NULL,
	"package_price_monthly" real DEFAULT 150000 NOT NULL,
	"subscription_start_at" text,
	"subscription_end_at" text,
	"settings" text,
	"database_engine" text DEFAULT 'shared_sqlite' NOT NULL,
	"database_key" text DEFAULT '' NOT NULL,
	"database_status" text DEFAULT 'shared' NOT NULL,
	"database_provisioned_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"permission_code" text NOT NULL,
	"allowed" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text,
	"phone" text,
	"role" text NOT NULL,
	"tenant_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "backup_logs" ADD CONSTRAINT "backup_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_care_logs" ADD CONSTRAINT "customer_care_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_care_logs" ADD CONSTRAINT "customer_care_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_ledger" ADD CONSTRAINT "debt_ledger_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_ledger" ADD CONSTRAINT "debt_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payable_ledger" ADD CONSTRAINT "payable_ledger_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payable_ledger" ADD CONSTRAINT "payable_ledger_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_combo_product_id_products_id_fk" FOREIGN KEY ("combo_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_components" ADD CONSTRAINT "product_components_component_product_id_products_id_fk" FOREIGN KEY ("component_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_import_batches" ADD CONSTRAINT "product_import_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_import_issues" ADD CONSTRAINT "product_import_issues_batch_id_product_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_import_issues" ADD CONSTRAINT "product_import_issues_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_return_id_purchase_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."purchase_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_purchase_item_id_purchase_items_id_fk" FOREIGN KEY ("purchase_item_id") REFERENCES "public"."purchase_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_profile_permissions" ADD CONSTRAINT "role_profile_permissions_role_profile_id_role_profiles_id_fk" FOREIGN KEY ("role_profile_id") REFERENCES "public"."role_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_profile_permissions" ADD CONSTRAINT "role_profile_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_profiles" ADD CONSTRAINT "role_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_return_id_sales_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."sales_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_invoice_item_id_invoice_items_id_fk" FOREIGN KEY ("invoice_item_id") REFERENCES "public"."invoice_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_credit_ledger" ADD CONSTRAINT "supplier_credit_ledger_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_credit_ledger" ADD CONSTRAINT "supplier_credit_ledger_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
