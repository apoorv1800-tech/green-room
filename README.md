# Green Room: setup guide (about 30 minutes)

Rehearse your interview pitch in front of the stakeholder who'll actually hear it.
Stack: **Vercel** (page + serverless functions) · **Gemini API** (the coach) · **Supabase** (stores every review, powers the live stats).

```
green-room/
├── index.html        Landing page + "Review my pitch" feature + live stats
├── api/review.js     POST /api/review → validates, checks caps, calls Gemini, saves to Supabase
├── api/stats.js      GET  /api/stats  → numbers shown on the page (read back from Supabase)
├── lib/prompt.js     System prompt, audiences, JSON output schema
├── lib/supabase.js   Tiny Supabase REST helper (no npm installs needed)
├── supabase.sql      Table definition, run once
└── package.json
```

No `npm install` is needed. The functions use only Node's built-in `fetch` and `crypto`.

---

## 1. Supabase (5 min)

1. Go to supabase.com → **New project**. Pick any name and a strong DB password; region Mumbai (ap-south-1) is closest.
2. Open **SQL Editor → New query**, paste everything from `supabase.sql`, click **Run**. You should see "Success. No rows returned."
3. Open **Table Editor** and confirm that `pitch_reviews` exists.
4. Go to **Project Settings → API Keys** (or **Data API**) and copy:
   - **Project URL**, e.g. `https://abcd1234.supabase.co` → this becomes `SUPABASE_URL`
   - A **secret key** (`sb_secret_...`), or the legacy **service_role** key (starts with `eyJ`). Either one works → this becomes `SUPABASE_SERVICE_KEY`

   Never use the secret/service key in the browser. Here it only lives in Vercel.

## 2. Gemini key (2 min)

1. Go to aistudio.google.com → **Get API key → Create API key**.
2. Copy it (it starts with `AIza`). This becomes `GEMINI_API_KEY`.
3. The code uses `gemini-2.5-flash-lite` by default. If AI Studio shows a newer Flash-Lite model, put its name in the `GEMINI_MODEL` env var instead. You don't need to change any code.

## 3. GitHub (5 min)

1. Create a new **public** repo, e.g. `green-room`.
2. Click **uploading an existing file** and drag in all the files and folders from this zip, keeping the `api/` and `lib/` folders. Commit.

   *If you already have a Task 3 landing page:* you can replace it with this `index.html`, which already contains the full landing page. Or you can copy just three parts into your page: the `<section id="try">` and `<section id="stats">` blocks, the `<script>` at the bottom, and the CSS under the `/* try it */` and `/* stats */` comments.

## 4. Vercel (5 min)

1. vercel.com → **Add New → Project** → import the GitHub repo. Framework preset: **Other**. Leave the build settings empty.
2. Before clicking Deploy, open **Environment Variables** and add:

| Name | Value | Required |
|---|---|---|
| `GEMINI_API_KEY` | your `AIza...` key | yes |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | yes |
| `SUPABASE_SERVICE_KEY` | `sb_secret_...` or `eyJ...` | yes |
| `GEMINI_MODEL` | e.g. `gemini-2.5-flash-lite` | optional |
| `VISITOR_SALT` | any random string, e.g. `gr-7f3k9q` | optional (recommended) |
| `DAILY_CAP` | `5` (raise to `30` while you test, then set it back) | optional |

3. Click **Deploy**. If you add or change env vars later, go to **Deployments → ⋯ → Redeploy**. Env vars only apply to new deployments.

## 5. Test it (10 min)

1. Open the live URL → **Use a sample** → **Get feedback**. You should get a score within a few seconds.
2. Refresh the page. The "pitches reviewed" number in the hero and in the stats section should go up.
3. In Supabase's **Table Editor**, you should see the row.
4. Run a typical test, an edge case and three adversarial tests (a pasted resume, a prompt injection, a request to judge the person) so you have 5+ rows.
5. Search your GitHub repo for `AIza`. You should get **no results**.

### If something breaks
- **"The coach is unavailable"**: check the Gemini key and model name. In Vercel, open **Logs**, find the `/api/review` request and read the `Gemini error` line.
- **500 "Something went wrong"** or **stats show "–"**: usually the Supabase URL or key. Check that the table name is `pitch_reviews` and that the env vars have no extra spaces.
- **404 on /api/review**: the `api/` folder must sit at the repo root, next to `index.html`.
- **The 🎙 button doesn't show**: voice only works in Chrome and Edge. Text input works everywhere.
