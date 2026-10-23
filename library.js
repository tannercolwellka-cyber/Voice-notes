// Everything about notes as a library: Markdown, [[links]], folders, areas, import and export.

import { marked } from './vendor/marked.esm.js';
import DOMPurify from './vendor/purify.es.js';

// ---------- [[links]] ----------

// Matches [[Title]] and [[Title|text to show]].
const LINK = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function findByTitle(notes, title) {
  return notes.find(n => same(n.title, title));
}

// Titles this note links to.
export function linksIn(body) {
  return [...body.matchAll(LINK)].map(m => m[1].trim());
}

// Notes that link to this one.
export function backlinks(notes, note) {
  return notes.filter(n => n.id !== note.id && linksIn(n.body).some(t => same(t, note.title)));
}

// After a rename, rewrites [[Old]] to [[New]] in every note. Returns the notes it changed.
export function renameLinks(notes, oldTitle, newTitle) {
  const changed = [];
  for (const n of notes) {
    const body = n.body.replace(LINK, (whole, target, label) =>
      same(target, oldTitle) ? `[[${newTitle}${label ? '|' + label : ''}]]` : whole);
    if (body !== n.body) changed.push({ ...n, body });
  }
  return changed;
}

// ---------- Markdown ----------

const escape = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Turns a note body into safe HTML. [[links]] become <a data-link="Title">, marked
// "missing" when no note has that title yet.
export function render(body, notes) {
  const withLinks = body.replace(LINK, (_, target, label) => {
    const missing = findByTitle(notes, target) ? '' : ' class="missing"';
    return `<a href="#" data-link="${escape(target.trim())}"${missing}>${escape((label || target).trim())}</a>`;
  });
  return DOMPurify.sanitize(marked.parse(withLinks, { breaks: true }));
}

// Note text without Markdown symbols, for previews: "**big** [[Gym plan|plan]]" -> "big plan".
export function plain(body) {
  return body
    .replace(LINK, (_, target, label) => (label || target).trim())
    .replace(/^---[\s\S]*?\n---\n/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~|`)(?=\S)([^\n]*?\S)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- folders ----------

export function folders(notes) {
  return [...new Set(notes.map(n => n.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// "Work" also shows notes in "Work/Ideas".
export function inFolder(note, folder) {
  if (folder === null) return true;
  if (folder === '') return !note.folder;
  return note.folder === folder || note.folder.startsWith(folder + '/');
}

// ---------- areas ----------
// Areas are like folders, except a note can be in as many as you like.

// Every area with how many notes are in it, biggest first.
export function areas(notes) {
  const counts = new Map();
  for (const n of notes) for (const a of n.areas || []) counts.set(a, (counts.get(a) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
}

// "Health, cooking,  Health" -> ["Health", "cooking"]
export function parseAreas(text) {
  const seen = new Set();
  return text.split(',').map(a => a.trim().replace(/^#/, '')).filter(a => {
    const key = a.toLowerCase();
    if (!a || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Obsidian keeps tags in a block at the top of the file:
//   ---
//   tags: [Health, Cooking]
//   ---
// Returns the areas it lists and the text without that block.
function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { areas: [], body: text };
  const inline = m[1].match(/^tags:[ \t]*\[(.*)\]/m);
  const list = m[1].match(/^tags:[ \t]*\r?\n((?:[ \t]*-.*\r?\n?)+)/m);
  const single = m[1].match(/^tags:[ \t]*([^\[\s].*)$/m);
  const raw = inline ? inline[1] : list ? list[1].split('\n').map(l => l.replace(/^\s*-\s*/, '')).join(',') : single ? single[1] : '';
  return { areas: parseAreas(raw.replace(/["']/g, '')), body: text.slice(m[0].length) };
}

// ---------- import ----------

// Reads files the user picked and returns notes to create.
// Understands the Apple Notes export from the Shortcut in the README
// (one .txt with many notes), plus plain .md, .txt and .html files.
export async function parseFiles(files) {
  const out = [];
  for (const file of files) {
    const text = await file.text();
    if (text.includes('===NOTE===')) {
      out.push(...parseShortcutExport(text));
      continue;
    }
    const name = file.name.replace(/\.(md|markdown|txt|html?)$/i, '');
    // When a whole folder is picked, keep its subfolders: "Vault/Work/idea.md" -> "Work".
    const parts = (file.webkitRelativePath || '').split('/').slice(1, -1);
    const { areas: tags, body } = splitFrontmatter(text);
    out.push({
      title: name,
      body: /\.html?$/i.test(file.name) ? htmlToText(body) : body.trim(),
      areas: tags,
      folder: parts.join('/'),
      created_at: new Date(file.lastModified || Date.now()).toISOString(),
    });
  }
  return out.filter(n => n.title || n.body).map(n => ({ ...n, source: 'import' }));
}

// Blocks look like:
//   ===NOTE===
//   Title: Groceries
//   Folder: Home          (optional)
//   Created: Oct 3, 2025 at 9:14 AM   (optional)
//   ---
//   the note text...
function parseShortcutExport(text) {
  return text.split('===NOTE===').slice(1).map(block => {
    const [head, ...rest] = block.split(/^---\s*$/m);
    const field = name => (head.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'mi')) || [])[1]?.trim() || '';
    let body = rest.join('---').trim();
    if (/<\/?(div|p|br|span|h1|ul|li)\b/i.test(body)) body = htmlToText(body);
    const title = field('Title') || body.split('\n')[0].slice(0, 80);
    // Apple Notes often repeats the title as the body's first line.
    if (body.split('\n')[0].trim() === title) body = body.split('\n').slice(1).join('\n').trim();
    return { title, body, folder: field('Folder'), created_at: parseDate(field('Created')) };
  });
}

function parseDate(s) {
  const d = new Date(s.replace(' at ', ' '));
  return isNaN(d) ? undefined : d.toISOString();
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|h\d|li)>/gi, '\n'), 'text/html');
  return doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim();
}

// Skips notes that are already in the library with the same title and text.
export function withoutDuplicates(incoming, notes) {
  const have = new Set(notes.map(n => n.title.trim() + '\n' + n.body.trim()));
  return incoming.filter(n => !have.has(n.title.trim() + '\n' + n.body.trim()));
}

// ---------- export ----------

// Downloads every note as a .md file inside its folder, zipped. Opens in Obsidian as-is.
export async function exportZip(notes) {
  if (!window.JSZip) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/jszip.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
  }
  const zip = new window.JSZip();
  const used = new Set();
  for (const n of notes) {
    const safe = (n.title || 'Untitled').replace(/[\\/:*?"<>|]/g, '-').slice(0, 100);
    let path = (n.folder ? n.folder + '/' : '') + safe;
    for (let i = 2; used.has(path.toLowerCase()); i++) path = (n.folder ? n.folder + '/' : '') + `${safe} ${i}`;
    used.add(path.toLowerCase());
    // Areas become Obsidian tags.
    const tags = (n.areas || []).length ? `---\ntags: [${n.areas.map(a => JSON.stringify(a)).join(', ')}]\n---\n` : '';
    zip.file(path + '.md', tags + n.body, { date: new Date(n.updated_at || n.created_at) });
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `voice-notes-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
