# Test Bot Implementation Plan

> **Project:** northstar.LM Agent Orchestrator
> **Feature:** Test Prompting System
> **Created:** 2026-01-15
> **Status:** In Progress

---

## Overview

This document outlines the implementation plan for adding a "Run Test Prompting" feature to the Agent Orchestrator. The feature allows users to test meeting agents with pre-loaded or custom prompts, view real-time execution progress, and export analytics as an HTML report.

---

## Feature Requirements

| Requirement | Description |
|-------------|-------------|
| **Test Button** | "Run Test Prompting" button in orchestrator UI |
| **Prompt Selection** | Select up to 10 prompts from pre-loaded list |
| **Prompt Editing** | Edit any selected prompt inline |
| **Custom Prompts** | Add user-defined prompts |
| **RLM Settings** | Toggle reasoning mode: On / Off / Auto |
| **Test Runner** | Progress bar + streaming status feedback |
| **Sequential Execution** | Run prompts one-at-a-time, wait for response |
| **Analytics Dashboard** | Display metrics after test completion |
| **HTML Export** | Generate downloadable HTML report |

---

## Architecture

### Files to Modify

| File | Purpose |
|------|---------|
| `orchestrator.html` | Add UI components (modal, runner, dashboard) |
| `js/orchestrator.js` | Add test logic, state management, API calls |
| `css/styles.css` | Add styles for new components |

### New State Object

```javascript
const testState = {
    selectedPrompts: [],      // Array of selected prompt objects
    customPrompts: [],        // User-added prompts
    rlmMode: 'auto',          // 'on' | 'off' | 'auto'
    isRunning: false,         // Test execution state
    currentPromptIndex: 0,    // Current prompt being executed
    results: [],              // Array of test results
    startTime: null,          // Test start timestamp
    aborted: false            // User cancelled flag
};
```

---

## Implementation Phases

The implementation is divided into 5 independent phases. Each phase can be completed in a single session and builds upon previous phases.

---

## Phase 1: UI Foundation (HTML Structure)

**Estimated Scope:** ~150 lines HTML
**Dependencies:** None
**Files:** `orchestrator.html`

### Tasks

1. **Add Test Prompting Button**
   - Location: After "Generate Cross-Meeting Insights" button
   - Initially disabled until agents are loaded

2. **Add Prompt Selection Modal**
   - Modal container with header and close button
   - RLM toggle group (Off / Auto / On)
   - Prompts list container with selection count
   - Custom prompt input field
   - "Deploy Test Agent" button

3. **Add Test Runner Screen**
   - Modal with "Testing Agent Running" header
   - Progress bar container
   - Progress label (X / Y prompts)
   - Status stream container (scrollable)
   - Cancel button

4. **Add Analytics Dashboard Section**
   - Section header with export button
   - Summary cards grid (4 cards)
   - Results list container

### HTML to Add (in orchestrator.html)

#### 1.1 Test Button (after line 93, inside `.generate-insights-wrapper`)

```html
<button id="run-test-prompting-btn" class="btn-secondary btn-large" disabled title="Load agents first">
    <span class="btn-text">🧪 Run Test Prompting</span>
</button>
```

#### 1.2 Prompt Selection Modal (before closing `</main>` tag)

```html
<!-- Test Prompting Modal -->
<div id="test-prompting-modal" class="modal hidden">
    <div class="modal-overlay"></div>
    <div class="modal-content test-prompting-modal-content">
        <div class="modal-header">
            <h2>🧪 Configure Test Prompts</h2>
            <button class="modal-close-btn" id="close-test-modal">✕</button>
        </div>

        <div class="modal-body">
            <!-- RLM Settings -->
            <div class="rlm-settings">
                <label class="rlm-label">Reasoning Language Model:</label>
                <div class="rlm-toggle-group">
                    <button class="rlm-btn" data-mode="off">Off</button>
                    <button class="rlm-btn active" data-mode="auto">Auto</button>
                    <button class="rlm-btn" data-mode="on">On</button>
                </div>
                <p class="rlm-hint">Auto enables reasoning for complex analytical prompts</p>
            </div>

            <!-- Prompt Selection -->
            <div class="prompt-selection">
                <div class="prompt-selection-header">
                    <span>Select prompts to test (max 10):</span>
                    <span class="prompts-selected-count" id="prompts-selected-count">0/10 selected</span>
                </div>
                <div id="prompts-list" class="prompts-list">
                    <!-- Populated dynamically -->
                </div>
            </div>

            <!-- Custom Prompt Input -->
            <div class="custom-prompt-section">
                <label>Add Custom Prompt:</label>
                <div class="custom-prompt-input-group">
                    <input type="text" id="custom-prompt-input" placeholder="Enter a custom test prompt..." maxlength="500">
                    <button id="add-custom-prompt-btn" class="btn-secondary">+ Add</button>
                </div>
            </div>
        </div>

        <div class="modal-footer">
            <button id="deploy-test-agent-btn" class="btn-primary btn-large" disabled>
                🚀 Deploy Test Agent
            </button>
        </div>
    </div>
</div>

<!-- Test Runner Screen -->
<div id="test-runner-screen" class="modal hidden">
    <div class="modal-overlay"></div>
    <div class="modal-content test-runner-content">
        <div class="test-runner-header">
            <div class="test-runner-icon">🤖</div>
            <h2>Testing Agent Running</h2>
            <p id="test-progress-text">Initializing test sequence...</p>
        </div>

        <div class="test-progress-section">
            <div class="test-progress-container">
                <div class="test-progress-bar" id="test-progress-bar"></div>
            </div>
            <span class="test-progress-label" id="test-progress-label">0 / 0 prompts</span>
        </div>

        <div class="test-status-section">
            <label>Status Log:</label>
            <div class="test-status-stream" id="test-status-stream">
                <!-- Status messages streamed here -->
            </div>
        </div>

        <div class="test-runner-footer">
            <button id="cancel-test-btn" class="btn-secondary">Cancel Test</button>
        </div>
    </div>
</div>
```

#### 1.3 Analytics Dashboard (before About Section)

```html
<!-- Test Analytics Dashboard -->
<section id="test-analytics-section" class="test-analytics-section hidden">
    <div class="section-header">
        <h2><span>📊</span> Test Analytics Dashboard</h2>
        <div class="analytics-actions">
            <button id="rerun-test-btn" class="btn-secondary">🔄 Run Again</button>
            <button id="export-test-html-btn" class="btn-primary">📄 Export HTML Report</button>
        </div>
    </div>

    <!-- Summary Cards -->
    <div class="analytics-summary-grid">
        <div class="analytics-card">
            <span class="analytics-icon">✅</span>
            <span class="analytics-value" id="analytics-prompts-run">0</span>
            <span class="analytics-label">Prompts Run</span>
        </div>
        <div class="analytics-card">
            <span class="analytics-icon">⏱️</span>
            <span class="analytics-value" id="analytics-total-time">0s</span>
            <span class="analytics-label">Total Time</span>
        </div>
        <div class="analytics-card">
            <span class="analytics-icon">🔢</span>
            <span class="analytics-value" id="analytics-total-tokens">0</span>
            <span class="analytics-label">Total Tokens</span>
        </div>
        <div class="analytics-card">
            <span class="analytics-icon">💰</span>
            <span class="analytics-value" id="analytics-total-cost">$0.00</span>
            <span class="analytics-label">Est. Cost</span>
        </div>
    </div>

    <!-- Context Window Gauge -->
    <div class="context-window-gauge">
        <div class="gauge-header">
            <span>Context Window Usage</span>
            <span id="context-usage-text">0 / 128,000 tokens</span>
        </div>
        <div class="gauge-container">
            <div class="gauge-fill" id="context-gauge-fill"></div>
        </div>
    </div>

    <!-- Individual Results -->
    <div class="analytics-results-section">
        <h3>Detailed Results</h3>
        <div id="analytics-results-list" class="analytics-results-list">
            <!-- Results populated dynamically -->
        </div>
    </div>
</section>
```

### Completion Criteria

- [ ] Test button appears (disabled) in orchestrator
- [ ] Modal opens/closes with X button or overlay click
- [ ] Test runner screen structure in place
- [ ] Analytics section structure in place
- [ ] No JavaScript errors in console

---

## Phase 2: CSS Styling

**Estimated Scope:** ~150 lines CSS
**Dependencies:** Phase 1
**Files:** `css/styles.css`

### Tasks

1. **Modal Base Styles**
   - Overlay with backdrop blur
   - Centered modal content
   - Header/body/footer layout

2. **RLM Toggle Styles**
   - Button group with active state
   - Gold highlight for selected

3. **Prompts List Styles**
   - Scrollable container
   - Checkbox + text + edit button layout
   - Selected state highlighting
   - Editable input styling

4. **Test Runner Styles**
   - Progress bar with gradient animation
   - Status stream monospace font
   - Animated dots for "running" state

5. **Analytics Dashboard Styles**
   - 4-column summary grid
   - Context gauge with gradient fill
   - Result cards with success/error states

### CSS to Add (in styles.css)

```css
/* ============================================
   TEST PROMPTING STYLES
   ============================================ */

/* Modal Base */
.modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal.hidden {
    display: none;
}

.modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
}

.modal-content {
    position: relative;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
}

.modal-close-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
}

.modal-close-btn:hover {
    color: var(--text-primary);
    background: var(--bg-secondary);
}

.modal-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-lg);
}

.modal-footer {
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--border-color);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
}

/* Test Prompting Modal Specific */
.test-prompting-modal-content {
    width: 700px;
}

/* RLM Settings */
.rlm-settings {
    margin-bottom: var(--space-lg);
    padding: var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
}

.rlm-label {
    display: block;
    font-weight: 600;
    margin-bottom: var(--space-sm);
}

.rlm-toggle-group {
    display: flex;
    gap: var(--space-xs);
    margin-bottom: var(--space-xs);
}

.rlm-btn {
    padding: 0.5rem 1.25rem;
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: 0.9rem;
}

.rlm-btn:hover {
    border-color: var(--gold);
    color: var(--text-primary);
}

.rlm-btn.active {
    background: var(--gold);
    color: var(--bg-primary);
    border-color: var(--gold);
    font-weight: 600;
}

.rlm-hint {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0;
}

/* Prompt Selection */
.prompt-selection {
    margin-bottom: var(--space-lg);
}

.prompt-selection-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-sm);
    font-weight: 600;
}

.prompts-selected-count {
    color: var(--gold);
    font-size: 0.9rem;
}

.prompts-list {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
}

.prompt-item {
    display: flex;
    align-items: flex-start;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border-color);
    gap: var(--space-sm);
    transition: background var(--transition-fast);
}

.prompt-item:last-child {
    border-bottom: none;
}

.prompt-item:hover {
    background: rgba(212, 168, 83, 0.05);
}

.prompt-item.selected {
    background: rgba(212, 168, 83, 0.1);
}

.prompt-checkbox {
    margin-top: 0.25rem;
    width: 18px;
    height: 18px;
    accent-color: var(--gold);
    cursor: pointer;
}

.prompt-content {
    flex: 1;
    min-width: 0;
}

.prompt-text {
    display: block;
    font-size: 0.95rem;
    line-height: 1.4;
    color: var(--text-primary);
}

.prompt-category {
    display: inline-block;
    font-size: 0.75rem;
    color: var(--gold);
    background: rgba(212, 168, 83, 0.15);
    padding: 0.1rem 0.5rem;
    border-radius: var(--radius-sm);
    margin-top: 0.25rem;
}

.prompt-edit-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    font-size: 0.85rem;
    opacity: 0;
    transition: opacity var(--transition-fast);
}

.prompt-item:hover .prompt-edit-btn {
    opacity: 1;
}

.prompt-edit-btn:hover {
    color: var(--gold);
}

.prompt-edit-input {
    width: 100%;
    padding: 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--gold);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 0.95rem;
}

/* Custom Prompt Section */
.custom-prompt-section {
    margin-bottom: var(--space-md);
}

.custom-prompt-section label {
    display: block;
    font-weight: 600;
    margin-bottom: var(--space-xs);
}

.custom-prompt-input-group {
    display: flex;
    gap: var(--space-sm);
}

.custom-prompt-input-group input {
    flex: 1;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.95rem;
}

.custom-prompt-input-group input:focus {
    outline: none;
    border-color: var(--gold);
}

/* Test Runner Screen */
.test-runner-content {
    width: 600px;
    text-align: center;
}

.test-runner-header {
    padding: var(--space-xl) var(--space-lg) var(--space-lg);
}

.test-runner-icon {
    font-size: 3rem;
    margin-bottom: var(--space-sm);
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
}

.test-runner-header h2 {
    margin: 0 0 var(--space-xs);
}

.test-runner-header p {
    color: var(--text-secondary);
    margin: 0;
}

.test-progress-section {
    padding: 0 var(--space-lg) var(--space-lg);
}

.test-progress-container {
    height: 12px;
    background: var(--bg-secondary);
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: var(--space-xs);
}

.test-progress-bar {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, var(--gold), #f5d89a);
    border-radius: 6px;
    transition: width 0.3s ease;
}

.test-progress-label {
    font-size: 0.9rem;
    color: var(--text-secondary);
}

.test-status-section {
    padding: 0 var(--space-lg) var(--space-lg);
    text-align: left;
}

.test-status-section label {
    display: block;
    font-weight: 600;
    margin-bottom: var(--space-xs);
    font-size: 0.9rem;
}

.test-status-stream {
    height: 200px;
    overflow-y: auto;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: var(--space-sm);
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 0.85rem;
}

.status-message {
    padding: 0.25rem 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}

.status-message:last-child {
    border-bottom: none;
}

.status-message.info { color: var(--text-secondary); }
.status-message.success { color: #4caf50; }
.status-message.error { color: #f44336; }
.status-message.complete { color: var(--gold); font-weight: 600; }

.test-runner-footer {
    padding: var(--space-md) var(--space-lg) var(--space-lg);
}

/* Analytics Dashboard */
.test-analytics-section {
    margin-top: var(--space-xl);
}

.test-analytics-section .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-sm);
}

.analytics-actions {
    display: flex;
    gap: var(--space-sm);
}

.analytics-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-md);
    margin: var(--space-lg) 0;
}

@media (max-width: 768px) {
    .analytics-summary-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

.analytics-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: var(--space-lg);
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
}

.analytics-icon {
    font-size: 1.5rem;
}

.analytics-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--gold);
    font-family: 'Bebas Neue', sans-serif;
}

.analytics-label {
    font-size: 0.85rem;
    color: var(--text-secondary);
}

/* Context Window Gauge */
.context-window-gauge {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    margin-bottom: var(--space-lg);
}

.gauge-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--space-sm);
    font-size: 0.9rem;
}

.gauge-container {
    height: 20px;
    background: var(--bg-primary);
    border-radius: 10px;
    overflow: hidden;
}

.gauge-fill {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #4caf50, #ffeb3b, #f44336);
    border-radius: 10px;
    transition: width 0.5s ease;
}

/* Analytics Results List */
.analytics-results-section h3 {
    margin-bottom: var(--space-md);
}

.analytics-results-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
}

.analytics-result-item {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
}

.analytics-result-item.success {
    border-left: 4px solid #4caf50;
}

.analytics-result-item.error {
    border-left: 4px solid #f44336;
}

.result-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md);
    background: rgba(0,0,0,0.2);
    cursor: pointer;
}

.result-item-header:hover {
    background: rgba(0,0,0,0.3);
}

.result-prompt-text {
    font-weight: 600;
    flex: 1;
}

.result-meta {
    display: flex;
    gap: var(--space-md);
    font-size: 0.85rem;
    color: var(--text-secondary);
}

.result-item-body {
    padding: var(--space-md);
    border-top: 1px solid var(--border-color);
    display: none;
}

.result-item-body.expanded {
    display: block;
}

.result-response {
    white-space: pre-wrap;
    font-size: 0.9rem;
    line-height: 1.6;
}
```

### Completion Criteria

- [ ] Modal displays correctly with backdrop
- [ ] RLM toggle buttons show active state
- [ ] Prompts list is scrollable with hover effects
- [ ] Progress bar animates smoothly
- [ ] Status stream has monospace font
- [ ] Analytics cards display in 4-column grid
- [ ] Context gauge shows gradient fill
- [ ] Responsive on mobile devices

---

## Phase 3: Core JavaScript - State & UI Logic

**Estimated Scope:** ~200 lines JS
**Dependencies:** Phase 1, Phase 2
**Files:** `js/orchestrator.js`

### Tasks

1. **Add Test State Object**
2. **Add Default Test Prompts**
3. **Add DOM Element References**
4. **Implement Modal Open/Close**
5. **Implement RLM Toggle**
6. **Implement Prompt Selection (max 10)**
7. **Implement Prompt Editing**
8. **Implement Custom Prompt Addition**
9. **Update Button States**

### JavaScript to Add

#### 3.1 Test State & Default Prompts (add after line 34)

```javascript
// ============================================
// Test Prompting State
// ============================================

const testState = {
    selectedPrompts: [],
    customPrompts: [],
    rlmMode: 'auto',
    isRunning: false,
    currentPromptIndex: 0,
    results: [],
    startTime: null,
    endTime: null,
    aborted: false
};

const DEFAULT_TEST_PROMPTS = [
    {
        id: 'default-1',
        category: 'Summary',
        prompt: 'What are the main topics discussed across all meetings?',
        description: 'Tests cross-meeting synthesis capability',
        isCustom: false
    },
    {
        id: 'default-2',
        category: 'Action Items',
        prompt: 'List all action items with their owners and deadlines.',
        description: 'Tests action item extraction accuracy',
        isCustom: false
    },
    {
        id: 'default-3',
        category: 'Decisions',
        prompt: 'What key decisions were made in these meetings?',
        description: 'Tests decision identification',
        isCustom: false
    },
    {
        id: 'default-4',
        category: 'Timeline',
        prompt: 'Create a timeline of major events and milestones mentioned.',
        description: 'Tests temporal reasoning',
        isCustom: false
    },
    {
        id: 'default-5',
        category: 'Risks',
        prompt: 'What risks or blockers were identified?',
        description: 'Tests risk extraction',
        isCustom: false
    },
    {
        id: 'default-6',
        category: 'Participants',
        prompt: 'Who are the key participants and what are their roles?',
        description: 'Tests entity recognition',
        isCustom: false
    },
    {
        id: 'default-7',
        category: 'Follow-ups',
        prompt: 'What follow-up items need attention before the next meeting?',
        description: 'Tests follow-up identification',
        isCustom: false
    },
    {
        id: 'default-8',
        category: 'Sentiment',
        prompt: 'How would you describe the overall sentiment and team dynamics?',
        description: 'Tests sentiment analysis depth',
        isCustom: false
    },
    {
        id: 'default-9',
        category: 'Comparison',
        prompt: 'Compare the progress between the first and last meeting.',
        description: 'Tests comparative analysis',
        isCustom: false
    },
    {
        id: 'default-10',
        category: 'Recommendations',
        prompt: 'Based on all meetings, what are your top 3 recommendations?',
        description: 'Tests strategic reasoning',
        isCustom: false
    }
];
```

#### 3.2 DOM Element References (add to initElements function)

```javascript
// Test Prompting Elements
runTestBtn: document.getElementById('run-test-prompting-btn'),
testPromptingModal: document.getElementById('test-prompting-modal'),
closeTestModalBtn: document.getElementById('close-test-modal'),
rlmToggleGroup: document.querySelector('.rlm-toggle-group'),
promptsList: document.getElementById('prompts-list'),
promptsSelectedCount: document.getElementById('prompts-selected-count'),
customPromptInput: document.getElementById('custom-prompt-input'),
addCustomPromptBtn: document.getElementById('add-custom-prompt-btn'),
deployTestAgentBtn: document.getElementById('deploy-test-agent-btn'),

// Test Runner Elements
testRunnerScreen: document.getElementById('test-runner-screen'),
testProgressBar: document.getElementById('test-progress-bar'),
testProgressLabel: document.getElementById('test-progress-label'),
testProgressText: document.getElementById('test-progress-text'),
testStatusStream: document.getElementById('test-status-stream'),
cancelTestBtn: document.getElementById('cancel-test-btn'),

// Analytics Elements
testAnalyticsSection: document.getElementById('test-analytics-section'),
analyticsPromptsRun: document.getElementById('analytics-prompts-run'),
analyticsTotalTime: document.getElementById('analytics-total-time'),
analyticsTotalTokens: document.getElementById('analytics-total-tokens'),
analyticsTotalCost: document.getElementById('analytics-total-cost'),
contextUsageText: document.getElementById('context-usage-text'),
contextGaugeFill: document.getElementById('context-gauge-fill'),
analyticsResultsList: document.getElementById('analytics-results-list'),
rerunTestBtn: document.getElementById('rerun-test-btn'),
exportTestHtmlBtn: document.getElementById('export-test-html-btn'),
```

#### 3.3 Event Listeners (add to setupEventListeners function)

```javascript
// Test Prompting Events
if (elements.runTestBtn) {
    elements.runTestBtn.addEventListener('click', openTestPromptingModal);
}
if (elements.closeTestModalBtn) {
    elements.closeTestModalBtn.addEventListener('click', closeTestPromptingModal);
}
if (elements.testPromptingModal) {
    elements.testPromptingModal.querySelector('.modal-overlay')?.addEventListener('click', closeTestPromptingModal);
}
if (elements.rlmToggleGroup) {
    elements.rlmToggleGroup.addEventListener('click', handleRlmToggle);
}
if (elements.addCustomPromptBtn) {
    elements.addCustomPromptBtn.addEventListener('click', addCustomPrompt);
}
if (elements.customPromptInput) {
    elements.customPromptInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addCustomPrompt();
    });
}
if (elements.deployTestAgentBtn) {
    elements.deployTestAgentBtn.addEventListener('click', deployTestAgent);
}
if (elements.cancelTestBtn) {
    elements.cancelTestBtn.addEventListener('click', cancelTest);
}
if (elements.rerunTestBtn) {
    elements.rerunTestBtn.addEventListener('click', openTestPromptingModal);
}
if (elements.exportTestHtmlBtn) {
    elements.exportTestHtmlBtn.addEventListener('click', exportTestReportHTML);
}
```

#### 3.4 Modal & UI Functions

```javascript
// ============================================
// Test Prompting UI Functions
// ============================================

function openTestPromptingModal() {
    if (state.agents.length === 0) {
        showError('Please upload at least one agent file first.');
        return;
    }

    // Reset selection state
    testState.selectedPrompts = [];
    testState.customPrompts = [];
    testState.rlmMode = 'auto';

    // Render prompts list
    renderPromptsList();

    // Reset RLM toggle
    elements.rlmToggleGroup.querySelectorAll('.rlm-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === 'auto');
    });

    // Show modal
    elements.testPromptingModal.classList.remove('hidden');
    updateDeployButtonState();
}

function closeTestPromptingModal() {
    elements.testPromptingModal.classList.add('hidden');
}

function handleRlmToggle(e) {
    if (e.target.classList.contains('rlm-btn')) {
        elements.rlmToggleGroup.querySelectorAll('.rlm-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        e.target.classList.add('active');
        testState.rlmMode = e.target.dataset.mode;
    }
}

function renderPromptsList() {
    const allPrompts = [...DEFAULT_TEST_PROMPTS, ...testState.customPrompts];

    elements.promptsList.innerHTML = allPrompts.map(prompt => `
        <div class="prompt-item ${testState.selectedPrompts.find(p => p.id === prompt.id) ? 'selected' : ''}" data-id="${prompt.id}">
            <input type="checkbox" class="prompt-checkbox"
                   ${testState.selectedPrompts.find(p => p.id === prompt.id) ? 'checked' : ''}
                   ${testState.selectedPrompts.length >= 10 && !testState.selectedPrompts.find(p => p.id === prompt.id) ? 'disabled' : ''}>
            <div class="prompt-content">
                <span class="prompt-text">${escapeHtml(prompt.prompt)}</span>
                <span class="prompt-category">${prompt.category}${prompt.isCustom ? ' (Custom)' : ''}</span>
            </div>
            <button class="prompt-edit-btn" title="Edit prompt">✏️</button>
            ${prompt.isCustom ? '<button class="prompt-delete-btn" title="Delete">🗑️</button>' : ''}
        </div>
    `).join('');

    // Add event listeners
    elements.promptsList.querySelectorAll('.prompt-item').forEach(item => {
        const checkbox = item.querySelector('.prompt-checkbox');
        const editBtn = item.querySelector('.prompt-edit-btn');
        const deleteBtn = item.querySelector('.prompt-delete-btn');

        checkbox.addEventListener('change', () => togglePromptSelection(item.dataset.id));
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            enablePromptEditing(item.dataset.id);
        });
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteCustomPrompt(item.dataset.id);
            });
        }
    });

    updatePromptsSelectedCount();
}

function togglePromptSelection(promptId) {
    const allPrompts = [...DEFAULT_TEST_PROMPTS, ...testState.customPrompts];
    const prompt = allPrompts.find(p => p.id === promptId);

    const existingIndex = testState.selectedPrompts.findIndex(p => p.id === promptId);

    if (existingIndex >= 0) {
        testState.selectedPrompts.splice(existingIndex, 1);
    } else if (testState.selectedPrompts.length < 10 && prompt) {
        testState.selectedPrompts.push({ ...prompt });
    }

    renderPromptsList();
    updateDeployButtonState();
}

function enablePromptEditing(promptId) {
    const item = elements.promptsList.querySelector(`[data-id="${promptId}"]`);
    const promptContent = item.querySelector('.prompt-content');
    const currentText = item.querySelector('.prompt-text').textContent;

    promptContent.innerHTML = `
        <input type="text" class="prompt-edit-input" value="${escapeHtml(currentText)}" maxlength="500">
        <div style="margin-top: 0.5rem;">
            <button class="btn-secondary btn-sm save-edit-btn">Save</button>
            <button class="btn-text btn-sm cancel-edit-btn">Cancel</button>
        </div>
    `;

    const input = promptContent.querySelector('.prompt-edit-input');
    input.focus();
    input.select();

    promptContent.querySelector('.save-edit-btn').addEventListener('click', () => {
        savePromptEdit(promptId, input.value);
    });
    promptContent.querySelector('.cancel-edit-btn').addEventListener('click', () => {
        renderPromptsList();
    });
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') savePromptEdit(promptId, input.value);
    });
}

function savePromptEdit(promptId, newText) {
    if (!newText.trim()) {
        renderPromptsList();
        return;
    }

    // Update in custom prompts if custom
    const customIndex = testState.customPrompts.findIndex(p => p.id === promptId);
    if (customIndex >= 0) {
        testState.customPrompts[customIndex].prompt = newText.trim();
    }

    // Update in selected prompts
    const selectedIndex = testState.selectedPrompts.findIndex(p => p.id === promptId);
    if (selectedIndex >= 0) {
        testState.selectedPrompts[selectedIndex].prompt = newText.trim();
    }

    // For default prompts, create a modified copy in selected
    if (customIndex < 0 && selectedIndex >= 0) {
        testState.selectedPrompts[selectedIndex].prompt = newText.trim();
        testState.selectedPrompts[selectedIndex].edited = true;
    }

    renderPromptsList();
}

function addCustomPrompt() {
    const text = elements.customPromptInput.value.trim();
    if (!text) return;
    if (testState.customPrompts.length + DEFAULT_TEST_PROMPTS.length >= 20) {
        showError('Maximum 20 prompts allowed (10 default + 10 custom)');
        return;
    }

    const newPrompt = {
        id: `custom-${Date.now()}`,
        category: 'Custom',
        prompt: text,
        description: 'User-defined prompt',
        isCustom: true
    };

    testState.customPrompts.push(newPrompt);
    elements.customPromptInput.value = '';
    renderPromptsList();
}

function deleteCustomPrompt(promptId) {
    testState.customPrompts = testState.customPrompts.filter(p => p.id !== promptId);
    testState.selectedPrompts = testState.selectedPrompts.filter(p => p.id !== promptId);
    renderPromptsList();
    updateDeployButtonState();
}

function updatePromptsSelectedCount() {
    elements.promptsSelectedCount.textContent = `${testState.selectedPrompts.length}/10 selected`;
}

function updateDeployButtonState() {
    elements.deployTestAgentBtn.disabled = testState.selectedPrompts.length === 0;
}

function updateTestButtonState() {
    if (elements.runTestBtn) {
        elements.runTestBtn.disabled = state.agents.length === 0 || !state.apiKey;
        elements.runTestBtn.title = state.agents.length === 0
            ? 'Upload agents first'
            : (!state.apiKey ? 'Enter API key first' : '');
    }
}
```

#### 3.5 Update Existing Functions

Add to `updateButtonStates()`:
```javascript
updateTestButtonState();
```

### Completion Criteria

- [ ] Modal opens when clicking "Run Test Prompting"
- [ ] Modal closes with X button or overlay click
- [ ] RLM toggle switches between modes
- [ ] Prompts can be selected (max 10 enforced)
- [ ] Selection count updates correctly
- [ ] Prompts can be edited inline
- [ ] Custom prompts can be added
- [ ] Custom prompts can be deleted
- [ ] Deploy button enables when prompts selected

---

## Phase 4: Test Execution Engine

**Estimated Scope:** ~150 lines JS
**Dependencies:** Phase 3
**Files:** `js/orchestrator.js`

### Tasks

1. **Implement Deploy Test Agent**
2. **Implement Sequential Test Execution**
3. **Implement Progress Updates**
4. **Implement Status Streaming**
5. **Implement Test Cancellation**
6. **Implement RLM-aware API Calls**

### JavaScript to Add

```javascript
// ============================================
// Test Execution Engine
// ============================================

async function deployTestAgent() {
    if (testState.selectedPrompts.length === 0) return;

    // Close modal, show runner
    closeTestPromptingModal();
    showTestRunnerScreen();

    // Reset state
    testState.isRunning = true;
    testState.aborted = false;
    testState.results = [];
    testState.startTime = Date.now();
    testState.currentPromptIndex = 0;

    // Clear status stream
    elements.testStatusStream.innerHTML = '';

    // Run test sequence
    await runTestSequence();
}

function showTestRunnerScreen() {
    elements.testRunnerScreen.classList.remove('hidden');
    elements.testProgressBar.style.width = '0%';
    elements.testProgressLabel.textContent = `0 / ${testState.selectedPrompts.length} prompts`;
    elements.testProgressText.textContent = 'Initializing test sequence...';
}

function hideTestRunnerScreen() {
    elements.testRunnerScreen.classList.add('hidden');
}

async function runTestSequence() {
    const prompts = testState.selectedPrompts;
    const totalPrompts = prompts.length;

    appendStatusMessage('Starting test sequence...', 'info');
    appendStatusMessage(`RLM Mode: ${testState.rlmMode.toUpperCase()}`, 'info');
    appendStatusMessage(`Testing ${totalPrompts} prompt(s) against ${state.agents.length} agent(s)`, 'info');
    appendStatusMessage('---', 'info');

    for (let i = 0; i < totalPrompts; i++) {
        if (testState.aborted) {
            appendStatusMessage('Test cancelled by user.', 'error');
            break;
        }

        testState.currentPromptIndex = i;
        const prompt = prompts[i];

        // Update progress
        updateTestProgress(i + 1, totalPrompts);
        elements.testProgressText.textContent = `Running prompt ${i + 1} of ${totalPrompts}...`;

        appendStatusMessage(`[${i + 1}/${totalPrompts}] "${prompt.prompt.substring(0, 60)}${prompt.prompt.length > 60 ? '...' : ''}"`, 'info');

        const startTime = Date.now();

        try {
            const response = await callGPTForTest(prompt.prompt, testState.rlmMode);
            const duration = Date.now() - startTime;

            testState.results.push({
                prompt: prompt,
                response: response.content,
                inputTokens: response.inputTokens,
                outputTokens: response.outputTokens,
                totalTokens: response.inputTokens + response.outputTokens,
                duration: duration,
                success: true,
                rlmUsed: response.rlmUsed
            });

            appendStatusMessage(`✓ Completed in ${(duration / 1000).toFixed(1)}s (${response.inputTokens + response.outputTokens} tokens)`, 'success');

        } catch (error) {
            const duration = Date.now() - startTime;

            testState.results.push({
                prompt: prompt,
                error: error.message,
                duration: duration,
                success: false
            });

            appendStatusMessage(`✗ Error: ${error.message}`, 'error');
        }

        // Brief pause between prompts to avoid rate limiting
        if (i < totalPrompts - 1 && !testState.aborted) {
            await sleep(500);
        }
    }

    // Complete
    testState.endTime = Date.now();
    testState.isRunning = false;

    if (!testState.aborted) {
        appendStatusMessage('---', 'info');
        appendStatusMessage('🎉 Test Complete!', 'complete');

        updateTestProgress(totalPrompts, totalPrompts);
        elements.testProgressText.textContent = 'Test complete!';

        // Show analytics after brief delay
        setTimeout(() => {
            hideTestRunnerScreen();
            showAnalyticsDashboard();
        }, 1500);
    } else {
        setTimeout(() => {
            hideTestRunnerScreen();
            if (testState.results.length > 0) {
                showAnalyticsDashboard();
            }
        }, 1000);
    }
}

function updateTestProgress(current, total) {
    const percentage = (current / total) * 100;
    elements.testProgressBar.style.width = `${percentage}%`;
    elements.testProgressLabel.textContent = `${current} / ${total} prompts`;
}

function appendStatusMessage(text, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const messageDiv = document.createElement('div');
    messageDiv.className = `status-message ${type}`;
    messageDiv.textContent = `[${timestamp}] ${text}`;
    elements.testStatusStream.appendChild(messageDiv);
    elements.testStatusStream.scrollTop = elements.testStatusStream.scrollHeight;
}

function cancelTest() {
    testState.aborted = true;
    appendStatusMessage('Cancelling test...', 'error');
}

async function callGPTForTest(prompt, rlmMode) {
    // Determine if we should use reasoning
    const useReasoning = shouldUseReasoning(prompt, rlmMode);

    // Build context from agents
    const context = buildChatContext(prompt);

    const systemPrompt = `You are a meeting analysis assistant being tested for accuracy and helpfulness.
You have access to data from ${state.agents.length} meeting(s).
Provide accurate, comprehensive answers based on the meeting data.
Be concise but thorough.

${context}`;

    const requestBody = {
        model: 'gpt-5.2',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ],
        max_completion_tokens: 2000,
        temperature: 0.7
    };

    // Add reasoning parameter if enabled
    if (useReasoning) {
        requestBody.reasoning_effort = 'medium';
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.apiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();

    // Track metrics
    if (data.usage) {
        currentMetrics.gptInputTokens += data.usage.prompt_tokens || 0;
        currentMetrics.gptOutputTokens += data.usage.completion_tokens || 0;
        currentMetrics.apiCalls.push({
            name: `Test: ${prompt.substring(0, 30)}...`,
            model: 'gpt-5.2',
            inputTokens: data.usage.prompt_tokens || 0,
            outputTokens: data.usage.completion_tokens || 0
        });
        updateMetricsDisplay();
    }

    return {
        content: data.choices[0].message.content,
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        rlmUsed: useReasoning
    };
}

function shouldUseReasoning(prompt, rlmMode) {
    if (rlmMode === 'on') return true;
    if (rlmMode === 'off') return false;

    // Auto mode: detect prompts that benefit from reasoning
    const reasoningKeywords = [
        'compare', 'comparison', 'analyze', 'analysis',
        'recommend', 'recommendation', 'strategy', 'strategic',
        'timeline', 'relationship', 'pattern', 'trend',
        'prioritize', 'evaluate', 'assess', 'implications',
        'trade-off', 'tradeoff', 'pros and cons', 'advantages'
    ];

    const lowerPrompt = prompt.toLowerCase();
    return reasoningKeywords.some(keyword => lowerPrompt.includes(keyword));
}
```

### Completion Criteria

- [ ] Test runner screen displays on deploy
- [ ] Progress bar updates smoothly
- [ ] Status messages stream in real-time
- [ ] Prompts execute sequentially
- [ ] Cancel button stops execution
- [ ] Results stored in testState.results
- [ ] Metrics tracked correctly
- [ ] RLM mode respected (on/off/auto)

---

## Phase 5: Analytics Dashboard & HTML Export

**Estimated Scope:** ~200 lines JS
**Dependencies:** Phase 4
**Files:** `js/orchestrator.js`

### Tasks

1. **Implement Analytics Dashboard Display**
2. **Implement Context Window Gauge**
3. **Implement Results List with Expand/Collapse**
4. **Implement HTML Report Generation**
5. **Implement Download Functionality**

### JavaScript to Add

```javascript
// ============================================
// Analytics Dashboard
// ============================================

function showAnalyticsDashboard() {
    // Calculate totals
    const successfulResults = testState.results.filter(r => r.success);
    const totalTime = testState.endTime ? (testState.endTime - testState.startTime) / 1000 : 0;
    const totalTokens = testState.results.reduce((sum, r) => sum + (r.totalTokens || 0), 0);
    const totalCost = calculateTestCost(testState.results);

    // Update summary cards
    elements.analyticsPromptsRun.textContent = testState.results.length;
    elements.analyticsTotalTime.textContent = `${totalTime.toFixed(1)}s`;
    elements.analyticsTotalTokens.textContent = totalTokens.toLocaleString();
    elements.analyticsTotalCost.textContent = formatCost(totalCost);

    // Update context window gauge
    updateContextGauge(totalTokens);

    // Render results list
    renderAnalyticsResults();

    // Show section
    elements.testAnalyticsSection.classList.remove('hidden');

    // Scroll to analytics
    elements.testAnalyticsSection.scrollIntoView({ behavior: 'smooth' });
}

function calculateTestCost(results) {
    let totalCost = 0;

    results.forEach(r => {
        if (r.success) {
            const inputCost = (r.inputTokens / 1000000) * PRICING['gpt-5.2'].input;
            const outputCost = (r.outputTokens / 1000000) * PRICING['gpt-5.2'].output;
            totalCost += inputCost + outputCost;
        }
    });

    return totalCost;
}

function updateContextGauge(tokensUsed) {
    const maxContext = 128000; // GPT-5.2 context window
    const percentage = Math.min((tokensUsed / maxContext) * 100, 100);

    elements.contextUsageText.textContent = `${tokensUsed.toLocaleString()} / ${maxContext.toLocaleString()} tokens`;
    elements.contextGaugeFill.style.width = `${percentage}%`;

    // Change color based on usage
    if (percentage < 50) {
        elements.contextGaugeFill.style.background = 'linear-gradient(90deg, #4caf50, #8bc34a)';
    } else if (percentage < 80) {
        elements.contextGaugeFill.style.background = 'linear-gradient(90deg, #ffeb3b, #ff9800)';
    } else {
        elements.contextGaugeFill.style.background = 'linear-gradient(90deg, #ff9800, #f44336)';
    }
}

function renderAnalyticsResults() {
    elements.analyticsResultsList.innerHTML = testState.results.map((result, index) => `
        <div class="analytics-result-item ${result.success ? 'success' : 'error'}">
            <div class="result-item-header" data-index="${index}">
                <span class="result-prompt-text">
                    ${index + 1}. ${escapeHtml(result.prompt.prompt.substring(0, 80))}${result.prompt.prompt.length > 80 ? '...' : ''}
                </span>
                <div class="result-meta">
                    ${result.success ? `
                        <span>⏱️ ${(result.duration / 1000).toFixed(1)}s</span>
                        <span>🔢 ${result.totalTokens} tokens</span>
                        ${result.rlmUsed ? '<span>🧠 RLM</span>' : ''}
                    ` : `
                        <span style="color: #f44336;">❌ Failed</span>
                    `}
                    <span class="expand-indicator">▼</span>
                </div>
            </div>
            <div class="result-item-body" id="result-body-${index}">
                ${result.success ? `
                    <div class="result-response">${escapeHtml(result.response)}</div>
                ` : `
                    <div class="result-error" style="color: #f44336;">
                        <strong>Error:</strong> ${escapeHtml(result.error)}
                    </div>
                `}
            </div>
        </div>
    `).join('');

    // Add expand/collapse listeners
    elements.analyticsResultsList.querySelectorAll('.result-item-header').forEach(header => {
        header.addEventListener('click', () => {
            const index = header.dataset.index;
            const body = document.getElementById(`result-body-${index}`);
            const indicator = header.querySelector('.expand-indicator');

            body.classList.toggle('expanded');
            indicator.textContent = body.classList.contains('expanded') ? '▲' : '▼';
        });
    });
}

// ============================================
// HTML Report Export
// ============================================

function exportTestReportHTML() {
    const html = generateTestReportHTML();

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `test-report-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function generateTestReportHTML() {
    const totalTime = testState.endTime ? ((testState.endTime - testState.startTime) / 1000).toFixed(1) : '0';
    const totalTokens = testState.results.reduce((sum, r) => sum + (r.totalTokens || 0), 0);
    const totalCost = calculateTestCost(testState.results);
    const successCount = testState.results.filter(r => r.success).length;
    const failCount = testState.results.filter(r => !r.success).length;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Report - northstar.LM Agent Orchestrator</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 1000px;
            margin: 0 auto;
            padding: 2rem;
            background: #f8f9fa;
            color: #333;
            line-height: 1.6;
        }
        .header {
            background: linear-gradient(135deg, #0a0e17, #1a1f2e);
            color: white;
            padding: 2rem;
            border-radius: 12px;
            margin-bottom: 2rem;
        }
        .header h1 {
            color: #d4a853;
            margin-bottom: 0.5rem;
            font-size: 2rem;
        }
        .header .meta {
            color: #aaa;
            font-size: 0.9rem;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        .summary-card {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .summary-card .icon { font-size: 1.5rem; }
        .summary-card .value {
            font-size: 1.75rem;
            font-weight: 700;
            color: #d4a853;
            display: block;
            margin: 0.5rem 0;
        }
        .summary-card .label {
            color: #666;
            font-size: 0.85rem;
        }
        .config-section {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 2rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .config-section h2 {
            color: #0a0e17;
            margin-bottom: 1rem;
            font-size: 1.25rem;
        }
        .config-item {
            display: flex;
            justify-content: space-between;
            padding: 0.5rem 0;
            border-bottom: 1px solid #eee;
        }
        .config-item:last-child { border-bottom: none; }
        .results-section h2 {
            color: #0a0e17;
            margin-bottom: 1rem;
            font-size: 1.5rem;
        }
        .result-item {
            background: white;
            border-radius: 8px;
            margin-bottom: 1rem;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .result-item.success { border-left: 4px solid #4caf50; }
        .result-item.error { border-left: 4px solid #f44336; }
        .result-header {
            background: #0a0e17;
            color: white;
            padding: 1rem 1.5rem;
        }
        .result-header .prompt-num {
            color: #d4a853;
            font-weight: 600;
        }
        .result-header .prompt-text {
            display: block;
            margin-top: 0.25rem;
        }
        .result-meta {
            display: flex;
            gap: 1rem;
            margin-top: 0.5rem;
            font-size: 0.85rem;
            color: #aaa;
        }
        .result-body {
            padding: 1.5rem;
        }
        .result-body pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: inherit;
            margin: 0;
        }
        .error-message {
            color: #f44336;
            font-weight: 600;
        }
        .agents-list {
            background: #f1f3f4;
            padding: 1rem;
            border-radius: 4px;
            margin-top: 1rem;
        }
        .agents-list ul {
            list-style: none;
            padding-left: 1rem;
        }
        .agents-list li {
            padding: 0.25rem 0;
        }
        .footer {
            margin-top: 3rem;
            text-align: center;
            color: #999;
            font-size: 0.85rem;
            padding-top: 2rem;
            border-top: 1px solid #ddd;
        }
        @media print {
            body { background: white; }
            .summary-card, .result-item, .config-section { box-shadow: none; border: 1px solid #ddd; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 Agent Test Report</h1>
        <div class="meta">
            <p>Generated: ${new Date().toLocaleString()}</p>
            <p>northstar.LM Agent Orchestrator</p>
        </div>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <span class="icon">✅</span>
            <span class="value">${testState.results.length}</span>
            <span class="label">Prompts Run</span>
        </div>
        <div class="summary-card">
            <span class="icon">✓</span>
            <span class="value" style="color: #4caf50;">${successCount}</span>
            <span class="label">Successful</span>
        </div>
        <div class="summary-card">
            <span class="icon">✗</span>
            <span class="value" style="color: ${failCount > 0 ? '#f44336' : '#4caf50'};">${failCount}</span>
            <span class="label">Failed</span>
        </div>
        <div class="summary-card">
            <span class="icon">⏱️</span>
            <span class="value">${totalTime}s</span>
            <span class="label">Total Time</span>
        </div>
        <div class="summary-card">
            <span class="icon">🔢</span>
            <span class="value">${totalTokens.toLocaleString()}</span>
            <span class="label">Total Tokens</span>
        </div>
        <div class="summary-card">
            <span class="icon">💰</span>
            <span class="value">${formatCost(totalCost)}</span>
            <span class="label">Est. Cost</span>
        </div>
    </div>

    <div class="config-section">
        <h2>Test Configuration</h2>
        <div class="config-item">
            <span>RLM Mode</span>
            <strong>${testState.rlmMode.toUpperCase()}</strong>
        </div>
        <div class="config-item">
            <span>Agents Tested</span>
            <strong>${state.agents.length}</strong>
        </div>
        <div class="agents-list">
            <strong>Agent Files:</strong>
            <ul>
                ${state.agents.map(a => `<li>📋 ${escapeHtml(a.title)} (${a.date || 'No date'})</li>`).join('')}
            </ul>
        </div>
    </div>

    <div class="results-section">
        <h2>Detailed Results</h2>
        ${testState.results.map((result, index) => `
            <div class="result-item ${result.success ? 'success' : 'error'}">
                <div class="result-header">
                    <span class="prompt-num">Prompt ${index + 1}</span>
                    <span class="prompt-text">${escapeHtml(result.prompt.prompt)}</span>
                    <div class="result-meta">
                        ${result.success ? `
                            <span>⏱️ ${(result.duration / 1000).toFixed(2)}s</span>
                            <span>📥 ${result.inputTokens} input</span>
                            <span>📤 ${result.outputTokens} output</span>
                            ${result.rlmUsed ? '<span>🧠 RLM Used</span>' : ''}
                        ` : `
                            <span>❌ Failed after ${(result.duration / 1000).toFixed(2)}s</span>
                        `}
                    </div>
                </div>
                <div class="result-body">
                    ${result.success ? `
                        <pre>${escapeHtml(result.response)}</pre>
                    ` : `
                        <p class="error-message">Error: ${escapeHtml(result.error)}</p>
                    `}
                </div>
            </div>
        `).join('')}
    </div>

    <div class="footer">
        <p>Report generated by northstar.LM Agent Orchestrator</p>
        <p>https://mjamiv.github.io/vox2txt/orchestrator.html</p>
    </div>
</body>
</html>`;
}
```

### Completion Criteria

- [ ] Analytics dashboard displays after test
- [ ] Summary cards show correct totals
- [ ] Context gauge shows token usage with color coding
- [ ] Results list shows all prompts with expand/collapse
- [ ] Success/error states styled correctly
- [ ] HTML export downloads correctly
- [ ] Exported HTML displays properly in browser
- [ ] Exported HTML is print-friendly

---

## Testing Checklist

### Functional Tests

- [ ] Upload 2+ agent files successfully
- [ ] Open test prompting modal
- [ ] Toggle RLM between off/auto/on
- [ ] Select up to 10 prompts (max enforced)
- [ ] Edit a default prompt inline
- [ ] Add a custom prompt
- [ ] Delete a custom prompt
- [ ] Deploy test with selected prompts
- [ ] Progress bar updates during execution
- [ ] Status messages stream correctly
- [ ] Cancel test mid-execution
- [ ] Analytics dashboard shows after completion
- [ ] Expand/collapse individual results
- [ ] Export HTML report
- [ ] Verify HTML report opens correctly

### Edge Cases

- [ ] Test with 0 agents (should show error)
- [ ] Test with no prompts selected (deploy disabled)
- [ ] Test with API error (should show in results)
- [ ] Test with all 10 prompts selected
- [ ] Test cancellation at various stages
- [ ] Test RLM auto-detection triggers correctly

### Browser Compatibility

- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-15 | Initial plan created |

---

## Notes for Future Agents

1. **Start with Phase 1** if HTML structure is missing
2. **Check for existing elements** before adding duplicates
3. **Update version parameters** in HTML after changes (`?v=XX`)
4. **Test incrementally** after each phase
5. **Commit after each phase** with descriptive message
6. **Reference line numbers** when editing existing code

---

*End of Implementation Plan*
