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

const body = document.getElementById('counter-body');
const headerTitle = document.getElementById('header-title');

if (!storyId) {
  body.innerHTML = '<div class="empty-state">No proposal selected.</div>';
  throw new Error('No story id');
}

let story, proposal, openingMsg, proposerChar;
let editMode = false;
const editedStoryTags = [];
const editedContentTags = [];

async function load() {
  const { data } = await supabase
    .from('stories')
    .select('*, story_tags(tag, tag_type), proposals(*), characters(*), chapters(id, messages(*))')
    .eq('id', storyId)
    .single();

  if (!data) {
    body.innerHTML = '<div class="empty-state">Proposal not found.</div>';
    return;
  }

  story = data;
  proposal = data.proposals?.[0];
  proposerChar = data.characters?.find(c => c.owned_by === proposal?.proposed_by);

  // Find the opening message
  const allMsgs = (data.chapters || []).flatMap(ch => ch.messages || []);
  openingMsg = allMsgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];

  headerTitle.textContent = story.title;

  const isMine = proposal?.proposed_by === userId;
  const isCountered = proposal?.status === 'countered';

  // Decide which view to show:
  // - If I proposed it and it's been countered → sender review view
  // - If I proposed it and still pending → waiting view
  // - If they proposed it → receiver view
  if (isMine && isCountered) {
    renderSenderReview();
  } else if (isMine) {
    renderWaiting();
  } else {
    renderReceiver();
  }
}

function tagsByType(type) {
  return story.story_tags?.filter(t => t.tag_type === type) || [];
}

// ── WAITING (I proposed, still pending) ──────────────────────

function renderWaiting() {
  body.innerHTML = `
    <div class="counter-note sender">💌 You proposed this story. Waiting for a response...</div>
    ${summaryBlock()}
    ${tagsBlock()}
    ${characterBlock()}
    ${openingBlock()}
  `;
}

// ── RECEIVER (they proposed, I respond) ──────────────────────

function renderReceiver() {
  if (editMode) return renderReceiverEditing();

  body.innerHTML = `
    <div class="counter-note receiver">💌 You received a story proposal. Review it, then accept or suggest edits.</div>
    ${summaryBlock()}
    ${tagsBlock()}
    ${characterBlock()}
    ${openingBlock()}
    <div class="btn-row">
      <button class="btn-outline" id="propose-edits-btn" style="flex:1;">
        <i class="ti ti-edit"></i> Suggest edits
      </button>
      <button class="btn-primary" id="accept-btn" style="flex:1;">
        <i class="ti ti-check"></i> Accept &amp; join
      </button>
    </div>
  `;

  document.getElementById('propose-edits-btn').addEventListener('click', () => {
    editMode = true;
    // Pre-fill editable tags with current ones
    editedStoryTags.length = 0;
    editedContentTags.length = 0;
    tagsByType('story').forEach(t => editedStoryTags.push(t.tag));
    tagsByType('content').forEach(t => editedContentTags.push(t.tag));
    renderReceiver();
  });

  document.getElementById('accept-btn').addEventListener('click', acceptProposal);
}

function renderReceiverEditing() {
  body.innerHTML = `
    <div class="counter-note receiver">✏️ Edit what you'd like to change. The character and opening message stay as the sender wrote them.</div>

    <div class="counter-field">
      <div class="cf-label">SUMMARY <span class="badge-editable">editable</span></div>
      <textarea class="field-textarea" id="edit-summary" rows="3">${story.summary || ''}</textarea>
    </div>

    <div class="counter-field">
      <div class="cf-label">STORY TAGS <span class="badge-editable">editable</span></div>
      <div class="tag-row" id="edit-story-tags"></div>
      <div class="edit-tag-row">
        <input class="field-input edit-tag-input" id="story-tag-input" placeholder="Add tag">
        <button class="btn-add-tag" id="add-story-tag">Add</button>
      </div>
    </div>

    <div class="counter-field">
      <div class="cf-label">CONTENT TAGS <span class="badge-editable">editable</span></div>
      <div class="tag-row" id="edit-content-tags"></div>
      <div class="edit-tag-row">
        <input class="field-input edit-tag-input" id="content-tag-input" placeholder="Add tag">
        <button class="btn-add-tag" id="add-content-tag">Add</button>
      </div>
    </div>

    <div class="counter-field">
      <div class="cf-label">CHARACTER <span class="badge-locked">locked</span></div>
      <div class="locked-box"><i class="ti ti-lock"></i> ${proposerChar?.name || 'Sender\'s character'} — can't be edited</div>
    </div>

    <div class="counter-field">
      <div class="cf-label">OPENING MESSAGE <span class="badge-locked">locked</span></div>
      <div class="locked-box"><i class="ti ti-lock"></i> Sender's opening — locked</div>
    </div>

    <div class="counter-field">
      <div class="cf-label">NOTES <span style="font-size:9px;">(disappears when story starts)</span></div>
      <textarea class="field-textarea" id="edit-notes" rows="2" placeholder="Add a note to the sender..."></textarea>
    </div>

    <button class="btn-primary" id="send-counter-btn">💌 Send counter-proposal</button>
  `;

  setupEditTags('edit-story-tags', 'story-tag-input', 'add-story-tag', editedStoryTags, false);
  setupEditTags('edit-content-tags', 'content-tag-input', 'add-content-tag', editedContentTags, true);

  document.getElementById('send-counter-btn').addEventListener('click', sendCounter);
}

// ── SENDER REVIEW (I proposed, they countered) ───────────────

function renderSenderReview() {
  body.innerHTML = `
    <div class="counter-note sender">💌 Your partner suggested changes. Green text is their edit. You can adjust anything before accepting.</div>

    <div class="counter-field">
      <div class="cf-label">SUMMARY</div>
      ${proposal.counter_summary && proposal.counter_summary !== story.summary
        ? `<div class="cf-original">${story.summary || ''}</div>
           <div class="cf-proposed">${proposal.counter_summary}</div>`
        : `<div class="cf-value">${story.summary || 'No summary.'}</div>`}
    </div>

    ${tagsBlock()}
    ${characterBlock(true)}
    ${openingBlock(true)}

    ${proposal.counter_notes ? `
    <div class="counter-field">
      <div class="cf-label">THEIR NOTES</div>
      <div class="notes-box">${proposal.counter_notes}</div>
    </div>` : ''}

    <div class="btn-row">
      <button class="btn-primary" id="accept-counter-btn">
        <i class="ti ti-check"></i> Accept &amp; begin
      </button>
    </div>
  `;

  document.getElementById('accept-counter-btn').addEventListener('click', async () => {
    // Apply countered summary if present
    const updates = { status: 'active' };
    if (proposal.counter_summary) updates.summary = proposal.counter_summary;
    await supabase.from('stories').update(updates).eq('id', storyId);
    await supabase.from('proposals').update({ status: 'accepted' }).eq('id', proposal.id);
    window.location.href = `/Aishiteru/pages/chat.html?story_id=${storyId}`;
  });
}

// ── SHARED BLOCKS ────────────────────────────────────────────

function summaryBlock() {
  return `
    <div class="counter-field">
      <div class="cf-label">SUMMARY</div>
      <div class="cf-value">${story.summary || 'No summary yet.'}</div>
    </div>`;
}

function tagsBlock() {
  const st = tagsByType('story');
  const ct = tagsByType('content');
  let html = '';
  if (st.length) {
    html += `<div class="counter-field"><div class="cf-label">STORY TAGS</div>
      <div class="tag-row">${st.map(t => `<span class="tag">${t.tag}</span>`).join('')}</div></div>`;
  }
  if (ct.length) {
    html += `<div class="counter-field"><div class="cf-label">CONTENT TAGS</div>
      <div class="tag-row">${ct.map(t => `<span class="tag content-tag">${t.tag}</span>`).join('')}</div></div>`;
  }
  return html;
}

function characterBlock(editable = false) {
  if (!proposerChar) return '';
  const meta = [proposerChar.age && `age ${proposerChar.age}`, proposerChar.pronouns].filter(Boolean).join(' · ');
  return `
    <div class="counter-field">
      <div class="cf-label">${editable ? 'YOUR CHARACTER' : 'THEIR CHARACTER'}</div>
      <div class="cf-value">${proposerChar.name}${meta ? ' · ' + meta : ''}${proposerChar.description ? ' — ' + proposerChar.description : ''}</div>
    </div>`;
}

function openingBlock() {
  if (!openingMsg) return '';
  return `
    <div class="counter-field">
      <div class="cf-label">OPENING MESSAGE</div>
      <div class="opening-preview">${parseMessage(openingMsg.content)}</div>
    </div>`;
}

// ── TAG EDITOR FOR COUNTER ───────────────────────────────────

function setupEditTags(containerId, inputId, btnId, arr, isContent) {
  const container = document.getElementById(containerId);
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);

  function render() {
    container.innerHTML = arr.map((t, i) => `
      <span class="editable-tag ${isContent ? 'content' : ''}">
        ${t}<span class="remove-tag" data-i="${i}">×</span>
      </span>`).join('');
    container.querySelectorAll('.remove-tag').forEach(x => {
      x.addEventListener('click', () => { arr.splice(+x.dataset.i, 1); render(); });
    });
  }

  function add() {
    const v = input.value.trim();
    if (!v || arr.includes(v)) { input.value = ''; return; }
    arr.push(v); input.value = ''; render();
  }

  btn.addEventListener('click', add);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  render();
}

// ── ACCEPT PROPOSAL (receiver) ───────────────────────────────

async function acceptProposal() {
  // Receiver accepts as-is → story goes active, receiver will add their
  // character when they first open the chat
  await supabase.from('stories').update({ status: 'active' }).eq('id', storyId);
  await supabase.from('proposals').update({ status: 'accepted' }).eq('id', proposal.id);
  window.location.href = `/Aishiteru/pages/chat.html?story_id=${storyId}`;
}

// ── SEND COUNTER (receiver suggests edits) ───────────────────

async function sendCounter() {
  const newSummary = document.getElementById('edit-summary').value.trim();
  const notes = document.getElementById('edit-notes').value.trim();

  // Update the proposal with countered values
  await supabase.from('proposals').update({
    status: 'countered',
    counter_summary: newSummary,
    counter_notes: notes
  }).eq('id', proposal.id);

  // Replace story tags with the edited set
  await supabase.from('story_tags').delete().eq('story_id', storyId);
  const allTags = [
    ...editedStoryTags.map(t => ({ story_id: storyId, tag: t, tag_type: 'story' })),
    ...editedContentTags.map(t => ({ story_id: storyId, tag: t, tag_type: 'content' }))
  ];
  if (allTags.length) await supabase.from('story_tags').insert(allTags);

  window.location.href = '/Aishiteru/pages/stories.html';
}

load();
