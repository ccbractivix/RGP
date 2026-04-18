# Disc Rentals Library — User's Manual

Welcome to the Disc Rentals Library system! This manual explains how to use every part of the system. It covers three different pages: the **Public Library** page (for guests), the **Operator Panel** (for front-desk staff), and the **Admin Panel** (for managers).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Public Library Page — For Guests](#2-public-library-page--for-guests)
   - [Browsing the Library](#21-browsing-the-library)
   - [Searching for a Title](#22-searching-for-a-title)
   - [Understanding Status Labels](#23-understanding-status-labels)
   - [Making a Reservation](#24-making-a-reservation)
3. [Operator Panel — For Front-Desk Staff](#3-operator-panel--for-front-desk-staff)
   - [Signing In](#31-signing-in)
   - [Browsing and Searching Titles](#32-browsing-and-searching-titles)
   - [Checking Out Discs](#33-checking-out-discs)
   - [Adding More Titles to One Checkout](#34-adding-more-titles-to-one-checkout)
   - [Checking In Discs](#35-checking-in-discs)
   - [Marking a Disc as Damaged](#36-marking-a-disc-as-damaged)
   - [Managing Reservations](#37-managing-reservations)
4. [Admin Panel — For Managers](#4-admin-panel--for-managers)
   - [Signing In](#41-signing-in)
   - [Adding a Movie](#42-adding-a-movie)
   - [Adding a Game](#43-adding-a-game)
   - [Managing the Library List](#44-managing-the-library-list)
   - [Adding More Copies of a Title](#45-adding-more-copies-of-a-title)
   - [Removing a Title](#46-removing-a-title)
   - [Viewing All Checked-Out Discs](#47-viewing-all-checked-out-discs)
   - [Viewing Damaged Discs](#48-viewing-damaged-discs)
5. [Quick Reference](#5-quick-reference)

---

## 1. Overview

The Disc Rentals Library is a system that lets guests browse, reserve, check out, and return movies and video games. Here is a quick summary of who uses each part:

| Page | Who uses it | Link |
|------|-------------|------|
| Public Library | Guests | `…/rentals-web/index.html` |
| Operator Panel | Front-desk staff | `…/rentals-web/operator.html` |
| Admin Panel | Managers | `…/rentals-web/admin.html` |

---

## 2. Public Library Page — For Guests

Guests can open this page on their phone, tablet, or computer. No login is needed.

### 2.1 Browsing the Library

When you open the page, you will see a list of all available movies and games. At the top of the page you will find:

- **Filter buttons** — Tap **All**, **Movies**, or **Games** to show only that type of disc.
- **Sort buttons** — Sort the list by **Title** (A–Z), **Year** (newest first), or **Genre** (A–Z).

Each disc is shown on its own card. The card shows:
- The title of the movie or game
- The format badge (**Movie** or **Game**)
- The status badge (**Available**, **Out**, or **Reserved**)
- Year, MPAA rating (for movies), runtime (for movies), IMDB star rating (for movies), or ESRB rating (for games)
- Genre tags
- Links to IMDB and the IMDB Parents' Guide (for movies)

### 2.2 Searching for a Title

Use the **Search bar** at the top of the page to find a specific title. Type any part of the title or a genre word. The list will update as you type. To clear the search, tap the **✕** button next to the search bar.

> **Tip:** The search works even if you don't know the exact title. For example, searching "star" will find "Star Wars," "Stardust," etc.

### 2.3 Understanding Status Labels

| Label | What it means |
|-------|---------------|
| 🟢 **Available** | At least one copy is on the shelf and ready to check out |
| 🔴 **Out** | All copies are currently checked out — no copies on the shelf |
| 🟡 **Reserved** | No copies are on the shelf, but someone has a reservation pending |

### 2.4 Making a Reservation

You can reserve any title — even if it is currently "Out" — so that when it comes back, the staff knows you want it.

**Steps to reserve a title:**

1. Find the title you want on the library page.
2. Tap the **Reserve** button on the title's card.
3. A small window will pop up. Enter:
   - Your **Room Number**
   - Your **Last Name**
4. Tap **Reserve**.
5. You will see a confirmation message.

**Important rules for reservations:**
- Your reservation will be held for **24 hours**. After 24 hours, it expires automatically.
- You may have up to **3 active reservations** at one time.
- Please pick up your disc at the front desk within the 24-hour window.

---

## 3. Operator Panel — For Front-Desk Staff

This page is used by front-desk staff to check discs in and out.

### 3.1 Signing In

Open the Operator Panel page and enter your **4-digit PIN code**. Tap **Sign In**. If you forget your code, contact the manager.

To sign out at any time, tap **Sign Out** in the top-right corner.

### 3.2 Browsing and Searching Titles

After signing in, you will see the full library list sorted alphabetically. Each title shows:
- The title name and format (Movie or Game)
- A colored status badge (Available / Out / Reserved)
- How many copies are available and how many are out

**To filter the list**, tap one of the filter pills at the top:
- **All** — show every title
- **Available** — show only titles with copies ready to check out
- **Out** — show titles with all copies checked out
- **Reserved** — show titles with active reservations
- **Movies** / **Games** — filter by format

**To search**, type in the search bar at the top. The list filters as you type.

### 3.3 Checking Out Discs

1. Tap on a title that shows a green **Available** badge.
2. A panel will open at the bottom of the screen. You will see:
   - A **Select Copy** dropdown (choose which physical copy, e.g., x1, x2)
   - **Room Number** field
   - **Last Name** field
3. Enter the guest's room number and last name.
4. Tap **Check Out Now** to complete the checkout right away.

The disc's status will change to **Out** immediately.

### 3.4 Adding More Titles to One Checkout

A guest can check out up to **3 titles** in a single session. Instead of completing the checkout right away, you can build a session:

1. Tap a title → fill in room and last name → tap **Add to Session**.
2. The title is added to a session bar that appears at the top of the screen. It shows the room number, last name, and how many titles are queued (e.g., "2 titles — Room 204, Smith").
3. Continue browsing and tap another title → tap **Add to Session** again (up to 3 total).
4. When you are done, tap the **Check Out** button in the session bar to complete all checkouts at once.
5. To cancel the session without checking out, tap **Clear** in the session bar.

> **Note:** Once a session is started, the room and last name are locked for that session. All titles in the same session go to the same guest.

### 3.5 Checking In Discs

When a guest returns a disc:

1. Find the title in the list. It will show a red **Out** badge.
2. Tap the title.
3. A panel shows all the copies that are currently out, along with the room, guest name, and check-out date.
4. Tap **Check In** next to the correct copy.

The disc's status will change back to **Available**.

### 3.6 Marking a Disc as Damaged

If a returned disc is damaged:

1. Follow the same steps as checking in.
2. Instead of tapping **Check In**, tap **Check In as Damaged**.
3. A confirmation message will appear. Tap **OK** to confirm.

The disc will be removed from the public library and will no longer appear to guests. Managers can view all damaged discs in the Admin Panel.

### 3.7 Managing Reservations

When you tap a title that has active reservations, you will see the reservation details (guest name, room number, and expiry time) shown in an orange banner at the top of the copy panel.

- To **cancel a reservation** (for example, if the guest called to cancel), tap the **Cancel** button next to that reservation.
- To **fulfill a reservation** (check out the disc to the person who reserved it), follow the normal checkout steps. The system does not automatically connect a reservation to a checkout — the operator matches the guest manually.

---

## 4. Admin Panel — For Managers

The Admin Panel is where managers build and maintain the library. It has four tabs: **Add Title**, **Library**, **Checked Out**, and **Damaged**.

### 4.1 Signing In

Open the Admin Panel page and enter your **4-digit admin PIN code**. Tap **Sign In**. Admin codes are set in the backend settings and may be different from operator codes.

### 4.2 Adding a Movie

1. Go to the **Add Title** tab.
2. Under **Format**, make sure **Movie** is selected.
3. In the **Movie Lookup (OMDB)** section, either:
   - Type the movie's title in the **Search by Title** box and tap **Look Up**, or
   - Type the movie's IMDB ID (e.g., `tt1375666`) in the **IMDB ID** box and tap **Look Up**.
4. The system will fetch the movie's information from the internet and show a preview:
   - Title, year, MPAA rating, runtime, genres, IMDB star rating
   - Links to the IMDB page and the IMDB Parents' Guide
5. Check that the information looks correct.
6. Tap **Add to Library**.

The movie is added to the library with one copy (labeled **x1**). The copy is immediately available for checkout.

> **What if the lookup fails?** Double-check the spelling or the IMDB ID. Make sure the backend is running and the OMDB API key is set correctly (see the Installation Manual).

### 4.3 Adding a Game

1. Go to the **Add Title** tab.
2. Under **Format**, select **Game**.
3. Fill in the form:
   - **Title** — the game's name (required)
   - **Year** — release year (optional)
   - **Genres** — comma-separated genres, e.g., "Action, Sports" (optional)
   - **ESRB Rating** — choose from the dropdown: E, E10+, T, M, AO, or RP
4. Tap **Add to Library**.

The game is added with one copy (x1) and is immediately available.

### 4.4 Managing the Library List

Click the **Library** tab to see all titles in the database. Use the search box to filter by title.

Each title in the list can be expanded by tapping on it. The expanded view shows:
- All physical copies of that title and their current status (Available, Out, or Damaged)
- Which room has a copy that is checked out
- Buttons to **add more copies** or **delete the title**

### 4.5 Adding More Copies of a Title

If you receive a second (or third) physical copy of a title:

1. Open the **Library** tab and find the title.
2. Tap on it to expand.
3. Tap **+ Add Copy**.

A new copy will be created automatically with the next label (x2, x3, etc.).

### 4.6 Removing a Title

To remove a title and all of its copies permanently from the library:

1. Open the **Library** tab and find the title.
2. Tap on it to expand.
3. Tap **Delete Title**.
4. Confirm the deletion when asked.

> **Warning:** This action cannot be undone. All copy records and checkout history linked to this title will be deleted.

To remove just one copy of a title (but keep the title in the library):

1. Expand the title in the Library tab.
2. Tap **Remove** next to the specific copy you want to delete.

> **Note:** You cannot remove a copy that is currently checked out. Check it in first via the Operator Panel.

### 4.7 Viewing All Checked-Out Discs

Click the **Checked Out** tab to see a table of every disc that is currently checked out. The table shows:

| Column | What it means |
|--------|---------------|
| Title | The name of the disc |
| Copy | Which physical copy (x1, x2, etc.) |
| Room | The room it was checked out to |
| Last Name | The guest's last name |
| Out Since | The date it was checked out |

Tap **Refresh** to update the list.

### 4.8 Viewing Damaged Discs

Click the **Damaged** tab to see all discs that have been marked as damaged. These discs do not appear in the public library or operator list.

For each damaged disc, you can tap **Remove from Library** to permanently delete the copy record. This is useful for record-keeping once a disc has been discarded or replaced.

---

## 5. Quick Reference

### Operator — Checkout Steps
1. Find title (green Available badge) → tap it
2. Select copy, enter room & last name
3. Tap **Check Out Now** (single title) — or —
4. Tap **Add to Session** (up to 3 titles), then **Check Out** in the session bar

### Operator — Checkin Steps
1. Find title (red Out badge) → tap it
2. Tap **Check In** next to the correct copy
3. If damaged: tap **Check In as Damaged** instead

### Guest — Reservation Steps
1. Find title on the public page → tap **Reserve**
2. Enter room number and last name → tap **Reserve**
3. Pick up disc at front desk within **24 hours**

### Admin — Add Movie Steps
1. Add Title tab → Movie format → type title → Look Up
2. Confirm preview → Add to Library

### Admin — Add Game Steps
1. Add Title tab → Game format → fill in form → Add to Library

### Admin — Add More Copies
1. Library tab → find title → expand → + Add Copy

---

*End of User's Manual*
