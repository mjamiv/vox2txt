# Agent Builder UX Simplification - Implementation Plan

**Version:** 1.0
**Created:** 2026-01-23
**Status:** Ready for Implementation
**Related:** [UX-REVIEW-AGENT-BUILDER.md](./UX-REVIEW-AGENT-BUILDER.md)

---

## Overview

This document provides a detailed implementation plan for simplifying the Agent Builder UX. The plan is organized into three phases, with each phase containing discrete tasks that can be implemented and tested independently.

### Goals
- Reduce cognitive load for users
- Remove non-functional or developer-only features
- Consolidate redundant UI elements
- Improve mobile usability
- Maintain all core functionality

### Success Metrics
| Metric | Current | Target |
|--------|---------|--------|
| Input tabs | 7 | 4 |
| Results nav items | 7 | 0 (removed) |
| KPI cards | 6 | 3 |
| User decisions before analysis | 3+ | 1 |
| CSS file size | ~70KB | <50KB |

---

## Phase 1: Quick Wins

**Timeline:** 1-2 days
**Risk:** Low
**Dependencies:** None

### Task 1.1: Remove Wearable Tab

**Description:** Remove the non-functional "Wearable" tab that displays "Coming Soon"

**Files to modify:**
- `index.html`
- `css/styles.css`
- `js/app.js`

**Changes:**

```html
<!-- index.html: DELETE these lines (111-115) -->
<button class="tab-btn" data-tab="wearable" id="wearable-tab-btn">
    <span class="tab-icon">⌚</span>
    Wearable
    <span class="coming-soon-badge">Coming Soon</span>
</button>

<!-- index.html: DELETE wearable tab pane (205-212) -->
<div id="wearable-tab" class="tab-pane">
    <div class="wearable-coming-soon">
        ...
    </div>
</div>

<!-- index.html: DELETE wearable modal (732-762) -->
<div id="wearable-modal" class="modal-overlay hidden">
    ...
</div>
```

```css
/* css/styles.css: DELETE these rules */
.coming-soon-badge { ... }
@keyframes badge-pulse { ... }
.wearable-coming-soon { ... }
.wearable-icon { ... }
.wearable-status { ... }
.wearable-desc { ... }
.wearable-modal-container { ... }
.wearable-modal-content { ... }
.wearable-modal-icon { ... }
.wearable-modal-desc { ... }
.wearable-features-list { ... }
.wearable-modal-note { ... }
```

```javascript
// js/app.js: DELETE initWearableModal function and its call
// DELETE: function initWearableModal() { ... }
// DELETE: initWearableModal(); from setupEventListeners()
```

**Acceptance criteria:**
- [ ] Wearable tab no longer visible
- [ ] No JavaScript errors in console
- [ ] Other tabs still function correctly
- [ ] Modal no longer exists in DOM

---

### Task 1.2: Remove Memory Debug Panel

**Description:** Remove the developer-facing Memory Debug Panel from production UI

**Files to modify:**
- `index.html`
- `css/styles.css`

**Changes:**

```html
<!-- index.html: DELETE lines 396-405 -->
<details class="result-card" id="memory-debug-section">
    <summary class="card-header card-header-collapsible">
        <span class="card-icon">🧠</span>
        <h3>Memory Debug Panel</h3>
        <span class="collapse-toggle">▼</span>
    </summary>
    <div class="card-content" id="result-memory-debug">
        <p class="muted">Enable memory debug in the orchestrator to view state, retrieval, and token breakdowns.</p>
    </div>
</details>
```

**Acceptance criteria:**
- [ ] Memory Debug Panel not visible in results
- [ ] No references to memory-debug in rendered HTML
- [ ] Results grid layout adjusts properly

---

### Task 1.3: Remove Pulsing Animations

**Description:** Remove distracting pulsing animations from help button and badges

**Files to modify:**
- `css/styles.css`

**Changes:**

```css
/* css/styles.css: MODIFY help button - remove animation */
.help-btn {
    /* ... keep existing styles ... */
    /* DELETE: animation: helpPulse 3s ease-in-out infinite; */
    box-shadow: 0 4px 15px rgba(212, 168, 83, 0.3); /* static shadow */
}

/* DELETE these keyframes entirely */
@keyframes helpPulse { ... }
@keyframes badge-pulse { ... }
```

**Acceptance criteria:**
- [ ] Help button no longer pulses
- [ ] Help button still has visible styling
- [ ] No animation-related CSS warnings

---

### Task 1.4: Remove Animated Gradient Background

**Description:** Replace animated gradient background with solid color for cleaner look

**Files to modify:**
- `css/styles.css`
- `index.html` (optional cleanup)

**Changes:**

```css
/* css/styles.css: SIMPLIFY gradient-bg */
.gradient-bg {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(180deg, #0a0e17 0%, #0d1220 100%);
    pointer-events: none;
    z-index: -1;
}
```

**Alternative:** Remove `.gradient-bg` entirely and apply background to body:

```css
body {
    background: linear-gradient(180deg, #0a0e17 0%, #0d1220 100%);
    /* or simply: background-color: #0a0e17; */
}
```

**Acceptance criteria:**
- [ ] Background is static (no animation)
- [ ] Visual appearance is clean and professional
- [ ] No layout shifts

---

### Task 1.5: Auto-Select Chat Mode

**Description:** Remove Direct/RLM toggle; always use Direct mode for Agent Builder

**Files to modify:**
- `index.html`
- `css/styles.css`
- `js/app.js`

**Changes:**

```html
<!-- index.html: DELETE chat mode toggle (417-425) -->
<div class="chat-mode-toggle">
    <span class="mode-label mode-active" id="mode-direct-label">Direct</span>
    <label class="toggle-switch">
        <input type="checkbox" id="chat-mode-toggle">
        <span class="toggle-slider"></span>
    </label>
    <span class="mode-label" id="mode-rlm-label">RLM</span>
</div>

<!-- index.html: DELETE RLM warning (433-437) -->
<div id="rlm-warning" class="rlm-warning hidden">
    ...
</div>
```

```javascript
// js/app.js: SIMPLIFY state
const state = {
    // ...
    chatMode: 'direct', // Always direct, no longer changeable
    // ...
};

// js/app.js: DELETE from elements object
// chatModeToggle: document.getElementById('chat-mode-toggle'),
// modeDirectLabel: document.getElementById('mode-direct-label'),
// modeRlmLabel: document.getElementById('mode-rlm-label'),

// js/app.js: DELETE event listener for chat mode toggle
// DELETE: if (elements.chatModeToggle) { ... }

// js/app.js: DELETE or simplify updateChatModeUI function
```

```css
/* css/styles.css: DELETE these rules */
.chat-mode-toggle { ... }
.chat-mode-toggle .mode-label { ... }
.chat-mode-toggle .mode-label.mode-active { ... }
.chat-mode-toggle .toggle-switch { ... }
.chat-mode-toggle .toggle-slider { ... }
.chat-mode-toggle .toggle-slider:before { ... }
/* etc. */

.rlm-warning { ... }
```

**Acceptance criteria:**
- [ ] No toggle visible in chat section
- [ ] Chat always uses Direct mode
- [ ] No RLM warning message
- [ ] Chat functionality works correctly

---

### Task 1.6: Simplify Voice Controls

**Description:** Remove Real-time voice mode, keep only Push-to-Talk

**Files to modify:**
- `index.html`
- `css/styles.css`
- `js/app.js`

**Changes:**

```html
<!-- index.html: DELETE voice mode selector (479-487) -->
<div class="voice-mode-selector">
    <button class="voice-mode-btn active" data-mode="push-to-talk">...</button>
    <button class="voice-mode-btn" data-mode="realtime">...</button>
</div>

<!-- index.html: DELETE realtime panel (490-516) -->
<div id="realtime-panel" class="realtime-panel hidden">
    ...
</div>
```

```javascript
// js/app.js: DELETE from state
// voiceMode: 'push-to-talk',  // No longer needed, always push-to-talk
// realtimeActive: false,
// realtimeSessionCost: 0

// js/app.js: DELETE from elements
// voiceModeBtns, realtimePanel, startRealtimeBtn, stopRealtimeBtn,
// realtimeStatus, realtimeStatusText, realtimeCost

// js/app.js: DELETE event listeners for voice mode and realtime
// DELETE: elements.voiceModeBtns.forEach(...)
// DELETE: if (elements.startRealtimeBtn) {...}
// DELETE: if (elements.stopRealtimeBtn) {...}

// js/app.js: DELETE realtime functions
// DELETE: startRealtimeConversation()
// DELETE: stopRealtimeConversation()
// DELETE: handleRealtimeMessage()
// DELETE: playRealtimeAudioChunk()
// DELETE: updateVoiceModeUI()
```

```css
/* css/styles.css: DELETE all .realtime-* and .voice-mode-* rules */
.voice-mode-selector { ... }
.voice-mode-btn { ... }
.realtime-panel { ... }
.realtime-warning { ... }
.realtime-controls { ... }
.realtime-status { ... }
/* etc. */
```

**Acceptance criteria:**
- [ ] No voice mode selector visible
- [ ] Push-to-talk button still works
- [ ] No realtime panel or cost warnings
- [ ] Voice recording status still shows when recording

---

### Phase 1 Completion Checklist

- [ ] Task 1.1: Wearable tab removed
- [ ] Task 1.2: Memory Debug Panel removed
- [ ] Task 1.3: Pulsing animations removed
- [ ] Task 1.4: Animated background removed
- [ ] Task 1.5: Chat mode toggle removed
- [ ] Task 1.6: Realtime voice mode removed
- [ ] All existing functionality still works
- [ ] No console errors
- [ ] Mobile testing passed

---

## Phase 2: Consolidation

**Timeline:** 3-5 days
**Risk:** Medium
**Dependencies:** Phase 1 complete

### Task 2.1: Unified Upload Zone

**Description:** Replace 4 separate upload tabs (Audio, PDF, Image, Video) with single smart upload zone

**Files to modify:**
- `index.html`
- `css/styles.css`
- `js/app.js`

**New HTML structure:**

```html
<div class="input-tabs">
    <button class="tab-btn active" data-tab="upload">
        <span class="tab-icon">📁</span>
        Upload
    </button>
    <button class="tab-btn" data-tab="text">
        <span class="tab-icon">📝</span>
        Text
    </button>
    <button class="tab-btn" data-tab="url">
        <span class="tab-icon">🔗</span>
        URL
    </button>
    <button class="tab-btn" data-tab="import">
        <span class="tab-icon">📥</span>
        Import Agent
    </button>
</div>

<div class="tab-content">
    <div id="upload-tab" class="tab-pane active">
        <input type="file" id="file-upload"
               accept=".mp3,.wav,.m4a,.ogg,.flac,.mp4,.webm,.mpeg,.pdf,.jpg,.jpeg,.png,.gif,.webp,audio/*,video/*,image/*,application/pdf"
               hidden>
        <label for="file-upload" class="upload-zone" id="unified-drop-zone">
            <div class="upload-icon">📁</div>
            <p>Drag & drop your file here</p>
            <p class="hint">or click to browse</p>
            <p class="file-types">Audio, Video, PDF, or Image</p>
        </label>
        <div id="file-info" class="file-info hidden">
            <span class="file-icon" id="file-type-icon">📄</span>
            <span class="file-name" id="selected-file-name"></span>
            <span class="file-type-badge" id="file-type-badge">PDF</span>
            <button type="button" class="remove-file" id="remove-file-btn">✕</button>
        </div>
        <!-- Image preview (shown only for images) -->
        <div id="image-preview" class="image-preview hidden">
            <img id="image-preview-img" alt="Image preview" />
        </div>
    </div>

    <!-- Text tab remains the same -->
    <div id="text-tab" class="tab-pane">
        <textarea id="text-input" placeholder="Paste your meeting transcript or notes here..."></textarea>
    </div>

    <!-- URL tab remains the same -->
    <div id="url-tab" class="tab-pane">
        <!-- ... existing URL input ... -->
    </div>

    <!-- New Import tab (moved from bottom) -->
    <div id="import-tab" class="tab-pane">
        <input type="file" id="agent-file" accept=".md,text/markdown" hidden>
        <label for="agent-file" class="upload-zone" id="agent-drop-zone">
            <div class="upload-icon">🤖</div>
            <p>Import a previously exported agent</p>
            <p class="hint">Drag & drop or click to browse</p>
            <p class="file-types">Accepts: .md agent files</p>
        </label>
    </div>
</div>
```

**JavaScript changes:**

```javascript
// js/app.js: New unified file handler
function handleUnifiedFileSelect(e) {
    const file = e.target.files[0] || e.dataTransfer?.files[0];
    if (!file) return;

    const extension = file.name.split('.').pop().toLowerCase();
    const mimeType = file.type;

    // Detect file type and set appropriate state
    if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'webm', 'oga'].includes(extension) ||
        mimeType.startsWith('audio/')) {
        state.inputMode = 'audio';
        state.selectedFile = file;
        showFileInfo(file, '🎵', 'Audio');
    }
    else if (['mp4', 'webm', 'mpeg'].includes(extension) ||
             mimeType.startsWith('video/')) {
        state.inputMode = 'video';
        state.selectedVideoFile = file;
        showFileInfo(file, '🎬', 'Video');
    }
    else if (extension === 'pdf' || mimeType === 'application/pdf') {
        state.inputMode = 'pdf';
        state.selectedPdfFile = file;
        showFileInfo(file, '📄', 'PDF');
    }
    else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension) ||
             mimeType.startsWith('image/')) {
        state.inputMode = 'image';
        state.selectedImageFile = file;
        showFileInfo(file, '🖼️', 'Image');
        showImagePreview(file);
    }
    else {
        showError('Unsupported file type. Please upload audio, video, PDF, or image.');
        return;
    }

    updateAnalyzeButton();
}

function showFileInfo(file, icon, typeBadge) {
    elements.fileTypeIcon.textContent = icon;
    elements.selectedFileName.textContent = file.name;
    elements.fileTypeBadge.textContent = typeBadge;
    elements.fileInfo.classList.remove('hidden');
    elements.unifiedDropZone.classList.add('hidden');
}

function clearSelectedFile() {
    state.selectedFile = null;
    state.selectedPdfFile = null;
    state.selectedImageFile = null;
    state.selectedImageBase64 = null;
    state.selectedVideoFile = null;
    state.inputMode = 'upload';

    elements.fileInfo.classList.add('hidden');
    elements.unifiedDropZone.classList.remove('hidden');
    elements.imagePreview.classList.add('hidden');
    elements.fileUpload.value = '';

    updateAnalyzeButton();
}
```

**Acceptance criteria:**
- [ ] Single upload zone accepts all file types
- [ ] File type auto-detected and displayed with badge
- [ ] Image preview shows for image files
- [ ] Analyze button enables for valid files
- [ ] Import Agent moved to dedicated tab
- [ ] Previous 4-tab upload functionality preserved

---

### Task 2.2: Unified Export Menu

**Description:** Replace 5 scattered export buttons with single dropdown menu

**Files to modify:**
- `index.html`
- `css/styles.css`
- `js/app.js`

**New HTML structure:**

```html
<!-- Replace results-actions section -->
<div class="results-actions">
    <div class="export-dropdown-container">
        <button id="export-menu-btn" class="btn-primary">
            <span>⬇️</span> Export
            <span class="dropdown-arrow">▼</span>
        </button>
        <div id="export-dropdown" class="export-dropdown hidden">
            <button class="dropdown-item" id="export-docx">
                <span class="dropdown-icon">📄</span>
                <span class="dropdown-label">Word Document</span>
                <span class="dropdown-hint">.docx</span>
            </button>
            <button class="dropdown-item" id="export-agent">
                <span class="dropdown-icon">🤖</span>
                <span class="dropdown-label">Agent File</span>
                <span class="dropdown-hint">.md</span>
            </button>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item" id="export-audio">
                <span class="dropdown-icon">🎧</span>
                <span class="dropdown-label">Audio Briefing</span>
                <span class="dropdown-hint">Generate</span>
            </button>
            <button class="dropdown-item" id="export-infographic">
                <span class="dropdown-icon">🖼️</span>
                <span class="dropdown-label">Infographic</span>
                <span class="dropdown-hint">Generate</span>
            </button>
            <button class="dropdown-item" id="export-agenda">
                <span class="dropdown-icon">📋</span>
                <span class="dropdown-label">Meeting Agenda</span>
                <span class="dropdown-hint">Generate</span>
            </button>
        </div>
    </div>

    <button id="new-analysis-btn" class="btn-secondary">
        <span>↻</span> New Analysis
    </button>
</div>
```

**CSS for dropdown:**

```css
.export-dropdown-container {
    position: relative;
}

.export-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    min-width: 220px;
    background: var(--bg-card);
    border: 1px solid rgba(212, 168, 83, 0.3);
    border-radius: var(--radius-lg);
    padding: var(--space-sm);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
    z-index: 100;
}

.dropdown-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.9rem;
    cursor: pointer;
    transition: background var(--transition-fast);
}

.dropdown-item:hover {
    background: rgba(212, 168, 83, 0.15);
}

.dropdown-icon {
    font-size: 1.1rem;
    width: 24px;
}

.dropdown-label {
    flex: 1;
    text-align: left;
}

.dropdown-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
}

.dropdown-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: var(--space-xs) 0;
}
```

**JavaScript changes:**

```javascript
// Toggle export dropdown
function toggleExportDropdown() {
    elements.exportDropdown.classList.toggle('hidden');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!elements.exportMenuBtn.contains(e.target) &&
        !elements.exportDropdown.contains(e.target)) {
        elements.exportDropdown.classList.add('hidden');
    }
});

// Export handlers
elements.exportDocx.addEventListener('click', () => {
    downloadDocx();
    elements.exportDropdown.classList.add('hidden');
});

elements.exportAgent.addEventListener('click', () => {
    showAgentNameModal();
    elements.exportDropdown.classList.add('hidden');
});

elements.exportAudio.addEventListener('click', () => {
    generateAudioBriefing();
    elements.exportDropdown.classList.add('hidden');
});

elements.exportInfographic.addEventListener('click', () => {
    generateInfographic();
    elements.exportDropdown.classList.add('hidden');
});

elements.exportAgenda.addEventListener('click', () => {
    generateAgenda();
    elements.exportDropdown.classList.add('hidden');
});
```

**Acceptance criteria:**
- [ ] Single Export button with dropdown
- [ ] All 5 export options accessible
- [ ] Dropdown closes when clicking outside
- [ ] Each option triggers correct action
- [ ] Visual feedback during generation

---

### Task 2.3: Reduce KPI Dashboard

**Description:** Reduce KPI dashboard from 6 cards to 3 essential metrics

**Keep:**
- Sentiment (visual and meaningful)
- Key Points count
- Action Items count

**Remove:**
- Words Analyzed (noise metric)
- Read Time (can be inferred)
- Topics (redundant with content)

**Files to modify:**
- `index.html`
- `css/styles.css`
- `js/app.js`

**New HTML:**

```html
<div class="kpi-dashboard" id="kpi-section">
    <div class="kpi-item kpi-sentiment">
        <span class="kpi-icon">📊</span>
        <div class="kpi-content">
            <span class="kpi-label">Sentiment</span>
            <span class="kpi-value" id="kpi-sentiment">--</span>
        </div>
    </div>
    <div class="kpi-item">
        <span class="kpi-icon">💡</span>
        <div class="kpi-content">
            <span class="kpi-label">Key Points</span>
            <span class="kpi-value" id="kpi-keypoints">--</span>
        </div>
    </div>
    <div class="kpi-item">
        <span class="kpi-icon">✅</span>
        <div class="kpi-content">
            <span class="kpi-label">Action Items</span>
            <span class="kpi-value" id="kpi-actions">--</span>
        </div>
    </div>
</div>
```

**CSS changes:**

```css
.kpi-dashboard {
    display: grid;
    grid-template-columns: repeat(3, 1fr); /* Changed from 6 to 3 */
    gap: var(--space-md);
    /* ... rest remains same ... */
}

@media (max-width: 768px) {
    .kpi-dashboard {
        grid-template-columns: repeat(3, 1fr); /* Keep 3 on tablet */
    }
}

@media (max-width: 480px) {
    .kpi-dashboard {
        grid-template-columns: 1fr; /* Stack on mobile */
    }
}
```

**Acceptance criteria:**
- [ ] Only 3 KPI cards visible
- [ ] Sentiment, Key Points, Actions displayed
- [ ] Grid layout adjusts properly
- [ ] Mobile layout works

---

### Task 2.4: Remove Results Navigation Bar

**Description:** Remove the redundant results navigation bar

**Rationale:** With simplified results layout, navigation bar is unnecessary. Content is scannable without jumping.

**Files to modify:**
- `index.html`
- `css/styles.css`
- `js/app.js`

**Changes:**

```html
<!-- index.html: DELETE results-nav (261-283) -->
<nav class="results-nav" id="results-nav">
    ...
</nav>
```

```javascript
// js/app.js: DELETE from elements
// resultsNav: document.getElementById('results-nav'),

// js/app.js: DELETE setupResultsNav function
// js/app.js: DELETE updateNavOnScroll function
// js/app.js: DELETE updateActiveNavPill function
// js/app.js: DELETE scroll spy event listener
```

```css
/* css/styles.css: DELETE all .results-nav and .nav-pill rules */
.results-nav { ... }
.nav-pill { ... }
.nav-pill:hover { ... }
.nav-pill.active { ... }
/* etc. */
```

**Acceptance criteria:**
- [ ] No navigation bar in results
- [ ] Results still scrollable
- [ ] No JavaScript errors
- [ ] Content sections still visible

---

### Task 2.5: Simplify Audio Briefing Section

**Description:** Move audio briefing generation to export menu, remove dedicated section

**Files to modify:**
- `index.html`
- `js/app.js`

**Changes:**

Remove the full audio briefing section from results. When user selects "Audio Briefing" from export menu:

```javascript
async function generateAudioBriefingFromMenu() {
    // Show simple modal with options
    showAudioOptionsModal();
}

function showAudioOptionsModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-container modal-sm">
            <div class="modal-header">
                <h3>🎧 Audio Briefing</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Voice</label>
                    <select id="modal-voice-select">
                        <option value="nova" selected>Nova (Female)</option>
                        <option value="alloy">Alloy (Neutral)</option>
                        <option value="echo">Echo (Male)</option>
                        <option value="onyx">Onyx (Deep Male)</option>
                        <option value="shimmer">Shimmer (Soft Female)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Style (optional)</label>
                    <input type="text" id="modal-audio-prompt"
                           placeholder="e.g., upbeat and motivational">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn-primary" onclick="generateAudioFromModal(this)">Generate</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}
```

**Acceptance criteria:**
- [ ] Audio briefing section removed from main results
- [ ] Export menu "Audio Briefing" opens options modal
- [ ] Audio generates and downloads/plays correctly
- [ ] Modal closes after generation starts

---

### Task 2.6: Simplify Infographic Section

**Description:** Move infographic generation to export menu, remove presets

**Files to modify:**
- `index.html`
- `js/app.js`

**Changes:**

Remove infographic section and presets. Use "Executive" style as default:

```javascript
async function generateInfographicFromMenu() {
    // Use default executive style
    const preset = INFOGRAPHIC_PRESETS.executive;
    await generateInfographicWithStyle(preset.style);
}

// Optional: Show simple customization modal
function showInfographicOptionsModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-container modal-sm">
            <div class="modal-header">
                <h3>🖼️ Infographic</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <div class="modal-body">
                <p class="modal-description">Generate a visual summary of your meeting.</p>
                <div class="form-group">
                    <label>Custom style (optional)</label>
                    <input type="text" id="modal-infographic-prompt"
                           placeholder="Leave blank for default executive style">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn-primary" onclick="generateInfographicFromModal(this)">Generate</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}
```

**Acceptance criteria:**
- [ ] Infographic section removed from main results
- [ ] Export menu triggers generation with default style
- [ ] Custom prompt optional via modal
- [ ] Generated image displays in new modal or downloads

---

### Phase 2 Completion Checklist

- [ ] Task 2.1: Unified upload zone implemented
- [ ] Task 2.2: Export dropdown menu working
- [ ] Task 2.3: KPI dashboard reduced to 3 items
- [ ] Task 2.4: Results navigation bar removed
- [ ] Task 2.5: Audio briefing moved to menu
- [ ] Task 2.6: Infographic moved to menu
- [ ] All file types still uploadable
- [ ] All exports still functional
- [ ] Mobile testing passed
- [ ] No regression in core functionality

---

## Phase 3: Redesign

**Timeline:** 5-7 days
**Risk:** Medium-High
**Dependencies:** Phase 2 complete

### Task 3.1: Two-Column Results Layout

**Description:** Implement split layout with Insights panel and Chat panel

**New layout structure:**

```html
<section id="results-section" class="results-section hidden">
    <!-- Summary bar - always visible -->
    <div class="results-summary-bar">
        <div class="summary-text" id="result-summary-brief">
            <!-- Brief summary paragraph -->
        </div>
        <div class="summary-metrics">
            <span class="metric sentiment-positive" id="summary-sentiment">😊 Positive</span>
            <span class="metric">💡 5 Key Points</span>
            <span class="metric">✅ 3 Actions</span>
        </div>
    </div>

    <!-- Two-column layout -->
    <div class="results-columns">
        <!-- Left column: Insights -->
        <div class="results-insights">
            <div class="insights-section">
                <h3>💡 Key Points</h3>
                <ul id="result-keypoints-list">
                    <!-- Key points as list items -->
                </ul>
            </div>
            <div class="insights-section">
                <h3>✅ Action Items</h3>
                <ul id="result-actions-list" class="action-list">
                    <!-- Action items with checkboxes -->
                </ul>
            </div>
        </div>

        <!-- Right column: Chat -->
        <div class="results-chat">
            <div class="chat-container">
                <div class="chat-messages" id="chat-messages">
                    <div class="chat-welcome">
                        <div class="chat-welcome-icon">🤖</div>
                        <div class="chat-welcome-text">
                            <strong>Ask me anything</strong>
                            <p>I have access to your meeting transcript and analysis.</p>
                        </div>
                    </div>
                </div>
                <div class="chat-input-area">
                    <input type="text" id="chat-input" placeholder="Ask a question..." />
                    <button id="voice-input-btn" class="btn-voice" title="Hold to speak">🎤</button>
                    <button id="chat-send-btn" class="btn-chat-send">➤</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Action bar -->
    <div class="results-actions">
        <div class="export-dropdown-container">
            <button id="export-menu-btn" class="btn-primary">⬇️ Export ▼</button>
            <div id="export-dropdown" class="export-dropdown hidden">
                <!-- Export options -->
            </div>
        </div>
        <button id="new-analysis-btn" class="btn-secondary">↻ New Analysis</button>
    </div>
</section>
```

**CSS for two-column layout:**

```css
.results-summary-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-lg);
    padding: var(--space-lg);
    background: var(--bg-card);
    border: 1px solid rgba(212, 168, 83, 0.2);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-lg);
}

.summary-text {
    flex: 1;
    color: var(--text-secondary);
    line-height: 1.6;
}

.summary-metrics {
    display: flex;
    gap: var(--space-md);
    flex-shrink: 0;
}

.summary-metrics .metric {
    padding: var(--space-xs) var(--space-sm);
    background: rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
    white-space: nowrap;
}

.results-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
}

.results-insights {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
}

.insights-section {
    background: var(--bg-card);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
}

.insights-section h3 {
    font-family: var(--font-display);
    font-size: 1.1rem;
    color: var(--accent-primary);
    margin-bottom: var(--space-md);
}

.results-chat {
    background: var(--bg-card);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    min-height: 400px;
}

.results-chat .chat-container {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.results-chat .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-lg);
}

.results-chat .chat-input-area {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding: var(--space-md);
}

/* Mobile: Stack columns */
@media (max-width: 900px) {
    .results-columns {
        grid-template-columns: 1fr;
    }

    .results-chat {
        min-height: 300px;
    }
}

@media (max-width: 600px) {
    .results-summary-bar {
        flex-direction: column;
    }

    .summary-metrics {
        flex-wrap: wrap;
    }
}
```

**Acceptance criteria:**
- [ ] Two-column layout on desktop
- [ ] Single column on mobile (<900px)
- [ ] Chat always visible and functional
- [ ] Key points and actions in left column
- [ ] Summary bar at top with metrics

---

### Task 3.2: Progressive Disclosure Settings

**Description:** Create settings panel for advanced options

**Files to modify:**
- `index.html`
- `css/styles.css`
- `js/app.js`

**New settings panel:**

```html
<!-- Add settings button to header -->
<button id="settings-btn" class="settings-btn" title="Settings">⚙️</button>

<!-- Settings panel (slide-in from right) -->
<div id="settings-panel" class="settings-panel hidden">
    <div class="settings-header">
        <h3>Settings</h3>
        <button class="settings-close" id="settings-close">×</button>
    </div>
    <div class="settings-content">
        <div class="settings-section">
            <h4>API Configuration</h4>
            <div class="setting-item">
                <label for="settings-api-key">OpenAI API Key</label>
                <div class="input-with-btn">
                    <input type="password" id="settings-api-key" placeholder="sk-...">
                    <button id="settings-save-key" class="btn-sm">Save</button>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h4>Voice Options</h4>
            <div class="setting-item">
                <label>
                    <input type="checkbox" id="settings-voice-response" checked>
                    Speak responses aloud
                </label>
            </div>
            <div class="setting-item">
                <label for="settings-voice">Default voice</label>
                <select id="settings-voice">
                    <option value="nova" selected>Nova</option>
                    <option value="alloy">Alloy</option>
                    <option value="echo">Echo</option>
                    <option value="onyx">Onyx</option>
                    <option value="shimmer">Shimmer</option>
                </select>
            </div>
        </div>

        <div class="settings-section">
            <h4>Advanced</h4>
            <div class="setting-item">
                <label>
                    <input type="checkbox" id="settings-show-metrics">
                    Show usage metrics
                </label>
            </div>
            <div class="setting-item">
                <label>
                    <input type="checkbox" id="settings-debug-mode">
                    Debug mode
                </label>
            </div>
        </div>
    </div>
</div>
```

**CSS for settings panel:**

```css
.settings-btn {
    position: fixed;
    top: 20px;
    right: 80px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--bg-card);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--text-secondary);
    font-size: 1.2rem;
    cursor: pointer;
    transition: all var(--transition-fast);
    z-index: 100;
}

.settings-btn:hover {
    color: var(--accent-primary);
    border-color: var(--accent-primary);
}

.settings-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 320px;
    height: 100vh;
    background: var(--bg-secondary);
    border-left: 1px solid rgba(212, 168, 83, 0.2);
    z-index: 1000;
    transform: translateX(100%);
    transition: transform var(--transition-normal);
    overflow-y: auto;
}

.settings-panel.visible {
    transform: translateX(0);
}

.settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-lg);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.settings-header h3 {
    font-family: var(--font-display);
    color: var(--accent-primary);
    margin: 0;
}

.settings-close {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 1.5rem;
    cursor: pointer;
}

.settings-content {
    padding: var(--space-lg);
}

.settings-section {
    margin-bottom: var(--space-xl);
}

.settings-section h4 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: var(--space-md);
}

.setting-item {
    margin-bottom: var(--space-md);
}

.setting-item label {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: 0.9rem;
    color: var(--text-primary);
}

.setting-item input[type="checkbox"] {
    accent-color: var(--accent-primary);
}

.setting-item select,
.setting-item input[type="text"],
.setting-item input[type="password"] {
    width: 100%;
    margin-top: var(--space-xs);
    padding: var(--space-sm);
    background: var(--bg-card);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    color: var(--text-primary);
}
```

**Acceptance criteria:**
- [ ] Settings button visible in header
- [ ] Settings panel slides in from right
- [ ] API key manageable in settings
- [ ] Voice options configurable
- [ ] Debug mode toggle works
- [ ] Settings persist in localStorage

---

### Task 3.3: Mobile Bottom Sheet for Exports

**Description:** Replace dropdown with bottom sheet on mobile devices

**Implementation:**

```javascript
function showExportOptions() {
    if (window.innerWidth <= 600) {
        showExportBottomSheet();
    } else {
        toggleExportDropdown();
    }
}

function showExportBottomSheet() {
    const sheet = document.createElement('div');
    sheet.className = 'bottom-sheet-overlay';
    sheet.innerHTML = `
        <div class="bottom-sheet">
            <div class="bottom-sheet-handle"></div>
            <div class="bottom-sheet-header">
                <h3>Export</h3>
            </div>
            <div class="bottom-sheet-content">
                <button class="sheet-item" data-action="docx">
                    <span class="sheet-icon">📄</span>
                    <span class="sheet-label">Word Document</span>
                </button>
                <button class="sheet-item" data-action="agent">
                    <span class="sheet-icon">🤖</span>
                    <span class="sheet-label">Agent File</span>
                </button>
                <button class="sheet-item" data-action="audio">
                    <span class="sheet-icon">🎧</span>
                    <span class="sheet-label">Audio Briefing</span>
                </button>
                <button class="sheet-item" data-action="infographic">
                    <span class="sheet-icon">🖼️</span>
                    <span class="sheet-label">Infographic</span>
                </button>
                <button class="sheet-item" data-action="agenda">
                    <span class="sheet-icon">📋</span>
                    <span class="sheet-label">Meeting Agenda</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(sheet);

    // Animate in
    requestAnimationFrame(() => {
        sheet.classList.add('visible');
    });

    // Close on overlay click
    sheet.addEventListener('click', (e) => {
        if (e.target === sheet) {
            closeBottomSheet(sheet);
        }
    });

    // Handle actions
    sheet.querySelectorAll('.sheet-item').forEach(item => {
        item.addEventListener('click', () => {
            handleExportAction(item.dataset.action);
            closeBottomSheet(sheet);
        });
    });
}
```

**CSS for bottom sheet:**

```css
.bottom-sheet-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 1000;
    opacity: 0;
    transition: opacity var(--transition-normal);
}

.bottom-sheet-overlay.visible {
    opacity: 1;
}

.bottom-sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--bg-card);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    transform: translateY(100%);
    transition: transform var(--transition-normal);
    max-height: 70vh;
    overflow-y: auto;
}

.bottom-sheet-overlay.visible .bottom-sheet {
    transform: translateY(0);
}

.bottom-sheet-handle {
    width: 40px;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    margin: var(--space-sm) auto var(--space-md);
}

.bottom-sheet-header {
    padding: 0 var(--space-lg) var(--space-md);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.bottom-sheet-header h3 {
    font-family: var(--font-display);
    color: var(--accent-primary);
    margin: 0;
}

.bottom-sheet-content {
    padding: var(--space-md);
}

.sheet-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-md);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 1rem;
    cursor: pointer;
    transition: background var(--transition-fast);
}

.sheet-item:hover,
.sheet-item:active {
    background: rgba(212, 168, 83, 0.1);
}

.sheet-icon {
    font-size: 1.3rem;
    width: 32px;
}

.sheet-label {
    flex: 1;
    text-align: left;
}
```

**Acceptance criteria:**
- [ ] Bottom sheet appears on mobile (<600px)
- [ ] Regular dropdown on desktop
- [ ] Swipe to dismiss works
- [ ] All export options functional
- [ ] Touch targets are 44px minimum

---

### Phase 3 Completion Checklist

- [ ] Task 3.1: Two-column layout implemented
- [ ] Task 3.2: Settings panel created
- [ ] Task 3.3: Mobile bottom sheet working
- [ ] Responsive design tested on all breakpoints
- [ ] All features accessible on mobile
- [ ] Performance acceptable (no jank)
- [ ] Accessibility audit passed (keyboard nav, screen readers)

---

## Testing Plan

### Unit Tests
- File type detection for unified upload
- Export menu item handlers
- Settings persistence

### Integration Tests
- Full upload → analyze → export flow
- Chat functionality with new layout
- Voice input on mobile

### Visual Regression Tests
- Screenshots at key breakpoints (320px, 768px, 1024px, 1440px)
- Compare before/after Phase 1, 2, 3

### User Testing
- 5 users complete "upload and export" task
- Measure time to completion
- Collect qualitative feedback

### Performance Tests
- Lighthouse score before/after
- CSS file size reduction
- JavaScript bundle size

---

## Rollback Plan

Each phase creates a tagged release:
- `v2.0.0-phase1` after Phase 1
- `v2.1.0-phase2` after Phase 2
- `v3.0.0-phase3` after Phase 3

If issues arise:
1. Revert to previous tag
2. Document issue in GitHub issue
3. Create hotfix branch
4. Test fix thoroughly
5. Re-deploy

---

## Appendix: CSS Rules to Delete

After all phases, these CSS rule groups can be removed:

```
Phase 1:
- .coming-soon-badge
- @keyframes badge-pulse
- @keyframes helpPulse
- .wearable-* (all)
- .chat-mode-toggle (all)
- .rlm-warning
- .voice-mode-selector
- .voice-mode-btn
- .realtime-* (all)

Phase 2:
- Individual upload zone styles (merge to single)
- .results-nav (all)
- .nav-pill (all)
- Infographic preset styles
- Separate audio briefing section styles

Phase 3:
- Legacy card layouts (replaced by columns)
- Old mobile-specific overrides (replaced by new responsive)
```

Estimated CSS reduction: **~40%** (from ~70KB to ~42KB)

---

*This implementation plan should be reviewed and adjusted based on team capacity and priorities. Each task is designed to be independently testable and deployable.*
