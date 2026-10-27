# 🎵 GROIC — Social Music Listening Platform

[![Platform](https://img.shields.io/badge/Platform-GitHub%20Pages%20Static-blue.svg)](#-github-pages-deployment)
[![Vanilla JS](https://img.shields.io/badge/Stack-HTML5%20%7C%20CSS3%20%7C%20Vanilla%20ES6+-yellow.svg)](#-architecture--technologies)
[![YouTube API v3](https://img.shields.io/badge/API-YouTube%20Data%20API%20v3-red.svg)](#-youtube-data-api-setup)
[![Supabase Realtime](https://img.shields.io/badge/Realtime-Supabase%20PostgreSQL-emerald.svg)](#-supabase-social-backend-setup)

> *"Music Hits Different When We Share It."*  
> **Create a room. Invite your people. Discover public rooms. Listen to music together in real time.**

---

## 🌟 Overview

**GROIC** is an upgraded, real-time social music listening platform built entirely as a static web application suitable for hosting on **GitHub Pages**, backed by **Supabase PostgreSQL & Realtime**, and powered by the **official YouTube Data API v3 and YouTube IFrame Player API**.

Listeners can create private rooms for partners, friends, and family, launch public rooms discoverable by the community, track trending rooms with active listeners, and stream the same YouTube audio and video in synchronized real time.

---

## ✨ Features

- **📻 Real-Time Synchronized Rooms**: Multiple users on different devices watch and listen to the same YouTube stream simultaneously with automatic drift correction.
- **🔒 Private Listening Rooms**: Create intimate rooms for 2, 4, 6, 8, or 10 people with secret 8-character invitation codes and direct invite links. Private rooms never appear in public listings or search results.
- **🌐 Public Rooms Discovery**: Discover open rooms hosted by the community, view active participant counts, and jump in to listen together.
- **🔥 Trending Rooms Algorithm**: Public rooms are dynamically ranked by active listeners, occupancy ratio, recent room activity, and freshness.
- **👥 Multi-Tab Deduplicated Presence**: Live online listener presence indicators powered by Supabase Realtime Presence, accurately counting individual users rather than inflating counts across multiple browser tabs.
- **📋 Collaborative Room Queue**: Add upcoming songs from YouTube search directly into a shared queue in real time, with automatic queue advancement when a video ends.
- **🛡️ Atomic Room Capacity Enforcement**: Server-side PostgreSQL function with `SELECT ... FOR UPDATE` row-locking prevents concurrent joins from exceeding the configured capacity limit (2, 4, 6, 8, or 10 listeners).
- **🔑 Supabase Authentication**: Real email and password registration, login, session restoration, and custom listener display names.
- **☁️ Cloud & Local Library**: Save tracks and manage playlists locally in browser `localStorage` or sync to personal cloud storage with Row Level Security (RLS) when signed in, including a safe "Import Local to Cloud" tool.
- **⚡ Zero-Build Architecture**: 100% Vanilla ES6+ JavaScript, semantic HTML5, and CSS3. No Node build steps, no bundlers, zero npm dependencies.

---

## 📁 Project Structure

```text
groic-mvp/
├── index.html                  # Landing page with hero, live preview, and social spotlight
├── explore.html                # YouTube music search, mood filters & add-to-room action
├── rooms.html                  # Social rooms discovery, trending rooms & room launcher
├── room.html                   # Synchronized room experience (player, queue & presence)
├── player.html                 # Solo web player with queue and listening history
├── library.html                # Personal library (Saved songs, playlists & cloud sync)
├── about.html                  # Architecture breakdown, algorithms & security specs
├── README.md                   # Comprehensive documentation & setup guide
├── .gitignore                  # Git ignore rules for clean repository hygiene
│
├── supabase/
│   └── schema.sql              # Complete PostgreSQL schema, functions & RLS policies
│
├── css/
│   ├── style.css               # Shared tokens, typography, navigation, modals & toasts
│   ├── rooms.css               # Social room cards, trending grid & room layout styles
│   ├── explore.css             # Search bar, genre chips & music cards grid
│   ├── player.css              # Ambient video glow, transport controls & queue sidebar
│   └── library.css             # Library tabs, playlist cards & song rows
│
├── js/
│   ├── config.example.js       # Configuration guide with security instructions
│   ├── config.js               # Runtime configuration & browser localStorage overrides
│   ├── storage.js              # Resilient storage wrapper with in-memory fallback
│   ├── auth.js                 # Functional Supabase Authentication controller & UI modal
│   ├── youtube.js              # YouTube Data API v3 search client & curated catalog
│   ├── player.js               # Official YouTube IFrame Player controller & queue
│   ├── library.js              # Personal library controller (Local + Cloud Sync)
│   ├── playlists.js            # Global "Add to Playlist" modal manager
│   ├── rooms.js                # Rooms discovery controller & creation workflows
│   ├── room.js                 # Social room controller (orchestrates sync & presence)
│   ├── room-permissions.js     # Host vs member permission verification
│   ├── room-sync.js            # Drift calculation & real-time playback synchronization
│   ├── room-presence.js        # Supabase Realtime Presence tracker
│   ├── main.js                 # Shared UI manager (responsive nav, settings modal, toasts)
│   └── services/
│       ├── supabase-client.js  # Shared Supabase singleton client factory
│       ├── music-service.js    # Unified music discovery facade & playback queue
│       ├── local-library-service.js    # Local browser storage repository
│       ├── supabase-library-service.js # Supabase cloud repository with RLS
│       └── room-service.js     # Room creation, atomic join, queue & trending API
│
└── assets/
    └── images/
        ├── logo.svg            # Scalable vector sound-prism logo
        └── default-cover.svg   # High-resolution placeholder cover art
```

---

## 🛠️ YouTube Error 153: Root Cause, Resolution & Testing Guide

### What Causes YouTube Error 153?
When opening an HTML file directly from your local filesystem using a file URL (e.g. `file:///F:/Groic_Mimic/room.html?id=demo-room-synth-02`):
1. **Missing / Null HTTP Referrer & Origin**: The browser's protocol is `file:`. The browser sets the `Origin` header to `"null"` or omits the `Referer` header entirely. YouTube's embedded player configuration checks reject embeds that lack a valid HTTP or HTTPS origin, displaying:  
   **"Video player configuration error — Error 153"**
2. **Passing `origin: "null"` to YouTube Player API**: If the player configuration passes `window.location.origin` while running on `file:///`, it literally passes `"null"`, triggering immediate embed rejection.
3. **Invalid or Unsanitized Video IDs**: Video IDs containing query parameters or malformed strings trigger configuration errors.

### Fixes Implemented in GROIC:
- **Referrer Policy Meta Tag**: Added `<meta name="referrer" content="strict-origin-when-cross-origin">` to all HTML pages.
- **Conditional Origin in `playerVars`**: The `origin` parameter is only passed when the page is served over `http:` or `https:` with a valid origin. When served over `file:`, `origin` is omitted so `"null"` is never transmitted.
- **Strict Video ID Validation**: All video IDs are sanitized and validated against `/^[a-zA-Z0-9_-]{11}$/` before initializing or seeking.
- **Single API Script Initialization**: Guards prevent duplicate `https://www.youtube.com/iframe_api` script tags or overwriting `window.onYouTubeIframeAPIReady`.
- **In-Player Error Overlay**: If Error 153, 101, 150, or 100 occurs, an interactive in-player overlay appears with:
  - Error explanation tailored to the problem.
  - A prominent **"Open on YouTube"** button that lets the user open the video directly on YouTube.
  - A **"Skip to Next Track"** button to advance the room queue.
  - A **"Retry"** button.
- **Local File Advisory Banner**: Automatically detects `window.location.protocol === 'file:'` and informs the user to run a local web server or open via GitHub Pages.

### How to Test Locally with an HTTP Server:
To test and ensure Error 153 does not occur, run any local HTTP server from your project folder:

```bash
# In F:\Groic_Mimic:
python -m http.server 8000
# or
npx serve .
```
Then open:
`http://localhost:8000/room.html?id=demo-room-synth-02`

### Testing on GitHub Pages:
Once deployed to GitHub Pages (which serves over `https://` with valid origins and referrers), YouTube embeds load with full origin validation without Error 153.

---

## 🎶 Collaborative Queue Management & Synchronization

### 1. Adding Music to Room Queue
- Click the prominent **"+ Add Music"** button in the Queue header.
- A modal opens with quick genre chips (Lo-Fi, Synthwave, Indie Acoustic, Top Hits, Cyberpunk, R&B).
- Type a song or artist and submit:
  - Visual loading spinner displays during search.
  - Results show thumbnail, title, channel name, and **"+ Add to Queue"**.
  - Clicking "+ Add to Queue" disables the button, changes to "✓ Added!", prevents duplicate submissions, and updates the queue immediately.
  - Adding music **never interrupts or resets the currently playing track**.

### 2. Separated Queue Layout
- **Now Playing Card**: Displayed separately at the top of the queue with live animated equalizer sound bars, track title, channel, and "Added by [Name]".
- **Upcoming Songs Section**: Numbered list of upcoming tracks showing track details, thumbnail, and "Added by" name.

### 3. Queue Management Actions
- **Reordering (Move Up `↑` / Move Down `↓`)**: Host and authorized members can swap song positions in the upcoming list.
- **Play Next (`⏭`)**: Moves the selected upcoming song directly to the top of upcoming tracks so it streams right after the current song.
- **Remove Song (`✕`)**: Host can remove any song from queue; listeners can remove their own added songs. Removing an upcoming track never affects the playing track.

### 4. Real-Time Synchronization
- **Supabase Cloud Mode**: Uses PostgreSQL Realtime (`postgres_changes` on `room_queue`) to propagate all additions, reorders, and removals across all connected clients instantly.
- **Local Demo Mode**: Persists queue state in `localStorage` under `groic_demo_queue_[ROOM_ID]` and synchronizes across all open browser tabs using `BroadcastChannel` and storage events.

---

Because GROIC has **zero dependencies and zero build steps**, you can serve it immediately with any static web server:

### Option A: Using Python (Recommended)
```bash
# In the project root directory:
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

### Option B: Using VS Code Live Server
1. Open the project folder in VS Code.
2. Right-click `index.html` and choose **"Open with Live Server"**.

### Option C: Using Node `npx serve`
```bash
npx serve .
```

---

## ☁️ Supabase Social Backend Setup

To enable real-time synchronized listening rooms, live presence, and user accounts:

### 1. Create a Free Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and create an account or project (e.g. `groic-social`).
2. Wait a minute for the database to provision.

### 2. Execute Database Schema & Functions
1. In the Supabase Dashboard, click on the **SQL Editor** in the left sidebar.
2. Click **New Query**.
3. Copy the entire contents of [`supabase/schema.sql`](./supabase/schema.sql) and paste it into the query editor.
4. Click **Run**.
   *This automatically creates the `profiles`, `rooms`, `room_memberships`, `room_queue`, `room_activity`, `saved_songs`, `playlists`, and `playlist_items` tables, Row Level Security policies, Realtime publications, and atomic functions (`join_room_atomic`, `advance_room_queue_atomic`, `get_trending_rooms`).*

### 3. Configure Supabase Credentials
1. In the Supabase Dashboard, navigate to **Project Settings > API**.
2. Copy your **Project URL** (`https://xyzcompany.supabase.co`) and **Project API Key** (use `anon` / `public`, **NEVER** `service_role`).
3. You can apply the credentials in either of two ways:
   - **In-Browser (Zero Code Changes)**: Click the **Mode Badge** in the website header, paste the URL and Anon Key into the Settings modal, and click **Save & Apply**.
   - **In Code**: Open `js/config.js` and set:
     ```javascript
     window.GROIC_CONFIG.SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
     window.GROIC_CONFIG.SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';
     ```

---

## 🧪 Testing with Two Authenticated Users

To verify the real multi-user social room experience:

1. **Open Two Browser Sessions**:
   - Open Browser A (e.g. Chrome normal window).
   - Open Browser B (e.g. Chrome Incognito window or Firefox).
2. **Sign Up User A (Host)**:
   - In Browser A, click **Sign In** in the header, click **Sign Up**, and create an account: `host@example.com` with display name `Host Alex`.
   - Go to **Rooms 🔥**, click **+ Create Room**, enter a room name (e.g. `Neon Drive`), select privacy (Public or Private), capacity (e.g. 6), and click **Launch Room**.
   - You will enter the room at `room.html?id=ROOM_ID`.
3. **Join with User B (Listener)**:
   - In Browser B, sign up as `listener@example.com` with display name `Listener Sam`.
   - **For Public Rooms**: Go to **Rooms 🔥**, find the room in the Public Rooms or Trending list, and click **Join Room**.
   - **For Private Rooms**: In Browser A, click **Invite**, copy the 8-digit secret code, and in Browser B paste it into the "Have a room code?" bar on the Rooms page.
4. **Verify Synchronization**:
   - Both browsers show `Neon Drive` and connect to the same stream.
   - Look at the **Listeners** sidebar tab in both browsers: both `Host Alex` and `Listener Sam` appear with live green dots.
   - In Browser A (Host), click **Play**, **Pause**, or seek the video: Browser B mirrors the playback state with automatic drift correction.
   - In Browser B (Listener), click **+ Add Songs**, search for a track, and add it: the song immediately appears in the shared **Queue** for both participants!

---

## 🔑 YouTube Data API v3 Setup

GROIC includes a curated catalog of genuine playable YouTube streams in **Demo Mode**. To enable **Live Mode** search across the entire YouTube music catalog:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and enable **YouTube Data API v3**.
3. Create Credentials -> **API Key**.
4. **Crucial Security Restriction**:
   - Under **Application restrictions**: Select **Websites (HTTP referrers)** and add your local dev URL (`http://localhost:*`) and your GitHub Pages domain (`https://YOUR_USERNAME.github.io/*`).
   - Under **API restrictions**: Select **Restrict key** and choose ONLY **YouTube Data API v3**.
5. Paste your key into the in-app Settings modal or in `js/config.js`.

---

## 🌐 GitHub Pages Deployment

Deploying GROIC to GitHub Pages takes less than 2 minutes:

1. Create a public repository on GitHub (e.g. `groic-social`).
2. Push your files:
   ```bash
   git init
   git add .
   git commit -m "Upgrade GROIC: Social Music Listening Platform"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/groic-social.git
   git push -u origin main
   ```
3. In your repository on GitHub, navigate to **Settings > Pages**.
4. Under **Build and deployment > Source**, choose **Deploy from a branch**, select branch `main` and folder `/ (root)`, then click **Save**.
5. Your platform is live at `https://YOUR_USERNAME.github.io/groic-social/`.

> **Note on Auth Redirects**: In your Supabase Dashboard under **Authentication > URL Configuration**, add your GitHub Pages URL (`https://YOUR_USERNAME.github.io/groic-social/**`) to **Redirect URLs**.

---

## 🛡️ Database Security & Capacity Architecture

- **Atomic Capacity Lock**: Implemented in PostgreSQL via `public.join_room_atomic()`. Uses row-level lock (`SELECT ... FOR UPDATE`) to eliminate race conditions. Concurrent requests cannot exceed room capacity.
- **Row Level Security (RLS)**:
  - Private rooms cannot be queried by unauthorized visitors.
  - Profiles are publicly readable by authenticated listeners; only the owner can modify their profile.
  - Playback commands are restricted to the host or members granted permission in room settings.
  - Personal saved tracks and playlists are strictly isolated by `auth.uid() = user_id`.
- **Zero Exposed Secrets**: Only the Supabase `anon` public key is used in static frontend code. The `service_role` key is **never** committed or exposed.

---

## ✅ Quality & Verification Matrix

| Area | Feature | Test Verification | Status |
| :--- | :--- | :--- | :---: |
| **Authentication** | Registration & Login | Email/Password with custom display name via Supabase Auth | ✅ Verified |
| **Authentication** | Session Restoration | Auto-restores session on refresh and listens to `onAuthStateChange` | ✅ Verified |
| **Room Creation** | Public & Private Rooms | Stores capacity (2, 4, 6, 8, 10), privacy, permissions, and theme | ✅ Verified |
| **Capacity** | Atomic Enforcement | Stored procedure `join_room_atomic` locks row and rejects joins when full | ✅ Verified |
| **Private Rooms** | Secret Invite Token | Cryptographic 8-character token; excluded from public listings & search | ✅ Verified |
| **Trending** | Algorithmic Ranking | Weighted score `(Participants × 15) + (Activity × 5) + (Occupancy% × 20) - (Hours × 0.4)` | ✅ Verified |
| **Realtime Sync** | Drift Correction | `room-sync.js` verifies offset and seeks when drift > 2.5s without infinite loop | ✅ Verified |
| **Realtime Sync** | Autoplay Handling | Detects blocked browser autoplay and renders "Tap to Sync & Listen" prompt | ✅ Verified |
| **Presence** | Multi-Tab Deduplication | Supabase Realtime Presence tracked by `user_id` so 1 user = 1 listener | ✅ Verified |
| **Shared Queue** | Collaborative Queuing | Songs added in room queue propagate in real time via Postgres replication | ✅ Verified |
| **Library** | Cloud Sync & Migration | RLS protected tables + "Import Local to Cloud" button without duplicates | ✅ Verified |
| **Compliance** | YouTube Developer Terms | Official IFrame Player API used exclusively; no audio ripping or ad bypass | ✅ Verified |
| **Deployment** | GitHub Pages Ready | All asset paths and navigation use relative `./` links; zero build step | ✅ Verified |

---

## 📄 License & Attribution

Educational and portfolio showcase. All music content, video playback, and trademarks remain the property of their respective copyright holders, Google LLC, and YouTube.
