import { requireAuth } from '../auth.js';
import { applyTheme } from '../theme.js';
import { supabase } from '../supabase-client.js';

const session = await requireAuth();
if (!session) throw new Error('Not authenticated');
await applyTheme();

const userId = session.user.id;

// ── TAG EDITORS ───────────────────────────────────────────────

const storyTags   = [];
const contentTags = [];

setupTagEditor('story-tags', 'story-tag-input', 'add-story-tag', storyTags, false);
setupTagEditor('content-tags', 'content-tag-input', 'add-content-tag', contentTags, true);

function setupTagEditor(containerId, inputId, btnId, tagArray, isContent) {
  const container = document.getElementById(containerId);
  const input     = document.getElementById(inputId);
  const btn       = document.getElementById(btnId);

  function addTag() {
    const val = input.value.trim();
    if (!val || tagArray.includes(val)) { input.value = ''; return; }
    tagArray.push(val);
    input.value = '';
    render();
  }

  function render() {
    container.innerHTML = tagArray.map((t, i) => `
      <span class="editable-tag ${isContent ? 'content' : ''}">
        ${t}
        <span class="remove-tag" data-i="${i}">×</span>
      </span>`).join('');

    container.querySelectorAll('.remove-tag').forEach(x => {
      x.addEventListener('click', () => {
        tagArray.splice(parseInt(x.dataset.i), 1);
        render();
      });
    });
  }

  btn.addEventListener('click', addTag);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
  });
}

// ── SEND PROPOSAL ─────────────────────────────────────────────

const sendBtn  = document.getElementById('send-proposal-btn');
const errorMsg = document.getElementById('error-msg');

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}

sendBtn.addEventListener('click', async () => {
  errorMsg.classList.add('hidden');

  const title    = document.getElementById('title').value.trim();
  const emoji    = document.getElementById('cover-emoji').value.trim() || '🌸';
  const summary  = document.getElementById('summary').value.trim();
  const charName = document.getElementById('char-name').value.trim();
  const opening  = document.getElementById('opening-message').value.trim();

  if (!title)    return showError('Please give your story a title.');
  if (!charName) return showError('Please name your character.');
  if (!opening)  return showError('Please write an opening message.');

  sendBtn.textContent = 'Sending...';
  sendBtn.disabled = true;

  try {
    // 1. Create the story (status: proposed)
    const { data: story, error: storyErr } = await supabase
      .from('stories')
      .insert({
        title,
        summary,
        cover_emoji: emoji,
        status: 'proposed',
        created_by: userId
      })
      .select()
      .single();

    if (storyErr) throw storyErr;

    // 2. Insert tags
    const allTags = [
      ...storyTags.map(t => ({ story_id: story.id, tag: t, tag_type: 'story' })),
      ...contentTags.map(t => ({ story_id: story.id, tag: t, tag_type: 'content' }))
    ];
    if (allTags.length) {
      await supabase.from('story_tags').insert(allTags);
    }

    // 3. Create the proposer's character
    const { data: character, error: charErr } = await supabase
      .from('characters')
      .insert({
        story_id: story.id,
        owned_by: userId,
        name: charName,
        age: document.getElementById('char-age').value.trim(),
        pronouns: document.getElementById('char-pronouns').value.trim(),
        likes: document.getElementById('char-likes').value.trim(),
        dislikes: document.getElementById('char-dislikes').value.trim(),
        description: document.getElementById('char-description').value.trim()
      })
      .select()
      .single();

    if (charErr) throw charErr;

    // 4. Create a first chapter
    const { data: chapter } = await supabase
      .from('chapters')
      .insert({ story_id: story.id, title: 'ch. 1', position: 1 })
      .select()
      .single();

    // 5. Save the opening message
    await supabase.from('messages').insert({
      chapter_id: chapter.id,
      story_id: story.id,
      sent_by: userId,
      character_id: character.id,
      content: opening,
      mode: 'character'
    });

    // 6. Create the proposal record
    await supabase.from('proposals').insert({
      story_id: story.id,
      proposed_by: userId,
      proposed_summary: summary,
      status: 'pending'
    });

    // Done — back to stories
    window.location.href = '/Aishiteru/pages/stories.html';

  } catch (err) {
    showError('Something went wrong. Please try again.');
    sendBtn.textContent = '💌 Send proposal';
    sendBtn.disabled = false;
  }
});
