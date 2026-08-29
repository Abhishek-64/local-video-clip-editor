# Local Video Clip Editor

A privacy-first, ultra-fast video editing and multi-platform automation studio comprising a React frontend and a Cloudflare Worker backend. 

The editor processes video, audio, images, and export generation locally in the browser, while the backend handles authentication, template synchronization, cloud storage (Backblaze B2), and social media API scheduling (YouTube, Facebook Reels).

---

## 🏗️ Project Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                   FRONTEND (React + Vite)                                │
│  - VideoPreview (WYSIWYG Canvas Blit + Overlays + Live Timeline Cut-Skipping)            │
│  - Timeline & SplitCutEditor (Precision Split, Keep/Delete Trimming, Custom Parts Table) │
│  - Export Engine (WebCodecs Hardware H.264 + Web Audio Offline Mixing + MP4 Muxer)       │
│  - MultiPlatform & YouTube / Facebook Modals (Smart Scheduling & Template Token Replacers)│
│  - Studio Template Manager (1-Click Presets for Canvas, YouTube, Facebook, Hashtags)     │
└────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                         │  HTTPS / Cookie & Bearer Auth / REST API
┌────────────────────────────────────────▼─────────────────────────────────────────────────┐
│                           BACKEND (Cloudflare Worker + Hono)                             │
│  - /api/auth/*     (User Signup, Login, Multi-Device Session Tokens, Salted Passwords)   │
│  - /api/settings/* (Project Templates, Tags, Upload Defaults)                            │
│  - /api/branding/* (Visual Presets, Logos, Text Overlays CRUD)                           │
│  - /api/uploads/*  (YouTube Resumable Upload Session Generator & Job Audit Log)          │
│  - /api/user/*     (Storage Accounting, Resource Usage & Scope Purge)                    │
│  - /api/youtube/*  (Google OAuth 2.0, Channel Info, Token Exchange, Metadata Sync)       │
│  - /api/facebook/* (Meta Graph API v21.0 OAuth, Page Token Exchange, Reels Scheduler)    │
│  - /api/storage/*  (Backblaze B2 Auth, Upload URL Generation, Public Signed Links)       │
│  - /api/admin/*    (Immediate DB Lifecycle Purge, Cleanup Audit Logs, Factory Reset)     │
│  - Cron Scheduled  (Background Worker Cron every 5 mins for Due Reels & B2 Temp Purge)   │
└────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                         │  D1 SQL ORM / Typed Queries
┌────────────────────────────────────────▼─────────────────────────────────────────────────┐
│                              DATABASE (Cloudflare D1 SQLite)                             │
│  - users, sessions, youtube_accounts, facebook_accounts, facebook_oauth_sessions         │
│  - branding_presets, upload_jobs, facebook_scheduled_posts                                │
│  - b2_temp_uploads, system_cleanup_logs                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Core Features

- **Local Video Editing:** Drag-and-drop video processing that runs entirely locally in your browser. Video files are not uploaded to servers for editing, preserving privacy and saving bandwidth.
- **Timeline & Splitting:** Precision range selection, manual cut-and-keep features, and batch splitting (e.g., cut a video into 15-second chunks, or 5 equal parts).
- **Studio Template Manager:** Create, save, and 1-click apply branding presets across Canvas overlays, YouTube titles/tags, and Facebook captions.
- **Smart Framing & Overlays:** Interactive crop modes (9:16, 16:9, 1:1, etc.), blurred backdrops, draggable text overlays with dynamic `{movie}` and `{part}` tokens, and custom logo watermarks.
- **Local Face Tracking:** Smart AI tracking to keep the active speaker centered in vertical crop exports, processed entirely within the browser via native `FaceDetector` APIs or heuristic fallbacks.
- **Advanced Audio Engine:** Mix original audio with voiceovers and background music. Includes smart voice ducking and speed-aware sampling.
- **Multi-Platform Export & Scheduling:** Export locally or automatically schedule and upload finished clips to YouTube Shorts and Facebook Reels through native OAuth integrations.

---

## 🚀 Export Engine Architecture

The export engine detects browser capabilities and chooses the most efficient pipeline.

1. **WebCodecs Pipeline (Fastest):** Uses hardware-accelerated `VideoEncoder` (H.264), periodic keyframes, and offline Web Audio mixing, bundled by an internal JavaScript MP4 Muxer for fast-start playback.
2. **MediaRecorder Fallback:** Used when WebCodecs is unavailable. Captures Canvas streams with Web Audio routing and standard browser encoding. 

The application utilizes web workers for non-blocking UI and caps concurrent render jobs based on the device's CPU and memory constraints.

---

## 🛠️ Tech Stack

### Frontend
* React 19 + Vite
* Tailwind CSS + Lucide Icons
* WebCodecs, WebGL/WebGL2, Canvas 2D
* Web Audio API
* JSZip

### Backend
* Cloudflare Workers
* Hono (Web Framework)
* Cloudflare D1 (Serverless SQLite)
* Backblaze B2 (Object Storage)
* YouTube Data API v3 & Meta Graph API v21.0

---

## 💻 Development & Deployment

### Requirements
- Node.js 18+ (npm or Bun)
- A modern browser with hardware acceleration enabled (Chrome/Edge recommended)
- Wrangler CLI (for backend deployment)

### Local Development

**1. Clone and Install Dependencies:**
```bash
# Frontend
cd frontend
npm install

# Backend
cd backend
npm install
```

**2. Start Frontend Dev Server:**
```bash
cd frontend
npm run dev
# Vite will serve at http://localhost:5173
```

**3. Configure Backend (Local / Cloudflare):**
Ensure your `wrangler.toml` is configured with your D1 databases and bindings, and you've generated necessary OAuth credentials for social platforms.

### Production Deployment

**Frontend:**
```bash
cd frontend
npm run build
npx wrangler deploy -c wrangler.jsonc
```

**Backend (Cloudflare Worker):**
```bash
cd backend
npx wrangler deploy -c wrangler.toml
```

---

## 🔒 Privacy & Data Handling

1. **Video Processing:** Local to the browser.
2. **Temporary Cloud Uploads:** Used strictly as a bridge for uploading to social media APIs (e.g., Backblaze B2 temporary links).
3. **Automated Cleanup:** Cloudflare Cron jobs periodically purge temporary files from B2 and clean out stale database records.
