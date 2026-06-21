import { requireAuth } from '../auth.js';
import { applyTheme, saveTheme, THEMES } from '../theme.js';
import { supabase } from '../supabase-client.js';
import { signOut } from '../auth.js';

const session = await requireAuth();
if (!session) throw new Error('Not authenticated');
await applyTheme();

const userId      = session.user.id;
const themeGrid   = document.getElementById('theme-grid');
const displayName = document.getElementById('display-name');
const saveNameBtn = document.getElementById('save-name-btn');
const signOutBtn  = document.getElementById('sign-out-btn');

// ── LOAD PROFILE ──────────────────────────────────────────────

const { data: profile } = await supabase
  .from('profiles')
  .select('display_name, theme')
  .eq('id', userId)
  .single();

if (profile) {
  displayName.value = profile.display_name || '';
  setSelectedSwatch(profile.theme || 'haru_urara');
}

// ── THEME SWATCHES ────────────────────────────────────────────

themeGrid.querySelectorAll('.swatch-col').forEach(swatch => {
  swatch.addEventListener('click', async () => {
    const theme = swatch.dataset.theme;
    await saveTheme(theme);
    setSelectedSwatch(theme);
  });
});

function setSelectedSwatch(themeName) {
  themeGrid.querySelectorAll('.swatch-col').forEach(s => {
    s.classList.toggle('selected', s.dataset.theme === themeName);
  });
}

// ── SAVE DISPLAY NAME ─────────────────────────────────────────

saveNameBtn.addEventListener('click', async () => {
  const name = displayName.value.trim();
  if (!name) return;

  saveNameBtn.textContent = 'Saving...';
  saveNameBtn.disabled = true;

  await supabase
    .from('profiles')
    .update({ display_name: name })
    .eq('id', userId);

  saveNameBtn.textContent = 'Saved ✓';
  setTimeout(() => {
    saveNameBtn.textContent = 'Save name';
    saveNameBtn.disabled = false;
  }, 1500);
});

// ── SIGN OUT ──────────────────────────────────────────────────

signOutBtn.addEventListener('click', () => signOut());
