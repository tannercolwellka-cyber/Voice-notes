// Free, on-device organizing: works out which folder a note belongs in and which
// notes it should link to, by comparing the words it shares with your other notes.
// Words that show up in lots of notes count for less than rare ones.

import { linksIn } from './library.js';

const STOP = new Set(`the and for are but not you all any can had her was one our out has him his how
its may new now old see two way who did get got let put say she too use with that this from have they
will your what when where which their there them then than been were said each just like into over
also some could would should about after before because being other these those very much more most
only even well back here going gonna want really thing things know think make made need yeah okay
um uh`.split(/\s+/));

function words(text) {
  return (text.toLowerCase().match(/[a-z0-9']{3,}/g) || [])
    .map(w => w.replace(/'s$|'/g, ''))
    .filter(w => w.length >= 3 && !STOP.has(w));
}

// Builds word weights for every note so they can be compared.
function index(notes) {
  const docs = notes.map(n => {
    const counts = new Map();
    // The title counts double: it's usually what the note is about.
    for (const w of [...words(n.title), ...words(n.title), ...words(n.body)]) counts.set(w, (counts.get(w) || 0) + 1);
    return { note: n, counts };
  });
  const df = new Map();
  for (const d of docs) for (const w of d.counts.keys()) df.set(w, (df.get(w) || 0) + 1);
  const idf = w => Math.log((docs.length + 1) / ((df.get(w) || 0) + 1)) + 1;
  for (const d of docs) {
    d.vec = new Map([...d.counts].map(([w, c]) => [w, (1 + Math.log(c)) * idf(w)]));
    d.len = Math.hypot(...d.vec.values()) || 1;
  }
  return { docs, idf };
}

function similarity(a, b) {
  let dot = 0;
  for (const [w, x] of a.vec) { const y = b.vec.get(w); if (y) dot += x * y; }
  return dot / (a.len * b.len);
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Finds where another note's title appears in this text as whole words, outside existing links.
function mentionAt(body, title) {
  if (title.trim().length < 3 || /^untitled$/i.test(title)) return -1;
  const re = new RegExp(`(^|[^\\w\\[])(${escapeRe(title.trim())})(?![\\w\\]])`, 'i');
  const m = body.replace(/\[\[[^\]]*\]\]/g, s => ' '.repeat(s.length)).match(re);
  return m ? m.index + m[1].length : -1;
}

// What to do with a note. Returns { folder, mentions: [{ title, at, length }], related: [titles] }.
// folder is only set for notes that don't have one yet.
export function suggest(note, notes) {
  const others = notes.filter(n => n.id !== note.id && !n.waiting);
  const result = { folder: null, mentions: [], related: [] };
  if (!others.length) return result;

  const { docs } = index([note, ...others]);
  const [self, ...rest] = docs;
  const linked = new Set(linksIn(note.body).map(t => t.toLowerCase()));
  const scored = rest.map(d => ({ note: d.note, score: similarity(self, d) }))
    .filter(s => s.score > 0).sort((a, b) => b.score - a.score);

  // Folder: the folder most of the closest notes are in.
  const votes = new Map();
  for (const s of scored.slice(0, 5)) {
    if (s.note.folder && s.score > 0.12) votes.set(s.note.folder, (votes.get(s.note.folder) || 0) + s.score);
  }
  const [best] = [...votes].sort((a, b) => b[1] - a[1]);
  // Only for notes without a folder: once you've filed something, it stays put.
  if (!note.folder && best && best[1] > 0.2) result.folder = best[0];

  // Mentions: other notes' titles that appear in this one's text.
  for (const n of others) {
    if (linked.has(n.title.toLowerCase())) continue;
    const at = mentionAt(note.body, n.title);
    if (at >= 0) result.mentions.push({ title: n.title, at, length: n.title.trim().length });
  }
  result.mentions.sort((a, b) => b.length - a.length);
  // Keep the longest title when two overlap ("Meal plan" over "Meal").
  result.mentions = result.mentions.filter((m, i, all) =>
    !all.slice(0, i).some(o => m.at < o.at + o.length && o.at < m.at + m.length));

  // Related: the closest notes that aren't linked or mentioned yet.
  const linksHere = others.filter(n => linksIn(n.body).some(t => t.toLowerCase() === note.title.toLowerCase()));
  const taken = new Set([...linked, ...result.mentions.map(m => m.title.toLowerCase()),
    ...linksHere.map(n => n.title.toLowerCase())]);
  result.related = scored.filter(s => s.score > 0.18 && !taken.has(s.note.title.toLowerCase()))
    .slice(0, 3).map(s => s.note.title);
  return result;
}

export const isEmpty = s => !s.folder && !s.mentions.length && !s.related.length;

// Applies a suggestion (or part of one) and returns the changed fields.
export function apply(note, s) {
  let body = note.body;
  // Wrap mentions in [[ ]], from the end so earlier positions stay correct.
  for (const m of [...s.mentions].sort((a, b) => b.at - a.at)) {
    const text = body.slice(m.at, m.at + m.length);
    body = body.slice(0, m.at) + (text === m.title ? `[[${m.title}]]` : `[[${m.title}|${text}]]`) + body.slice(m.at + m.length);
  }
  if (s.related.length) body = body.trimEnd() + '\n\nRelated: ' + s.related.map(t => `[[${t}]]`).join(', ');
  return { body, folder: s.folder ?? note.folder };
}

// Other notes that mention this note's title without linking to it.
export function unlinkedMentions(note, notes) {
  return notes.filter(n => n.id !== note.id && !n.waiting && mentionAt(n.body, note.title) >= 0);
}

// Describes a suggestion in a few words, like "Filed in Home, linked to Groceries".
export function describe(s) {
  const parts = [];
  if (s.folder) parts.push(`filed in ${s.folder}`);
  const links = [...s.mentions.map(m => m.title), ...s.related];
  if (links.length) parts.push(`linked to ${links.join(', ')}`);
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
