// Where notes are kept. Two versions with the same functions:
//   localStore - this browser only, for trying the app out
//   cloudStore - Supabase, so every device sees the same notes
// A note looks like: { id, title, body, source, created_at, updated_at }

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const syncEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function titleFrom(body) {
  const words = body.trim().split(/\s+/).slice(0, 8).join(' ');
  return words.replace(/[.,!?;:]+$/, '') || 'Untitled';
}

// ---------- local ----------

const KEY = 'voice-notes';

function readLocal() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

function writeLocal(notes) {
  localStorage.setItem(KEY, JSON.stringify(notes));
}

export const localStore = {
  async user() { return null; },
  async list() {
    return readLocal().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async create({ title, body, source }) {
    const now = new Date().toISOString();
    const note = { id: crypto.randomUUID(), title, body, source, created_at: now, updated_at: now };
    writeLocal([note, ...readLocal()]);
    return note;
  },
  async update(id, fields) {
    const notes = readLocal().map(n =>
      n.id === id ? { ...n, ...fields, updated_at: new Date().toISOString() } : n);
    writeLocal(notes);
  },
  async remove(id) {
    writeLocal(readLocal().filter(n => n.id !== id));
  },
  // Other tabs in this browser fire a storage event when notes change.
  subscribe(onChange) {
    addEventListener('storage', e => { if (e.key === KEY) onChange(); });
  },
};

// ---------- cloud ----------

let supabase = null;

async function client() {
  if (!supabase) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

function check({ data, error }) {
  if (error) throw error;
  return data;
}

export const cloudStore = {
  async user() {
    const { data } = await (await client()).auth.getSession();
    return data.session?.user ?? null;
  },
  async signIn(email, password) {
    check(await (await client()).auth.signInWithPassword({ email, password }));
  },
  async signUp(email, password) {
    check(await (await client()).auth.signUp({ email, password }));
  },
  async signOut() {
    await (await client()).auth.signOut();
  },
  async list() {
    return check(await (await client())
      .from('notes').select('*').order('created_at', { ascending: false }));
  },
  async create({ title, body, source }) {
    return check(await (await client())
      .from('notes').insert({ title, body, source }).select().single());
  },
  async update(id, fields) {
    check(await (await client()).from('notes').update(fields).eq('id', id));
  },
  async remove(id) {
    check(await (await client()).from('notes').delete().eq('id', id));
  },
  // Supabase Realtime pushes every insert, edit and delete to all open devices.
  async subscribe(onChange) {
    (await client())
      .channel('notes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, onChange)
      .subscribe();
  },
};

export const store = syncEnabled ? cloudStore : localStore;
