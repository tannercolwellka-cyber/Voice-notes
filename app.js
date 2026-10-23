import { store, syncEnabled, titleFrom, pending, queue, flush } from './store.js';
import { speechSupported, startListening } from './speech.js';
import * as lib from './library.js';
import * as auto from './suggest.js';

const $ = id => document.getElementById(id);

let notes = [];
let stopListening = null;
let openId = null;      // the note in the dialog, or null for a new one
let folder = null;      // folder filter: null = all, '' = no folder

// ---------- start up ----------

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

  if (syncEnabled && !(await store.user())) {
    $('auth').hidden = false;
    return;
  }
  showApp();
}

async function showApp() {
  $('auth').hidden = true;
  $('app').hidden = false;
  $('sign-out').hidden = !syncEnabled;
  $('sync-status').textContent = syncEnabled ? 'Synced' : 'This device only';
  if (!speechSupported) {
    $('record').disabled = true;
    $('record-hint').textContent = 'Voice isn’t supported in this browser. Try Safari or Chrome.';
  }
  await flush();
  await refresh();
  store.subscribe(refresh);
  addEventListener('online', async () => { await flush(); await refresh(); });
}

// ---------- sign in ----------

$('auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  await authWith('signIn');
});
$('auth-signup').addEventListener('click', () => authWith('signUp'));

async function authWith(method) {
  $('auth-error').textContent = '';
  try {
    await store[method]($('auth-email').value, $('auth-password').value);
    if (await store.user()) showApp();
    else $('auth-error').textContent = 'Check your email to confirm your account, then sign in.';
  } catch (err) {
    $('auth-error').textContent = err.message;
  }
}

$('sign-out').addEventListener('click', async () => {
  await store.signOut();
  location.reload();
});

// ---------- recording ----------

$('record').addEventListener('click', () => {
  if (stopListening) {
    stopListening();
    return;
  }
  $('live').hidden = false;
  $('live').textContent = 'Listening…';
  setRecording(true);
  stopListening = startListening(
    text => { $('live').textContent = text; },
    async text => {
      stopListening = null;
      setRecording(false);
      $('live').hidden = true;
      if (text) await save(text, 'voice');
    });
});

function setRecording(on) {
  $('record').classList.toggle('on', on);
  $('record').setAttribute('aria-label', on ? 'Stop recording' : 'Start recording');
  $('record-hint').textContent = on ? 'Tap to stop and save' : 'Tap to record';
}

$('type-form').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('type-input').value.trim();
  if (!text) return;
  $('type-input').value = '';
  await save(text, 'typed');
});

async function save(body, source) {
  // New notes go into the folder you're looking at.
  const note = { title: titleFrom(body), body, source, folder: folder || '' };
  let made;
  try {
    made = await store.create(note);
  } catch {
    queue({ ...note, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  }
  if (made) await organize(made);
  await refresh();
}

// ---------- auto-organize ----------

let undoTimer = null;

// Files a new note and links it to related ones, then offers Undo.
// When you're looking at a folder, the note stays in that folder.
async function organize(note) {
  const s = auto.suggest(note, notes);
  if (folder !== null) s.folder = null;
  if (auto.isEmpty(s)) return;
  const before = { body: note.body, folder: note.folder };
  await store.update(note.id, auto.apply(note, s));
  showUndo(auto.describe(s), async () => {
    await store.update(note.id, before);
    await refresh();
  });
}

function showUndo(text, undo) {
  clearTimeout(undoTimer);
  // An open note blocks the rest of the page, so show the bar inside it.
  if ($('note-dialog').open) $('note-view').prepend($('undo-bar'));
  else $('app').querySelector('.toolbar').before($('undo-bar'));
  $('undo-bar').querySelector('span').textContent = text + '.';
  $('undo-bar').hidden = false;
  $('undo').onclick = async () => {
    $('undo-bar').hidden = true;
    await undo();
  };
  undoTimer = setTimeout(() => { $('undo-bar').hidden = true; }, 12000);
}

// ---------- list ----------

async function refresh() {
  const waiting = pending().map(n => ({ ...n, waiting: true }));
  try {
    notes = [...waiting, ...await store.list()];
    $('sync-status').textContent = syncEnabled ? 'Synced' : 'This device only';
  } catch (err) {
    notes = [...waiting, ...notes.filter(n => !n.waiting)];
    $('sync-status').textContent = 'Offline';
    console.error(err);
  }
  render();
}

$('search').addEventListener('input', render);

function render() {
  renderFolders();
  const q = $('search').value.toLowerCase();
  const shown = notes.filter(n => lib.inFolder(n, folder) &&
    (!q || (n.title + ' ' + n.body + ' ' + n.folder).toLowerCase().includes(q)));
  $('notes').replaceChildren(...shown.map(n => {
    const li = document.createElement('li');
    li.innerHTML = '<strong></strong><span class="preview"></span><span class="meta"><time></time><span class="folder"></span></span>';
    li.querySelector('strong').textContent = n.title;
    li.querySelector('.preview').textContent = n.body;
    li.querySelector('time').textContent = n.waiting ? 'Waiting to upload' : when(n.created_at);
    if (folder === null && n.folder) li.querySelector('.folder').textContent = n.folder;
    if (!n.waiting) li.addEventListener('click', () => openNote(n));
    return li;
  }));
  if (!shown.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = q ? 'No matching notes.'
      : folder !== null ? 'Nothing in this folder yet.'
      : 'No notes yet. Tap the button and start talking.';
    $('notes').append(li);
  }
}

function renderFolders() {
  const all = lib.folders(notes);
  const chip = (label, value) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = 'chip' + (folder === value ? ' on' : '');
    b.addEventListener('click', () => { folder = value; render(); });
    return b;
  };
  $('folders').replaceChildren(
    chip('All', null),
    ...all.map(f => chip(f, f)),
    ...(all.length && notes.some(n => !n.folder) ? [chip('No folder', '')] : []));
  $('folder-list').replaceChildren(...all.map(f => Object.assign(document.createElement('option'), { value: f })));
}

function when(iso) {
  return new Date(iso).toLocaleString(undefined,
    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ---------- one note ----------

const SOURCE = { voice: 'Spoken', typed: 'Typed', import: 'Imported' };

function openNote(n) {
  openId = n.id;
  showView(n);
  if (!$('note-dialog').open) $('note-dialog').showModal();
}

function showView(n) {
  $('note-form').hidden = true;
  $('note-view').hidden = false;
  $('view-title').textContent = n.title;
  $('view-folder').textContent = n.folder || '';
  $('view-body').innerHTML = lib.render(n.body, notes);
  $('note-meta').textContent = `${SOURCE[n.source] || 'Added'} ${when(n.created_at)}`;
  const from = lib.backlinks(notes, n);
  $('backlinks').hidden = !from.length;
  $('backlinks').querySelector('ul').replaceChildren(...from.map(b => {
    const li = document.createElement('li');
    const a = Object.assign(document.createElement('a'), { href: '#', textContent: b.title });
    a.addEventListener('click', e => { e.preventDefault(); openNote(b); });
    li.append(a);
    return li;
  }));
  showSuggestions(n);
}

// Suggested folder and links for the open note, each one tap to apply.
function showSuggestions(n) {
  const s = auto.suggest(n, notes);
  const chips = [];
  const chip = (label, part) => {
    const b = Object.assign(document.createElement('button'), { className: 'chip', textContent: label });
    b.addEventListener('click', () => applyToOpen(n, { folder: null, mentions: [], related: [], ...part }));
    chips.push(b);
  };
  if (s.folder) chip(`Move to ${s.folder}`, { folder: s.folder });
  for (const m of s.mentions) chip(`Link ${m.title}`, { mentions: [m] });
  for (const t of s.related) chip(`Add related: ${t}`, { related: [t] });
  if (chips.length > 1) chip('Do all', s);
  $('suggestions').hidden = !chips.length;
  $('suggestions').querySelector('.chips').replaceChildren(...chips);

  const mentions = auto.unlinkedMentions(n, notes);
  $('mentions').hidden = !mentions.length;
  $('mentions').querySelector('ul').replaceChildren(...mentions.map(o => {
    const li = document.createElement('li');
    const a = Object.assign(document.createElement('a'), { href: '#', textContent: o.title });
    a.addEventListener('click', e => { e.preventDefault(); openNote(o); });
    const link = Object.assign(document.createElement('button'), { className: 'secondary', textContent: 'Link' });
    link.addEventListener('click', async () => {
      const m = auto.suggest(o, notes).mentions.find(x => x.title === n.title);
      if (m) await store.update(o.id, auto.apply(o, { folder: null, mentions: [m], related: [] }));
      await refresh();
      showView(current());
    });
    li.append(a, link);
    return li;
  }));
}

async function applyToOpen(n, part) {
  const before = { body: n.body, folder: n.folder };
  await store.update(n.id, auto.apply(n, part));
  await refresh();
  showView(current());
  showUndo(auto.describe(part), async () => {
    await store.update(n.id, before);
    await refresh();
    if ($('note-dialog').open && openId === n.id) showView(current());
  });
}

function showEdit(n) {
  $('note-view').hidden = true;
  $('note-form').hidden = false;
  $('note-title').value = n?.title || '';
  $('note-folder').value = n ? n.folder : folder || '';
  $('note-body').value = n?.body || '';
  $('note-delete').hidden = !n;
  if (!$('note-dialog').open) $('note-dialog').showModal();
  (n ? $('note-body') : $('note-title')).focus();
}

const current = () => notes.find(n => n.id === openId);

// Clicking a [[link]] opens that note, or offers to start it.
$('view-body').addEventListener('click', async e => {
  const a = e.target.closest('a[data-link]');
  if (!a) return;
  e.preventDefault();
  const target = lib.findByTitle(notes, a.dataset.link);
  if (target) return openNote(target);
  if (!confirm(`There's no note called "${a.dataset.link}" yet. Create it?`)) return;
  const made = await store.create({ title: a.dataset.link, body: '', source: 'typed', folder: current()?.folder || '' });
  await refresh();
  openId = made.id;
  showEdit(current());
});

$('new-note').addEventListener('click', () => { openId = null; showEdit(null); });
$('note-edit').addEventListener('click', () => showEdit(current()));
$('note-close').addEventListener('click', () => $('note-dialog').close());
$('note-dialog').addEventListener('close', () => { $('undo-bar').hidden = true; });
$('note-cancel').addEventListener('click', () => (openId ? showView(current()) : $('note-dialog').close()));

$('note-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fields = {
    title: $('note-title').value.trim() || titleFrom($('note-body').value),
    body: $('note-body').value,
    folder: $('note-folder').value.trim().replace(/^\/+|\/+$/g, ''),
  };
  const before = current();
  if (before) {
    await store.update(before.id, fields);
    // Keep [[links]] pointing here when the title changes.
    if (before.title !== fields.title) {
      for (const n of lib.renameLinks(notes, before.title, fields.title)) {
        await store.update(n.id, { body: n.body });
      }
    }
  } else {
    openId = (await store.create({ ...fields, source: 'typed' })).id;
  }
  await refresh();
  showView(current());
});

$('note-delete').addEventListener('click', async () => {
  if (!confirm('Delete this note?')) return;
  await store.remove(openId);
  $('note-dialog').close();
  await refresh();
});

// ---------- import and export ----------

$('import').addEventListener('click', () => $('import-files').click());

$('import-files').addEventListener('change', async e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  try {
    const found = await lib.parseFiles(files);
    const fresh = lib.withoutDuplicates(found, notes);
    if (!fresh.length) return alert(found.length ? 'Those notes are already in your library.' : 'No notes found in that file.');
    const skipped = found.length - fresh.length;
    if (!confirm(`Import ${fresh.length} note${fresh.length === 1 ? '' : 's'}?` +
      (skipped ? ` (${skipped} already in your library will be skipped.)` : ''))) return;
    for (let i = 0; i < fresh.length; i += 100) await store.createMany(fresh.slice(i, i + 100));
    await refresh();
    alert(`Imported ${fresh.length} note${fresh.length === 1 ? '' : 's'}.`);
  } catch (err) {
    console.error(err);
    alert('Import failed: ' + err.message);
  }
});

$('export').addEventListener('click', () => lib.exportZip(notes.filter(n => !n.waiting)));

boot();
