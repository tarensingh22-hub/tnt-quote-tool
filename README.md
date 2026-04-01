# TNT Print House — Quote Builder
## How to Deploy (Step-by-Step, No Coding Required)

---

### What you need (both are free):
- A **GitHub** account → github.com
- A **Vercel** account → vercel.com (sign up with your GitHub account)

---

### Step 1 — Create a GitHub Repository

1. Go to **github.com** and sign in
2. Click the **+** icon (top right) → **New repository**
3. Name it: `tnt-quote-tool`
4. Leave everything else as default
5. Click **Create repository**

---

### Step 2 — Upload the project files

1. On your new repository page, click **uploading an existing file**
2. Drag and drop the entire contents of this folder (all files and the `src` folder)
3. Scroll down, click **Commit changes**

> ⚠️ Make sure the `src` folder is uploaded with `App.jsx` and `main.jsx` inside it.

---

### Step 3 — Deploy on Vercel

1. Go to **vercel.com** and sign in with GitHub
2. Click **Add New → Project**
3. Find `tnt-quote-tool` in the list and click **Import**
4. Vercel auto-detects it as a Vite project — don't change anything
5. Click **Deploy**
6. Wait ~60 seconds — you'll get a live URL like `tnt-quote-tool.vercel.app`

---

### Step 4 — Share with your team

- Send your team the Vercel URL
- Bookmark it on every computer/phone you use for quoting
- It works on mobile too

---

### Step 5 (Optional) — Use your own domain

If you want `quotes.tntprinthouse.ca` instead of the Vercel URL:

1. In Vercel, go to your project → **Settings → Domains**
2. Add your custom domain (e.g. `quotes.tntprinthouse.ca`)
3. Vercel gives you DNS instructions
4. Log into your domain/website host and add a CNAME record pointing to Vercel
5. Done — usually takes 5–10 minutes to go live

Your web host's support team can do Step 5 for you in a few minutes if you ask them.

---

### Updating the tool in the future

When pricing changes or new features are added:
1. Replace `src/App.jsx` with the new version
2. GitHub auto-deploys to Vercel within ~30 seconds

---

### Need help?
Ask Claude — paste this README and describe what step you're stuck on.
