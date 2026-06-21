import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = 'https://ibuwqmiiarsonpghpnnf.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlidXdxbWlpYXJzb25wZ2hwbm5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMDkzNzUsImV4cCI6MjA5NzU4NTM3NX0.h3Q4dXyWL70wX81C2Ke8C0Q-j1qKYJzNF9KHbQJoRWY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
