ALTER TABLE public.inventory_reservations
  DROP CONSTRAINT IF EXISTS inventory_reservations_source_type_check;
ALTER TABLE public.inventory_reservations
  ADD CONSTRAINT inventory_reservations_source_type_check
  CHECK (source_type IN ('manual', 'bot', 'invoice'));

DROP POLICY IF EXISTS inventory_section_insert ON public.inventory_reservations;
CREATE POLICY inventory_section_insert
ON public.inventory_reservations
FOR INSERT TO authenticated
WITH CHECK (
  public.is_organization_member(organization_id)
  AND public.has_organization_section(organization_id, 'inventory')
  AND source_type IN ('manual', 'bot', 'invoice')
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_invoice_generated_movement_source_idx
  ON public.inventory_stock_movements (organization_id, source_id, movement_type)
  WHERE source_type = 'invoice';

CREATE OR REPLACE FUNCTION public.invoice_inventory_signature(p_items jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'inventory_id', line.value->>'inventory_id',
        'item_type', COALESCE(line.value->>'item_type', 'sale'),
        'quantity', COALESCE(line.value->>'qty', line.value->>'quantity'),
        'checkout', line.value->>'rental_checkout_date',
        'return', line.value->>'rental_return_date'
      )
      ORDER BY line.value->>'inventory_id'
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS line(value)
  WHERE NULLIF(line.value->>'inventory_id', '') IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.guard_invoice_inventory_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF public.invoice_inventory_signature(OLD.items_data)
      IS DISTINCT FROM public.invoice_inventory_signature(NEW.items_data)
    AND (
      EXISTS (
        SELECT 1
        FROM public.inventory_stock_movements AS movement
        WHERE movement.organization_id = OLD.organization_id
          AND movement.source_type = 'invoice'
          AND movement.source_id LIKE OLD.id::text || ':%'
      )
      OR EXISTS (
        SELECT 1
        FROM public.inventory_reservations AS reservation
        WHERE reservation.organization_id = OLD.organization_id
          AND reservation.source_type = 'invoice'
          AND reservation.source_id LIKE OLD.id::text || ':%'
      )
    )
    AND NOT (
      public.invoice_inventory_signature(NEW.items_data)
        @> public.invoice_inventory_signature(OLD.items_data)
    ) THEN
    RAISE EXCEPTION 'اقلام متصل به موجودی پس از ثبت گردش انبار قابل حذف یا تغییر نیستند؛ ابتدا با انبار هماهنگ کنید.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_invoice_inventory_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.inventory_stock_movements AS movement
    WHERE movement.organization_id = OLD.organization_id
      AND movement.source_type = 'invoice'
      AND movement.source_id LIKE OLD.id::text || ':%'
  ) OR EXISTS (
    SELECT 1
    FROM public.inventory_reservations AS reservation
    WHERE reservation.organization_id = OLD.organization_id
      AND reservation.source_type = 'invoice'
      AND reservation.source_id LIKE OLD.id::text || ':%'
  ) THEN
    RAISE EXCEPTION 'فاکتور دارای گردش یا رزرو انبار است و قابل حذف نیست؛ ابتدا وضعیت کالا را در انبار تعیین کنید.';
  END IF;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_invoice_rental_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_stock numeric(14, 3);
  v_reserved numeric(14, 3);
BEGIN
  IF NEW.source_type <> 'invoice' OR NEW.reservation_type <> 'rent' THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM public.inventory AS item
  WHERE item.id = NEW.inventory_id
    AND item.organization_id = NEW.organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'کالای اجاره‌ای به این فضای کاری تعلق ندارد.';
  END IF;

  SELECT COALESCE(sum(movement.quantity_delta), 0)
  INTO v_stock
  FROM public.inventory_stock_movements AS movement
  WHERE movement.organization_id = NEW.organization_id
    AND movement.inventory_id = NEW.inventory_id
    AND movement.warehouse_id = NEW.warehouse_id;

  SELECT COALESCE(sum(reservation.quantity), 0)
  INTO v_reserved
  FROM public.inventory_reservations AS reservation
  WHERE reservation.organization_id = NEW.organization_id
    AND reservation.inventory_id = NEW.inventory_id
    AND reservation.warehouse_id = NEW.warehouse_id
    AND reservation.status = 'reserved'
    AND (
      reservation.reservation_type = 'sale'
      OR (
        reservation.reservation_type = 'rent'
        AND reservation.starts_on <= NEW.ends_on
        AND reservation.ends_on >= NEW.starts_on
      )
    );

  IF v_stock - v_reserved < NEW.quantity THEN
    RAISE EXCEPTION 'موجودی آزاد برای این بازهٔ اجاره کافی نیست.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_invoice_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_line record;
  v_inventory_id bigint;
  v_quantity numeric(14, 3);
  v_item_type text;
  v_item_rental_checkout date;
  v_item_rental_return date;
  v_warehouse_id bigint;
  v_source_id text;
  v_duplicate_count integer;
  v_linked_item_count integer;
BEGIN
  IF jsonb_typeof(COALESCE(NEW.items_data, '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'فهرست اقلام فاکتور معتبر نیست.';
  END IF;

  SELECT count(*), count(DISTINCT line.value->>'inventory_id')
  INTO v_linked_item_count, v_duplicate_count
  FROM jsonb_array_elements(NEW.items_data) AS line(value)
  WHERE NULLIF(line.value->>'inventory_id', '') IS NOT NULL;
  IF v_linked_item_count <> v_duplicate_count THEN
    RAISE EXCEPTION 'یک کالای متصل به انبار را فقط یک بار در فاکتور وارد کنید و تعداد همان ردیف را تغییر دهید.';
  END IF;

  IF v_linked_item_count = 0 THEN
    RETURN NEW;
  END IF;

  SELECT warehouse.id INTO v_warehouse_id
  FROM public.inventory_warehouses AS warehouse
  WHERE warehouse.organization_id = NEW.organization_id
    AND warehouse.is_default
  FOR UPDATE;
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'برای این فضای کاری انبار اصلی تعریف نشده است.';
  END IF;

  FOR v_line IN
    SELECT line.value
    FROM jsonb_array_elements(NEW.items_data) AS line(value)
    WHERE NULLIF(line.value->>'inventory_id', '') IS NOT NULL
  LOOP
    IF v_line.value->>'inventory_id' !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'شناسهٔ کالای متصل به فاکتور معتبر نیست.';
    END IF;
    v_inventory_id := (v_line.value->>'inventory_id')::bigint;
    v_quantity := COALESCE(
      NULLIF(v_line.value->>'qty', ''),
      NULLIF(v_line.value->>'quantity', '')
    )::numeric;
    v_item_type := COALESCE(NULLIF(v_line.value->>'item_type', ''), 'sale');
    IF v_quantity IS NULL OR v_quantity <= 0 OR v_item_type NOT IN ('sale', 'rent') THEN
      RAISE EXCEPTION 'تعداد یا نوع کالای متصل به فاکتور معتبر نیست.';
    END IF;

    PERFORM 1
    FROM public.inventory AS item
    WHERE item.id = v_inventory_id
      AND item.organization_id = NEW.organization_id
      AND COALESCE(item.item_type, 'sale') = v_item_type
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'کالا در انبار این فضای کاری پیدا نشد یا نوع آن با فاکتور هم‌خوانی ندارد.';
    END IF;

    v_source_id := NEW.id::text || ':' || v_inventory_id::text;
    IF v_item_type = 'sale' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.inventory_stock_movements AS movement
        WHERE movement.organization_id = NEW.organization_id
          AND movement.source_type = 'invoice'
          AND movement.source_id = v_source_id
          AND movement.movement_type = 'sale_issue'
      ) THEN
        INSERT INTO public.inventory_stock_movements (
          organization_id, inventory_id, warehouse_id, movement_type,
          quantity_delta, note, source_type, source_id, offline_sync_id
        )
        VALUES (
          NEW.organization_id, v_inventory_id, v_warehouse_id, 'sale_issue',
          -v_quantity, 'کسر خودکار از فاکتور رسمی شمارهٔ ' || NEW.id,
          'invoice', v_source_id, gen_random_uuid()
        );
      END IF;
    ELSE
      IF v_line.value->>'rental_checkout_date' IS NULL
        OR v_line.value->>'rental_return_date' IS NULL THEN
        RAISE EXCEPTION 'برای کالای اجاره‌ای، تاریخ تحویل و مهلت عودت را در فاکتور ثبت کنید.';
      END IF;
      v_item_rental_checkout := (v_line.value->>'rental_checkout_date')::date;
      v_item_rental_return := (v_line.value->>'rental_return_date')::date;
      IF v_item_rental_return < v_item_rental_checkout THEN
        RAISE EXCEPTION 'مهلت عودت نمی‌تواند قبل از تاریخ تحویل باشد.';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.inventory_reservations AS reservation
        WHERE reservation.organization_id = NEW.organization_id
          AND reservation.source_type = 'invoice'
          AND reservation.source_id = v_source_id
          AND reservation.inventory_id = v_inventory_id
          AND reservation.warehouse_id = v_warehouse_id
          AND reservation.reservation_type = 'rent'
      ) THEN
        INSERT INTO public.inventory_reservations (
          organization_id, inventory_id, warehouse_id, source_type, source_id,
          reservation_type, quantity, starts_on, ends_on, note, offline_sync_id
        )
        VALUES (
          NEW.organization_id, v_inventory_id, v_warehouse_id, 'invoice', v_source_id,
          'rent', v_quantity, v_item_rental_checkout, v_item_rental_return,
          'رزرو اجاره از فاکتور رسمی شمارهٔ ' || NEW.id, gen_random_uuid()
        );
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS invoice_inventory_update_guard ON public.invoices;
CREATE TRIGGER invoice_inventory_update_guard
BEFORE UPDATE OF items_data ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_inventory_update();

DROP TRIGGER IF EXISTS invoice_inventory_delete_guard ON public.invoices;
CREATE TRIGGER invoice_inventory_delete_guard
BEFORE DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_inventory_delete();

DROP TRIGGER IF EXISTS invoice_inventory_capacity_guard ON public.inventory_reservations;
CREATE TRIGGER invoice_inventory_capacity_guard
BEFORE INSERT ON public.inventory_reservations
FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_rental_capacity();

DROP TRIGGER IF EXISTS invoices_sync_inventory_after_insert ON public.invoices;
CREATE TRIGGER invoices_sync_inventory_after_insert
AFTER INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_inventory();

DROP TRIGGER IF EXISTS invoices_sync_inventory_after_items_update ON public.invoices;
CREATE TRIGGER invoices_sync_inventory_after_items_update
AFTER UPDATE OF items_data ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_inventory();

REVOKE ALL ON FUNCTION public.invoice_inventory_signature(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_invoice_inventory_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_invoice_inventory_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_invoice_rental_capacity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_invoice_inventory() FROM PUBLIC, anon, authenticated;
