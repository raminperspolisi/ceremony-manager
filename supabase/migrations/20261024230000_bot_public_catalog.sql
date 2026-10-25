CREATE TABLE public.bot_catalog_items AS
SELECT inventory.id AS inventory_id
FROM public.inventory AS inventory
WITH NO DATA;

ALTER TABLE public.bot_catalog_items
  ALTER COLUMN inventory_id SET NOT NULL,
  ADD COLUMN public_price numeric(14, 0) CHECK (public_price IS NULL OR public_price >= 0),
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD CONSTRAINT bot_catalog_items_pkey PRIMARY KEY (inventory_id),
  ADD CONSTRAINT bot_catalog_items_inventory_fkey
    FOREIGN KEY (inventory_id)
    REFERENCES public.inventory(id)
    ON DELETE CASCADE;

INSERT INTO public.bot_catalog_items (inventory_id)
SELECT inventory.id
FROM public.inventory AS inventory
ON CONFLICT (inventory_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.add_inventory_item_to_bot_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.bot_catalog_items (inventory_id)
  VALUES (NEW.id)
  ON CONFLICT (inventory_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_inventory_item_to_bot_catalog()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER inventory_add_to_bot_catalog
AFTER INSERT ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION public.add_inventory_item_to_bot_catalog();

ALTER TABLE public.bot_catalog_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.bot_catalog_items FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bot_catalog_items TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can manage bot catalog"
  ON public.bot_catalog_items;
CREATE POLICY "Authenticated users can manage bot catalog"
ON public.bot_catalog_items
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.bot_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', inventory.id,
        'title', inventory.title,
        'item_type', COALESCE(inventory.item_type, 'sale'),
        'public_price', catalog.public_price,
        'description', catalog.description
      )
      ORDER BY inventory.title
    ),
    '[]'::jsonb
  )
  FROM public.bot_catalog_items AS catalog
  JOIN public.inventory AS inventory
    ON inventory.id = catalog.inventory_id;
$function$;

REVOKE ALL ON FUNCTION public.bot_catalog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_catalog() TO anon;
