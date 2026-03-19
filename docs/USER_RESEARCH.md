# BookDock — User Research

**Prepared by:** Alex, Product Manager  
**Date:** 2026-03-20  
**Research Method:** Synthesis of community data, forum analysis, and behavioral patterns from r/datahoarder, r/selfhosted, r/ebooks, and Hacker News  
**Confidence Level:** Medium-High (qualitative, not primary research)

---

## 1. Research Methodology

This research synthesizes qualitative signals from the self-hosted and e-book communities rather than primary user interviews (which should be conducted in a later discovery phase). Primary sources include:

- **r/datahoarder** (800K+ members) — Threads on e-book management, Calibre alternatives, NAS reading workflows
- **r/selfhosted** (350K+ members) — Discussion of self-hosted reading solutions
- **r/ebooks** (280K+ members) — E-book format discussions, DRM frustration
- **Hacker News threads** — "What's your e-book setup?" and similar threads
- **GitHub issue trackers** — Calibre Web, Kouko, Ubooquity feature requests and complaints
- **Synology/QNAP community forums** — Deployment questions, performance concerns

**Note:** BookDock should invest in primary research (user interviews with 5–10 target users) before finalizing the MVP scope. This document is a hypothesis generator, not a validation study.

---

## 2. Who the Users Are

### 2.1 Mental Model: "The Sovereign Reader"

Across all communities, a coherent user archetype emerges that I'll call **The Sovereign Reader**:

> Someone who has deliberately chosen to own their data, books, and media rather than rent access through a subscription service. They have the technical literacy to set up self-hosted infrastructure and the philosophical conviction that ownership matters. They read a mix of technical/professional content and recreational reading.

**Behavioral signals that identify a Sovereign Reader:**
- Uses Calibre to manage their e-book library (often 1,000–10,000+ books)
- Has a NAS or is considering getting one primarily for media/book storage
- Has tried Kindle Unlimited or similar but cancelled due to limited ownership
- Expresses frustration that "e-books are too expensive" (when buying both ebook + audiobook)
- Follows r/datahoarder or r/selfhosted
- Uses or would use: Jellyfin, Home Assistant, AdGuard Home, Paperless-NGX

---

## 3. Core User Needs (Ranked)

### 3.1 Need: "I want my books to be findable"

**What this means:**  
Users have accumulated thousands of books over years or decades. Finding a specific book — or finding a book they vaguely remember — is a genuine pain point. Calibre's search is adequate; Calibre Web's search is slower. No other self-hosted solution offers full-text search.

**Evidence from community research:**
- Top feature requests on Calibre Web GitHub: full-text search improvements
- Common r/datahoarder complaint: "I know I have a book about X but I can't find it"
- Hacker News thread: "How do you search inside your e-books?" → answers are mostly "I don't, I just use Calibre's title/author search"

**Implication for BookDock:**  
Full-text search is a Priority 2 feature, but it should be in the MVP conversation. Without it, BookDock is just "Calibre Web but prettier." With it, BookDock solves a real pain point.

**Design implication:**  
The search UX should feel instant. Results should show not just the book but the passage that matched. Think: "Spotlight for your e-book library."

---

### 3.2 Need: "I want to read without friction"

**What this means:**  
Users want to open a book and start reading. They don't want to configure a reverse proxy, install a font pack, or adjust a dozen settings before they can read chapter one. The setup should be a one-time investment; the reading should be frictionless forever.

**Evidence from community research:**
- "Calibre Web is great but it takes me 5 minutes to set up nginx properly" — common complaint on r/selfhosted
- Users frequently ask "why does the Calibre Web reader not remember my font size preference?"
- Comparison threads consistently praise ReadWise/Kindle for "just working"

**Implication for BookDock:**  
The reading experience is the product. If the reader is slow, ugly, or loses state, nothing else matters. Invest disproportionately in the reader experience.

**Design implication:**  
Default reading settings should be sensible (16px font, dark mode, 1.5 line height). Users who want to customize can, but the out-of-box experience should be immediately comfortable.

---

### 3.3 Need: "I want TTS to actually work"

**What this means:**  
Users are frustrated by the audio tax — paying full price for an audiobook when they already own the ebook. They want a "play" button on any book that reads it aloud at a reasonable quality. They have tried free TTS before (Google Translate, Natural Reader) and found it lacking but are willing to try again if quality is better.

**Evidence from community research:**
- r/datahoarder thread on "audiobook alternatives for self-hosted users" → top answers: coqui-tts, edge-tts, Piper (all self-hosted TTS options gaining traction)
- Many users have experimented with text-to-speech pipelines for their Calibre libraries; most abandoned them due to setup complexity
- ReadWise is frequently praised for TTS quality, suggesting users have high baseline expectations

**Implication for BookDock:**  
TTS is the killer feature that no self-hosted alternative offers. Getting it right — not just functional but pleasant — is the most important thing BookDock can do.

**Design implication:**
- The TTS play/pause button should be visible on every book without clicking into the reader
- Speed control (0.75x–2.0x) is non-negotiable
- Voice selection matters: users have strong preferences about accent, gender, and speaking pace
- TTS position should be saved independently of reading position

---

### 3.4 Need: "I want to read on any device"

**What this means:**  
Users read on multiple devices — desktop at work, laptop at home, phone on commute, tablet on couch. They want to start on one device and continue on another without thinking about it.

**Evidence from community research:**
- "I use Calibre Web but I can't sync reading position to my phone" — top complaint
- OPDS is a workaround but most users don't know it exists or find it too complex
- Mobile e-book reader apps (Moon+ Reader, Marvin, Legado) are popular specifically because of OPDS support

**Implication for BookDock:**  
Cross-device reading position sync is a hard requirement. It is table stakes — if BookDock doesn't have it, users will work around it with Calibre + OPDS apps.

**Design implication:**  
Reading position sync should be automatic. The user should not have to "save" or "sync." Every page turn should be written to the local database immediately.

---

### 3.5 Need: "I don't want to manage my library"

**What this means:**  
Users want to drop books into a folder and have everything else happen automatically — metadata fetched, covers extracted, duplicates detected, format normalized. They do not want to be librarians.

**Evidence from community research:**
- Calibre users love the automatic metadata download feature; it's the #1 reason people adopt Calibre over simpler tools
- r/datahoarder threads on "how I organize my e-books" show massive over-engineering (nested folders, complex naming conventions) because no tool does it well enough

**Implication for BookDock:**  
The library should be "set and forget" after initial configuration. Automatic metadata fetching (via Open Library or Google Books API) is a must for MVP.

**Design implication:**  
Watched folder + auto-import is the ideal flow. No web upload UI required for MVP (but nice to have).

---

## 4. Frustration Themes

Analyzing negative reviews and complaints from competing products reveals consistent frustration patterns:

### 4.1 "The UI is from 2010"

Users are viscerally tired of Calibre Web's interface. Comments include:
- "It looks like a university library database from 1998"
- "I cringe every time I open it"
- "My wife refuses to use it because it looks so bad"

**Implication:** UI quality is a competitive differentiator, not a nice-to-have. BookDock's modern UI is not vanity — it's a real requirement.

---

### 4.2 "It breaks every time I update"

Self-hosted tools that require frequent updates and manual intervention get abandoned. Users cite:
- "I stopped updating Calibre Web because it kept breaking my library"
- "Ubooquity updates require Java reinstalls"

**Implication:** BookDock must use Docker for all deployment. Updates should be `docker-compose pull && docker-compose up -d` — nothing more.

---

### 4.3 "PDF support is terrible"

Nearly every e-book reader platform has poor PDF support. Users want:
- Reflow mode (text reflows to screen size, not letterboxed)
- Annotation (highlighting, sticky notes)
- Page rotation without losing position

**Implication:** PDF support is harder than EPUB. Scope it as Priority 2, but make the basic PDF reader (without reflow) work well in MVP.

---

### 4.4 "I can't share with my family"

Multiple users in r/datahoarder mention wanting to share a family library without family members needing their own Calibre/Web accounts. Calibre Web's user management is clunky.

**Implication:** Multi-user support with simple permission sharing is a Priority 2+ feature worth prioritizing for the "family library" use case.

---

## 5. Underserved User Segments

### 5.1 Chinese / Non-English Readers

The Chinese-language e-book community (Z-Library, Library Genesis, Netease Cloud Reading) is enormous. Chinese NAS users (QNAP, Synology) frequently run Chinese-language ROMs and apps. However:
- Most self-hosted e-book tools have poor Chinese UI support
- Chinese TTS voices are scarce in Web Speech API
- Chinese text rendering (vertical text, different font stacks) is often broken

**BookDock opportunity:** Chinese-language UI (i18n), Chinese TTS voice support, and proper CJK text rendering could capture a large, underserved market.

---

### 5.2 Academic Users

Researchers who read PDFs extensively (as opposed to EPUB) have specific needs:
- Citation management (import from Zotero)
- Note-taking that feeds into their writing workflow
- PDF annotation that survives format migration

No current self-hosted tool serves academics well. BookStack comes closest but destroys PDF formatting during import.

**BookDock opportunity:** An academic reading mode — PDF reflow, margin notes, Zotero integration — could differentiate BookDock in the higher-education space.

---

### 5.3 Language Learners

Users learning languages through reading (Japanese learners reading native-content, Spanish learners, etc.) have specific needs:
- Bilingual dictionary lookup
- Pop-up grammar notes
- Adjustable text with furigana/ruby annotation support
- TTS at slow speeds for pronunciation practice

**BookDock opportunity:** This is a niche but passionate community (r/LanguageLearning has 4M+ members). TTS at 0.5x speed + dictionary pop-up could be a compelling feature.

---

## 6. Synthesis: Design Principles for BookDock

Based on all the above research, the following design principles should guide every decision:

### Principle 1: The Setup is a One-Time Cost

The initial setup should take under 15 minutes. Everything after that is reading. If users spend more than 15 minutes on setup, they'll go back to Kindle.

### Principle 2: Reading Is Sacred

The reader experience gets 60% of the design budget. Everything else is secondary. If reading in BookDock feels worse than Kindle, nothing else matters.

### Principle 3: TTS Is the Hook

TTS is what no competitor offers. Make it work well and make it visible. A prominent "Listen" button on every book, even before opening the reader, signals that BookDock is different.

### Principle 4: Own Nothing, Lose Everything

User data (reading position, highlights, notes, preferences) should be stored locally in SQLite, not in an external database. If the user deletes and reinstalls BookDock, their data should persist in a named volume.

### Principle 5: Respect the Power User

Don't hide complexity behind magic — expose it to users who want it. Advanced settings should be accessible, even if the defaults are simple.

---

## 7. Open Questions for Primary Research

Before the MVP scope is finalized, the following questions need primary research (user interviews):

1. **Library size distribution:** Do most self-hosted e-book users have 200 books or 20,000? This changes how we think about search and database performance.

2. **Format breakdown:** What % of libraries are EPUB vs. PDF vs. MOBI vs. comics? Technical books skew PDF; fiction skews EPUB. This affects format support prioritization.

3. **TTS voice preference:** Do users prefer native-sounding voices (Web Speech API) or character voices (AI-generated)? What's the tolerance for robotic-sounding TTS?

4. **Annotation behavior:** Do users actually annotate, or do they think they will but don't? (Product managers commonly overestimate annotation usage.)

5. **Family vs. solo usage:** Is BookDock primarily a solo tool or a shared family resource? Multi-user support adds significant complexity.

6. **Mobile usage patterns:** How do users split reading time between desktop, tablet, and phone? Does PWA cover mobile needs, or is a native app genuinely required?

---

*This document is a living research artifact. It should be updated after primary user interviews are conducted and after BookDock has beta users providing real behavioral data.*
