import { requireAuth } from '../auth.js';
import { applyTheme } from '../theme.js';
import { supabase } from '../supabase-client.js';

const session = await requireAuth();
if (!session) throw new Error('Not authenticated');
await applyTheme();

const userId = session.user.id;

const filterBar = document.getElementById('filter-bar');
const bookGrid  = document.getElementById('book-grid');
const bookModal = document.getElementById('book-modal');
const modalCard = document.getElementById('book-modal-card');

let books = [];
let activeFilter = 'all';
let profilesById = {};

// ── LOAD ──────────────────────────────────────────────────────

async function load() {
  // Load both profiles for review attribution
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name');
  (profiles || []).forEach(p => { profilesById[p.id] = p.display_name; });

  const { data } = await supabase
    .from('stories')
    .select('*, story_tags(tag, tag_type), reviews(reviewed_by, hearts), chapters(id)')
    .eq('status', 'finished')
    .order('updated_at', { ascending: false });

  books = data || [];

  if (!books.length) {
    filterBar.innerHTML = '';
    bookGrid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1; margin-top:30px;">
        📚<br><br>Your bookshelf is empty for now.<br>
        Finish a story to add it here.
      </div>`;
    return;
  }

  renderFilters();
  renderBooks();
}

// ── FILTERS ───────────────────────────────────────────────────

function renderFilters() {
  // Collect all unique story tags
  const tagSet = new Set();
  books.forEach(b => {
    b.story_tags?.filter(t => t.tag_type === 'story').forEach(t => tagSet.add(t.tag));
  });

  const tags = ['all', ...tagSet];
  filterBar.innerHTML = tags.map(t => `
    <button class="filter-pill ${t === activeFilter ? 'active-filter' : ''}" data-tag="${t}">
      ${t}
    </button>`).join('');

  filterBar.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      activeFilter = pill.dataset.tag;
      renderFilters();
      renderBooks();
    });
  });
}

// ── BOOK GRID ─────────────────────────────────────────────────

function renderBooks() {
  const filtered = activeFilter === 'all'
    ? books
    : books.filter(b => b.story_tags?.some(t => t.tag === activeFilter && t.tag_type === 'story'));

  if (!filtered.length) {
    bookGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No books with that tag.</div>`;
    return;
  }

  bookGrid.innerHTML = filtered.map(b => {
    const avgHearts = averageHearts(b.reviews);
    return `
      <div class="book-cover" data-id="${b.id}">
        <div class="book-img">
          ${b.cover_image_url ? `<img src="${b.cover_image_url}" alt="${b.title}">` : (b.cover_emoji || '🌹')}
        </div>
        <div class="book-spine">
          <div class="book-title">${b.title}</div>
          <div class="book-hearts">${heartString(avgHearts)}</div>
        </div>
      </div>`;
  }).join('');

  bookGrid.querySelectorAll('.book-cover').forEach(cover => {
    cover.addEventListener('click', () => openBook(cover.dataset.id));
  });
}

function averageHearts(reviews) {
  if (!reviews || !reviews.length) return 0;
  return reviews.reduce((sum, r) => sum + r.hearts, 0) / reviews.length;
}

function heartString(avg) {
  const rounded = Math.round(avg);
  let s = '';
  for (let i = 1; i <= 5; i++) {
    s += i <= rounded ? '♥' : '<span class="empty-heart">♥</span>';
  }
  return s;
}

// ── BOOK MODAL + REVIEW ───────────────────────────────────────

function openBook(bookId) {
  const book = books.find(b => b.id === bookId);
  if (!book) return;

  const storyTags   = book.story_tags?.filter(t => t.tag_type === 'story') || [];
  const myReview    = book.reviews?.find(r => r.reviewed_by === userId);
  const myHearts    = myReview?.hearts || 0;

  modalCard.innerHTML = `
    <div class="modal-cover">
      ${book.cover_image_url ? `<img src="${book.cover_image_url}" alt="${book.title}">` : (book.cover_emoji || '🌹')}
      <button class="modal-close" id="modal-close">×</button>
    </div>
    <div class="modal-body">
      <div class="modal-title">${book.title}</div>
      <div class="modal-summary">${book.summary || 'No summary.'}</div>

      ${storyTags.length ? `
      <div class="modal-tags">
        ${storyTags.map(t => `<span class="tag">${t.tag}</span>`).join('')}
      </div>` : ''}

      <div class="review-section">
        <div class="review-prompt">Your review</div>
        <div class="heart-picker" id="heart-picker">
          ${[1,2,3,4,5].map(n => `
            <span class="heart-pick ${n <= myHearts ? 'filled' : ''}" data-n="${n}">♥</span>
          `).join('')}
        </div>
        <div class="review-status" id="review-status">
          ${myReview ? 'Tap to change your rating' : 'Tap a heart to rate this story'}
        </div>
        ${renderBothReviews(book.reviews)}
      </div>

      <div class="modal-actions">
        <a class="btn-outline reopen-btn" href="/Aishiteru/pages/chat.html?story_id=${book.id}">
          <i class="ti ti-book-2"></i> Reread
        </a>
        <button class="btn-outline reopen-btn" id="unfinish-btn">
          <i class="ti ti-arrow-back-up"></i> Reopen
        </button>
      </div>
    </div>`;

  bookModal.classList.remove('hidden');

  document.getElementById('modal-close').addEventListener('click', closeModal);
  bookModal.addEventListener('click', (e) => {
    if (e.target === bookModal) closeModal();
  });

  // Heart picker
  modalCard.querySelectorAll('.heart-pick').forEach(h => {
    h.addEventListener('click', () => saveReview(book, parseInt(h.dataset.n)));
    h.addEventListener('mouseenter', () => previewHearts(parseInt(h.dataset.n)));
  });
  document.getElementById('heart-picker').addEventListener('mouseleave', () => {
    previewHearts(book.reviews?.find(r => r.reviewed_by === userId)?.hearts || 0);
  });

  // Reopen story
  document.getElementById('unfinish-btn').addEventListener('click', async () => {
    if (!confirm('Move this story back to active?')) return;
    await supabase.from('stories').update({ status: 'active' }).eq('id', book.id);
    closeModal();
    load();
  });
}

function renderBothReviews(reviews) {
  if (!reviews || !reviews.length) return '';
  return `
    <div class="both-reviews">
      ${reviews.map(r => `
        <div class="review-by">
          <div class="review-by-name">${profilesById[r.reviewed_by] || 'Someone'}</div>
          <div class="review-by-hearts">${'♥'.repeat(r.hearts)}</div>
        </div>`).join('')}
    </div>`;
}

function previewHearts(n) {
  modalCard.querySelectorAll('.heart-pick').forEach(h => {
    h.classList.toggle('filled', parseInt(h.dataset.n) <= n);
  });
}

async function saveReview(book, hearts) {
  const existing = book.reviews?.find(r => r.reviewed_by === userId);

  if (existing) {
    await supabase.from('reviews')
      .update({ hearts })
      .eq('story_id', book.id)
      .eq('reviewed_by', userId);
  } else {
    await supabase.from('reviews')
      .insert({ story_id: book.id, reviewed_by: userId, hearts });
  }

  document.getElementById('review-status').textContent = 'Saved ✓';
  // Refresh local data then re-render both-reviews
  await load();
  // Reopen modal with fresh data
  openBook(book.id);
}

function closeModal() {
  bookModal.classList.add('hidden');
}

load();
