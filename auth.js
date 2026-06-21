import { supabase } from './supabase-client.js';

// Call at the top of every page JS file.
// Returns the session if valid, otherwise redirects to login.
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '/pages/login.html';
    return null;
  }
  return session;
}

// Returns the current user's profile row from the profiles table.
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return data;
}

// Sign in with email + password.
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Sign out and redirect to login.
export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = '/pages/login.html';
}
