import { requireAuth } from '../auth.js';
import { applyTheme } from '../theme.js';
import { supabase } from '../supabase-client.js';
import { parseMessage } from '../text-parser.js';

const session = await requireAuth();
if (!session) throw new Error('Not authenticated');
await applyTheme();

const userId = session.user.id;
const params = new URLSearchParams(window.location.search);
const storyId = params.get('story_id');
let chapterId = params.get('chapter_id');

const storyTitle = document.getElementById('story-title');
const infoLink   = document.getElementById('info-link');
const chapterBar = document.getElementById('chapter-bar');
const chatScroll = document.getElementById('chat-scroll');
const inputArea  = document.getElementById('input-area');
const textarea   = document.getElementById('chat-textarea');
const sendBtn    = document.getElementById('chat-send');
const personaToggle = document.getElementById('persona-toggle');
const personaIcon   = document.getElementById('persona-icon');
const personaPopup  = document.getElementById('persona-popup');
const msgMenu    = document.getElementById('msg-menu');

if (!storyId) {
  chatScroll.innerHTML = '<div class="empty-state">No story selected.</div>';
  throw new Error('No story id');
}

infoLink.href = `/Aishiteru/pages/story-info.html?story_id=${storyId}`;

let story, chapters = [], characters = [], myCharacter = null;
let currentPersona = 'character'; // 'character' | 'self'
let messages = [];
let editingMsgId = null;
let menuTargetMsg = null;
let realtimeChannel = null;

// ── INITIAL LOAD ──────────────────────────────────────────────

async function init() {
  const { data } = await supabase
    .from('stories')
    .select('*, chapters(id, title, position), characters(*)')
    .eq('id', storyId)
    .single();

  if (!data) {
    chatScroll.innerHTML = '<div class="empty-state">Story not found.</div>';
    return;
  }

  story = data;
  storyTitle.textContent = story.title;
  chapters = (data.chapters || []).sort((a, b) => a.position - b.position);
  characters = data.characters || [];
  myCharacter = characters.find(c => c.owned_by === userId) || null;

  // If I have no character in this story yet, prompt me to create one
  if (!myCharacter) {
    showCharSetup();
    return;
  }

  // Default to first chapter if none specified
  if (!chapterId && chapters.length) {
    chapterId = chapters[0].id;
  }

  renderChapterTabs();
  setupPersona();
  inputArea.style.display = 'block';
  await loadMessages();
  subscribeRealtime();
}

// ── CHAPTER TABS ──────────────────────────────────────────────

function renderChapterTabs() {
  chapterBar.innerHTML =
    `<a class="ch-tab info-tab" href="/Aishiteru/pages/story-info.html?story_id=${storyId}">ⓘ info</a>` +
    chapters.map(ch => `
      <button class="ch-tab ${ch.id === chapterId ? 'active-ch' : ''}" data-ch="${ch.id}">
        ${ch.title}
      </button>`).join('') +
    `<button class="ch-tab add-ch" id="add-chapter">+</button>`;

  chapterBar.querySelectorAll('[data-ch]').forEach(tab => {
    tab.addEventListener('click', () => {
      chapterId = tab.dataset.ch;
      renderChapterTabs();
      loadMessages();
      subscribeRealtime();
    });
  });

  document.getElementById('add-chapter').addEventListener('click', addChapter);
}

async function addChapter() {
  const title = prompt('Chapter title (e.g. "ch. 2 · the garden")');
  if (!title) return;
  const { data: ch } = await supabase
    .from('chapters')
    .insert({ story_id: storyId, title, position: chapters.length + 1 })
    .select()
    .single();
  chapters.push(ch);
  chapterId = ch.id;
  renderChapterTabs();
  loadMessages();
  subscribeRealtime();
}

// ── LOAD MESSAGES ─────────────────────────────────────────────

async function loadMessages() {
  if (!chapterId) {
    chatScroll.innerHTML = '<div class="empty-state">No chapters yet.</div>';
    return;
  }

  const { data } = await supabase
    .from('messages')
    .select('*, characters(name, avatar_url)')
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: true });

  messages = data || [];
  renderMessages();
}

function renderMessages() {
  const chTitle = chapters.find(c => c.id === chapterId)?.title || '';

  if (!messages.length) {
    chatScroll.innerHTML = `
      <div class="ch-divider">${chTitle}</div>
      <div class="empty-state">No messages yet.<br>Write the first line below.</div>`;
    return;
  }

  chatScroll.innerHTML =
    `<div class="ch-divider">${chTitle}</div>` +
    messages.map(m => renderMessage(m)).join('');

  // Attach ··· menu handlers (only on my own messages)
  chatScroll.querySelectorAll('.dot-menu').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMsgMenu(btn, btn.dataset.msgId);
    });
  });

  // Scroll to bottom
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

function renderMessage(m) {
  const mine = m.sent_by === userId;
  const side = mine ? 'me' : 'them';

  // Out of character (self) message
  if (m.mode === 'self') {
    return `
      <div class="msg-row ${side}">
        <div class="avatar self">${mine ? 'you' : '·'}</div>
        <div class="bubble-wrap">
          <div class="bubble ooc">${escapeHtml(m.content)}</div>
          ${mine ? dotMenu(m.id) : ''}
        </div>
      </div>`;
  }

  // In-character message
  const charName = m.characters?.name || '???';
  const avatar = m.characters?.avatar_url
    ? `<img src="${m.characters.avatar_url}" alt="${charName}">`
    : characterEmoji(charName);

  return `
    <div class="msg-row ${side}">
      <div class="avatar ${side}">${avatar}</div>
      <div class="bubble-wrap">
        <div class="char-name">${charName}</div>
        <div class="bubble ${side}">${parseMessage(m.content)}</div>
        ${m.edited ? '<span class="edited-label">edited</span>' : ''}
        ${mine ? dotMenu(m.id) : ''}
      </div>
    </div>`;
}

function dotMenu(msgId) {
  return `<button class="dot-menu" data-msg-id="${msgId}">···</button>`;
}

function characterEmoji(name) {
  // Simple deterministic emoji based on first letter
  const emojis = ['🌙','✨','🌸','🌿','🗝️','🌊','🕯️','🦋','🌹','⭐'];
  const idx = (name.charCodeAt(0) || 0) % emojis.length;
  return emojis[idx];
}

function escapeHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── PERSONA TOGGLE ────────────────────────────────────────────

function setupPersona() {
  updatePersonaIcon();

  personaToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePersonaPopup();
  });
}

function updatePersonaIcon() {
  if (currentPersona === 'self') {
    personaToggle.classList.add('self-mode');
    personaIcon.textContent = 'you';
    textarea.placeholder = 'Write as yourself (out of character)...';
  } else {
    personaToggle.classList.remove('self-mode');
    personaIcon.textContent = myCharacter ? characterEmoji(myCharacter.name) : '✨';
    textarea.placeholder = `Write as ${myCharacter?.name || 'your character'}...`;
  }
}

function togglePersonaPopup() {
  if (!personaPopup.classList.contains('hidden')) {
    personaPopup.classList.add('hidden');
    return;
  }

  personaPopup.innerHTML = `
    <button class="persona-option" data-persona="character">
      <span class="p-icon">${myCharacter ? characterEmoji(myCharacter.name) : '✨'}</span>
      <span>${myCharacter?.name || 'Your character'}</span>
    </button>
    <button class="persona-option self" data-persona="self">
      <span class="p-icon">you</span>
      <span>Yourself (OOC)</span>
    </button>`;

  personaPopup.classList.remove('hidden');

  personaPopup.querySelectorAll('.persona-option').forEach(opt => {
    opt.addEventListener('click', () => {
      currentPersona = opt.dataset.persona;
      updatePersonaIcon();
      personaPopup.classList.add('hidden');
    });
  });
}

// ── SEND MESSAGE ──────────────────────────────────────────────

async function sendMessage() {
  const content = textarea.value.trim();
  if (!content || !chapterId) return;

  // Editing existing message?
  if (editingMsgId) {
    await supabase
      .from('messages')
      .update({ content, edited: true, edited_at: new Date().toISOString() })
      .eq('id', editingMsgId);
    cancelEdit();
    textarea.value = '';
    autoGrow();
    await loadMessages();
    return;
  }

  textarea.value = '';
  autoGrow();

  const payload = {
    chapter_id: chapterId,
    story_id: storyId,
    sent_by: userId,
    content,
    mode: currentPersona,
    character_id: currentPersona === 'character' ? myCharacter.id : null
  };

  const { error } = await supabase.from('messages').insert(payload);
  if (error) {
    textarea.value = content; // restore on failure
    return;
  }
  // Realtime will append it; but also reload to be safe
  await loadMessages();
}

sendBtn.addEventListener('click', sendMessage);

textarea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-grow textarea
function autoGrow() {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}
textarea.addEventListener('input', autoGrow);

// ── MESSAGE MENU (edit/delete) ────────────────────────────────

function openMsgMenu(btn, msgId) {
  menuTargetMsg = messages.find(m => m.id === msgId);
  if (!menuTargetMsg) return;

  const rect = btn.getBoundingClientRect();
  msgMenu.style.top  = `${rect.bottom + 4}px`;
  msgMenu.style.left = `${Math.min(rect.left, window.innerWidth - 150)}px`;
  msgMenu.classList.remove('hidden');
}

document.getElementById('edit-msg-btn').addEventListener('click', () => {
  if (!menuTargetMsg) return;
  startEdit(menuTargetMsg);
  msgMenu.classList.add('hidden');
});

document.getElementById('delete-msg-btn').addEventListener('click', async () => {
  if (!menuTargetMsg) return;
  if (confirm('Delete this message?')) {
    await supabase.from('messages').delete().eq('id', menuTargetMsg.id);
    await loadMessages();
  }
  msgMenu.classList.add('hidden');
});

function startEdit(m) {
  editingMsgId = m.id;
  textarea.value = m.content;
  autoGrow();
  textarea.focus();

  // Show editing banner
  if (!document.getElementById('editing-banner')) {
    const banner = document.createElement('div');
    banner.className = 'editing-banner';
    banner.id = 'editing-banner';
    banner.innerHTML = `Editing message <span class="cancel-edit">cancel</span>`;
    inputArea.insertBefore(banner, inputArea.firstChild);
    banner.querySelector('.cancel-edit').addEventListener('click', cancelEdit);
  }
}

function cancelEdit() {
  editingMsgId = null;
  textarea.value = '';
  autoGrow();
  const banner = document.getElementById('editing-banner');
  if (banner) banner.remove();
}

// Close popups when clicking elsewhere
document.addEventListener('click', () => {
  personaPopup.classList.add('hidden');
  msgMenu.classList.add('hidden');
});

// ── REALTIME ──────────────────────────────────────────────────

function subscribeRealtime() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);

  realtimeChannel = supabase
    .channel(`chapter:${chapterId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'messages',
      filter: `chapter_id=eq.${chapterId}`
    }, () => {
      loadMessages();
    })
    .subscribe();
}

// ── CHARACTER SETUP (receiver joining a story) ────────────────

function showCharSetup() {
  const overlay = document.createElement('div');
  overlay.className = 'char-setup-overlay';
  overlay.innerHTML = `
    <div class="char-setup-card">
      <div class="char-setup-title">Create your character</div>
      <div class="char-setup-sub">Before you join this story, set up who you'll be playing.</div>
      <div class="char-setup-grid">
        <input class="field-input" id="cs-name" placeholder="Name">
        <input class="field-input" id="cs-age" placeholder="Age">
        <input class="field-input" id="cs-pronouns" placeholder="Pronouns">
        <input class="field-input" id="cs-likes" placeholder="Likes">
        <input class="field-input" id="cs-dislikes" placeholder="Dislikes">
      </div>
      <textarea class="field-textarea" id="cs-description" rows="3"
        placeholder="Visual description & personality"></textarea>
      <button class="btn-primary" id="cs-save">Join story</button>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('cs-save').addEventListener('click', async () => {
    const name = document.getElementById('cs-name').value.trim();
    if (!name) { alert('Please give your character a name.'); return; }

    const { data: char } = await supabase
      .from('characters')
      .insert({
        story_id: storyId,
        owned_by: userId,
        name,
        age: document.getElementById('cs-age').value.trim(),
        pronouns: document.getElementById('cs-pronouns').value.trim(),
        likes: document.getElementById('cs-likes').value.trim(),
        dislikes: document.getElementById('cs-dislikes').value.trim(),
        description: document.getElementById('cs-description').value.trim()
      })
      .select()
      .single();

    myCharacter = char;
    characters.push(char);
    overlay.remove();

    // Continue init
    if (!chapterId && chapters.length) chapterId = chapters[0].id;
    renderChapterTabs();
    setupPersona();
    inputArea.style.display = 'block';
    await loadMessages();
    subscribeRealtime();
  });
}

init();
