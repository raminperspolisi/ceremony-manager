import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nqerbvzkwsrumcnkxwxs.supabase.co';
const supabaseAnonKey = 'sb_publishable_hnpylFDXeJgZa7NWGGETZA_79HJ7F-z';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
