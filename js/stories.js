import { requireAuth } from '../auth.js';
import { applyTheme } from '../theme.js';
import { supabase } from '../supabase-client.js';

const session = await requireAuth();
if (!session) throw new Error('Not authenticated');
await applyTheme();

const userId = session.user.id;

const activeList   = document.getElementById('active-stories');
const proposedList = document.getElementById('proposed-stories');
const proposedRow  = document.getElementById('proposed-section-row');
const newStoryBtn  = document.getElementById('new-story-btn');

newStoryBtn.addEventListener('click', () => {
  window.location.href = '/Aishiteru/pages/propose.html';
});

// ── LOAD STORIES ─────────────────────────────────────────────

async function loadStories() {
  // Active and finished stories
  const { data: stories, error } = await supabase
    .from('stories')
    .select(`
      id, title, summary, cover_emoji, status, updated_at,
      story_favorites(user_id)
    `)
    .in('status', ['active', 'finished'])
    .order('updated_at', { ascending: false });

  if (error) {
    activeList.innerHTML = '<div class="empty-state">Couldn\'t load stories.</div>';
    return;
  }

  if (!stories || stories.length === 0) {
    activeList.innerHTML = `
      <div class="empty-state">
        No stories yet.<br>Tap + to propose your first one.
      </div>`;
    return;
  }

  // Get unread message counts (messages since last visit)
  // For now we show total recent messages per story as the badge
  const { data: recentMsgs } = await supabase
    .from('messages')
    .select('story_id, sent_by')
    .neq('sent_by', userId)
    .gte('created_at', new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString());

  const unreadCounts = {};
  if (recentMsgs) {
    recentMsgs.forEach(m => {
      unreadCounts[m.story_id] = (unreadCounts[m.story_id] || 0) + 1;
    });
  }

  activeList.innerHTML = stories.map(s => renderStoryCard(s, unreadCounts)).join('');

  // Attach favorite toggle listeners
  activeList.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(btn.dataset.storyId, btn.dataset.favorited === 'true');
    });
  });
}

// ── LOAD PROPOSALS ────────────────────────────────────────────

async function loadProposals() {
  const { data: stories } = await supabase
    .from('stories')
    .select('id, title, summary, cover_emoji, proposals(id, status, proposed_by)')
    .eq('status', 'proposed')
    .order('updated_at', { ascending: false });

  if (!stories || stories.length === 0) {
    proposedRow.style.display = 'none';
    proposedList.innerHTML = '';
    return;
  }

  proposedRow.style.display = 'flex';
  proposedList.innerHTML = stories.map(s => {
    const proposal  = s.proposals?.[0];
    const isMine    = proposal?.proposed_by === userId;
    const isCounter = proposal?.status === 'countered';
    const badge     = isCounter && isMine
      ? '<span class="counter-badge">counter ↩</span>'
      : isMine
        ? '<span class="proposed-badge">proposed</span>'
        : '<span class="proposed-badge">respond</span>';

    return `
      <a class="story-card proposed-story"
         href="/Aishiteru/pages/counter.html?story_id=${s.id}">
        <div class="story-icon">${s.cover_emoji || '🌸'}</div>
        <div class="story-meta">
          <div class="story-title">${s.title}</div>
          <div class="story-summary">${s.summary || 'No summary yet.'}</div>
        </div>
        ${badge}
      </a>`;
  }).join('');
}

// ── RENDER STORY CARD ─────────────────────────────────────────

function renderStoryCard(story, unreadCounts) {
  const isFav    = story.story_favorites?.some(f => f.user_id === userId);
  const unread   = unreadCounts[story.id] || 0;
  const badge    = unread > 0
    ? `<span class="notif-badge"><i class="ti ti-heart"></i> ${unread}</span>`
    : '';
  const starIcon = isFav ? '★' : '☆';
  const starClass = isFav ? 'star-btn' : 'star-btn empty';

  return `
    <a class="story-card ${story.status === 'active' ? 'active-story' : ''}"
       href="/Aishiteru/pages/chat.html?story_id=${story.id}">
      <button class="${starClass}"
              data-story-id="${story.id}"
              data-favorited="${isFav}"
              title="${isFav ? 'Unfavorite' : 'Favorite'}">
        ${starIcon}
      </button>
      <div class="story-icon">${story.cover_emoji || '🌸'}</div>
      <div class="story-meta">
        <div class="story-title">${story.title}</div>
        <div class="story-summary">${story.summary || 'No summary yet.'}</div>
      </div>
      ${badge}
    </a>`;
}

// ── TOGGLE FAVORITE ───────────────────────────────────────────

async function toggleFavorite(storyId, currentlyFavorited) {
  if (currentlyFavorited) {
    await supabase
      .from('story_favorites')
      .delete()
      .eq('story_id', storyId)
      .eq('user_id', userId);
  } else {
    await supabase
      .from('story_favorites')
      .insert({ story_id: storyId, user_id: userId });
  }
  // Re-render to reflect change
  loadStories();
}

// ── REALTIME — badge updates when partner sends a message ─────

supabase
  .channel('story_notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages'
  }, () => {
    loadStories();
  })
  .subscribe();

// ── INIT ──────────────────────────────────────────────────────

loadStories();
loadProposals();
