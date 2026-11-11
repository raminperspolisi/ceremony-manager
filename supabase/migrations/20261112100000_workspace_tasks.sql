CREATE TABLE IF NOT EXISTS public.workspace_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  completed boolean NOT NULL DEFAULT false,
  offline_sync_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_tasks_offline_sync_id_key
  ON public.workspace_tasks (offline_sync_id);
CREATE INDEX IF NOT EXISTS workspace_tasks_organization_created_idx
  ON public.workspace_tasks (organization_id, created_at DESC);

ALTER TABLE public.workspace_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workspace_tasks FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_tasks TO authenticated;

DROP POLICY IF EXISTS workspace_tasks_dashboard_access ON public.workspace_tasks;
CREATE POLICY workspace_tasks_dashboard_access
ON public.workspace_tasks
FOR ALL TO authenticated
USING (public.is_organization_member(organization_id))
WITH CHECK (public.is_organization_member(organization_id));

DROP TRIGGER IF EXISTS prevent_organization_change ON public.workspace_tasks;
CREATE TRIGGER prevent_organization_change
BEFORE UPDATE ON public.workspace_tasks
FOR EACH ROW
EXECUTE FUNCTION public.prevent_organization_change();

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'workspace_tasks'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_tasks;
  END IF;
END;
$migration$;
