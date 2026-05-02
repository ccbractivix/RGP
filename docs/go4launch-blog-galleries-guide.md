# go4launch — Blog & Galleries User Guide
### *"For Dummies" Edition*

---

## 📖 What Is This?

**go4launch** is the resort's rocket launch companion app. Guests open it on their phones to see upcoming launches, countdowns, and all the info they need to enjoy a launch from the resort.

This guide covers the two brand-new features added to go4launch:

1. **Chris' Blog** — A personal blog written by Chris, delivered directly inside the app
2. **Photo Galleries** — A collection of launch photo galleries guests can browse at any time

---

## 🧭 The Navigation Bar

At the top of the app, you'll notice a row of three tabs:

| Tab | What it does |
|---|---|
| 🚀 **Launches** | The original home screen — upcoming launch cards with countdowns |
| 📷 **Galleries** | Browse all launch photo galleries |
| 📝 **Blog** | Read Chris' Blog posts |

**"NEW" badges** — If a new blog post or gallery has been added in the past 7 days, a small **NEW** badge appears on that tab so guests know something fresh is waiting for them.

---

## 📷 PART 1: Photo Galleries

### For Guests — How to Use the Galleries

1. Tap the **📷 Galleries** tab at the top of the app.
2. You'll see galleries listed, newest first.
3. **Featured** galleries (the most spectacular ones) appear as big banner cards at the top.
4. Older galleries are grouped by year in a two-column grid below.
5. Tap **"Open Gallery →"** on any card to open the photo gallery in your browser. *(This takes you to a Google Sites page that opens in a new tab.)*
6. Use your browser's back button to return to go4launch.

---

### For Chris — How to Add a New Gallery

Galleries are stored in a simple text file in the website's code. Adding a new gallery means editing that file. Here's how — step by step:

**Where the file lives:**
```
go4launch/data/galleries.json
```

**How to add a gallery (GitHub.com method):**

1. Go to [github.com/ccbractivix/RGP](https://github.com/ccbractivix/RGP)
2. Navigate to `go4launch` → `data` → `galleries.json`
3. Click the **pencil icon** ✏️ to edit the file
4. Add your new gallery entry. The file looks like this:

```json
[
  {
    "id": "falcon9-starlink-jan-2025",
    "title": "Falcon 9 — Starlink Jan 15 2025",
    "date": "2025-01-15",
    "url": "https://sites.google.com/view/your-gallery-page",
    "cover": "https://link-to-cover-thumbnail.jpg",
    "description": "A stunning nighttime launch visible from the beach.",
    "featured": true
  }
]
```

5. Add your entry **inside** the `[` and `]` brackets. If there are already entries, add a comma `,` after the last entry's closing `}` before adding yours.
6. Scroll down and click **"Commit changes"** → **"Commit directly to main"** → **"Commit changes"**
7. The app updates itself automatically within a minute or two.

---

**Gallery entry fields explained:**

| Field | Required? | What it means |
|---|---|---|
| `id` | ✅ Yes | A unique identifier — no spaces, use hyphens. Example: `falcon9-starlink-jan-2025` |
| `title` | ✅ Yes | The gallery name shown in the app. Example: `"Falcon 9 — Starlink 6-14"` |
| `date` | ✅ Yes | The launch date in `YYYY-MM-DD` format. Example: `"2025-01-15"` |
| `url` | ✅ Yes | The full link to your Google Sites gallery page |
| `cover` | Optional | A thumbnail image URL. Shows as the gallery preview photo. If omitted, a 📷 placeholder is shown. |
| `description` | Optional | One or two sentences about the gallery. Shown under the title on featured cards. |
| `featured` | Optional | Set to `true` to show this gallery as a large banner card at the top. Good for the most recent or spectacular launches. Set to `false` or leave out for a regular grid card. |

**Important:** Only set `featured: true` for 1–3 galleries. If too many are featured, the page looks cluttered.

---

**Example of a completed `galleries.json` with two galleries:**

```json
[
  {
    "id": "falcon9-starlink-march-2025",
    "title": "Falcon 9 — Starlink March 12 2025",
    "date": "2025-03-12",
    "url": "https://sites.google.com/view/holidayinnclubcape/gallery-march-12",
    "cover": "https://example.com/photos/march12-thumb.jpg",
    "description": "A perfect daytime launch with a double sonic boom heard from the pool deck!",
    "featured": true
  },
  {
    "id": "falcon9-starlink-jan-2025",
    "title": "Falcon 9 — Starlink Jan 15 2025",
    "date": "2025-01-15",
    "url": "https://sites.google.com/view/holidayinnclubcape/gallery-jan-15",
    "cover": "https://example.com/photos/jan15-thumb.jpg",
    "description": "Nighttime launch — beautiful exhaust plume illuminated by the setting sun.",
    "featured": false
  }
]
```

**Tip:** Always keep the newest gallery at the top of the list in the file. The app sorts by date automatically, but keeping them in order makes the file easier to manage.

---

## 📝 PART 2: Chris' Blog

### For Guests — How to Use the Blog

1. Tap the **📝 Blog** tab at the top of the app.
2. You'll see two sections:

   - **📚 Chris' Library** — A gold shelf at the top with hand-picked posts that are great reads at any time during your stay. Think of these as the "must reads" — stories, guides, and background info that don't get old.
   - **Latest Posts** — The regular blog feed, newest post at the top, just like any blog.

3. Each post card shows:
   - The date it was published
   - The title
   - A short excerpt (a sentence or two preview)
   - Tags (like "Falcon 9" or "SpaceX") — helpful if you want to know the topic at a glance
   - Estimated reading time ("⏱ 3 min read")

4. Tap **"Read more →"** to open the full post.

5. Inside a post, you can tap the **SHARE** button to copy the link or share it with someone.

6. Tap **← Back to Blog** to go back to the post list.

---

### For Chris — How to Write and Publish Blog Posts

Blog posts are managed through a dedicated admin tool called the **Blog Editor**.

**How to access the Blog Editor:**

1. Go to your go4launch admin dashboard at `https://go4launch-backend.onrender.com/admin-ui/`
2. Enter your admin code to log in.
3. Click the **📝 Blog Editor** button in the top-right corner of the dashboard.

*(You can also go directly to `https://go4launch-backend.onrender.com/admin-ui/blog.html`)*

---

### The Blog Editor — Step by Step

#### Writing a New Post

1. Click **"+ New Post"** at the top of the post list.
2. An editor form opens. Fill in:

**Title** *(required)* — The headline of your post. Example: *"Why This Falcon 9 Launch Is One to Watch"*

**Slug** *(auto-generated, usually don't touch this)* — This is the URL-friendly version of the title. It auto-fills when you type the title. Example: `why-this-falcon-9-launch-is-one-to-watch`. Only edit it if you need something shorter or different. Rules: lowercase letters, numbers, and hyphens only.

**Excerpt** *(optional but recommended)* — A 1–2 sentence preview that shows on the blog list page and on the home screen teaser. Guests see this before clicking to read the full post. Keep it short and enticing.

**Post Body** *(required)* — This is the full post. Write as much as you like. You can use basic HTML to format it:
- `<b>bold text</b>` for **bold**
- `<i>italic text</i>` for *italic*
- `<br>` for a line break (new paragraph)
- `<a href="https://...">link text</a>` for clickable links

**Header Image URL** *(optional)* — Paste a link to an image to show at the top of the post. This image also appears as a banner on the blog list card. Use a landscape photo for best results.

**Tags** *(optional)* — Type comma-separated keywords. Example: `Falcon 9, SpaceX, Starlink`. Guests see these as colored labels on the post.

**Published Date** *(optional)* — Leave blank to use today's date/time when you publish. Or set a custom date if you want to backdate a post.

**📚 Add to Chris' Library** *(checkbox)* — Check this box if this post is an evergreen "must read" that you want featured in the Library shelf. Good for things like:
- "Everything You Need to Know About Watching Launches from the Resort"
- "The History of SpaceX Starlink Missions"
- "Your Complete Guide to Launch Viewing Spots at the Resort"
  
  Keep the Library to a small, curated list (5–10 posts max).

**✅ Published** *(checkbox)* — Until you check this box, the post is a **Draft** — only you can see it in the admin editor, and guests won't see it in the app. When you're ready to go live, check this box and save.

3. Click **💾 Save Post**.

---

#### Editing an Existing Post

1. Find the post in the list.
2. Click the **Edit** button next to it.
3. The editor opens with all the existing content loaded.
4. Make your changes.
5. Click **💾 Save Post**.

---

#### Publishing vs. Drafts

- **Draft** = Post is saved but hidden from guests. Use drafts to write posts in advance or keep half-finished work safe.
- **Published** = Post is live and visible to all guests in the app.

To publish a draft: open it, check the **✅ Published** checkbox, and save.

To take a post offline: open it, uncheck **✅ Published**, and save.

---

#### Deleting a Post

1. Open the post in the editor.
2. Scroll down to the red **🗑 Delete** button.
3. Click it and confirm in the popup.

⚠️ **Warning:** Deleting is permanent. There is no undo. If you just want to hide a post from guests, unpublish it instead (uncheck "Published").

---

### Tips for Writing Great Blog Posts

**Keep it personal and conversational.** Guests chose this resort partly for the launch-watching experience. They want to hear from Chris — the expert. Write like you're talking to a guest at the pool bar, not writing a Wikipedia article.

**Good topic ideas:**
- Pre-launch commentary: "Here's What to Expect Tonight"
- Mission spotlight: "What Are All These Starlink Satellites For, Anyway?"
- Launch day story: "Last Night's Launch — What We Saw and What Happened"
- Resort-specific tips: "Best Spots on Property for Watching a Launch"
- Science made fun: "Why Does the Rocket Look Orange When It Launches?"

**For the Library**, pick posts that stay useful even months later — not news or predictions, but educational or resort-specific pieces.

**Reading time** is calculated automatically. The editor shows a live estimate as you type. Aim for 2–5 minutes for most posts. Library posts can be longer.

---

## 🏠 HOME SCREEN TEASERS

Even when guests are on the main Launches screen, they'll see two small cards at the bottom showing:

- The **latest photo gallery** (with an "Open Gallery" button)
- The **latest blog post** (with the title, date, excerpt, and a "Read more" link)

These teasers automatically update whenever you add a new gallery or publish a new post. No action needed — they just appear.

---

## 🔔 "NEW" Badges

If a blog post was published within the **last 7 days**, the Blog tab shows a small **NEW** badge. Same for galleries — if one was added within the last 7 days, the Galleries tab shows **NEW**.

Once a guest taps that tab, the badge disappears for them (stored in their browser, not server-side). New visitors or guests who haven't visited yet will still see the badge.

---

## ❓ Frequently Asked Questions

**Q: Can guests comment on blog posts?**
A: No. The blog is read-only for guests. This keeps things simple and eliminates spam/moderation issues. Guests can share posts using the Share button.

**Q: What if I make a typo in a published post?**
A: Just edit the post and save it again. Changes take effect immediately.

**Q: How long does it take for a new gallery to appear after I save the file on GitHub?**
A: Usually 1–3 minutes. GitHub Pages rebuilds automatically when you commit a change.

**Q: Can I add a gallery cover photo that's hosted on Google Sites?**
A: Possibly, but direct image links from Google Sites can be tricky. For best results, host cover photos on Google Photos, Imgur, or any direct image URL. If the image doesn't load, a 📷 placeholder will show automatically.

**Q: What happens if a guest opens a blog post link and that post gets unpublished?**
A: They'll see a "Post not found" message. This is fine — it's unlikely to happen since you'd only unpublish while revising, then re-publish quickly.

**Q: What does "slug" mean?**
A: The slug is the web address identifier for a blog post. For example, if the title is "Best Launch Ever", the slug might be `best-launch-ever`. It shows up in the browser address bar when sharing a post. You normally don't need to think about it — it's auto-generated from the title.

**Q: How many Library posts should I have?**
A: 5–10 is ideal. Too few and the shelf looks empty; too many and guests won't know where to start. Think of it as a curated bookshelf, not a full archive.

---

## 🚀 Quick Reference Card

### Adding a Gallery
1. Edit `go4launch/data/galleries.json` on GitHub
2. Add an entry with `id`, `title`, `date`, `url`
3. Commit → app updates in ~2 minutes

### Writing a Blog Post
1. Go to admin dashboard → **📝 Blog Editor**
2. Click **+ New Post**
3. Fill in Title, Body (+ optional Excerpt, Tags, Header Image)
4. Check **📚 Library** if it's an evergreen post
5. Check **✅ Published** when ready to go live
6. Click **💾 Save Post**

### Making a Post a Library Post
- Open the post → check **📚 Add to Chris' Library** → Save

### Taking a Post Offline
- Open the post → uncheck **✅ Published** → Save

### Setting the Cover Photo for a Gallery
- Add `"cover": "https://direct-image-link.jpg"` to the gallery entry in `galleries.json`

---

*go4launch — Resort Rocket Launch Viewing Companion*
