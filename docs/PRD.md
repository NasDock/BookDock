# BookDock (书仓) — Product Requirements Document

**Version:** 1.0  
**Last Updated:** 2026-03-20  
**Product Manager:** Alex  
**Audience:** Engineering, Design, Leadership, Stakeholders  

---

## 1. Executive Summary

BookDock is a self-hosted e-book reading platform designed for NAS (Network-Attached Storage) power users who want full ownership of their reading experience — no cloud subscriptions, no data harvesting, no "features" that disappear when the startup shuts down.

The core value proposition: **your books live on your hardware, your reading happens everywhere.**

BookDock transforms any NAS into a personal e-book library with a polished web reader and native TTS (Text-to-Speech) audio reading, bridging the gap between "I own my files" and "I actually read the damn thing."

---

## 2. Problem Statement

### The Pain

NAS users have massive local file libraries. Many of them read — technical books, novels, research papers, language learning materials. But existing solutions fall short in ways that matter:

| Problem | Impact |
|---|---|
| Calibre Web is ugly and dated | If the UI sucks, you don't open the app |
| Proprietary reading platforms (Kindle, Kobo) lock your files | You bought the book but don't own it |
| Cloud reading services spy on your reading habits | Nobody needs an algorithm knowing your reading speed |
| TTS audio books are expensive or unavailable for many books | You've already bought the ebook; why pay again for audio? |
| No seamless multi-device reading | Phone, tablet, work laptop, home server — sync matters |
| NAS users are technical but not *that* technical | Docker Compose is fine; configuring Calibre with nginx reverse proxy is not |

### The User Quote

> "I have 8TB of e-books I've collected over 15 years. I love that I own them. But honestly? I read more on Kindle Unlimited because it's just easier. I hate that."  
> — Actual person in a r/datahoarder thread about e-book management

---

## 3. Product Vision

BookDock is to your e-book collection what Jellyfin is to your media library: **a beautiful, self-hosted alternative that doesn't make you feel like you're settling.**

Three pillars:

1. **Sovereignty** — Your books never leave your NAS. No accounts required.
2. **Quality** — The reading experience should feel as good as a commercial app, not a hobbyist project.
3. **Intelligence** — TTS that actually works, smart library management, and zero-friction reading.

---

## 4. Target User Personas

### Persona 1: "The Archivist" — Chen Wei, 42, IT Manager

**Background:** Works in enterprise IT, runs a Synology DS1621+ at home. Has ~15,000 e-books accumulated over 20 years. Primarily reads technical books (programming, management, DevOps) and some Chinese-language fiction.

**Goals:**
- Consolidate all books in one searchable place
- Access library from desktop (Windows), phone (Android), and tablet (iPad)
- Listen to technical books during commute via TTS

**Pain Points:**
- Calibre Web is ugly; doesn't trust it with his library metadata
- Kindle app can't see his custom e-book files
- TTS on phone sounds robotic and loses its place

**Tech Comfort:** High. Runs Home Assistant, Jellyfin, and AdGuard Home on the same NAS. Willing to run Docker and edit YAML.

**Quote:** "I want my books accessible like Spotify, but I want to own them like I own my music files."

---

### Persona 2: "The Commuter" — Lisa Park, 31, Urban Professional

**Background:** Consulting analyst, reads 30–60 minutes/day on the train. Has a QNAP TS-473A at home shared with her husband. Reads business books, self-improvement, and Korean web novels.

**Goals:**
- Sync reading progress across devices seamlessly
- Listen to books via TTS during commute without buying separate audiobooks
- Share family library without overlapping purchases

**Pain Points:**
- Buying both ebook AND audiobook is financially painful
- Current TTS solutions require too much setup per book
- Reading on phone is okay but she'd prefer larger screen at home

**Tech Comfort:** Medium. Can follow a setup guide but doesn't want to maintain anything ongoing.

**Quote:** "I just want to read. I don't want to manage a server."

---

### Persona 3: "The Academic" — Dr. Marcus Schmidt, 48, University Researcher

**Background:** Humanities professor at a European university. Reads PDFs extensively (academic papers, dissertations). Maintains a Zotero library of ~50,000 items on a custom-built NAS (unRAID). Reads on Linux desktop and iPad.

**Goals:**
- Annotation and highlighting that persists across sessions
- Full-text search across entire library
- Clean PDF rendering without format degradation

**Pain Points:**
- Most e-book platforms handle PDFs poorly (wrong aspect ratio, bad reflow)
- Cloud services restrict file sizes
- TTS for academic English (complex vocabulary, multi-language citations) is especially bad

**Tech Comfort:** High, but time-constrained. Values reliability over features.

**Quote:** "I need a tool that gets out of my way and just works when I open it at 10pm to prep for a lecture."

---

### Persona 4: "The Hobbyist" — Jin Tanaka, 26, Software Engineer

**Background:** Works at a startup, runs a Raspberry Pi NAS at home (just for fun). Reads programming tutorials, sci-fi, and manga (in CBZ/CBR format). Experiments with self-hosted tools.

**Goals:**
- Easy deployment via Docker Compose
- Open-source stack they can fork and customize
- Support for manga/comics alongside regular e-books

**Pain Points:**
- Many solutions are ebook-only, no manga support
- Community projects die or become unmaintained
- Wants to contribute but finds most codebases impenetrable

**Tech Comfort:** High. Writes TypeScript, contributes to open source occasionally.

**Quote:** "I'll spend 10 hours setting something up if it's 20 hours of work to maintain afterward."

---

## 5. User Stories

### Library Management

```
AS A Archivist
I WANT TO import e-books by dropping them into a watched folder
SO THAT I don't have to use a clunky web interface to add books

AS A Archivist  
I WANT TO automatically extract metadata (title, author, cover, ISBN)
SO THAT I don't have to manually tag every book

AS A Archivist
I WANT TO search my library by title, author, or full-text content
SO THAT I can find a specific passage even if I forgot the book title

AS A Academic
I WANT TO import directly from Calibre's database
SO THAT I can migrate without losing my existing metadata and collections
```

### Reading Experience

```
AS A Commuter
I WANT TO read in a clean, distraction-free interface
SO THAT I can focus on content

AS A Academic
I WANT TO read PDFs in a reflow-enabled viewer
SO THAT I don't get eye strain reading small text on my iPad

AS A Archivist
I WANT TO customize font, font size, line height, and theme
SO THAT I can read comfortably in any lighting condition

AS A Hobbyist
I WANT TO read manga in left-to-right or right-to-left mode
SO THAT I don't have to convert CBZ files between Japanese and Western reading orders
```

### TTS Audio Reading

```
AS A Commuter
I WANT TO press play on any book and have it read aloud
SO THAT I don't have to buy a separate audiobook

AS A Archivist
I WANT TO adjust reading speed (0.75x – 2.0x) and voice selection
SO THAT I can listen comfortably during my 45-minute commute

AS A Academic
I WANT TO TTS to handle technical terminology and proper nouns
SO THAT I don't have to re-listen to sections because "API" was read as "ah-pee-eye"

AS A Any User
I WANT TO continue audio from where I left off in text reading (and vice versa)
SO THAT switching between reading and listening is seamless
```

### Multi-Device & Sync

```
AS A Commuter
I WANT TO open a book on my phone and have my place saved
SO THAT I can continue exactly where I left off on my tablet

AS A The Archivist
I WANT TO access my library from any browser without installing anything
SO THAT I can read on a work computer that I can't install apps on

AS A Academic
I WANT TO sync annotations and highlights to a local JSON file
SO THAT I own my data and can back it up with the rest of my NAS
```

### Administration

```
AS A Archivist
I WANT TO set up BookDock via Docker Compose in under 15 minutes
SO THAT it feels accessible even for non-DevOps users

AS A The Hobbyist
I WANT TO self-host with no external dependencies
SO THAT the app works completely offline and respects my privacy

AS A The Academic
I WANT TO grant access to specific library folders to collaborators
SO THAT I can share research materials with my PhD students
```

---

## 6. Feature Requirements

### Priority 1 (MVP)

| Feature | Description |
|---|---|
| E-book format support | EPUB, PDF, MOBI, AZW3, CBR/CBZ (manga) |
| Web-based reader | In-browser reading with pagination, no Flash |
| Library browser | Grid/list view, sorting, basic filtering |
| Metadata extraction | Auto-fetch cover, title, author via Open Library / Google Books API |
| TTS engine | Browser Web Speech API + configurable voice selection |
| Basic reading settings | Font size, theme (light/dark/sepia), line spacing |
| Docker Compose deployment | Single `docker-compose.yml`, no external database required |
| Progress sync | Reading position saved per-user in local SQLite |
| Authentication | Local username/password, optional LDAP/SSO integration |

### Priority 2 (Post-MVP)

| Feature | Description |
|---|---|
| Full-text search | Index library with FlexSearch or Typesense |
| TTS bookmarking | Remember TTS position independently of text position |
| Offline reading (PWA) | Service worker caching for offline access |
| Annotation system | Highlights and notes stored locally, exportable to JSON/Markdown |
| Calibre migration tool | Import from Calibre library database directly |
| Multi-language UI | i18n with RTL support |
| Advanced PDF support | Reflow mode, annotation, page rotation |
| Collection/shelf management | User-created shelves, "Want to Read" / "Finished" |

### Priority 3 (Future)

| Feature | Description |
|---|---|
| Collaborative libraries | Share shelves with other BookDock users |
| Podcast-ification | Export TTS audio as MP3 chapters for use in podcast apps |
| AI-powered metadata | Auto-categorization, summary generation |
| Mobile app | React Native or Tauri-based native reader |
| Readwise integration | Sync highlights to Readwise |
| OPDS feed | Serve books to third-party e-reader apps (Moon+ Reader, Marvin) |

---

## 7. Technical Architecture (Overview)

```
┌─────────────────────────────────────────────────────────┐
│                    BookDock Stack                        │
├─────────────────────────────────────────────────────────┤
│  Frontend:  React + Vite (web reader UI)               │
│  Backend:   Node.js / Express (API server)              │
│  Database:  SQLite (library metadata, user data)       │
│  File Store: Local filesystem on NAS                    │
│  TTS:       Web Speech API (client) + coqui-tts (srv)  │
│  Search:    FlexSearch (client-side full-text)          │
│  Deployment: Docker + Docker Compose                   │
└─────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**
- SQLite on the NAS (not external DB) — keep it self-contained
- Client-side TTS using Web Speech API for MVP, coqui-tts for higher quality post-MVP
- No Electron — web-first approach keeps deployment simple
- File storage is flat (one folder per library) — don't try to outsmart Calibre's database

---

## 8. Non-Functional Requirements

### Performance
- Library of 10,000 books should load in < 2 seconds on gigabit LAN
- TTS should start playing within 500ms of pressing play
- PDF pages should render within 200ms

### Security
- All data stays on the NAS — no outbound network calls except metadata APIs
- User passwords hashed with bcrypt
- Optional: HTTPS via reverse proxy (Caddy, nginx)

### Privacy
- Zero telemetry, zero analytics, zero "anonymous usage stats"
- No accounts on external services required
- Reading history never leaves the device

### Compatibility
- Modern browsers: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- Responsive: works on mobile phones (320px) through desktop (4K)

---

## 9. Success Metrics

We will measure success by:

1. **Setup completion rate** — % of users who successfully complete initial Docker setup (target: >80%)
2. **30-day retention** — % of users who open BookDock 30 days after setup (target: >60%)
3. **TTS adoption** — % of reading sessions that include TTS (target: >30%)
4. **Library size median** — Median number of books in user libraries (benchmark: Calibre average is ~2,000 books)
5. **GitHub stars** — Not a product metric, but an indicator of developer community health

---

## 10. Out of Scope (Deliberately)

- **Native mobile apps in v1** — Web app is accessible via mobile browser; PWA is the bridge
- **Calibre server replacement** — BookDock is not trying to be Calibre. We import from Calibre but don't replicate its complexity
- **E-book conversion/processing** — Use Calibre for that. BookDock focuses on reading.
- **Social features** — No book clubs, no "what friends are reading", no recommendations engine
- **Cloud backup** — Your NAS is your backup. We don't add a cloud layer.

---

## 11. Open Questions

1. **DRM handling:** Should BookDock attempt to decrypt ACSM/Adobe DRM files? (Answer: No, we are not a piracy tool. We support DRM-free formats only.)

2. **TTS quality:** Web Speech API is free but mediocre. Coqui-tts requires significant CPU. When is the right time to invest in server-side TTS?

3. **Monetization:** This is an open-source project. Is there a sustainable path to paid support or hosted version, or is this purely a passion project?

4. **Team size:** Who is the target contributor? Solo developer? Small team? We should optimize the codebase's accessibility accordingly.

---

*This PRD is a living document. It will be updated as we learn more from user research and prototype testing.*
