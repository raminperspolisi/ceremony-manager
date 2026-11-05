ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS sort_order integer;

WITH ranked_inventory AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY organization_id ORDER BY id)::integer AS position
  FROM public.inventory
  WHERE sort_order IS NULL
)
UPDATE public.inventory AS inventory
SET sort_order = ranked_inventory.position
FROM ranked_inventory
WHERE inventory.id = ranked_inventory.id;

ALTER TABLE public.inventory
  ALTER COLUMN sort_order SET DEFAULT 0,
  ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_organization_sort_order_idx
  ON public.inventory (organization_id, sort_order);
