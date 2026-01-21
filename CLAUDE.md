# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

**northstar.LM** is a client-side web application that transforms meeting recordings, videos, PDFs, images, or text into actionable insights using OpenAI's AI models. The entire application runs client-side with no backend server.

The application consists of two main pages:
- **Agent Builder** (`index.html`) - Analyzes individual meetings and exports them as agents
- **Agent Orchestrator** (`orchestrator.html`) - Combines multiple agents for cross-meeting insights using the RLM pipeline

Features include multi-meeting orchestration, agent export/import, image OCR with Vision AI, and professional document generation.

> **For visual architecture diagrams**, see [README.md](README.md).
> **For detailed RLM implementation status**, see [RLM_STATUS.md](RLM_STATUS.md).
> **For Societies of Thought planning**, see [docs/societies-of-thought-implementation-plan.md](docs/societies-of-thought-implementation-plan.md).

## Architecture

```
northstar.LM/
├── index.html          # Agent Builder - main single-page app
├── orchestrator.html   # Agent Orchestrator - multi-agent analysis
├── northstar-overview.html # Product overview/marketing page
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (PWA + COOP/COEP headers)
├── css/
│   └── styles.css      # All styling (dark theme with gold accents)
├── js/
│   ├── app.js          # Main application logic (ES Module)
│   ├── orchestrator.js # Orchestrator page logic (uses RLM)
│   ├── kb-canvas.js    # Knowledge Base 3D canvas (drag-drop, SVG connections)
│   └── rlm/            # RLM-Lite module (Recursive Language Model)
│       ├── index.js        # Main entry point & RLMPipeline class
│       ├── context-store.js    # Agent data as queryable variables
│       ├── query-decomposer.js # Query analysis & sub-query generation
│       ├── sub-executor.js     # Parallel execution engine
│       ├── aggregator.js       # Response synthesis & merging
│       ├── memory-store.js     # Signal-weighted memory with focus episodes
│       ├── prompt-builder.js   # Token budgeting and prompt assembly
│       ├── query-cache.js      # LRU cache with TTL
│       ├── eval-harness.js     # Quality benchmarking scaffold
│       ├── repl-environment.js # Pyodide Web Worker interface
│       ├── repl-worker.js      # Sandboxed Python execution
│       └── code-generator.js   # Python code generation
├── images/
│   ├── k-northstar-logo.png   # Main app logo
│   └── orchestrator-logo.png  # Robot mascot for Orchestrator
├── Testing/            # Test programs and documentation
├── archive/            # Legacy files (not deployed)
└── .github/workflows/deploy.yml  # GitHub Pages deployment
```

## RLM Quick Reference

The orchestrator uses RLM-Lite for intelligent query processing. See [RLM_STATUS.md](RLM_STATUS.md) for full implementation details.

### RLM Components

| Component | File | Purpose |
|-----------|------|---------|
| **RLMPipeline** | `index.js` | Main orchestration class |
| **ContextStore** | `context-store.js` | Agent data with search indexing |
| **QueryDecomposer** | `query-decomposer.js` | Query analysis & sub-query generation |
| **SubExecutor** | `sub-executor.js` | Parallel execution with concurrency control |
| **Aggregator** | `aggregator.js` | Response synthesis with early-stop detection |
| **MemoryStore** | `memory-store.js` | Signal-weighted memory, Stage A/B retrieval |
| **PromptBuilder** | `prompt-builder.js` | Token budgeting (state block + working window + slices) |
| **QueryCache** | `query-cache.js` | LRU cache with TTL and similarity matching |
| **REPLEnvironment** | `repl-environment.js` | Pyodide Web Worker for Python execution |

### Query Strategies

| Strategy | When Used | How It Works |
|----------|-----------|--------------|
| **direct** | Simple queries, ≤2 agents | Single LLM call with combined context |
| **parallel** | Comparative queries | One sub-query per agent, run concurrently |
| **map-reduce** | Aggregate queries (all/every/across) | Map: query each agent → Reduce: synthesize |
| **iterative** | Exploratory queries | Initial query → followup if uncertain |

### RLM Configuration

```javascript
const RLM_CONFIG = {
    maxSubQueries: 25,           // Absolute ceiling
    defaultSubQueryDepth: 10,    // Starting depth
    depthIncrement: 5,           // Added per "Go Deeper"
    summaryMaxSubQueries: 4,     // Cap for full-scope summaries
    maxConcurrent: 4,            // Parallel execution limit
    maxDepth: 2,                 // Max recursion for sub_lm calls
    tokensPerSubQuery: 800,      // Token budget per sub-query
    enableLLMSynthesis: true,
    enableREPL: true,
    replTimeout: 30000,
    subLmTimeout: 60000,
    enableSyncSubLm: true
};
```

## Key Technical Decisions

### Client-Side Only
- No server-side code - everything runs in browser
- User provides their own OpenAI API key (stored in localStorage)
- API calls go directly from browser to OpenAI

### OpenAI Models Used

| Purpose | Model |
|---------|-------|
| Audio/Video Transcription | `whisper-1` |
| Text Analysis & Chat | `gpt-5.2` |
| Image/PDF Vision | `gpt-5.2` (vision) |
| Text-to-Speech | `gpt-4o-mini-tts` |
| Image Generation | `gpt-image-1.5` |

### Libraries (CDN-loaded)
- **docx.js** (`8.5.0`) - DOCX generation
- **PDF.js** (`4.0.379`) - PDF text extraction
- **marked.js** - Markdown parsing
- **Pyodide** (`0.25.0`) - In-browser Python (lazy loaded)

## Common Development Tasks

### Running Locally
```bash
npx http-server -p 3000
# or
python -m http.server 3000
```

### Cache Busting
Update version parameters in HTML files when modifying CSS/JS:
```html
<link rel="stylesheet" href="css/styles.css?v=XX">
<script src="js/app.js?v=XX" type="module"></script>
```

### Adding New Features
1. Add HTML elements to `index.html`
2. Add element references in `init()` function's `elements` object
3. Add event listeners in `setupEventListeners()`
4. Implement functionality in `app.js`
5. Add styles to `styles.css`

## State Management

### Agent Builder (`app.js`)
```javascript
const state = {
    apiKey: '',
    selectedFile: null,
    selectedPdfFile: null,
    selectedImageFile: null,
    selectedImageBase64: null,
    selectedVideoFile: null,
    inputMode: 'audio', // 'audio', 'pdf', 'image', 'video', 'text', 'url'
    isProcessing: false,
    results: null,        // transcription, summary, keyPoints, actionItems, sentiment
    metrics: null,
    chatHistory: [],
    sourceUrl: null,
    exportMeta: { /* agentId, source, processing, artifacts */ },
    urlContent: null
};
```

### Orchestrator (`orchestrator.js`)
```javascript
const state = {
    agents: [],           // Loaded agent files
    apiKey: '',
    chatHistory: [],
    insights: null,
    // ... model settings, RLM config
};
```

## Key Functions

### Agent Builder
- `updateKPIDashboard()` - Populates KPI cards
- `buildExportPayload()` / `exportAgentWithName()` - Export with embedded JSON payload
- `parseAgentFile()` - Parse markdown + JSON payload
- `importAgentSession()` - Restore session state
- `analyzeImageWithVision()` - GPT-5.2 Vision OCR
- `downloadDocx()` - Professional Word document

### Orchestrator
- `chatWithRLM()` - Process queries through RLM pipeline
- `syncAgentsToRLM()` - Keep RLM context store in sync
- `shouldUseRLM()` - Determine if RLM should be used
- `downloadMetricsCSV()` - Export metrics as CSV
- `createGroup()`, `groupByThematic()`, `groupByTemporal()` - Agent grouping

## API Patterns

### GPT-5.2 Chat Completions
```javascript
// GPT-5.2 requires max_completion_tokens, not max_tokens
// logprobs only work when effort is 'none'
body: JSON.stringify({
    model: 'gpt-5.2',
    messages: [...],
    max_completion_tokens: 1000,
    temperature: 1,  // Only when effort is 'none'
    reasoning_effort: 'medium',  // 'none', 'low', 'medium', 'high', 'xhigh'
    logprobs: true,  // Only when effort is 'none'
    top_logprobs: 1
})
```

### Token Tracking
```javascript
currentMetrics.gptInputTokens += usage.prompt_tokens || 0;
currentMetrics.gptOutputTokens += usage.completion_tokens || 0;
```

## Styling Conventions

- CSS variables in `:root` for theming
- Color scheme: Dark navy (`#0a0e17`) with gold accents (`#d4a853`)
- Fonts: 'Bebas Neue' for display, 'Source Sans 3' for body
- Collapsible sections use native `<details>` elements
- Chat markdown: gold arrow markers, gold headings, styled code blocks

## Deployment

Automatic via GitHub Actions on push to `main`.

**URLs:**
- Main App: https://mjamiv.github.io/vox2txt/
- Orchestrator: https://mjamiv.github.io/vox2txt/orchestrator.html

**Files Deployed:**
- `index.html`, `orchestrator.html`
- `css/`, `js/` (including `js/rlm/`)
- `manifest.json`, `sw.js`
- Optional: `images/`, `flowcharts/`, `static/`

Note: `archive/` folder is NOT deployed.
