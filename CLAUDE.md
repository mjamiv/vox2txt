# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

**northstar.LM** is a client-side web application that transforms meeting recordings, videos, PDFs, images, or text into actionable insights using OpenAI's AI models. The entire application runs client-side with no backend server.

The application consists of two main pages:
- **Agent Builder** (`index.html`) - Analyzes individual meetings and exports them as agents. Includes Direct/RLM toggle for chat and agenda generation.
- **Agent Orchestrator** (`orchestrator.html`) - Combines multiple agents for cross-meeting insights using the RLM pipeline

Features include multi-meeting orchestration, agent export/import, image OCR with Vision AI, professional document generation, RLM-powered chat in both applications, and voice conversation (Push-to-Talk and Real-time modes).

> **For visual architecture diagrams**, see [README.md](README.md).
> **For detailed RLM implementation status**, see [RLM_STATUS.md](RLM_STATUS.md).
> **For Societies of Thought planning**, see [docs/societies-of-thought-implementation-plan.md](docs/societies-of-thought-implementation-plan.md).
> **For RLM validation testing**, see [Testing/RLM-Validation-Study-Final-Report.html](Testing/RLM-Validation-Study-Final-Report.html).

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
│   ├── audio-worklet-processor.js  # PCM16 conversion for Realtime API
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
├── Testing/            # Test programs and validation reports
│   ├── RLM-Validation-Study-Final-Report.html  # Final peer-reviewed report
│   ├── 25-question-test/   # 25-question test data
│   ├── 50-question-test/   # 50-question test data
│   ├── 100-question-test/  # 100-question test data
│   └── archive/            # Previous report versions
├── archive/            # Legacy files (not deployed)
├── recent commits/     # Weekly progress reports (auto-generated)
│   ├── YYYY-MM-DD.md       # Daily commit tables
│   ├── weekly-summary.md   # Narrative weekly summary
│   └── weekly-summary.html # HTML version of summary
└── .github/workflows/deploy.yml  # GitHub Pages deployment
```

## RLM Quick Reference

Both the Agent Builder and Orchestrator use RLM-Lite for intelligent query processing. The Agent Builder includes a Direct/RLM toggle (defaults to RLM) for chat and agenda generation. See [RLM_STATUS.md](RLM_STATUS.md) for full implementation details.

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

### Infographic Style Presets

The Agent Builder includes 4 infographic style presets with a consistent black/gold/white theme:

| Preset | Description |
|--------|-------------|
| **Executive** | Premium corporate style with gold accents and strong visual hierarchy |
| **Dashboard** | Data visualization focused with charts, gauges, and KPI cards |
| **Action Board** | Task/checklist focused with priority badges and progress indicators |
| **Timeline** | Chronological flow with milestone markers and event cards |

**Design specifications:**
- Colors: Black (#0a0a0a) background, gold (#d4a853) and yellow (#fbbf24) accents, white text
- Headers: Bold condensed fonts (Impact/Bebas Neue style)
- Body: Clean sans-serif (Acumin Pro style)

Custom prompts override presets when provided. Presets are defined in `INFOGRAPHIC_PRESETS` constant in `app.js`.

### Voice Chat

The Agent Builder includes voice conversation capability with two modes:

| Mode | Description | Cost | Best For |
|------|-------------|------|----------|
| **Push-to-Talk** | Hold mic → Whisper → Chat → TTS | ~$0.02/exchange | Controlled interactions |
| **Real-time** | Continuous WebSocket streaming | ~$0.30/min | Natural conversation |

**Push-to-Talk Flow:**
```
[Hold button] → [MediaRecorder] → [Whisper API] → [Chat API] → [TTS API] → [Playback]
```

**Real-time Flow:**
```
[Microphone] ←→ [WebSocket @ 24kHz PCM16] ←→ [OpenAI Realtime API] ←→ [Playback]
```

**Key Files:**
- `js/app.js` - Voice recording, WebSocket management, audio playback
- `js/audio-worklet-processor.js` - PCM16 audio conversion for Realtime API

**GA Realtime API Session Format:**
```javascript
{
    type: 'session.update',
    session: {
        type: 'realtime',
        output_modalities: ['audio'],
        instructions: '...',
        audio: {
            input: {
                format: { type: 'audio/pcm', rate: 24000 },
                turn_detection: { type: 'server_vad', ... }
            },
            output: {
                format: { type: 'audio/pcm', rate: 24000 },
                voice: 'marin'
            }
        }
    }
}
```

> **For detailed implementation guide**, see [docs/voice-chat-implementation-guide.md](docs/voice-chat-implementation-guide.md).

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
| Real-time Voice | `gpt-4o-realtime-preview-2024-12-17` |

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
    chatMode: 'direct',   // 'direct' or 'rlm' - controls chat and agenda processing
    sourceUrl: null,
    exportMeta: { /* agentId, source, processing, artifacts */ },
    urlContent: null,
    // Voice chat
    isRecording: false,
    voiceResponseEnabled: true,
    voiceMode: 'push-to-talk',  // 'push-to-talk' or 'realtime'
    realtimeActive: false,
    realtimeSessionCost: 0
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
- `chatWithRLM()` - Process chat queries through RLM pipeline
- `syncMeetingToRLM()` - Load meeting data into RLM context store
- `updateChatModeUI()` - Update Direct/RLM toggle visual state
- `generateAgenda()` - Auto-generates half-page agenda when analysis completes (uses RLM when enabled)
- `generateInfographic()` - Generate visual infographic using preset or custom style
- **Custom Audio Player**
  - `initAudioPlayerControls()` - Set up custom audio player event listeners
  - `toggleAudioPlayback()` - Play/pause control
  - `updateAudioProgress()` - Update progress bar and time display
  - `seekAudio()` - Click-to-seek on progress bar
  - `handleVolumeChange()` / `toggleMute()` - Volume and mute controls
- **Chat Reminder**
  - `showChatReminder()` - Shows tooltip 5 seconds after results (once per session)
  - `hideChatReminder()` - Dismisses the reminder tooltip
- **Voice Chat (Push-to-Talk)**
  - `startVoiceRecording()` - Begin audio capture with volume visualization
  - `stopVoiceRecording()` - Stop recording and process audio
  - `transcribeVoiceInput()` - Send audio to Whisper API
  - `speakResponse()` - Convert text to speech via TTS API
- **Voice Chat (Real-time)**
  - `startRealtimeConversation()` - Initialize WebSocket connection to Realtime API
  - `stopRealtimeConversation()` - Cleanup WebSocket and audio resources
  - `startRealtimeAudioStream()` - Begin PCM16 audio streaming via AudioWorklet
  - `handleRealtimeMessage()` - Process incoming WebSocket messages
  - `playRealtimeAudioChunk()` - Queue and play PCM16 audio responses

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
- Collapsible sections use native `<details>` elements (Key Points, Action Items, Agenda, Infographic default collapsed)
- Chat markdown: gold arrow markers, gold headings, styled code blocks
- Custom audio player with gold circular play button, progress bar, volume slider
- Floating chat widget defaults to bottom-left with reminder tooltip

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
