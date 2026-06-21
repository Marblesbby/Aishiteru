import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = 'https://ibuwqmiiarsonpghpnnf.supabase.co';
const SUPABASE_ANON = 'sb_publishable_XdeRhkTihf1cICyr1OiORQ_V9QrP36t';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
