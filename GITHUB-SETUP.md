# Load KnitFlow OS on GitHub — Step-by-Step

Two options. **Option A needs zero installs** (works in your browser). Option B is the classic command-line way.

---

## Option A — Upload via the GitHub website (easiest)

1. Go to **github.com** → sign in (or create a free account).
2. Click the **+** (top-right) → **New repository**.
3. Name it `knitflow` → choose **Private** or **Public** → click **Create repository**.
4. On the new repo page click **"uploading an existing file"** link.
5. Drag in **everything inside your `knitflow` folder** (or unzip `knitflow-github.zip` and drag the files):
   `server.js`, `package.json`, `README.md`, `LICENSE`, `.gitignore`, the `public/` folder, and the `docs/` folder.
   *(Do **not** upload the `data` folder — the app creates it automatically.)*
6. Click **Commit changes**. Done — your code is on GitHub.

## Option B — Command line (git)

```bash
cd knitflow                       # the folder you downloaded/unzipped
git init
git add .
git commit -m "KnitFlow OS — full system"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/knitflow.git
git push -u origin main           # it will ask for your GitHub login
```

> Tip: download this repo as `knitflow-github.zip` — it already contains a prepared `.git`
> history, so you can skip `git init/add/commit` and just add the remote + push.

---

## 🚀 Free app hosting with GitHub Pages (recommended!)

The repo includes `docs/index.html` — the **entire app in one file**. GitHub will host it for free:

1. In your repo: **Settings** → **Pages** (left menu).
2. Under *Build and deployment*: Source = **Deploy from a branch**, Branch = **main**, Folder = **/ (root)** — or point it at the `docs` folder if you prefer. Click **Save**.
3. Wait ~1 minute. Your app goes live at:
   **`https://YOUR-USERNAME.github.io/knitflow/docs/index.html`**
   *(or simply `/knitflow/` if Pages serves from that folder as root)*
4. Open that URL anywhere — phone, office, home. Click **"Open company workspace →"**.

No server, no cost, no maintenance. (For the full multi-user server edition instead, deploy
`server.js` free on Render.com or Railway.app: start command `node server.js`.)

---

## After you update the app later

- Website way: repo → **Add file → Upload files** → drag the changed file → Commit.
- Command line: `git add . && git commit -m "update" && git push`.
