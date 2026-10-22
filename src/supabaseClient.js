import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://nqerbvzkwsrumcnkxwxs.supabase.co';
const supabaseAnonKey = 'sb_publishable_hnpylFDXeJgZa7NWGGETZA_79HJ7F-z';

export const supabase = createClient(SUPABASE_URL, supabaseAnonKey);
