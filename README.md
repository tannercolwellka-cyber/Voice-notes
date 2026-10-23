# Voice Notes

Speak into your phone and the note shows up on your PC a moment later.

Steps 1 to 3 are done: voice capture, sync, a library with folders, `[[links]]`, Apple Notes import and export, and automatic filing and linking. A smarter AI version of the automatic part can come later.

## How it works

- It's a web app, so the same code runs on your iPhone (Safari) and your Windows PC (Edge or Chrome). You add it to your home screen or install it, and it opens like a normal app.
- Speech to text uses the recognizer built into your browser, so there's no API key or cost. On iPhone this is the same system as keyboard dictation.
- Notes are stored in Supabase, a free hosted database. When you save a note on one device, Supabase pushes it to your other open devices right away.
- If your phone has no signal, the note waits on the phone and uploads by itself when you're back online.
- Without Supabase set up, the app still works but keeps notes only in that one browser. That's handy for trying it out.

| File | What it does |
|---|---|
| `index.html` | The page layout |
| `style.css` | How it looks, light and dark |
| `app.js` | Buttons, the note list, search, editing |
| `speech.js` | Turns your voice into text |
| `library.js` | Markdown, `[[links]]`, backlinks, folders, import and export |
| `suggest.js` | Automatic filing and linking, by comparing words between notes |
| `store.js` | Saves and loads notes, locally or in Supabase |
| `config.js` | Your Supabase address and key |
| `sw.js`, `manifest.webmanifest` | Let it install like an app |
| `supabase/schema.sql` | Creates the notes table and its privacy rules |
| `supabase/002_folders.sql` | The step 2 update that adds folders |
| `vendor/` | Libraries for Markdown, safety cleaning and zip files, kept here so the app works offline |

## Using your library

- **Folders:** open a note, tap **Edit**, and type a folder name like `Work`. Use a slash for folders inside folders, like `Work/Ideas`. The chips above the list filter by folder. New notes, spoken or typed, go into whichever folder you're looking at.
- **Markdown:** notes can use `**bold**`, `*italics*`, `# Headings`, `- lists`, and `> quotes`. Tap a note to see it formatted, and tap **Edit** to change it.
- **Links:** type `[[Groceries]]` to link to the note called Groceries. Use `[[Groceries|my list]]` to show different words. A grey dashed link points to a note that doesn't exist yet, and tapping it offers to create it. If you rename a note, links to it are updated everywhere.
- **Backlinks:** the bottom of each note lists the notes that link to it, under **Linked from**.
- **Export:** **Export** downloads everything as a zip of `.md` files, one folder per folder. You can open it straight in Obsidian, so your notes are never stuck in this app.
- **Import:** **Import** takes `.md`, `.txt` and `.html` files, so you can bring in an Obsidian vault or other notes. It also takes the Apple Notes export below. Importing the same notes twice doesn't make copies.

## Automatic organizing

When you save a new note while looking at **All**, the app compares its words with your other notes:

- **Folder:** if the closest notes mostly live in one folder, the new note goes there too. If you're looking at a folder when you record, the note stays in that folder.
- **Links:** if the note mentions another note's title, like "the meal plan", that becomes a link. Up to three of the most similar notes are added at the bottom as `Related: [[...]]`.
- **Undo:** a bar shows what it did, like "Filed in Home, linked to Meal plan." Tap **Undo** within about 12 seconds to put it back.

Open any note to see more:

- **Suggestions** offers a folder for unfiled notes, plus links to add. Tap one to apply it, or **Do all**. Each one can be undone.
- **Mentioned in, not linked yet** lists notes that use this note's title without linking to it. **Link** turns that mention into a link.

It all runs on your device for free. It matches words, not meaning, so "car" and "vehicle" don't count as related. That's what the AI version would add later.

## Bring in your Apple Notes

Apple doesn't let other apps read Apple Notes directly, so you'll build a Shortcut on your iPhone that writes all your notes into one file. You do this once.

1. Open the **Shortcuts** app, tap **+**, and name the shortcut **Export Notes**.
2. Search for and add **Find Notes**. Leave it as "Find All Notes" with no filters, and make sure **Limit** is off.
3. Add **Repeat with Each**. It will repeat over the notes.
4. Inside the repeat, add a **Text** action and type this into it exactly. Each `[...]` is a variable you insert from the bar above the keyboard: tap **Repeat Item**, then tap the blue bubble to pick **Name**, **Folder**, **Creation Date** or **Body**.

   ```
   ===NOTE===
   Title: [Repeat Item → Name]
   Folder: [Repeat Item → Folder]
   Created: [Repeat Item → Creation Date]
   ---
   [Repeat Item → Body]
   ```

   If **Folder** isn't offered, leave that line out. Your notes will come in without folders, and you can sort them in the app.
5. After **End Repeat**, add **Combine Text**. Set it to combine **Repeat Results** with **New Lines**.
6. Add **Save File** and pick a spot in iCloud Drive or On My iPhone.
7. Tap ▶ to run it. If it asks for permission to read your notes, allow it.
8. In Voice Notes, tap **Import** and pick the file it saved.

Locked notes are skipped, and images and drawings don't come across, only the text. Your Apple Notes stay as they are.

## Step 2 database update

If you set up Supabase before step 2, run `supabase/002_folders.sql` once the same way you ran `schema.sql`: **SQL Editor → New query**, paste, **Run**. Until you do, saving notes will fail.

## One-time setup

You do this once, all in your web browser. Nothing to download and no Command Prompt. After that you just tap the app on your home screen.

### 1. Put it online (GitHub Pages)

Your iPhone needs an `https://` address before it lets the app use the microphone. GitHub Pages hosts it for free:

1. On the repo's GitHub page, go to **Settings → Pages**.
2. Under **Build and deployment**, pick **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
3. After a minute, the address appears at the top of that page, like `https://YOUR-NAME.github.io/voice-notes/`.

Every time a change is pushed to `main`, the site updates on its own.

### 2. Turn on sync (Supabase)

Supabase is the cloud that holds your notes. Your phone saves to it at any time, and your PC loads everything new whenever you open the app, even if the PC was off all day.

1. Make a free account at [supabase.com](https://supabase.com) and create a new project. Any name and region works.
2. Open **SQL Editor → New query**, paste everything from `supabase/schema.sql`, and press **Run**.
3. Open **Project Settings → API Keys** (or **API** in older projects). Copy the **Project URL** and the **anon public** key (newer projects call it the **publishable** key) and send them to Claude to put in `config.js`. Or edit it yourself on GitHub: open `config.js`, click the pencil icon, paste them between the quotes, and click **Commit changes**. The anon key is designed to be public, so it's safe to share.
4. Open **Authentication → URL Configuration** and set the **Site URL** to your GitHub Pages address.
5. Open the app, choose **Create account**, and confirm the email Supabase sends you.
6. Since this is just for you, turn off new sign-ups afterwards: **Authentication → Sign In / Providers → Email**, and switch off **Allow new users to sign up**.

### 3. Add it to your home screen

- **iPhone:** open your GitHub Pages address in Safari, tap the Share button, then **Add to Home Screen**. The first time you record, allow the microphone. If voice doesn't work, check that **Settings → General → Keyboard → Enable Dictation** is on.
- **Windows:** open the address in Edge or Chrome and click the install icon at the right end of the address bar.

## Making changes on your PC (optional)

You only need this if you want to change the code yourself and try it before it goes live. Just using the app never needs it. You only do steps 1 to 3 once.

**1. Install Python.** The app doesn't need Python itself. Python just comes with a tiny web server we can borrow.

- Go to [python.org/downloads](https://www.python.org/downloads/) and click the yellow **Download Python** button.
- Open the file you downloaded. On the first screen, **tick "Add python.exe to PATH"** at the bottom before clicking **Install Now**. Without that box ticked, Windows won't find the `python` command later.
- To check it worked, open the Start menu, type `cmd`, open **Command Prompt**, type `python --version`, and press Enter. It should print something like `Python 3.13.1`.

**2. Install Git.** Git copies the project from GitHub to your PC and sends your changes back.

- Download it from [git-scm.com/download/win](https://git-scm.com/download/win) and run the installer. The default answer on every screen is fine.

**3. Copy the project to your PC.** Open Command Prompt and run these two lines, pressing Enter after each:

```
cd %USERPROFILE%\Documents
git clone https://github.com/tannercolwellka-cyber/Voice-notes
```

The first line moves you into your Documents folder. The second makes a `Voice-notes` folder there with all the app files. GitHub may open a window asking you to sign in, because the repo is private.

**4. Start the app.** Each time you want to run it, open Command Prompt and run:

```
cd %USERPROFILE%\Documents\Voice-notes
python -m http.server 8000
```

The first line moves into the project folder. The second starts the web server, which prints `Serving HTTP on :: port 8000`. Leave that window open, because closing it stops the app.

**5. Open it.** In Edge or Chrome, go to http://localhost:8000. `localhost` means "this computer", and `8000` is the port number from the command above.

**6. Stop it.** Click back in the Command Prompt window and press **Ctrl+C**.

If you get the latest changes from GitHub (`git pull`, see below) and the page still looks old, press **Ctrl+Shift+R** to reload without the saved copy.

## Things worth learning as you go

These are the things you'll do over and over:

- **Running it locally:** the `python -m http.server` command in the section above. Most changes you'll want to see on your PC before pushing them.
- **Git basics:** `git pull` gets the latest changes, `git add .` then `git commit -m "what changed"` saves a snapshot, and `git push` sends it to GitHub, which then updates the live site.
- **The browser console:** press F12 in Edge or Chrome and open **Console**. When something breaks, the error shows up there, and pasting that error to Claude is usually the quickest fix.
- **Small edits:** the wording and colors are good first changes to make yourself. Colors are at the top of `style.css`, and button text is in `index.html`.
