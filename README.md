# Ragnar Clothing — site setup

Two separate pages: `index.html` (public store) and `admin.html` (login-only owner panel). Both pull live data from one shared Firestore database — add a product in admin.html, it appears instantly in index.html for everyone.

## 1. Create a Firebase project (free)
1. Go to https://console.firebase.google.com → **Add project** → name it (e.g. "ragnar-clothing").
2. In the project: **Build → Firestore Database → Create database** → start in production mode.
3. In the project: **Build → Authentication → Get started → Email/Password** → enable it.
4. Under **Authentication → Users → Add user**, create *your own* admin login (email + password). This is the only account that can edit the catalog.
5. **Project settings (gear icon) → General → Your apps → Web (</>) → register app.** Copy the `firebaseConfig` values shown.

## 2. Paste in your config
Open `firebase-config.js` and replace every `YOUR_...` placeholder with the values Firebase gave you.

## 3. Deploy the security rules
In Firebase console: **Firestore Database → Rules** tab → paste the contents of `firestore.rules` → Publish.
This is what actually enforces "only I can edit" — not the page, the server.

## 4. Add your real prices
Open `admin.html` locally (or after deploying), sign in with the account you created in step 1.4, and add your real products — the 4 placeholder categories (Hoodies, Sweaters, Tracksuits, Hats) are empty until you add items.

## 5. Put it on GitHub Pages
1. Create a new GitHub repo, e.g. `ragnar-clothing`.
2. Upload every file in this folder (keep the `assets/` folder structure).
3. Repo → **Settings → Pages → Source: main branch, / (root)** → Save.
4. Your site is live at `https://yourusername.github.io/ragnar-clothing/` within a few minutes.
5. (Optional) Add a custom domain under the same Pages settings once you own one.

## File map
- `index.html` / `admin.html` — the two pages
- `style.css` — shared styling
- `app.js` — storefront logic (cart, WhatsApp checkout, live catalog)
- `firebase-config.js` — your project keys (step 2)
- `firestore.rules` — the real access control (step 3)
- `assets/logo.svg`, `assets/mark.svg` — your recreated logo, full and mark-only
