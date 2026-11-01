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
  v_stock numeric(14, 3);
  v_reserved numeric(14, 3);
  v_stock_shortfall numeric(14, 3);
  v_reservation_id bigint;
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
    SELECT COALESCE(sum(movement.quantity_delta), 0)
    INTO v_stock
    FROM public.inventory_stock_movements AS movement
    WHERE movement.organization_id = NEW.organization_id
      AND movement.inventory_id = v_inventory_id
      AND movement.warehouse_id = v_warehouse_id;

    IF v_item_type = 'sale' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.inventory_stock_movements AS movement
        WHERE movement.organization_id = NEW.organization_id
          AND movement.source_type = 'invoice'
          AND movement.source_id = v_source_id
          AND movement.movement_type = 'sale_issue'
      ) THEN
        SELECT COALESCE(sum(reservation.quantity), 0)
        INTO v_reserved
        FROM public.inventory_reservations AS reservation
        WHERE reservation.organization_id = NEW.organization_id
          AND reservation.inventory_id = v_inventory_id
          AND reservation.warehouse_id = v_warehouse_id
          AND reservation.status = 'reserved';

        v_stock_shortfall := greatest(0, v_reserved + v_quantity - v_stock);
        IF v_stock_shortfall > 0 THEN
          INSERT INTO public.inventory_stock_movements (
            organization_id, inventory_id, warehouse_id, movement_type,
            quantity_delta, note, source_type, source_id, offline_sync_id
          )
          VALUES (
            NEW.organization_id, v_inventory_id, v_warehouse_id, 'adjustment',
            v_stock_shortfall,
            'افزایش موجودی تأییدشده هنگام صدور فاکتور رسمی شمارهٔ ' || NEW.id,
            'invoice', v_source_id, gen_random_uuid()
          );
        END IF;

        INSERT INTO public.inventory_reservations (
          organization_id, inventory_id, warehouse_id, source_type, source_id,
          reservation_type, quantity, note, offline_sync_id
        )
        VALUES (
          NEW.organization_id, v_inventory_id, v_warehouse_id, 'invoice', v_source_id,
          'sale', v_quantity, 'رزرو فروش از فاکتور رسمی شمارهٔ ' || NEW.id,
          gen_random_uuid()
        )
        ON CONFLICT (
          organization_id, source_type, source_id, inventory_id, warehouse_id, reservation_type
        ) DO NOTHING;

        SELECT reservation.id INTO v_reservation_id
        FROM public.inventory_reservations AS reservation
        WHERE reservation.organization_id = NEW.organization_id
          AND reservation.source_type = 'invoice'
          AND reservation.source_id = v_source_id
          AND reservation.inventory_id = v_inventory_id
          AND reservation.warehouse_id = v_warehouse_id
          AND reservation.reservation_type = 'sale';

        IF v_reservation_id IS NULL THEN
          RAISE EXCEPTION 'رزرو فروش برای فاکتور رسمی ایجاد نشد.';
        END IF;

        INSERT INTO public.inventory_stock_movements (
          organization_id, inventory_id, warehouse_id, reservation_id, movement_type,
          quantity_delta, note, source_type, source_id, offline_sync_id
        )
        VALUES (
          NEW.organization_id, v_inventory_id, v_warehouse_id, v_reservation_id, 'sale_issue',
          -v_quantity, 'خروج فروش از فاکتور رسمی شمارهٔ ' || NEW.id,
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
        SELECT COALESCE(sum(reservation.quantity), 0)
        INTO v_reserved
        FROM public.inventory_reservations AS reservation
        WHERE reservation.organization_id = NEW.organization_id
          AND reservation.inventory_id = v_inventory_id
          AND reservation.warehouse_id = v_warehouse_id
          AND reservation.status = 'reserved'
          AND (
            reservation.reservation_type = 'sale'
            OR (
              reservation.reservation_type = 'rent'
              AND reservation.starts_on <= v_item_rental_return
              AND reservation.ends_on >= v_item_rental_checkout
            )
          );

        v_stock_shortfall := greatest(0, v_reserved + v_quantity - v_stock);
        IF v_stock_shortfall > 0 THEN
          INSERT INTO public.inventory_stock_movements (
            organization_id, inventory_id, warehouse_id, movement_type,
            quantity_delta, note, source_type, source_id, offline_sync_id
          )
          VALUES (
            NEW.organization_id, v_inventory_id, v_warehouse_id, 'adjustment',
            v_stock_shortfall,
            'افزایش موجودی تأییدشده هنگام صدور فاکتور رسمی شمارهٔ ' || NEW.id,
            'invoice', v_source_id, gen_random_uuid()
          );
        END IF;

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

REVOKE ALL ON FUNCTION public.sync_invoice_inventory() FROM PUBLIC, anon, authenticated;
