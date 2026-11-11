CREATE TABLE IF NOT EXISTS public.business_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name text NOT NULL CHECK (length(btrim(first_name)) > 0),
  last_name text NOT NULL CHECK (length(btrim(last_name)) > 0),
  company_name text,
  field_of_work text,
  phone text,
  instagram_id text,
  telegram_id text,
  business_card_path text,
  notes text,
  offline_sync_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_contacts_offline_sync_id_key
  ON public.business_contacts (offline_sync_id);

CREATE INDEX IF NOT EXISTS business_contacts_organization_name_idx
  ON public.business_contacts (organization_id, last_name, first_name);

ALTER TABLE public.business_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_contacts FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_contacts TO authenticated;

DROP POLICY IF EXISTS business_contacts_customer_access ON public.business_contacts;
CREATE POLICY business_contacts_customer_access
ON public.business_contacts
FOR ALL TO authenticated
USING (public.has_organization_section(organization_id, 'customers'))
WITH CHECK (public.has_organization_section(organization_id, 'customers'));

DROP TRIGGER IF EXISTS prevent_organization_change ON public.business_contacts;
CREATE TRIGGER prevent_organization_change
BEFORE UPDATE ON public.business_contacts
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
        AND tablename = 'business_contacts'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.business_contacts;
  END IF;
END;
$migration$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-contact-cards',
  'business-contact-cards',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS business_contact_cards_read ON storage.objects;
CREATE POLICY business_contact_cards_read
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'business-contact-cards'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.has_organization_section(((storage.foldername(name))[1])::uuid, 'customers')
    ELSE false
  END
);

DROP POLICY IF EXISTS business_contact_cards_insert ON storage.objects;
CREATE POLICY business_contact_cards_insert
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'business-contact-cards'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.has_organization_section(((storage.foldername(name))[1])::uuid, 'customers')
    ELSE false
  END
);

DROP POLICY IF EXISTS business_contact_cards_update ON storage.objects;
CREATE POLICY business_contact_cards_update
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'business-contact-cards'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.has_organization_section(((storage.foldername(name))[1])::uuid, 'customers')
    ELSE false
  END
)
WITH CHECK (
  bucket_id = 'business-contact-cards'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.has_organization_section(((storage.foldername(name))[1])::uuid, 'customers')
    ELSE false
  END
);

DROP POLICY IF EXISTS business_contact_cards_delete ON storage.objects;
CREATE POLICY business_contact_cards_delete
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'business-contact-cards'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.has_organization_section(((storage.foldername(name))[1])::uuid, 'customers')
    ELSE false
  END
);
