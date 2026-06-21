import { supabase } from '../supabase-client.js';
import { applyTheme } from '../theme.js';

// If already logged in, go straight to stories
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  window.location.href = '/pages/stories.html';
}

const emailInput  = document.getElementById('email');
const passInput   = document.getElementById('password');
const signInBtn   = document.getElementById('sign-in-btn');
const errorMsg    = document.getElementById('error-msg');

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function hideError() {
  errorMsg.classList.add('hidden');
}

signInBtn.addEventListener('click', async () => {
  hideError();
  const email    = emailInput.value.trim();
  const password = passInput.value;

  if (!email || !password) {
    showError('Please enter your email and password.');
    return;
  }

  signInBtn.textContent = 'Signing in...';
  signInBtn.disabled    = true;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    showError('Couldn\'t sign in. Check your email and password.');
    signInBtn.innerHTML = '<i class="ti ti-heart"></i> Sign in';
    signInBtn.disabled  = false;
    return;
  }

  // Apply their saved theme before redirect
  await applyTheme();
  window.location.href = '/pages/stories.html';
});

// Allow Enter key to submit
passInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') signInBtn.click();
});
