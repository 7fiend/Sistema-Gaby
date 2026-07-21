-- ============================================================================
-- Restricciones de negocio que Prisma no modela (docs/03-modelo-de-datos.md §4)
-- ============================================================================

-- Cantidades siempre positivas
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "chk_movement_qty_positive" CHECK ("quantity" > 0);
ALTER TABLE "product_batches"
  ADD CONSTRAINT "chk_batch_remaining" CHECK ("remainingQuantity" >= 0);
ALTER TABLE "products"
  ADD CONSTRAINT "chk_stock_not_negative" CHECK ("currentStock" >= 0);
ALTER TABLE "production_order_items"
  ADD CONSTRAINT "chk_portions_positive" CHECK ("portions" > 0);
ALTER TABLE "deliveries"
  ADD CONSTRAINT "chk_delivery_qty_positive" CHECK ("quantity" > 0);
ALTER TABLE "recipe_ingredients"
  ADD CONSTRAINT "chk_ingredient_qty_positive" CHECK ("quantity" > 0);
ALTER TABLE "expenses"
  ADD CONSTRAINT "chk_expense_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "sale_items"
  ADD CONSTRAINT "chk_sale_portions_positive" CHECK ("portions" > 0);

-- ============================================================================
-- Inmutabilidad a nivel de base de datos (RN-02, DM-02).
-- Trigger que rechaza UPDATE/DELETE en tablas append-only, sin importar
-- el rol de conexión. La corrección de errores se hace con movimientos
-- compensatorios, nunca editando el historial.
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Tabla append-only: % no permite %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_movements_immutable
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE TRIGGER trg_deliveries_immutable
  BEFORE UPDATE OR DELETE ON "deliveries"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- Los reportes generados no se eliminan (RF-12.3)
CREATE TRIGGER trg_reports_immutable
  BEFORE UPDATE OR DELETE ON "reports"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
