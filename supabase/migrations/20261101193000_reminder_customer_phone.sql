ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS customer_phone text NOT NULL DEFAULT '';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS customer_phone text NOT NULL DEFAULT '';

WITH unique_customer_phones AS (
  SELECT
    quotation.id,
    min(btrim(customer.phone)) AS phone
  FROM public.quotations AS quotation
  JOIN public.customers AS customer
    ON customer.organization_id = quotation.organization_id
   AND translate(lower(regexp_replace(btrim(customer."Full name"), '\s+', ' ', 'g')), 'يك', 'یک')
       = translate(lower(regexp_replace(btrim(quotation.customer_name), '\s+', ' ', 'g')), 'يك', 'یک')
  WHERE btrim(COALESCE(customer.phone, '')) <> ''
  GROUP BY quotation.id
  HAVING count(DISTINCT btrim(customer.phone)) = 1
)
UPDATE public.quotations AS quotation
SET customer_phone = unique_customer_phones.phone
FROM unique_customer_phones
WHERE quotation.id = unique_customer_phones.id
  AND btrim(COALESCE(quotation.customer_phone, '')) = '';

UPDATE public.invoices AS invoice
SET customer_phone = quotation.customer_phone
FROM public.quotations AS quotation
WHERE invoice.quotation_id = quotation.id::text
  AND btrim(COALESCE(invoice.customer_phone, '')) = ''
  AND btrim(COALESCE(quotation.customer_phone, '')) <> '';

WITH unique_customer_phones AS (
  SELECT
    invoice.id,
    min(btrim(customer.phone)) AS phone
  FROM public.invoices AS invoice
  JOIN public.customers AS customer
    ON customer.organization_id = invoice.organization_id
   AND translate(lower(regexp_replace(btrim(customer."Full name"), '\s+', ' ', 'g')), 'يك', 'یک')
       = translate(lower(regexp_replace(btrim(invoice.customer_name), '\s+', ' ', 'g')), 'يك', 'یک')
  WHERE btrim(COALESCE(invoice.customer_phone, '')) = ''
    AND btrim(COALESCE(customer.phone, '')) <> ''
  GROUP BY invoice.id
  HAVING count(DISTINCT btrim(customer.phone)) = 1
)
UPDATE public.invoices AS invoice
SET customer_phone = unique_customer_phones.phone
FROM unique_customer_phones
WHERE invoice.id = unique_customer_phones.id;
