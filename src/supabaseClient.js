import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://nqerbvzkwsrumcnkxwxs.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_hnpylFDXeJgZa7NWGGETZA_79HJ7F-z';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
