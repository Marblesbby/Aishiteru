import { supabase } from './supabase-client.js';

const THEMES = ['haru_urara', 'teto', 'brazilian_miku', 'slice_of_life'];

// Applies theme instantly from localStorage cache, then syncs with DB.
// Call on every page load. The cache prevents the flash of default theme.
export async function applyTheme() {
  // 1. Apply cached theme immediately (no flicker)
  const cached = localStorage.getItem('aishiteru_theme');
  if (cached && THEMES.includes(cached)) {
    setThemeClass(cached);
  }

  // 2. Sync with DB in background — corrects cache if changed elsewhere
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data } = await supabase
    .from('profiles')
    .select('theme')
    .eq('id', user.id)
    .single();

  const theme = data?.theme || 'haru_urara';
  if (theme !== cached) {
    setThemeClass(theme);
    localStorage.setItem('aishiteru_theme', theme);
  }
}

// Saves chosen theme to DB + cache and applies immediately.
export async function saveTheme(themeName) {
  if (!THEMES.includes(themeName)) return;

  localStorage.setItem('aishiteru_theme', themeName);
  setThemeClass(themeName);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('profiles')
    .update({ theme: themeName })
    .eq('id', user.id);
}

function setThemeClass(themeName) {
  document.body.classList.remove(...THEMES.map(t => `theme-${t}`));
  document.body.classList.add(`theme-${themeName}`);
}

export { THEMES };
