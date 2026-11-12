ALTER TABLE public.business_contacts
  ADD COLUMN IF NOT EXISTS personal_photo_path text;
