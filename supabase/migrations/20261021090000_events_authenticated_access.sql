ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.events FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.events TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can manage events" ON public.events;
CREATE POLICY "Authenticated users can manage events"
ON public.events
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
