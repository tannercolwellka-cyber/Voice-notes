import { store, syncEnabled, titleFrom, pending, queue, flush } from './store.js';
import { speechSupported, startListening } from './speech.js';

const $ = id => document.getElementById(id);

let notes = [];
let stopListening = null;
let openId = null;

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
  const note = { title: titleFrom(body), body, source };
  try {
    await store.create(note);
  } catch {
    queue({ ...note, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  }
  await refresh();
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
  const q = $('search').value.toLowerCase();
  const shown = notes.filter(n => !q || (n.title + ' ' + n.body).toLowerCase().includes(q));
  $('notes').replaceChildren(...shown.map(n => {
    const li = document.createElement('li');
    li.innerHTML = '<strong></strong><span class="preview"></span><time></time>';
    li.querySelector('strong').textContent = n.title;
    li.querySelector('.preview').textContent = n.body;
    li.querySelector('time').textContent = n.waiting ? 'Waiting to upload' : when(n.created_at);
    if (!n.waiting) li.addEventListener('click', () => openNote(n));
    return li;
  }));
  if (!shown.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = q ? 'No matching notes.' : 'No notes yet. Tap the button and start talking.';
    $('notes').append(li);
  }
}

function when(iso) {
  return new Date(iso).toLocaleString(undefined,
    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ---------- one note ----------

function openNote(n) {
  openId = n.id;
  $('note-title').value = n.title;
  $('note-body').value = n.body;
  $('note-meta').textContent = `${n.source === 'voice' ? 'Spoken' : 'Typed'} ${when(n.created_at)}`;
  $('note-dialog').showModal();
}

$('note-save').addEventListener('click', async () => {
  await store.update(openId, { title: $('note-title').value, body: $('note-body').value });
  $('note-dialog').close();
  await refresh();
});

$('note-delete').addEventListener('click', async () => {
  if (!confirm('Delete this note?')) return;
  await store.remove(openId);
  $('note-dialog').close();
  await refresh();
});

boot();
