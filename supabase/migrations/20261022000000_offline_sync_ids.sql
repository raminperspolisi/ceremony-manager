ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS offline_sync_id uuid;
ALTER TABLE public.ceremonies ADD COLUMN IF NOT EXISTS offline_sync_id uuid;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS offline_sync_id uuid;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS offline_sync_id uuid;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS offline_sync_id uuid;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS offline_sync_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS customers_offline_sync_id_key
  ON public.customers (offline_sync_id);
CREATE UNIQUE INDEX IF NOT EXISTS ceremonies_offline_sync_id_key
  ON public.ceremonies (offline_sync_id);
CREATE UNIQUE INDEX IF NOT EXISTS events_offline_sync_id_key
  ON public.events (offline_sync_id);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_offline_sync_id_key
  ON public.inventory (offline_sync_id);
CREATE UNIQUE INDEX IF NOT EXISTS quotations_offline_sync_id_key
  ON public.quotations (offline_sync_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_offline_sync_id_key
  ON public.invoices (offline_sync_id);
