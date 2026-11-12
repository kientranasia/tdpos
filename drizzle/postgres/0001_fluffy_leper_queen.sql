ALTER TABLE "backup_logs" ALTER COLUMN "verified" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "customer_care_logs" ALTER COLUMN "responded" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "allow_debt" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "active" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "packages" ALTER COLUMN "is_default" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "price_lists" ALTER COLUMN "is_default" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "price_lists" ALTER COLUMN "active" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "product_units" ALTER COLUMN "active" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "track_stock" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "purchase_items" ALTER COLUMN "is_gift" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "role_permissions" ALTER COLUMN "allowed" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "role_profile_permissions" ALTER COLUMN "allowed" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "active" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "tax_profiles" ALTER COLUMN "active" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "user_permissions" ALTER COLUMN "allowed" SET DEFAULT 1;--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_at_idx" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_at_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "cashbook_entries_tenant_created_at_idx" ON "cashbook_entries" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "cashbook_entries_tenant_reference_idx" ON "cashbook_entries" USING btree ("tenant_id","reference_id");--> statement-breakpoint
CREATE INDEX "customers_tenant_code_idx" ON "customers" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "customers_tenant_name_idx" ON "customers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "customers_tenant_phone_idx" ON "customers" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "debt_ledger_tenant_customer_created_at_idx" ON "debt_ledger" USING btree ("tenant_id","customer_id","created_at");--> statement-breakpoint
CREATE INDEX "debt_ledger_tenant_invoice_idx" ON "debt_ledger" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_sequences_tenant_type_uidx" ON "document_sequences" USING btree ("tenant_id","document_type");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_items_product_idx" ON "invoice_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "invoices_tenant_created_at_idx" ON "invoices" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_tenant_status_idx" ON "invoices" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "invoices_tenant_customer_idx" ON "invoices" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_idx" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_tenant_created_at_idx" ON "payments" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_tenant_customer_idx" ON "payments" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "price_list_items_list_product_unit_idx" ON "price_list_items" USING btree ("price_list_id","product_id","unit_name");--> statement-breakpoint
CREATE INDEX "price_list_items_tenant_product_idx" ON "price_list_items" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "product_components_tenant_combo_idx" ON "product_components" USING btree ("tenant_id","combo_product_id");--> statement-breakpoint
CREATE INDEX "product_components_tenant_component_idx" ON "product_components" USING btree ("tenant_id","component_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_import_batches_tenant_source_hash_uidx" ON "product_import_batches" USING btree ("tenant_id","source_system","source_hash");--> statement-breakpoint
CREATE INDEX "product_import_batches_tenant_created_at_idx" ON "product_import_batches" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "product_import_issues_batch_row_idx" ON "product_import_issues" USING btree ("batch_id","row_number");--> statement-breakpoint
CREATE INDEX "product_import_issues_tenant_created_at_idx" ON "product_import_issues" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "product_units_tenant_product_idx" ON "product_units" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "product_units_tenant_sku_idx" ON "product_units" USING btree ("tenant_id","sku");--> statement-breakpoint
CREATE INDEX "product_units_tenant_barcode_idx" ON "product_units" USING btree ("tenant_id","barcode");--> statement-breakpoint
CREATE INDEX "products_tenant_status_idx" ON "products" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_sku_uidx" ON "products" USING btree ("tenant_id","sku");--> statement-breakpoint
CREATE INDEX "products_tenant_barcode_idx" ON "products" USING btree ("tenant_id","barcode");--> statement-breakpoint
CREATE INDEX "products_tenant_name_idx" ON "products" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "purchase_items_purchase_idx" ON "purchase_items" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_items_product_idx" ON "purchase_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "purchase_return_items_return_idx" ON "purchase_return_items" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "purchase_return_items_purchase_item_idx" ON "purchase_return_items" USING btree ("purchase_item_id");--> statement-breakpoint
CREATE INDEX "purchase_returns_tenant_created_at_idx" ON "purchase_returns" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "purchase_returns_purchase_idx" ON "purchase_returns" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchases_tenant_created_at_idx" ON "purchases" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "purchases_tenant_supplier_idx" ON "purchases" USING btree ("tenant_id","supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_profiles_tenant_code_uidx" ON "role_profiles" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "sales_return_items_return_idx" ON "sales_return_items" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "sales_return_items_invoice_item_idx" ON "sales_return_items" USING btree ("invoice_item_id");--> statement-breakpoint
CREATE INDEX "sales_returns_tenant_created_at_idx" ON "sales_returns" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_returns_tenant_invoice_idx" ON "sales_returns" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_product_created_at_idx" ON "stock_movements" USING btree ("tenant_id","product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_created_at_idx" ON "stock_movements" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_reference_idx" ON "stock_movements" USING btree ("tenant_id","reference_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_tenant_status_product_idx" ON "stock_reservations" USING btree ("tenant_id","status","product_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_invoice_idx" ON "stock_reservations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "suppliers_tenant_code_idx" ON "suppliers" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "suppliers_tenant_name_idx" ON "suppliers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenants_created_at_idx" ON "tenants" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_permissions_tenant_user_idx" ON "user_permissions" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "users_tenant_status_idx" ON "users" USING btree ("tenant_id","status");