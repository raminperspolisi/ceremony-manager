-- Preserve the application's existing privileges inherited from PUBLIC for
-- authenticated users before removing those grants from anonymous API access.
DO $$
DECLARE
  grant_row record;
BEGIN
  FOR grant_row IN
    SELECT table_schema, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = 'PUBLIC'
      AND table_schema = 'public'
  LOOP
    EXECUTE format(
      'GRANT %s ON TABLE %I.%I TO authenticated',
      grant_row.privilege_type,
      grant_row.table_schema,
      grant_row.table_name
    );
  END LOOP;

  FOR grant_row IN
    SELECT namespace.nspname AS sequence_schema,
           seq.relname AS sequence_name,
           acl.privilege_type
    FROM pg_catalog.pg_class AS seq
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = seq.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(seq.relacl, pg_catalog.acldefault('S', seq.relowner))
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND seq.relkind = 'S'
      AND acl.grantee = 0
  LOOP
    EXECUTE format(
      'GRANT %s ON SEQUENCE %I.%I TO authenticated',
      grant_row.privilege_type,
      grant_row.sequence_schema,
      grant_row.sequence_name
    );
  END LOOP;

  FOR grant_row IN
    SELECT p.oid, namespace.nspname, p.proname, p.prokind
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
      AND p.prokind IN ('f', 'p')
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON %s %I.%I(%s) TO authenticated',
      CASE WHEN grant_row.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
      grant_row.nspname,
      grant_row.proname,
      pg_catalog.pg_get_function_identity_arguments(grant_row.oid)
    );
  END LOOP;
END;
$$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM anon, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory TO authenticated;

DO $$
DECLARE
  inventory_id_sequence text;
BEGIN
  inventory_id_sequence := pg_catalog.pg_get_serial_sequence('public.inventory', 'id');
  IF inventory_id_sequence IS NOT NULL THEN
    EXECUTE format(
      'GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
      inventory_id_sequence
    );
  END IF;
END;
$$;

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
        'price_level1', inventory.price_level1
      )
      ORDER BY inventory.title
    ),
    '[]'::jsonb
  )
  FROM public.inventory AS inventory;
$function$;

REVOKE ALL ON FUNCTION public.bot_catalog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_catalog() TO anon;
