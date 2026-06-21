import { supabase } from './supabase-client.js';

const THEMES = ['haru_urara', 'teto', 'brazilian_miku', 'slice_of_life'];

// Applies theme CSS class to <body>. Call on every page load.
export async function applyTheme() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data } = await supabase
    .from('profiles')
    .select('theme')
    .eq('id', user.id)
    .single();

  const theme = data?.theme || 'haru_urara';
  setThemeClass(theme);
}

// Saves chosen theme to the DB and applies it immediately..
export async function saveTheme(themeName) {
  if (!THEMES.includes(themeName)) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('profiles')
    .update({ theme: themeName })
    .eq('id', user.id);

  setThemeClass(themeName);
}

function setThemeClass(themeName) {
  // Remove any existing theme class
  document.body.classList.remove(...THEMES.map(t => `theme-${t}`));
  document.body.classList.add(`theme-${themeName}`);
}

export { THEMES };
