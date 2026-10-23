# Voice Notes

Speak into your phone and the note shows up on your PC a moment later.

This is step 1 of the plan: capture and sync. Your library, the Apple Notes import, `[[links]]` and automatic sorting come in later steps.

## How it works

- It's a web app, so the same code runs on your iPhone (Safari) and your Windows PC (Edge or Chrome). You add it to your home screen or install it, and it opens like a normal app.
- Speech to text uses the recognizer built into your browser, so there's no API key or cost. On iPhone this is the same system as keyboard dictation.
- Notes are stored in Supabase, a free hosted database. When you save a note on one device, Supabase pushes it to your other open devices right away.
- Without Supabase set up, the app still works but keeps notes only in that one browser. That's handy for trying it out.

| File | What it does |
|---|---|
| `index.html` | The page layout |
| `style.css` | How it looks, light and dark |
| `app.js` | Buttons, the note list, search, editing |
| `speech.js` | Turns your voice into text |
| `store.js` | Saves and loads notes, locally or in Supabase |
| `config.js` | Your Supabase address and key |
| `sw.js`, `manifest.webmanifest` | Let it install like an app |
| `supabase/schema.sql` | Creates the notes table and its privacy rules |

## Try it on your PC

You need [Python](https://www.python.org/downloads/) installed (tick "Add to PATH" when installing). In the project folder, run:

```
python -m http.server 8000
```

Then open http://localhost:8000 in Edge or Chrome. Press Ctrl+C in the terminal to stop it.

## Put it online (GitHub Pages)

Your iPhone needs an `https://` address before it lets the app use the microphone. GitHub Pages hosts it for free:

1. On the repo's GitHub page, go to **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
3. After a minute, the address appears at the top of that page, like `https://YOUR-NAME.github.io/voice-notes/`.

Every time a change is pushed to `main`, the site updates on its own.

## Turn on sync (Supabase)

1. Make a free account at [supabase.com](https://supabase.com) and create a new project. Any name and region works.
2. Open **SQL Editor → New query**, paste everything from `supabase/schema.sql`, and press **Run**.
3. Open **Project Settings → API Keys** (or **API** in older projects). Copy the **Project URL** and the **anon public** key (newer projects call it the **publishable** key) into `config.js`.
4. Open **Authentication → URL Configuration** and set the **Site URL** to your GitHub Pages address.
5. Open the app, choose **Create account**, and confirm the email Supabase sends you.
6. Since this is just for you, turn off new sign-ups afterwards: **Authentication → Sign In / Providers → Email**, and switch off **Allow new users to sign up**.

## Install it

- **iPhone:** open your GitHub Pages address in Safari, tap the Share button, then **Add to Home Screen**. The first time you record, allow the microphone. If voice doesn't work, check that **Settings → General → Keyboard → Enable Dictation** is on.
- **Windows:** open the address in Edge or Chrome and click the install icon at the right end of the address bar.

## Things worth learning as you go

These are the things you'll do over and over:

- **Running it locally:** the `python -m http.server` command above. Most changes you'll want to see on your PC before pushing them.
- **Git basics:** `git pull` gets the latest changes, `git add .` then `git commit -m "what changed"` saves a snapshot, and `git push` sends it to GitHub, which then updates the live site.
- **The browser console:** press F12 in Edge or Chrome and open **Console**. When something breaks, the error shows up there, and pasting that error to Claude is usually the quickest fix.
- **Small edits:** the wording and colors are good first changes to make yourself. Colors are at the top of `style.css`, and button text is in `index.html`.
