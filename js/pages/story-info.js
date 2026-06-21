import { requireAuth } from '../auth.js';
import { applyTheme } from '../theme.js';
import { supabase } from '../supabase-client.js';

const session = await requireAuth();
if (!session) throw new Error('Not authenticated');
await applyTheme();

const userId = session.user.id;
const params = new URLSearchParams(window.location.search);
const storyId = params.get('story_id');

const infoBody   = document.getElementById('info-body');
const headerTitle = document.getElementById('header-title');
const chapterBar = document.getElementById('chapter-bar');

if (!storyId) {
  infoBody.innerHTML = '<div class="empty-state">No story selected.</div>';
  throw new Error('No story id');
}

let activeCharIndex = 0;
let characters = [];

async function load() {
  const { data: story } = await supabase
    .from('stories')
    .select('*, story_tags(tag, tag_type), characters(*), chapters(id, title, position)')
    .eq('id', storyId)
    .single();

  if (!story) {
    infoBody.innerHTML = '<div class="empty-state">Story not found.</div>';
    return;
  }

  headerTitle.textContent = story.title;
  characters = story.characters || [];

  // Build chapter tabs
  const chapters = (story.chapters || []).sort((a, b) => a.position - b.position);
  chapterBar.innerHTML = `<div class="ch-tab info-tab active-ch">ⓘ info</div>` +
    chapters.map(ch => `
      <a class="ch-tab" href="/Aishiteru/pages/chat.html?story_id=${storyId}&chapter_id=${ch.id}">
        ${ch.title}
      </a>`).join('');

  const storyTags   = story.story_tags?.filter(t => t.tag_type === 'story') || [];
  const contentTags = story.story_tags?.filter(t => t.tag_type === 'content') || [];

  infoBody.innerHTML = `
    <div class="cover-display">
      ${story.cover_image_url
        ? `<img src="${story.cover_image_url}" alt="cover">`
        : (story.cover_emoji || '🌸')}
    </div>

    <div class="info-field">
      <div class="info-field-label">SUMMARY</div>
      <div class="info-field-value">${story.summary || 'No summary yet.'}</div>
    </div>

    ${storyTags.length ? `
    <div class="info-field">
      <div class="info-field-label">STORY TAGS</div>
      <div class="tag-row">
        ${storyTags.map(t => `<span class="tag">${t.tag}</span>`).join('')}
      </div>
    </div>` : ''}

    ${contentTags.length ? `
    <div class="info-field">
      <div class="info-field-label">CONTENT TAGS</div>
      <div class="tag-row">
        ${contentTags.map(t => `<span class="tag content-tag">${t.tag}</span>`).join('')}
      </div>
    </div>` : ''}

    <div class="info-field">
      <div class="info-field-label">CHARACTERS</div>
      <div class="char-toggle-row" id="char-toggle"></div>
      <div id="char-card-container"></div>
    </div>

    <a class="open-chat-btn" href="/Aishiteru/pages/chat.html?story_id=${storyId}">
      <i class="ti ti-book-2" aria-hidden="true"></i>
      Open story
    </a>

    ${story.status === 'active' ? `
    <button class="finish-btn" id="finish-btn">
      <i class="ti ti-book" aria-hidden="true"></i>
      <span>Finish &amp; publish to shelf</span>
    </button>` : ''}
  `;

  renderCharToggle();
  renderCharCard();

  const finishBtn = document.getElementById('finish-btn');
  if (finishBtn) {
    finishBtn.addEventListener('click', async () => {
      if (!confirm('Finish this story and move it to the bookshelf?')) return;
      await supabase.from('stories').update({ status: 'finished' }).eq('id', storyId);
      window.location.href = '/Aishiteru/pages/shelf.html';
    });
  }
}

function renderCharToggle() {
  const toggle = document.getElementById('char-toggle');
  if (!characters.length) {
    toggle.innerHTML = '<span class="char-description-text">No characters yet.</span>';
    return;
  }
  toggle.innerHTML = characters.map((c, i) => `
    <button class="char-toggle-btn ${i === activeCharIndex ? 'active-char' : ''}" data-i="${i}">
      ${c.name}
    </button>`).join('');

  toggle.querySelectorAll('.char-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCharIndex = parseInt(btn.dataset.i);
      renderCharToggle();
      renderCharCard();
    });
  });
}

function renderCharCard() {
  const container = document.getElementById('char-card-container');
  if (!characters.length) { container.innerHTML = ''; return; }

  const c = characters[activeCharIndex];
  const meta = [c.age && `age ${c.age}`, c.pronouns].filter(Boolean);
  const likes = [c.likes && `★ ${c.likes}`, c.dislikes && `✗ ${c.dislikes}`].filter(Boolean);

  container.innerHTML = `
    <div class="char-card">
      <div class="char-pic">
        ${c.avatar_url ? `<img src="${c.avatar_url}" alt="${c.name}">` : '👤'}
      </div>
      <div class="char-info">
        <div class="char-name-display">${c.name}</div>
        ${meta.length ? `<div class="char-meta-pills">${meta.map(m => `<span class="char-meta-pill">${m}</span>`).join('')}</div>` : ''}
        ${c.description ? `<div class="char-description-text">${c.description}</div>` : ''}
        ${likes.length ? `<div class="char-meta-pills">${likes.map(m => `<span class="char-meta-pill">${m}</span>`).join('')}</div>` : ''}
      </div>
    </div>`;
}

load();
