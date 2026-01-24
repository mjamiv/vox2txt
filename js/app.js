/**
 * northstar.LM - Client-Side Application
 * Transforms meeting audio/text/PDF into actionable insights using OpenAI
 */

// ============================================
// RLM Pipeline Import
// ============================================
import { getRLMPipeline } from './rlm/index.js';

// RLM Pipeline Instance (initialized in init())
let rlmPipeline = null;

// ============================================
// PDF.js Configuration
// ============================================
const pdfjsLib = window['pdfjs-dist/build/pdf'] || null;
let pdfJsLoaded = false;

// Load PDF.js dynamically
async function loadPdfJs() {
    if (pdfJsLoaded) return;
    
    try {
        const pdfjsModule = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
        window.pdfjsLib = pdfjsModule;
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
        pdfJsLoaded = true;
    } catch (e) {
        console.error('Failed to load PDF.js:', e);
    }
}

// ============================================
// State Management
// ============================================
const state = {
    apiKey: '',
    selectedFile: null,
    selectedPdfFile: null,
    selectedImageFile: null,
    selectedImageBase64: null, // Base64-encoded image for Vision API
    selectedVideoFile: null,
    inputMode: 'audio', // 'audio', 'pdf', 'image', 'video', 'text', or 'url'
    isProcessing: false,
    results: null,
    metrics: null,
    chatHistory: [], // Stores chat conversation history
    chatMode: 'direct', // 'direct' or 'rlm' - default to Direct for single-meeting chat
    isRecording: false, // Voice recording state
    voiceResponseEnabled: true, // Whether to speak responses aloud
    voiceMode: 'push-to-talk', // 'push-to-talk' or 'realtime'
    realtimeActive: false, // Whether real-time session is active
    realtimeSessionCost: 0, // Running cost of real-time session
    sourceUrl: null,
    exportMeta: {
        agentId: null,
        source: {
            audio: null,
            pdf: null,
            image: null,
            video: null,
            url: null
        },
        processing: {
            inputMode: null,
            analysis: null,
            transcriptionMethod: null,
            pdf: {
                totalPages: null,
                usedVisionOcr: false,
                ocrPagesAnalyzed: 0,
                ocrPageLimit: 0
            }
        },
        artifacts: {
            audioBriefing: null,
            infographic: null
        }
    },
    urlContent: null // Stores fetched URL content
};

// ============================================
// Chat Widget State
// ============================================
const chatWidgetState = {
    isExpanded: false,
    isDragging: false,
    position: { x: null, y: null },
    anchor: 'bottom-right',  // 'bottom-right', 'bottom-left', 'top-right', 'top-left'
    unreadCount: 0,
    dragOffset: { x: 0, y: 0 }
};

const GPT_52_MODEL = 'gpt-5.2-2025-12-11';

function isCorsError(error) {
    if (!error) {
        return false;
    }
    return error.name === 'TypeError' && /failed to fetch|networkerror|load resource/i.test(error.message || '');
}

function buildCorsErrorMessage() {
    return 'Browser blocked this request due to CORS. When running from GitHub Pages, you must route OpenAI API calls through your own backend/proxy so the response includes Access-Control-Allow-Origin.';
}

async function fetchOpenAI(url, options) {
    try {
        return await fetch(url, options);
    } catch (error) {
        if (isCorsError(error)) {
            throw new Error(buildCorsErrorMessage());
        }
        throw error;
    }
}

// ============================================
// Pricing Configuration (per 1M tokens / per minute / per unit)
// ============================================
const PRICING = {
    'gpt-5.2': {
        input: 1.75,   // $ per 1M input tokens
        output: 14.00  // $ per 1M output tokens
    },
    'gpt-5.2-2025-12-11': {
        input: 1.75,   // $ per 1M input tokens
        output: 14.00  // $ per 1M output tokens
    },
    'whisper-1': {
        perMinute: 0.006  // $ per minute of audio
    },
    'gpt-4o-mini-tts': {
        perKChars: 0.015  // $ per 1K characters (estimated)
    },
    'gpt-image-1.5': {
        input: 10.00,   // $ per 1M input tokens
        output: 40.00   // $ per 1M output tokens (image generation)
    }
};

const PROMPTS = {
    analysisBatchSystem: `You are an expert meeting analyst. Analyze the following meeting transcript and provide a comprehensive analysis in JSON format:

{
  "summary": "A concise abstract paragraph summarizing the meeting. Retain the most important points, providing a coherent and readable summary.",

  "keyPoints": "List of main points discussed, separated by newlines. Start each point with a dash (-). These should be the most important ideas, findings, or topics.",

  "actionItems": "List of specific tasks or action items assigned or discussed, separated by newlines. Start each item with a dash (-). If none found, respond with 'No specific action items identified.'",

  "sentiment": "Overall sentiment: exactly one of 'Positive', 'Negative', or 'Neutral'.",

  "meetingType": "Classify the meeting type. Choose exactly one: 'planning', 'review', 'standup', 'brainstorm', 'decision', 'retrospective', 'report', 'general'.",

  "keyEntities": {
    "people": ["Names of individuals mentioned (max 10)"],
    "projects": ["Project or initiative names mentioned (max 5)"],
    "organizations": ["Teams, departments, or companies mentioned (max 5)"],
    "products": ["Products, features, or tools mentioned (max 5)"]
  },

  "temporalContext": {
    "quarter": "Quarter mentioned (e.g., 'Q4 2025') or null if not specified",
    "explicitDates": ["Any specific dates mentioned in YYYY-MM-DD format"],
    "deadlines": ["Deadline descriptions if mentioned"],
    "timeframe": "Primary focus: 'past' (retrospective), 'present' (status), or 'future' (planning)"
  },

  "topicTags": ["3-7 lowercase semantic topic tags extracted from content, e.g., 'budget', 'hiring', 'product-launch'"],

  "contentSignals": {
    "riskMentions": 0,
    "decisionsMade": 0,
    "actionsAssigned": 0,
    "questionsRaised": 0,
    "conflictIndicators": 0
  },

  "suggestedPerspective": "Based on content focus, suggest the most appropriate analysis perspective. Choose one: 'analyst' (data-heavy), 'advocate' (opportunity-focused), 'critic' (risk-heavy), 'synthesizer' (pattern-finding), 'historian' (timeline-focused), 'pragmatist' (action-heavy), 'stakeholder' (people-focused)."
}

Ensure your response is valid JSON only, no additional text.`,
    summarySystem: `You are a highly skilled AI trained in language comprehension and summarization.
Read the following text and summarize it into a concise abstract paragraph.
Retain the most important points, providing a coherent and readable summary that helps someone understand the main points without reading the entire text.
Avoid unnecessary details or tangential points.`,
    keyPointsSystem: `You are a proficient AI with a specialty in distilling information into key points. 
Based on the following text, identify and list the main points that were discussed or brought up. 
These should be the most important ideas, findings, or topics that are crucial to the essence of the discussion. 
Format each point on its own line starting with a dash (-).`,
    actionItemsSystem: `You are a highly skilled AI trained in identifying action items. 
Review the following text and identify any specific tasks or action items that were assigned or discussed. 
Format each action item on its own line starting with a dash (-).
If no action items are found, respond with "No specific action items identified."`,
    sentimentSystem: `You are an AI trained in sentiment analysis. 
Analyze the overall sentiment of the following text. 
Respond with exactly one word: "Positive", "Negative", or "Neutral".`,
    visionOcrSystem: `You are an expert at analyzing images of documents, meeting notes, whiteboards, diagrams, and other visual content.

Your task is to extract and transcribe ALL text content visible in the image, and describe any relevant visual elements (diagrams, charts, drawings, etc.) that provide context.

Format your response as follows:
1. First, provide a complete transcription of all visible text, preserving the original structure as much as possible
2. Then describe any diagrams, charts, or visual elements
3. Finally, summarize what this image appears to be about

Be thorough and capture every piece of text visible in the image.`,
    audioBriefingSystem: 'You create professional executive audio briefings.',
    agendaSystem: `You are a meeting facilitator creating concise agendas.

CRITICAL RULES:
- Output must fit on HALF A PAGE (200-300 words max)
- Include only 4-6 big-picture sections
- Use time RANGES (e.g., "3-5 min"), not exact minutes
- Maximum 2 bullet points per section
- No detailed sub-items, preparation notes, or attendee lists
- Focus on WHAT, not HOW

FORMAT:
[Meeting Title] — Agenda
Target duration: [X-Y] minutes

[Section 1] ([time range])
- [1-2 bullets max]

[Section 2] ([time range])
- [1-2 bullets max]

... (4-6 sections total)`,
    agendaQuery: `Create a half-page follow-up meeting agenda.
Focus only on: action item review, key decisions needed, critical updates.
Keep it scannable - big picture items only, no details.`
};

// Infographic Style Presets
const INFOGRAPHIC_PRESETS = {
    executive: {
        name: 'Executive Summary',
        style: `Premium executive infographic with a BOLD, STRIKING design.

MANDATORY COLOR SCHEME:
- Background: Deep black (#0a0a0a) with subtle gold gradient accents
- Primary accent: Rich gold (#d4a853) and warm yellow (#fbbf24) for highlights
- Text: Clean white (#ffffff) for readability
- Secondary: Charcoal gray (#1a1a1a) for depth and cards

TYPOGRAPHY (CRITICAL):
- Headers: Bold condensed sans-serif (like Impact, Bebas Neue, or Oswald style) - strong, commanding presence
- Body text: Clean modern sans-serif (like Acumin Pro or Source Sans) - professional and readable
- Numbers/stats: Extra bold, oversized for visual impact

DESIGN STYLE:
- Sleek, modern corporate aesthetic with dramatic visual hierarchy
- Large bold header at top with gold underline accent
- 3-4 key insight cards with black backgrounds and gold borders
- Prominent statistics displayed as large numbers with gold highlights
- Minimalist icons in gold/white
- Subtle geometric patterns or lines for sophistication
- Strong contrast between elements
- Professional but visually exciting - NOT boring or generic`
    },
    dashboard: {
        name: 'Data Dashboard',
        style: `Dynamic data visualization dashboard with energetic design.

MANDATORY COLOR SCHEME:
- Background: Rich black (#0d0d0d) with depth
- Primary: Vibrant gold (#d4a853) and electric yellow (#facc15)
- Accent: Warm amber (#f59e0b) for charts and graphs
- Text: Crisp white (#ffffff)
- Cards: Dark charcoal (#1f1f1f) with gold glow effects

TYPOGRAPHY (CRITICAL):
- Headers: Heavy condensed typeface (Impact/Bebas Neue style) - bold and powerful
- Data labels: Clean sans-serif (Acumin Pro style)
- Numbers: Extra bold, large scale

DESIGN STYLE:
- Modern analytics dashboard aesthetic
- Circular progress rings and gauges in gold/yellow
- Bar charts and metrics with gradient fills
- KPI cards with glowing gold borders
- Percentage displays and trend indicators
- Grid layout with clear visual sections
- Data-driven but visually stunning
- Avoid flat/boring - make it dynamic and engaging`
    },
    action: {
        name: 'Action Board',
        style: `Bold action-focused task board with high-impact design.

MANDATORY COLOR SCHEME:
- Background: Jet black (#0a0a0a)
- Primary: Gold (#d4a853) for priorities and highlights
- Secondary: Bright yellow (#fde047) for urgent items
- Checkmarks/success: Gold with white
- Text: Pure white (#ffffff)
- Cards: Dark gray (#1a1a1a) with gold accents

TYPOGRAPHY (CRITICAL):
- Headers: Extra bold condensed (Impact/Bebas style) - attention-grabbing
- Task text: Clean readable sans-serif (Acumin Pro style)
- Priority labels: Bold uppercase

DESIGN STYLE:
- Kanban/task board inspired layout
- Large checkbox icons with gold fills when complete
- Priority badges with gold/yellow gradients
- Owner avatars or initials in gold circles
- Due dates with visual urgency indicators
- Clear task cards with subtle gold borders
- Progress bars in gold gradient
- Energetic, motivating design - NOT a plain checklist`
    },
    timeline: {
        name: 'Timeline Flow',
        style: `Striking timeline infographic with cinematic design.

MANDATORY COLOR SCHEME:
- Background: Deep black (#0a0a0a) with subtle texture
- Timeline line: Bold gold (#d4a853) gradient
- Milestone markers: Glowing gold/yellow (#fbbf24)
- Text: Clean white (#ffffff)
- Event cards: Charcoal (#1a1a1a) with gold highlights

TYPOGRAPHY (CRITICAL):
- Headers: Bold condensed display font (Impact/Bebas style) - dramatic presence
- Event titles: Strong sans-serif
- Dates/labels: Clean modern type (Acumin Pro style)

DESIGN STYLE:
- Horizontal or diagonal timeline flow
- Large gold milestone markers with glow effects
- Event cards branching from the timeline
- Connecting lines and arrows in gold
- Key moments highlighted with yellow bursts
- Date stamps with elegant typography
- Flow and progression clearly visible
- Cinematic, premium feel - NOT a basic timeline`
    }
};

// Currently selected infographic preset
let selectedInfographicPreset = 'executive';

// Metrics tracking for current run
let currentMetrics = {
    whisperMinutes: 0,
    gptInputTokens: 0,
    gptOutputTokens: 0,
    chatInputTokens: 0,
    chatOutputTokens: 0,
    ttsCharacters: 0,
    imageInputTokens: 0,
    imageOutputTokens: 0,
    apiCalls: []
};

// Store generated audio/image data for download
let generatedAudioUrl = null;
let generatedAudioBase64 = null;
let generatedImageUrl = null;
let generatedImageBase64 = null; // Store base64 for DOCX embedding

// ============================================
// DOM Elements (initialized in init())
// ============================================
let elements = {};

// ============================================
// Initialization
// ============================================
async function init() {
    // Initialize DOM element references
    elements = {
        // API Key
        apiKeyInput: document.getElementById('api-key'),
        toggleKeyBtn: document.getElementById('toggle-key'),
        saveKeyBtn: document.getElementById('save-key'),
        apiKeyContainer: document.getElementById('api-key-container'),
        apiKeyCollapsed: document.getElementById('api-key-collapsed'),
        expandKeyBtn: document.getElementById('expand-key-btn'),
        
        // Tabs
        tabBtns: document.querySelectorAll('.tab-btn'),
        uploadTab: document.getElementById('upload-tab'),
        textTab: document.getElementById('text-tab'),
        urlTab: document.getElementById('url-tab'),
        importTab: document.getElementById('import-tab'),

        // Unified Upload
        unifiedDropZone: document.getElementById('unified-drop-zone'),
        unifiedFileInput: document.getElementById('unified-file'),
        unifiedFileInfo: document.getElementById('unified-file-info'),
        fileTypeIcon: document.getElementById('file-type-icon'),
        selectedFileName: document.getElementById('selected-file-name'),
        fileTypeBadge: document.getElementById('file-type-badge'),
        removeUnifiedFileBtn: document.getElementById('remove-unified-file'),
        imagePreview: document.getElementById('image-preview'),
        imagePreviewImg: document.getElementById('image-preview-img'),

        // Agent Import
        agentDropZone: document.getElementById('agent-drop-zone'),
        agentFileInput: document.getElementById('agent-file'),

        // Text Input
        textInput: document.getElementById('text-input'),
        
        // Actions
        analyzeBtn: document.getElementById('analyze-btn'),
        downloadBtn: document.getElementById('download-btn'),
        newAnalysisBtn: document.getElementById('new-analysis-btn'),
        
        // Progress
        progressSection: document.getElementById('progress-section'),
        progressFill: document.querySelector('.progress-fill'),
        progressText: document.querySelector('.progress-text'),
        
        // Results
        resultsSection: document.getElementById('results-section'),
        resultSummary: document.getElementById('result-summary'),
        resultKeypoints: document.getElementById('result-keypoints'),
        resultActions: document.getElementById('result-actions'),
        resultAgenda: document.getElementById('result-agenda'),
        agendaSection: document.getElementById('agenda-section'),

        // Agenda
        makeAgendaBtn: document.getElementById('make-agenda-btn'),

        // Export Dropdown
        exportMenuBtn: document.getElementById('export-menu-btn'),
        exportDropdown: document.getElementById('export-dropdown'),

        // Generate Dropdown
        generateMenuBtn: document.getElementById('generate-menu-btn'),
        generateDropdown: document.getElementById('generate-dropdown'),
        generateAudioMenuBtn: document.getElementById('generate-audio-menu-btn'),
        generateInfographicMenuBtn: document.getElementById('generate-infographic-menu-btn'),

        // Error
        errorSection: document.getElementById('error-section'),
        errorMessage: document.getElementById('error-message'),
        dismissErrorBtn: document.getElementById('dismiss-error'),
        
        // Audio Briefing
        audioPrompt: document.getElementById('audio-prompt'),
        voiceSelect: document.getElementById('voice-select'),
        generateAudioBtn: document.getElementById('generate-audio-btn'),
        audioPlayerContainer: document.getElementById('audio-player-container'),
        audioPlayer: document.getElementById('audio-player'),
        downloadAudioBtn: document.getElementById('download-audio-btn'),
        
        // Infographic
        infographicPrompt: document.getElementById('infographic-prompt'),
        generateInfographicBtn: document.getElementById('generate-infographic-btn'),
        infographicContainer: document.getElementById('infographic-container'),
        infographicImage: document.getElementById('infographic-image'),
        downloadInfographicBtn: document.getElementById('download-infographic-btn'),
        infographicPresetBtns: document.querySelectorAll('.preset-btn'),
        
        // Chat with Data
        chatMessages: document.getElementById('chat-messages'),
        chatInput: document.getElementById('chat-input'),
        chatSendBtn: document.getElementById('chat-send-btn'),
        clearChatBtn: document.getElementById('clear-chat-btn'),

        // Voice Chat
        voiceInputBtn: document.getElementById('voice-input-btn'),
        voiceResponseToggle: document.getElementById('voice-response-toggle'),
        voiceRecordingStatus: document.getElementById('voice-recording-status'),
        voiceStatusText: document.getElementById('voice-status-text'),
        voiceVolumeBar: document.getElementById('voice-volume-bar'),

        // Real-time Voice
        voiceModeBtns: document.querySelectorAll('.voice-mode-btn'),
        realtimePanel: document.getElementById('realtime-panel'),
        startRealtimeBtn: document.getElementById('start-realtime-btn'),
        stopRealtimeBtn: document.getElementById('stop-realtime-btn'),
        realtimeStatus: document.getElementById('realtime-status'),
        realtimeStatusText: document.getElementById('realtime-status-text'),
        realtimeCost: document.getElementById('realtime-cost'),

        // URL Input
        urlTab: document.getElementById('url-tab'),
        urlInput: document.getElementById('url-input'),
        fetchUrlBtn: document.getElementById('fetch-url-btn'),
        urlPreview: document.getElementById('url-preview'),
        urlPreviewContent: document.getElementById('url-preview-content'),
        clearUrlBtn: document.querySelector('.clear-url-btn'),
        
        // Agent Export
        exportAgentBtn: document.getElementById('export-agent-btn'),
        
        // Agent Name Modal
        agentNameModal: document.getElementById('agent-name-modal'),
        agentNameInput: document.getElementById('agent-name-input'),
        agentNameHint: document.getElementById('agent-name-hint'),
        modalCloseBtn: document.getElementById('modal-close-btn'),
        modalCancelBtn: document.getElementById('modal-cancel-btn'),
        modalConfirmBtn: document.getElementById('modal-confirm-btn'),
        
        // Help Modal
        helpBtn: document.getElementById('help-btn'),
        helpModal: document.getElementById('help-modal'),
        helpCloseBtn: document.getElementById('help-close-btn'),
        helpGotItBtn: document.getElementById('help-got-it-btn'),
        
        // About Dropdown
        aboutBtn: document.getElementById('about-btn'),
        aboutDropdown: document.getElementById('about-dropdown'),

        // Settings Panel
        settingsBtn: document.getElementById('settings-btn'),
        settingsPanel: document.getElementById('settings-panel'),
        settingsOverlay: document.getElementById('settings-overlay'),
        settingsClose: document.getElementById('settings-close'),
        settingsApiKey: document.getElementById('settings-api-key'),
        settingsToggleKey: document.getElementById('settings-toggle-key'),
        settingsVoiceResponse: document.getElementById('settings-voice-response'),
        settingsVoice: document.getElementById('settings-voice'),
        settingsShowMetrics: document.getElementById('settings-show-metrics'),
        settingsDebugMode: document.getElementById('settings-debug-mode'),

        // Floating Chat Widget
        chatWidget: document.getElementById('chat-widget'),
        chatWidgetToggle: document.getElementById('chat-widget-toggle'),
        chatWidgetMinimize: document.getElementById('chat-widget-minimize'),
        chatWidgetHeader: document.getElementById('chat-widget-header'),
        chatUnreadBadge: document.getElementById('chat-unread-badge'),
        anchorZones: document.getElementById('anchor-zones')
    };

    loadSavedApiKey();
    loadSettings();
    setupEventListeners();
    updateAnalyzeButton();

    // Pre-load PDF.js in the background
    loadPdfJs();

    // Initialize RLM pipeline
    rlmPipeline = getRLMPipeline();
    console.log('[RLM] Pipeline initialized for Agent Builder');

    // Initialize chat widget
    initChatWidget();
}

function loadSavedApiKey() {
    const savedKey = localStorage.getItem('northstar_api_key');
    if (savedKey) {
        state.apiKey = savedKey;
        elements.apiKeyInput.value = savedKey;
        collapseApiKeySection();
    }
}

function collapseApiKeySection() {
    if (elements.apiKeyContainer && elements.apiKeyCollapsed) {
        elements.apiKeyContainer.classList.add('hidden');
        elements.apiKeyCollapsed.classList.remove('hidden');
    }
}

function expandApiKeySection() {
    if (elements.apiKeyContainer && elements.apiKeyCollapsed) {
        elements.apiKeyContainer.classList.remove('hidden');
        elements.apiKeyCollapsed.classList.add('hidden');
    }
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
    // API Key
    elements.apiKeyInput.addEventListener('input', handleApiKeyChange);
    elements.toggleKeyBtn.addEventListener('click', toggleApiKeyVisibility);
    elements.saveKeyBtn.addEventListener('click', saveApiKey);
    if (elements.expandKeyBtn) {
        elements.expandKeyBtn.addEventListener('click', expandApiKeySection);
    }
    
    // Tabs
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Unified File Upload
    if (elements.unifiedDropZone) {
        elements.unifiedDropZone.addEventListener('dragover', handleUnifiedDragOver);
        elements.unifiedDropZone.addEventListener('dragleave', handleUnifiedDragLeave);
        elements.unifiedDropZone.addEventListener('drop', handleUnifiedDrop);
    }
    if (elements.unifiedFileInput) {
        elements.unifiedFileInput.addEventListener('change', handleUnifiedFileSelect);
    }
    if (elements.removeUnifiedFileBtn) {
        elements.removeUnifiedFileBtn.addEventListener('click', clearUnifiedFile);
    }

    // Agent Import
    if (elements.agentFileInput) {
        elements.agentFileInput.addEventListener('change', handleAgentFileSelect);
    }

    // Text Input
    elements.textInput.addEventListener('input', updateAnalyzeButton);
    
    // Actions
    elements.analyzeBtn.addEventListener('click', startAnalysis);
    elements.newAnalysisBtn.addEventListener('click', resetForNewAnalysis);
    elements.dismissErrorBtn.addEventListener('click', hideError);

    // Export Dropdown
    if (elements.exportMenuBtn) {
        elements.exportMenuBtn.addEventListener('click', toggleExportDropdown);
    }
    if (elements.downloadBtn) {
        elements.downloadBtn.addEventListener('click', () => {
            downloadDocx();
            closeExportDropdown();
        });
    }

    // Generate Dropdown
    if (elements.generateMenuBtn) {
        elements.generateMenuBtn.addEventListener('click', toggleGenerateDropdown);
    }
    if (elements.generateAudioMenuBtn) {
        elements.generateAudioMenuBtn.addEventListener('click', () => {
            generateAudioBriefing();
            closeGenerateDropdown();
        });
    }
    if (elements.generateInfographicMenuBtn) {
        elements.generateInfographicMenuBtn.addEventListener('click', () => {
            generateInfographic();
            closeGenerateDropdown();
        });
    }
    if (elements.makeAgendaBtn) {
        elements.makeAgendaBtn.addEventListener('click', () => {
            generateAgenda();
            closeGenerateDropdown();
        });
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        // Close export dropdown
        if (elements.exportDropdown && !elements.exportDropdown.classList.contains('hidden')) {
            const container = document.querySelector('.export-dropdown-container');
            if (container && !container.contains(e.target)) {
                closeExportDropdown();
            }
        }
        // Close generate dropdown
        if (elements.generateDropdown && !elements.generateDropdown.classList.contains('hidden')) {
            const container = document.querySelector('.generate-dropdown-container');
            if (container && !container.contains(e.target)) {
                closeGenerateDropdown();
            }
        }
    });

    // Audio Briefing (from dedicated section, if exists)
    if (elements.generateAudioBtn) {
        elements.generateAudioBtn.addEventListener('click', generateAudioBriefing);
    }
    if (elements.downloadAudioBtn) {
        elements.downloadAudioBtn.addEventListener('click', downloadAudio);
    }

    // Infographic (from dedicated section, if exists)
    if (elements.generateInfographicBtn) {
        elements.generateInfographicBtn.addEventListener('click', generateInfographic);
    }
    if (elements.downloadInfographicBtn) {
        elements.downloadInfographicBtn.addEventListener('click', downloadInfographic);
    }

    // Infographic Preset Selection (if preset buttons exist)
    if (elements.infographicPresetBtns && elements.infographicPresetBtns.length > 0) {
        elements.infographicPresetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update selection state
                elements.infographicPresetBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedInfographicPreset = btn.dataset.preset;
                console.log('[Infographic] Preset selected:', selectedInfographicPreset);
            });
        });
    }

    // Chat with Data
    elements.chatSendBtn.addEventListener('click', sendChatMessage);
    elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    // Voice Input - Push-to-talk
    if (elements.voiceInputBtn) {
        elements.voiceInputBtn.addEventListener('mousedown', startVoiceRecording);
        elements.voiceInputBtn.addEventListener('mouseup', stopVoiceRecording);
        elements.voiceInputBtn.addEventListener('mouseleave', () => {
            if (state.isRecording) stopVoiceRecording();
        });

        // Touch support for mobile
        elements.voiceInputBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startVoiceRecording();
        });
        elements.voiceInputBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            stopVoiceRecording();
        });
    }

    // Voice Response Toggle
    if (elements.voiceResponseToggle) {
        elements.voiceResponseToggle.addEventListener('change', (e) => {
            state.voiceResponseEnabled = e.target.checked;
            console.log('[Voice] Response enabled:', state.voiceResponseEnabled);
        });
    }

    // Clear Chat Button
    if (elements.clearChatBtn) {
        elements.clearChatBtn.addEventListener('click', resetChatHistory);
    }

    // Voice Mode Selector
    elements.voiceModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.voiceModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.voiceMode = btn.dataset.mode;
            updateVoiceModeUI();
            console.log('[Voice] Mode switched to:', state.voiceMode);
        });
    });

    // Real-time Voice Controls
    if (elements.startRealtimeBtn) {
        elements.startRealtimeBtn.addEventListener('click', startRealtimeConversation);
    }
    if (elements.stopRealtimeBtn) {
        elements.stopRealtimeBtn.addEventListener('click', stopRealtimeConversation);
    }

    // URL Input
    elements.fetchUrlBtn.addEventListener('click', fetchUrlContent);
    elements.urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            fetchUrlContent();
        }
    });
    elements.urlInput.addEventListener('input', updateAnalyzeButton);
    elements.clearUrlBtn.addEventListener('click', clearUrlContent);
    
    // Agent Export (in dropdown)
    if (elements.exportAgentBtn) {
        elements.exportAgentBtn.addEventListener('click', () => {
            showAgentNameModal();
            closeExportDropdown();
        });
    }

    // Make Agenda (in dropdown)
    if (elements.makeAgendaBtn) {
        elements.makeAgendaBtn.addEventListener('click', () => {
            generateAgenda();
            closeExportDropdown();
        });
    }

    // Agent Name Modal
    elements.modalCloseBtn.addEventListener('click', hideAgentNameModal);
    elements.modalCancelBtn.addEventListener('click', hideAgentNameModal);
    elements.modalConfirmBtn.addEventListener('click', confirmExportAgent);
    elements.agentNameModal.addEventListener('click', (e) => {
        if (e.target === elements.agentNameModal) hideAgentNameModal();
    });
    elements.agentNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') confirmExportAgent();
    });
    
    // Help Modal
    elements.helpBtn.addEventListener('click', showHelpModal);
    elements.helpCloseBtn.addEventListener('click', hideHelpModal);
    elements.helpGotItBtn.addEventListener('click', hideHelpModal);
    elements.helpModal.addEventListener('click', (e) => {
        if (e.target === elements.helpModal) hideHelpModal();
    });
    
    // About Dropdown
    if (elements.aboutBtn && elements.aboutDropdown) {
        elements.aboutBtn.addEventListener('click', toggleAboutDropdown);
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!elements.aboutBtn.contains(e.target) && !elements.aboutDropdown.contains(e.target)) {
                elements.aboutDropdown.classList.add('hidden');
            }
        });
    }

    // Settings Panel
    if (elements.settingsBtn) {
        elements.settingsBtn.addEventListener('click', openSettingsPanel);
    }
    if (elements.settingsClose) {
        elements.settingsClose.addEventListener('click', closeSettingsPanel);
    }
    if (elements.settingsOverlay) {
        elements.settingsOverlay.addEventListener('click', closeSettingsPanel);
    }
    if (elements.settingsToggleKey) {
        elements.settingsToggleKey.addEventListener('click', toggleSettingsApiKeyVisibility);
    }
    if (elements.settingsApiKey) {
        elements.settingsApiKey.addEventListener('change', saveSettingsApiKey);
        elements.settingsApiKey.addEventListener('blur', saveSettingsApiKey);
    }
    if (elements.settingsVoiceResponse) {
        elements.settingsVoiceResponse.addEventListener('change', saveSettings);
    }
    if (elements.settingsVoice) {
        elements.settingsVoice.addEventListener('change', saveSettings);
    }
    if (elements.settingsShowMetrics) {
        elements.settingsShowMetrics.addEventListener('change', handleMetricsToggle);
    }
    if (elements.settingsDebugMode) {
        elements.settingsDebugMode.addEventListener('change', saveSettings);
    }
    // Close settings panel with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.settingsPanel && elements.settingsPanel.classList.contains('visible')) {
            closeSettingsPanel();
        }
    });

}

// ============================================
// Export Dropdown & Mobile Bottom Sheet
// ============================================
function toggleExportDropdown() {
    // On mobile, show bottom sheet instead
    if (window.innerWidth <= 600) {
        showExportBottomSheet();
        return;
    }

    if (elements.exportDropdown) {
        // Close generate dropdown if open
        closeGenerateDropdown();
        elements.exportDropdown.classList.toggle('hidden');
        const container = document.querySelector('.export-dropdown-container');
        if (container) {
            container.classList.toggle('open', !elements.exportDropdown.classList.contains('hidden'));
        }
    }
}

function closeExportDropdown() {
    if (elements.exportDropdown) {
        elements.exportDropdown.classList.add('hidden');
        const container = document.querySelector('.export-dropdown-container');
        if (container) {
            container.classList.remove('open');
        }
    }
}

function toggleGenerateDropdown() {
    // On mobile, show bottom sheet instead
    if (window.innerWidth <= 600) {
        showGenerateBottomSheet();
        return;
    }

    if (elements.generateDropdown) {
        // Close export dropdown if open
        closeExportDropdown();
        elements.generateDropdown.classList.toggle('hidden');
        const container = document.querySelector('.generate-dropdown-container');
        if (container) {
            container.classList.toggle('open', !elements.generateDropdown.classList.contains('hidden'));
        }
    }
}

function closeGenerateDropdown() {
    if (elements.generateDropdown) {
        elements.generateDropdown.classList.add('hidden');
        const container = document.querySelector('.generate-dropdown-container');
        if (container) {
            container.classList.remove('open');
        }
    }
}

function showExportBottomSheet() {
    // Remove any existing bottom sheet
    const existing = document.querySelector('.bottom-sheet-overlay');
    if (existing) existing.remove();

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
                    <span class="sheet-hint">.docx</span>
                </button>
                <button class="sheet-item" data-action="agent">
                    <span class="sheet-icon">🤖</span>
                    <span class="sheet-label">Agent File</span>
                    <span class="sheet-hint">.md</span>
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

    // Close on escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeBottomSheet(sheet);
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function showGenerateBottomSheet() {
    // Remove any existing bottom sheet
    const existing = document.querySelector('.bottom-sheet-overlay');
    if (existing) existing.remove();

    const sheet = document.createElement('div');
    sheet.className = 'bottom-sheet-overlay';
    sheet.innerHTML = `
        <div class="bottom-sheet">
            <div class="bottom-sheet-handle"></div>
            <div class="bottom-sheet-header">
                <h3>Generate</h3>
            </div>
            <div class="bottom-sheet-content">
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
            handleGenerateAction(item.dataset.action);
            closeBottomSheet(sheet);
        });
    });

    // Close on escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeBottomSheet(sheet);
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function closeBottomSheet(sheet) {
    if (sheet) {
        sheet.classList.remove('visible');
        setTimeout(() => {
            sheet.remove();
        }, 300);
    }
}

function handleExportAction(action) {
    switch (action) {
        case 'docx':
            downloadDocx();
            break;
        case 'agent':
            showAgentNameModal();
            break;
        default:
            console.warn('Unknown export action:', action);
    }
}

function handleGenerateAction(action) {
    switch (action) {
        case 'audio':
            generateAudioBriefing();
            break;
        case 'infographic':
            generateInfographic();
            break;
        case 'agenda':
            generateAgenda();
            break;
        default:
            console.warn('Unknown generate action:', action);
    }
}

// ============================================
// API Key Handling
// ============================================
function handleApiKeyChange(e) {
    state.apiKey = e.target.value.trim();
    updateAnalyzeButton();
}

function toggleApiKeyVisibility() {
    const isPassword = elements.apiKeyInput.type === 'password';
    elements.apiKeyInput.type = isPassword ? 'text' : 'password';
    elements.toggleKeyBtn.innerHTML = isPassword ? '&#128064;' : '&#128065;';
}

function saveApiKey() {
    if (state.apiKey) {
        localStorage.setItem('northstar_api_key', state.apiKey);
        showTemporaryMessage(elements.saveKeyBtn, 'Saved!', 'Save');
        // Collapse after a short delay to show the "Saved!" message
        setTimeout(() => {
            collapseApiKeySection();
        }, 1000);
    }
}

function showTemporaryMessage(btn, message, original) {
    const originalText = btn.textContent;
    btn.textContent = message;
    btn.disabled = true;
    setTimeout(() => {
        btn.textContent = original || originalText;
        btn.disabled = false;
    }, 1500);
}

// ============================================
// Tab Switching
// ============================================
function switchTab(tab) {
    // Map 'upload' tab to actual input mode based on selected file, or default to 'audio'
    if (tab === 'upload') {
        // Keep current inputMode if a file is selected, otherwise reset
        if (!state.selectedFile && !state.selectedPdfFile && !state.selectedImageFile && !state.selectedVideoFile) {
            state.inputMode = 'audio'; // Default mode for upload tab
        }
    } else if (tab === 'import') {
        // Import tab doesn't change input mode, it's handled separately
    } else {
        state.inputMode = tab;
    }

    elements.tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Toggle tab panes
    if (elements.uploadTab) elements.uploadTab.classList.toggle('active', tab === 'upload');
    if (elements.textTab) elements.textTab.classList.toggle('active', tab === 'text');
    if (elements.urlTab) elements.urlTab.classList.toggle('active', tab === 'url');
    if (elements.importTab) elements.importTab.classList.toggle('active', tab === 'import');

    updateAnalyzeButton();
}

// ============================================
// Unified File Handling
// ============================================
function handleUnifiedDragOver(e) {
    e.preventDefault();
    if (elements.unifiedDropZone) elements.unifiedDropZone.classList.add('dragover');
}

function handleUnifiedDragLeave(e) {
    e.preventDefault();
    if (elements.unifiedDropZone) elements.unifiedDropZone.classList.remove('dragover');
}

function handleUnifiedDrop(e) {
    e.preventDefault();
    if (elements.unifiedDropZone) elements.unifiedDropZone.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleUnifiedFileSelect({ target: { files: files } });
    }
}

function handleUnifiedFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const extension = file.name.split('.').pop().toLowerCase();
    const mimeType = file.type;

    // Detect file type and set appropriate state
    if (['mp3', 'wav', 'm4a', 'ogg', 'oga', 'flac', 'mpga'].includes(extension) ||
        mimeType.startsWith('audio/')) {
        // Audio file
        state.inputMode = 'audio';
        state.selectedFile = file;
        state.exportMeta.source.audio = getFileMeta(file);
        showUnifiedFileInfo(file, '🎵', 'Audio');
    }
    else if (['mp4', 'webm', 'mpeg'].includes(extension) ||
             mimeType.startsWith('video/')) {
        // Video file
        state.inputMode = 'video';
        state.selectedVideoFile = file;
        state.exportMeta.source.video = getFileMeta(file);
        showUnifiedFileInfo(file, '🎬', 'Video');
    }
    else if (extension === 'pdf' || mimeType === 'application/pdf') {
        // PDF file
        state.inputMode = 'pdf';
        state.selectedPdfFile = file;
        state.exportMeta.source.pdf = getFileMeta(file);
        showUnifiedFileInfo(file, '📄', 'PDF');
    }
    else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension) ||
             mimeType.startsWith('image/')) {
        // Image file
        state.inputMode = 'image';
        state.selectedImageFile = file;
        state.exportMeta.source.image = getFileMeta(file);
        showUnifiedFileInfo(file, '🖼️', 'Image');
        showImagePreview(file);
    }
    else {
        showError('Unsupported file type. Please upload audio, video, PDF, or image.');
        return;
    }

    updateAnalyzeButton();
}

function showUnifiedFileInfo(file, icon, typeBadge) {
    if (elements.fileTypeIcon) elements.fileTypeIcon.textContent = icon;
    if (elements.selectedFileName) elements.selectedFileName.textContent = file.name;
    if (elements.fileTypeBadge) elements.fileTypeBadge.textContent = typeBadge;
    if (elements.unifiedFileInfo) elements.unifiedFileInfo.classList.remove('hidden');
    if (elements.unifiedDropZone) elements.unifiedDropZone.style.display = 'none';
}

function showImagePreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        if (elements.imagePreviewImg) {
            elements.imagePreviewImg.src = e.target.result;
            state.selectedImageBase64 = e.target.result;
        }
        if (elements.imagePreview) elements.imagePreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function clearUnifiedFile() {
    state.selectedFile = null;
    state.selectedPdfFile = null;
    state.selectedImageFile = null;
    state.selectedImageBase64 = null;
    state.selectedVideoFile = null;
    state.exportMeta.source.audio = null;
    state.exportMeta.source.pdf = null;
    state.exportMeta.source.image = null;
    state.exportMeta.source.video = null;

    if (elements.unifiedFileInfo) elements.unifiedFileInfo.classList.add('hidden');
    if (elements.unifiedDropZone) elements.unifiedDropZone.style.display = 'block';
    if (elements.imagePreview) elements.imagePreview.classList.add('hidden');
    if (elements.unifiedFileInput) elements.unifiedFileInput.value = '';

    updateAnalyzeButton();
}

// ============================================
// Legacy File Handling (for backward compatibility)
// ============================================
function handleDragOver(e) {
    e.preventDefault();
    if (elements.dropZone) elements.dropZone.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    elements.dropZone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    elements.dropZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processSelectedFile(files[0]);
    }
}

function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        processSelectedFile(e.target.files[0]);
    }
}

function processSelectedFile(file) {
    const allowedFormats = ['m4a', 'mp3', 'webm', 'mp4', 'mpga', 'wav', 'mpeg', 'ogg', 'oga', 'flac'];
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (!allowedFormats.includes(extension)) {
        showError(`Invalid file format. Supported formats: ${allowedFormats.join(', ')}`);
        return;
    }
    
    // Check file size (OpenAI limit is 25MB)
    if (file.size > 25 * 1024 * 1024) {
        showError('File size exceeds 25MB limit.');
        return;
    }
    
    state.selectedFile = file;
    state.exportMeta.source.audio = getFileMeta(file);
    elements.fileName.textContent = file.name;
    elements.fileInfo.classList.remove('hidden');
    elements.dropZone.style.display = 'none';
    updateAnalyzeButton();
}

function removeSelectedFile() {
    state.selectedFile = null;
    state.exportMeta.source.audio = null;
    elements.audioFileInput.value = '';
    elements.fileInfo.classList.add('hidden');
    elements.dropZone.style.display = 'block';
    updateAnalyzeButton();
}

// ============================================
// PDF File Handling
// ============================================
function handlePdfDragOver(e) {
    e.preventDefault();
    elements.pdfDropZone.classList.add('dragover');
}

function handlePdfDragLeave(e) {
    e.preventDefault();
    elements.pdfDropZone.classList.remove('dragover');
}

function handlePdfDrop(e) {
    e.preventDefault();
    elements.pdfDropZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processSelectedPdfFile(files[0]);
    }
}

function handlePdfFileSelect(e) {
    if (e.target.files.length > 0) {
        processSelectedPdfFile(e.target.files[0]);
    }
}

function processSelectedPdfFile(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (extension !== 'pdf') {
        showError('Invalid file format. Please upload a PDF file.');
        return;
    }
    
    // Check file size (50MB limit for PDFs)
    if (file.size > 50 * 1024 * 1024) {
        showError('File size exceeds 50MB limit.');
        return;
    }
    
    state.selectedPdfFile = file;
    state.exportMeta.source.pdf = getFileMeta(file);
    elements.pdfFileName.textContent = file.name;
    elements.pdfFileInfo.classList.remove('hidden');
    elements.pdfDropZone.style.display = 'none';
    updateAnalyzeButton();
}

function removeSelectedPdfFile() {
    state.selectedPdfFile = null;
    state.exportMeta.source.pdf = null;
    elements.pdfFileInput.value = '';
    elements.pdfFileInfo.classList.add('hidden');
    elements.pdfDropZone.style.display = 'block';
    updateAnalyzeButton();
}

// ============================================
// Image File Handling
// ============================================
function handleImageDragOver(e) {
    e.preventDefault();
    elements.imageDropZone.classList.add('dragover');
}

function handleImageDragLeave(e) {
    e.preventDefault();
    elements.imageDropZone.classList.remove('dragover');
}

function handleImageDrop(e) {
    e.preventDefault();
    elements.imageDropZone.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processSelectedImageFile(files[0]);
    }
}

function handleImageFileSelect(e) {
    if (e.target.files.length > 0) {
        processSelectedImageFile(e.target.files[0]);
    }
}

async function processSelectedImageFile(file) {
    const allowedFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const extension = file.name.split('.').pop().toLowerCase();

    if (!allowedFormats.includes(extension)) {
        showError(`Invalid file format. Supported formats: ${allowedFormats.join(', ')}`);
        return;
    }

    // Check file size (20MB limit for images)
    if (file.size > 20 * 1024 * 1024) {
        showError('File size exceeds 20MB limit.');
        return;
    }

    // Convert image to base64 for Vision API
    try {
        const base64 = await fileToBase64(file);
        state.selectedImageFile = file;
        state.selectedImageBase64 = base64;
        state.exportMeta.source.image = getFileMeta(file);

        // Update UI
        elements.imageFileName.textContent = file.name;
        elements.imageFileInfo.classList.remove('hidden');
        elements.imageDropZone.style.display = 'none';

        // Show image preview
        elements.imagePreviewImg.src = base64;
        elements.imagePreview.classList.remove('hidden');

        updateAnalyzeButton();
    } catch (error) {
        showError('Failed to process image file.');
        console.error('Image processing error:', error);
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function base64ToBlob(base64, mimeType) {
    if (!base64) return null;
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

function removeSelectedImageFile() {
    state.selectedImageFile = null;
    state.selectedImageBase64 = null;
    state.exportMeta.source.image = null;
    elements.imageFileInput.value = '';
    elements.imageFileInfo.classList.add('hidden');
    elements.imagePreview.classList.add('hidden');
    elements.imagePreviewImg.src = '';
    elements.imageDropZone.style.display = 'block';
    updateAnalyzeButton();
}

// ============================================
// Video File Handling
// ============================================
function handleVideoDragOver(e) {
    e.preventDefault();
    elements.videoDropZone.classList.add('dragover');
}

function handleVideoDragLeave(e) {
    e.preventDefault();
    elements.videoDropZone.classList.remove('dragover');
}

function handleVideoDrop(e) {
    e.preventDefault();
    elements.videoDropZone.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processSelectedVideoFile(files[0]);
    }
}

function handleVideoFileSelect(e) {
    if (e.target.files.length > 0) {
        processSelectedVideoFile(e.target.files[0]);
    }
}

function processSelectedVideoFile(file) {
    // Whisper-compatible formats: mp3, mp4, mpeg, mpga, m4a, wav, webm
    const allowedFormats = ['mp4', 'webm', 'mpeg', 'mpga', 'm4a', 'mp3', 'wav'];
    const extension = file.name.split('.').pop().toLowerCase();

    if (!allowedFormats.includes(extension)) {
        showError(`Invalid file format. Whisper supports: MP4, WebM, MPEG, M4A, MP3, WAV`);
        return;
    }

    // Check file size (OpenAI Whisper limit is 25MB)
    if (file.size > 25 * 1024 * 1024) {
        showError('File size exceeds 25MB limit for transcription.');
        return;
    }

    state.selectedVideoFile = file;
    state.exportMeta.source.video = getFileMeta(file);
    elements.videoFileName.textContent = file.name;
    elements.videoFileInfo.classList.remove('hidden');
    elements.videoDropZone.style.display = 'none';
    updateAnalyzeButton();
}

function removeSelectedVideoFile() {
    state.selectedVideoFile = null;
    state.exportMeta.source.video = null;
    elements.videoFileInput.value = '';
    elements.videoFileInfo.classList.add('hidden');
    elements.videoDropZone.style.display = 'block';
    updateAnalyzeButton();
}

// ============================================
// PDF Text Extraction
// ============================================
async function extractTextFromPdf(file) {
    // Ensure PDF.js is loaded
    if (!pdfJsLoaded) {
        await loadPdfJs();
    }

    if (!window.pdfjsLib) {
        throw new Error('PDF.js library failed to load. Please refresh the page and try again.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    const totalPages = pdf.numPages;
    if (state.exportMeta?.processing?.pdf) {
        state.exportMeta.processing.pdf.totalPages = totalPages;
        state.exportMeta.processing.pdf.usedVisionOcr = false;
        state.exportMeta.processing.pdf.ocrPagesAnalyzed = 0;
        state.exportMeta.processing.pdf.ocrPageLimit = 0;
    }

    for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';

        // Update progress for large PDFs
        const progress = Math.round((i / totalPages) * 20);
        updateProgress(progress, `Extracting text from PDF (page ${i}/${totalPages})...`);
    }

    fullText = fullText.trim();

    // Return both text and PDF object for potential image-based processing
    return { text: fullText, pdf, totalPages };
}

// ============================================
// PDF to Image Conversion (for image-based PDFs)
// ============================================
async function renderPdfPagesToImages(pdf, totalPages, maxPages = 5) {
    const images = [];
    const pagesToRender = Math.min(totalPages, maxPages);

    for (let i = 1; i <= pagesToRender; i++) {
        updateProgress(10 + Math.round((i / pagesToRender) * 10), `Converting PDF page ${i}/${pagesToRender} to image...`);

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR

        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render page to canvas
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        // Convert canvas to base64
        const base64Image = canvas.toDataURL('image/png');
        images.push(base64Image);
    }

    return images;
}

async function analyzeImageBasedPdf(pdf, totalPages) {
    updateProgress(10, 'Detected image-based PDF. Converting pages to images...');

    // Render PDF pages to images
    const images = await renderPdfPagesToImages(pdf, totalPages);
    if (state.exportMeta?.processing?.pdf) {
        state.exportMeta.processing.pdf.usedVisionOcr = true;
        state.exportMeta.processing.pdf.ocrPagesAnalyzed = images.length;
        state.exportMeta.processing.pdf.ocrPageLimit = Math.min(totalPages, images.length);
    }

    updateProgress(25, 'Analyzing PDF images with Vision AI...');

    // Analyze each page with Vision API and combine results
    const pageResults = [];

    for (let i = 0; i < images.length; i++) {
        updateProgress(25 + Math.round((i / images.length) * 20), `Analyzing page ${i + 1}/${images.length} with Vision AI...`);

        const pageContent = await analyzeImageWithVision(images[i]);
        pageResults.push(`--- Page ${i + 1} ---\n${pageContent}`);
    }

    // If there are more pages than we analyzed, add a note
    let combinedText = pageResults.join('\n\n');
    if (totalPages > images.length) {
        combinedText += `\n\n[Note: Only the first ${images.length} of ${totalPages} pages were analyzed.]`;
    }

    return combinedText;
}

// ============================================
// Image Analysis with Vision API
// ============================================
async function analyzeImageWithVision(base64Image) {
    const response = await fetchOpenAI('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: GPT_52_MODEL,
            messages: [
                {
                    role: 'system',
                        content: PROMPTS.visionOcrSystem
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Please analyze this image and extract all text content and relevant visual information. This appears to be meeting-related content that needs to be analyzed.'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: base64Image,
                                detail: 'high'
                            }
                        }
                    ]
                }
            ],
            max_completion_tokens: 4000,
            temperature: 0.3
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Vision API error: ${response.status}`);
    }

    const data = await response.json();

    // Track metrics
    if (data.usage) {
        currentMetrics.gptInputTokens += data.usage.prompt_tokens || 0;
        currentMetrics.gptOutputTokens += data.usage.completion_tokens || 0;
    }
    currentMetrics.apiCalls.push({
        endpoint: 'chat/completions (vision)',
        model: GPT_52_MODEL,
        tokens: data.usage?.total_tokens || 0
    });

    return data.choices[0]?.message?.content || '';
}

// ============================================
// Analyze Button State
// ============================================
function updateAnalyzeButton() {
    let canAnalyze = false;

    if (state.apiKey) {
        if (state.inputMode === 'audio' && state.selectedFile) {
            canAnalyze = true;
        } else if (state.inputMode === 'pdf' && state.selectedPdfFile) {
            canAnalyze = true;
        } else if (state.inputMode === 'image' && state.selectedImageFile) {
            canAnalyze = true;
        } else if (state.inputMode === 'video' && state.selectedVideoFile) {
            canAnalyze = true;
        } else if (state.inputMode === 'text' && elements.textInput.value.trim()) {
            canAnalyze = true;
        } else if (state.inputMode === 'url' && state.urlContent) {
            canAnalyze = true;
        }
    }

    elements.analyzeBtn.disabled = !canAnalyze;
}

// ============================================
// Analysis Pipeline
// ============================================
async function startAnalysis() {
    if (state.isProcessing) return;
    
    state.isProcessing = true;
    hideError();
    showProgress();
    setButtonLoading(true);
    
    // Reset metrics for new run
    currentMetrics = {
        whisperMinutes: 0,
        gptInputTokens: 0,
        gptOutputTokens: 0,
        chatInputTokens: 0,
        chatOutputTokens: 0,
        ttsCharacters: 0,
        imageInputTokens: 0,
        imageOutputTokens: 0,
        apiCalls: []
    };
    const analysisStartMs = performance.now();
    const analysisStartIso = new Date().toISOString();
    state.exportMeta.processing = {
        inputMode: state.inputMode,
        analysis: {
            startedAt: analysisStartIso,
            completedAt: null,
            durationMs: null,
            mode: null,
            usedFallback: false,
            jsonRecovered: false
        },
        transcriptionMethod: null,
        pdf: {
            totalPages: null,
            usedVisionOcr: false,
            ocrPagesAnalyzed: 0,
            ocrPageLimit: 0
        }
    };
    
    try {
        let transcriptionText;

        if (state.inputMode === 'audio') {
            state.exportMeta.processing.transcriptionMethod = 'whisper-1';
            updateProgress(5, 'Transcribing audio with Whisper...');
            transcriptionText = await transcribeAudio(state.selectedFile);
        } else if (state.inputMode === 'pdf') {
            state.exportMeta.processing.transcriptionMethod = 'pdf.js';
            updateProgress(5, 'Extracting text from PDF...');
            const pdfResult = await extractTextFromPdf(state.selectedPdfFile);

            // Check if PDF has meaningful text content
            if (!pdfResult.text || pdfResult.text.length < 50) {
                // PDF appears to be image-based, use Vision API
                state.exportMeta.processing.transcriptionMethod = 'vision-ocr';
                transcriptionText = await analyzeImageBasedPdf(pdfResult.pdf, pdfResult.totalPages);

                if (!transcriptionText || transcriptionText.length < 10) {
                    throw new Error('Could not extract content from PDF. The file may be empty or unreadable.');
                }
            } else {
                transcriptionText = pdfResult.text;
            }
        } else if (state.inputMode === 'image') {
            state.exportMeta.processing.transcriptionMethod = 'vision-ocr';
            updateProgress(5, 'Analyzing image with Vision AI...');
            transcriptionText = await analyzeImageWithVision(state.selectedImageBase64);

            if (!transcriptionText || transcriptionText.length < 10) {
                throw new Error('Could not extract meaningful content from the image.');
            }
        } else if (state.inputMode === 'video') {
            state.exportMeta.processing.transcriptionMethod = 'whisper-1';
            updateProgress(5, 'Transcribing video audio with Whisper...');
            transcriptionText = await transcribeAudio(state.selectedVideoFile);
        } else if (state.inputMode === 'url') {
            state.exportMeta.processing.transcriptionMethod = 'url-extract';
            transcriptionText = state.urlContent;

            if (!transcriptionText || transcriptionText.length < 10) {
                throw new Error('No content available from URL. Please fetch the URL first.');
            }
        } else {
            state.exportMeta.processing.transcriptionMethod = 'text-input';
            transcriptionText = elements.textInput.value.trim();
        }

        updateProgress(30, 'Analyzing meeting content...');
        const analysis = await analyzeMeetingBatch(transcriptionText);
        const analysisMeta = analysis._meta || {};
        state.exportMeta.processing.analysis = {
            ...state.exportMeta.processing.analysis,
            ...analysisMeta,
            model: GPT_52_MODEL,
            completedAt: new Date().toISOString(),
            durationMs: Math.round(performance.now() - analysisStartMs)
        };
        
        const summary = analysis.summary;
        const keyPoints = analysis.keyPoints;
        const actionItems = analysis.actionItems;
        const sentiment = analysis.sentiment;

        updateProgress(100, 'Complete!');
        
        // Calculate costs
        const metrics = calculateMetrics();
        
        state.results = {
            transcription: transcriptionText,
            summary,
            keyPoints,
            actionItems,
            sentiment
        };
        state.metrics = metrics;
        
        setTimeout(() => {
            hideProgress();
            displayResults();
        }, 500);
        
    } catch (error) {
        console.error('Analysis error:', error);
        hideProgress();
        showError(error.message || 'An error occurred during analysis. Please try again.');
    } finally {
        state.isProcessing = false;
        setButtonLoading(false);
    }
}

function setButtonLoading(loading) {
    const btnText = elements.analyzeBtn.querySelector('.btn-text');
    const btnLoader = elements.analyzeBtn.querySelector('.btn-loader');
    
    btnText.classList.toggle('hidden', loading);
    btnLoader.classList.toggle('hidden', !loading);
    elements.analyzeBtn.disabled = loading;
}

// ============================================
// Response Caching
// ============================================

const responseCache = new Map();
const MAX_CACHE_SIZE = 50; // Limit cache size to prevent memory issues

function getCacheKey(systemPrompt, userContent) {
    // Create a hash-like key from the prompts
    const combined = systemPrompt + '::' + userContent;
    // Use a simple but effective cache key
    try {
        return btoa(encodeURIComponent(combined)).slice(0, 64);
    } catch (e) {
        // Fallback if btoa fails on large content
        return combined.substring(0, 100);
    }
}

function getCachedResponse(systemPrompt, userContent) {
    const key = getCacheKey(systemPrompt, userContent);
    return responseCache.get(key);
}

function cacheResponse(systemPrompt, userContent, response) {
    // Implement LRU-style caching - remove oldest if at capacity
    if (responseCache.size >= MAX_CACHE_SIZE) {
        const firstKey = responseCache.keys().next().value;
        responseCache.delete(firstKey);
    }

    const key = getCacheKey(systemPrompt, userContent);
    responseCache.set(key, response);
}

// ============================================
// Error Handling & Retry Logic
// ============================================

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function callAPIWithRetry(fn, maxRetries = 3, operation = 'API call') {
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry on client errors (4xx except 429)
            if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
                throw error;
            }

            // For rate limits (429) or server errors (5xx), retry with exponential backoff
            if (attempt < maxRetries - 1) {
                const delay = Math.min(2000 * Math.pow(2, attempt), 16000); // Max 16 seconds
                console.warn(`${operation} failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`, error.message);
                await sleep(delay);
            }
        }
    }

    // All retries exhausted
    throw new Error(`${operation} failed after ${maxRetries} attempts: ${lastError.message}`);
}

// ============================================
// OpenAI API Calls
// ============================================
async function transcribeAudio(file) {
    return await callAPIWithRetry(async () => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('model', 'whisper-1');

        const response = await fetchOpenAI('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.apiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const err = new Error(error.error?.message || `Transcription failed: ${response.status}`);
            err.status = response.status;
            throw err;
        }

        const data = await response.json();

        // Estimate audio duration from file size (rough estimate: ~1MB per minute for common formats)
        const estimatedMinutes = Math.max(0.1, file.size / (1024 * 1024));
        currentMetrics.whisperMinutes += estimatedMinutes;
        currentMetrics.apiCalls.push({
            name: 'Audio Transcription',
            model: 'whisper-1',
            duration: estimatedMinutes.toFixed(2) + ' min'
        });

        return data.text;
    }, 3, 'Audio transcription');
}

async function callChatAPI(systemPrompt, userContent, callName = 'API Call', useCache = true) {
    // Check cache first (only for deterministic calls with temperature=0)
    if (useCache) {
        const cached = getCachedResponse(systemPrompt, userContent);
        if (cached) {
            console.log(`[Cache Hit] ${callName}`);
            return cached;
        }
    }

    const result = await callAPIWithRetry(async () => {
        const response = await fetchOpenAI('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GPT_52_MODEL,
                temperature: 0,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const err = new Error(error.error?.message || `API call failed: ${response.status}`);
            err.status = response.status;
            throw err;
        }

        const data = await response.json();

        // Track token usage
        if (data.usage) {
            currentMetrics.gptInputTokens += data.usage.prompt_tokens || 0;
            currentMetrics.gptOutputTokens += data.usage.completion_tokens || 0;
            currentMetrics.apiCalls.push({
                name: callName,
                model: GPT_52_MODEL,
                inputTokens: data.usage.prompt_tokens || 0,
                outputTokens: data.usage.completion_tokens || 0
            });
        }

        return data.choices[0].message.content;
    }, 3, callName);

    // Cache the result
    if (useCache) {
        cacheResponse(systemPrompt, userContent, result);
    }

    return result;
}

async function analyzeMeetingBatch(text) {
    const meta = {
        mode: 'batch-json',
        jsonRecovered: false,
        usedFallback: false
    };
    const systemPrompt = PROMPTS.analysisBatchSystem;

    const response = await callChatAPI(systemPrompt, text, 'Meeting Analysis');

    // Helper to extract SoT metadata with defaults
    const extractSoTMetadata = (parsed) => ({
        meetingType: parsed.meetingType || 'general',
        keyEntities: parsed.keyEntities || {
            people: [], projects: [], organizations: [], products: []
        },
        temporalContext: parsed.temporalContext || null,
        topicTags: Array.isArray(parsed.topicTags) ? parsed.topicTags : [],
        contentSignals: parsed.contentSignals || {
            riskMentions: 0, decisionsMade: 0, actionsAssigned: 0,
            questionsRaised: 0, conflictIndicators: 0
        },
        suggestedPerspective: parsed.suggestedPerspective || null
    });

    try {
        // Try to parse the JSON response
        const parsed = JSON.parse(response);
        const sotMetadata = extractSoTMetadata(parsed);
        return {
            // Core fields
            summary: parsed.summary || '',
            keyPoints: parsed.keyPoints || '',
            actionItems: parsed.actionItems || '',
            sentiment: parsed.sentiment || 'Neutral',
            // SoT metadata fields (top-level for easy access)
            meetingType: sotMetadata.meetingType,
            keyEntities: sotMetadata.keyEntities,
            temporalContext: sotMetadata.temporalContext,
            topicTags: sotMetadata.topicTags,
            contentSignals: sotMetadata.contentSignals,
            suggestedPerspective: sotMetadata.suggestedPerspective,
            _meta: meta
        };
    } catch (error) {
        // Fallback: try to extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                meta.jsonRecovered = true;
                meta.mode = 'batch-json-extracted';
                const sotMetadata = extractSoTMetadata(parsed);
                return {
                    summary: parsed.summary || '',
                    keyPoints: parsed.keyPoints || '',
                    actionItems: parsed.actionItems || '',
                    sentiment: parsed.sentiment || 'Neutral',
                    meetingType: sotMetadata.meetingType,
                    keyEntities: sotMetadata.keyEntities,
                    temporalContext: sotMetadata.temporalContext,
                    topicTags: sotMetadata.topicTags,
                    contentSignals: sotMetadata.contentSignals,
                    suggestedPerspective: sotMetadata.suggestedPerspective,
                    _meta: meta
                };
            } catch (e) {
                // If still fails, use individual functions as fallback
                console.warn('Batch analysis failed, falling back to individual calls');
                meta.usedFallback = true;
                meta.mode = 'fallback-individual';
                const [summary, keyPoints, actionItems, sentiment] = await Promise.all([
                    extractSummary(text),
                    extractKeyPoints(text),
                    extractActionItems(text),
                    analyzeSentiment(text)
                ]);
                // Fallback mode has no SoT metadata
                return { summary, keyPoints, actionItems, sentiment, _meta: meta };
            }
        }
        // Final fallback
        console.warn('JSON extraction failed, falling back to individual calls');
        meta.usedFallback = true;
        meta.mode = 'fallback-individual';
        const [summary, keyPoints, actionItems, sentiment] = await Promise.all([
            extractSummary(text),
            extractKeyPoints(text),
            extractActionItems(text),
            analyzeSentiment(text)
        ]);
        return { summary, keyPoints, actionItems, sentiment, _meta: meta };
    }
}

async function extractSummary(text) {
    const systemPrompt = PROMPTS.summarySystem;

    return await callChatAPI(systemPrompt, text, 'Summary');
}

async function extractKeyPoints(text) {
    const systemPrompt = PROMPTS.keyPointsSystem;
    
    return await callChatAPI(systemPrompt, text, 'Key Points');
}

async function extractActionItems(text) {
    const systemPrompt = PROMPTS.actionItemsSystem;
    
    return await callChatAPI(systemPrompt, text, 'Action Items');
}

async function analyzeSentiment(text) {
    const systemPrompt = PROMPTS.sentimentSystem;
    
    return await callChatAPI(systemPrompt, text, 'Sentiment');
}

// ============================================
// Metrics Calculation
// ============================================
function calculateMetrics() {
    const whisperCost = currentMetrics.whisperMinutes * PRICING['whisper-1'].perMinute;
    const gptInputCost = (currentMetrics.gptInputTokens / 1000000) * PRICING[GPT_52_MODEL].input;
    const gptOutputCost = (currentMetrics.gptOutputTokens / 1000000) * PRICING[GPT_52_MODEL].output;
    const ttsCost = (currentMetrics.ttsCharacters / 1000) * PRICING['gpt-4o-mini-tts'].perKChars;
    const imageInputCost = (currentMetrics.imageInputTokens / 1000000) * PRICING['gpt-image-1.5'].input;
    const imageOutputCost = (currentMetrics.imageOutputTokens / 1000000) * PRICING['gpt-image-1.5'].output;
    const imageCost = imageInputCost + imageOutputCost;
    const totalCost = whisperCost + gptInputCost + gptOutputCost + ttsCost + imageCost;
    
    return {
        whisperMinutes: currentMetrics.whisperMinutes,
        gptInputTokens: currentMetrics.gptInputTokens,
        gptOutputTokens: currentMetrics.gptOutputTokens,
        totalTokens: currentMetrics.gptInputTokens + currentMetrics.gptOutputTokens,
        ttsCharacters: currentMetrics.ttsCharacters,
        imageInputTokens: currentMetrics.imageInputTokens,
        imageOutputTokens: currentMetrics.imageOutputTokens,
        imageTotalTokens: currentMetrics.imageInputTokens + currentMetrics.imageOutputTokens,
        whisperCost,
        gptInputCost,
        gptOutputCost,
        ttsCost,
        imageInputCost,
        imageOutputCost,
        imageCost,
        totalCost,
        apiCalls: currentMetrics.apiCalls
    };
}

// ============================================
// Progress UI
// ============================================
function showProgress() {
    elements.progressSection.classList.remove('hidden');
    elements.resultsSection.classList.add('hidden');
}

function hideProgress() {
    elements.progressSection.classList.add('hidden');
}

function updateProgress(percent, message) {
    elements.progressFill.style.width = `${percent}%`;
    elements.progressText.textContent = message;
}

// ============================================
// Results Display
// ============================================
function displayResults() {
    if (!state.results) return;
    
    // Collapse the setup section to focus on results
    const setupSection = document.getElementById('setup-section');
    if (setupSection) {
        setupSection.removeAttribute('open');
    }
    
    elements.resultsSection.classList.remove('hidden');
    
    // ========== KPI DASHBOARD ==========
    updateKPIDashboard();
    
    // Summary
    elements.resultSummary.innerHTML = `<p>${escapeHtml(state.results.summary)}</p>`;
    
    // Key Points
    elements.resultKeypoints.innerHTML = formatListContent(state.results.keyPoints);
    
    // Action Items
    elements.resultActions.innerHTML = formatListContent(state.results.actionItems);
    
    // Display metrics
    displayMetrics();

    // Show floating chat widget
    showChatWidget();

    // Scroll to results
    elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================
// Summary Bar Metrics
// ============================================
function updateKPIDashboard() {
    if (!state.results) return;

    // Sentiment metric badge
    const kpiSentiment = document.getElementById('kpi-sentiment');
    if (kpiSentiment) {
        const sentimentText = state.results.sentiment.trim();
        const sentimentLower = sentimentText.toLowerCase();

        // Determine sentiment class
        let sentimentClass = '';
        if (sentimentLower.includes('positive') || sentimentLower.includes('optimistic') || sentimentLower.includes('constructive')) {
            sentimentClass = 'positive';
        } else if (sentimentLower.includes('negative') || sentimentLower.includes('concern') || sentimentLower.includes('frustrated')) {
            sentimentClass = 'negative';
        }

        // Extract short sentiment (first word or two)
        const shortSentiment = sentimentText.split(/[,.:;]/)[0].trim().substring(0, 15);
        kpiSentiment.textContent = `📊 ${shortSentiment || 'Neutral'}`;
        kpiSentiment.className = `metric-badge metric-sentiment ${sentimentClass}`;
    }

    // Key Points Count metric badge
    const kpiKeypoints = document.getElementById('kpi-keypoints');
    if (kpiKeypoints && state.results.keyPoints) {
        const keyPointsCount = state.results.keyPoints.split('\n').filter(line => line.trim().length > 0).length;
        kpiKeypoints.textContent = `💡 ${keyPointsCount}`;
    }

    // Action Items Count metric badge
    const kpiActions = document.getElementById('kpi-actions');
    if (kpiActions && state.results.actionItems) {
        const actionsCount = state.results.actionItems.split('\n').filter(line => line.trim().length > 0).length;
        kpiActions.textContent = `✅ ${actionsCount}`;
    }
}

// Format number with commas
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
}

function displayMetrics() {
    const metrics = state.metrics;
    if (!metrics) return;
    
    const resultMetrics = document.getElementById('result-metrics');
    if (!resultMetrics) return;
    
    // Handle imported agents with a simpler display
    if (metrics.isImported) {
        resultMetrics.innerHTML = `
            <div class="metrics-imported">
                <div class="imported-badge">
                    <span>📥</span> Imported Agent
                </div>
                <p class="imported-note">
                    This session was loaded from an agent file.<br>
                    No API usage data available from the original analysis.
                </p>
                <p class="imported-hint">
                    Chat, audio, and infographic features will track new API calls.
                </p>
            </div>
        `;
        return;
    }
    
    let breakdownHtml = '';
    metrics.apiCalls.forEach(call => {
        if (call.model === 'whisper-1') {
            breakdownHtml += `
                <div class="metric-breakdown-item">
                    <span>${call.name}</span>
                    <span>${call.duration}</span>
                </div>`;
        } else if (call.model === 'gpt-4o-mini-tts') {
            breakdownHtml += `
                <div class="metric-breakdown-item">
                    <span>${call.name}</span>
                    <span>${call.characters.toLocaleString()} chars</span>
                </div>`;
        } else if (call.model === 'gpt-image-1.5') {
            breakdownHtml += `
                <div class="metric-breakdown-item">
                    <span>${call.name}</span>
                    <span>${formatTokens(call.inputTokens + call.outputTokens)} tokens</span>
                </div>`;
        } else {
            breakdownHtml += `
                <div class="metric-breakdown-item">
                    <span>${call.name}</span>
                    <span>${formatTokens(call.inputTokens + call.outputTokens)} tokens</span>
                </div>`;
        }
    });
    
    resultMetrics.innerHTML = `
        <div class="metrics-grid">
            <div class="metric-item">
                <span class="metric-value">${formatTokens(metrics.totalTokens)}</span>
                <span class="metric-label">Total Tokens</span>
            </div>
            <div class="metric-item">
                <span class="metric-value">${formatCost(metrics.totalCost)}</span>
                <span class="metric-label">Est. Cost</span>
            </div>
        </div>
        <div class="metric-breakdown">
            <div class="metric-breakdown-item">
                <span>GPT-5.2 Input</span>
                <span>${formatTokens(metrics.gptInputTokens)} tokens (${formatCost(metrics.gptInputCost)})</span>
            </div>
            <div class="metric-breakdown-item">
                <span>GPT-5.2 Output</span>
                <span>${formatTokens(metrics.gptOutputTokens)} tokens (${formatCost(metrics.gptOutputCost)})</span>
            </div>
            ${metrics.whisperMinutes > 0 ? `
            <div class="metric-breakdown-item">
                <span>Whisper Audio</span>
                <span>${metrics.whisperMinutes.toFixed(2)} min (${formatCost(metrics.whisperCost)})</span>
            </div>` : ''}
            ${metrics.ttsCharacters > 0 ? `
            <div class="metric-breakdown-item">
                <span>TTS Audio</span>
                <span>${metrics.ttsCharacters.toLocaleString()} chars (${formatCost(metrics.ttsCost)})</span>
            </div>` : ''}
            ${metrics.imageTotalTokens > 0 ? `
            <div class="metric-breakdown-item">
                <span>GPT-Image Input</span>
                <span>${formatTokens(metrics.imageInputTokens)} tokens (${formatCost(metrics.imageInputCost)})</span>
            </div>
            <div class="metric-breakdown-item">
                <span>GPT-Image Output</span>
                <span>${formatTokens(metrics.imageOutputTokens)} tokens (${formatCost(metrics.imageOutputCost)})</span>
            </div>` : ''}
        </div>
        <div class="metric-breakdown" style="margin-top: var(--space-sm);">
            <strong style="color: var(--text-secondary);">API Calls:</strong>
            ${breakdownHtml}
        </div>
    `;
}

function formatListContent(text) {
    const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    const listItems = lines.map(line => {
        // Remove leading dash or bullet if present
        const cleanLine = line.replace(/^[-•*]\s*/, '');
        return `<li>${escapeHtml(cleanLine)}</li>`;
    }).join('');
    
    return `<ul>${listItems}</ul>`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatTokens(tokens) {
    return tokens.toLocaleString();
}

function formatCost(cost) {
    return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(4)}`;
}

// ============================================
// DOCX Generation - Professional Export
// ============================================
async function downloadDocx() {
    if (!state.results) return;

    const {
        Document, Paragraph, TextRun, HeadingLevel, Packer, ImageRun,
        Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType,
        ShadingType, PageBreak, Header, Footer, TableOfContents,
        LevelFormat, convertInchesToTwip, ExternalHyperlink, NumberFormat,
        PageNumber, TextWrappingType, TextWrappingSide
    } = docx;

    const currentDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const shortDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
    });

    // ========== SIMPLE COLOR PALETTE ==========
    const colors = {
        black: "000000",
        darkGray: "333333",
        gray: "666666",
        lightGray: "cccccc",
        white: "ffffff"
    };

    // ========== HELPER FUNCTIONS ==========

    // Create a simple section heading
    const createSectionHeading = (text) => {
        return new Paragraph({
            children: [
                new TextRun({
                    text: text.toUpperCase(),
                    bold: true,
                    size: 26,
                    font: "Calibri"
                })
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 }
        });
    };

    // Create subsection heading
    const createSubHeading = (text) => {
        return new Paragraph({
            children: [
                new TextRun({
                    text: text,
                    bold: true,
                    size: 24,
                    font: "Calibri"
                })
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 }
        });
    };

    // Create proper bullet point using Word's native list
    const createBulletItem = (text, level = 0) => {
        return new Paragraph({
            children: [
                new TextRun({
                    text: text.replace(/^[-•*▸☐✓]\s*/, '').trim(),
                    size: 22,
                    font: "Calibri"
                })
            ],
            bullet: { level: level },
            spacing: { after: 100, line: 276 }
        });
    };

    // Create a simple table
    const createSimpleTable = (headers, rows) => {
        const headerCells = headers.map(h => new TableCell({
            children: [new Paragraph({
                children: [new TextRun({ text: h, bold: true, size: 20, font: "Calibri" })]
            })],
            margins: { top: 80, bottom: 80, left: 100, right: 100 }
        }));

        const dataRows = rows.map(row => new TableRow({
            children: row.map(cell => new TableCell({
                children: [new Paragraph({
                    children: [new TextRun({ text: String(cell), size: 20, font: "Calibri" })]
                })],
                margins: { top: 60, bottom: 60, left: 100, right: 100 }
            }))
        }));

        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({ children: headerCells, tableHeader: true }),
                ...dataRows
            ],
            borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: colors.lightGray },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: colors.lightGray },
                left: { style: BorderStyle.SINGLE, size: 1, color: colors.lightGray },
                right: { style: BorderStyle.SINGLE, size: 1, color: colors.lightGray },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: colors.lightGray },
                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: colors.lightGray }
            }
        });
    };

    // Create simple text paragraph
    const createTextParagraph = (text) => {
        return new Paragraph({
            children: [
                new TextRun({
                    text: text,
                    size: 22,
                    font: "Calibri"
                })
            ],
            spacing: { after: 200, line: 276 }
        });
    };
    
    // ========== BUILD DOCUMENT CONTENT ==========
    const children = [];

    // ========== COVER PAGE ==========
    children.push(new Paragraph({ spacing: { before: 1500 } }));

    // Main Title
    children.push(new Paragraph({
        children: [
            new TextRun({
                text: "MEETING INSIGHTS REPORT",
                bold: true,
                size: 56,
                font: "Calibri"
            })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
    }));

    // Date
    children.push(new Paragraph({
        children: [
            new TextRun({
                text: currentDate,
                size: 24,
                font: "Calibri"
            })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 }
    }));

    // Meeting details
    children.push(new Paragraph({
        children: [
            new TextRun({ text: "Meeting Title: ", bold: true, size: 22, font: "Calibri" }),
            new TextRun({ text: state.meetingTitle || "Meeting Analysis", size: 22, font: "Calibri" })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 }
    }));

    children.push(new Paragraph({
        children: [
            new TextRun({ text: "Source: ", bold: true, size: 22, font: "Calibri" }),
            new TextRun({
                text: state.selectedFile ? `Audio: ${state.selectedFile.name}` :
                      state.selectedPdfFile ? `PDF: ${state.selectedPdfFile.name}` :
                      state.selectedVideoFile ? `Video: ${state.selectedVideoFile.name}` :
                      state.urlContent ? 'URL Import' : 'Text Input',
                size: 22,
                font: "Calibri"
            })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
    }));

    // Branding
    children.push(new Paragraph({ spacing: { before: 800 } }));
    children.push(new Paragraph({
        children: [
            new TextRun({
                text: "Generated by northstar.LM",
                size: 20,
                color: colors.gray,
                font: "Calibri"
            })
        ],
        alignment: AlignmentType.CENTER
    }));

    // Page break after cover
    children.push(new Paragraph({ children: [new PageBreak()] }));

    // ========== TABLE OF CONTENTS ==========
    children.push(new Paragraph({
        children: [
            new TextRun({
                text: "TABLE OF CONTENTS",
                bold: true,
                size: 28,
                font: "Calibri"
            })
        ],
        spacing: { after: 400 }
    }));

    children.push(new TableOfContents("Table of Contents", {
        hyperlink: true,
        headingStyleRange: "1-3"
    }));

    children.push(new Paragraph({ spacing: { after: 200 } }));
    children.push(new Paragraph({
        children: [
            new TextRun({
                text: "Note: Update this table by right-clicking and selecting 'Update Field' in Microsoft Word.",
                italics: true,
                size: 18,
                color: colors.gray
            })
        ],
        spacing: { after: 400 }
    }));

    // Page break after TOC
    children.push(new Paragraph({ children: [new PageBreak()] }));

    // ========== EXECUTIVE SUMMARY ==========
    children.push(createSectionHeading("Executive Summary"));
    children.push(createTextParagraph(state.results.summary));
    children.push(new Paragraph({ spacing: { after: 300 } }));
    
    // ========== KEY POINTS ==========
    children.push(createSectionHeading("Key Points"));

    state.results.keyPoints.split('\n')
        .filter(line => line.trim())
        .forEach(point => {
            children.push(createBulletItem(point));
        });
    children.push(new Paragraph({ spacing: { after: 300 } }));

    // ========== ACTION ITEMS ==========
    children.push(createSectionHeading("Action Items"));

    state.results.actionItems.split('\n')
        .filter(line => line.trim())
        .forEach(item => {
            children.push(createBulletItem(item));
        });
    children.push(new Paragraph({ spacing: { after: 300 } }));

    // ========== SENTIMENT ANALYSIS ==========
    children.push(createSectionHeading("Sentiment Analysis"));

    children.push(new Paragraph({
        children: [
            new TextRun({
                text: state.results.sentiment,
                size: 22,
                font: "Calibri"
            })
        ],
        spacing: { after: 400 }
    }));
    
    // ========== CHAT Q&A (if present) ==========
    const chatMessages = document.querySelectorAll('#chat-messages .chat-message');
    if (chatMessages && chatMessages.length > 1) {
        children.push(createSectionHeading("Questions & Answers"));

        chatMessages.forEach(msg => {
            const isUser = msg.classList.contains('user');
            const content = msg.querySelector('.chat-message-content')?.textContent?.trim();
            if (content && !msg.querySelector('.chat-welcome')) {
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: isUser ? "Q: " : "A: ",
                            bold: true,
                            size: 22,
                            font: "Calibri"
                        }),
                        new TextRun({
                            text: content,
                            size: 22,
                            font: "Calibri"
                        })
                    ],
                    spacing: { after: 150 }
                }));
            }
        });
        children.push(new Paragraph({ spacing: { after: 300 } }));
    }

    // ========== AUDIO BRIEFING (if generated) ==========
    if (generatedAudioUrl) {
        children.push(createSectionHeading("Audio Briefing"));
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: "An executive audio summary has been generated for this meeting.",
                    size: 22,
                    font: "Calibri"
                })
            ],
            spacing: { after: 100 }
        }));
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: "Attachment: ",
                    bold: true,
                    size: 22,
                    font: "Calibri"
                }),
                new TextRun({
                    text: `meeting-briefing-${new Date().toISOString().slice(0, 10)}.mp3`,
                    size: 22,
                    font: "Calibri"
                })
            ],
            spacing: { after: 100 }
        }));
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: "Note: Download the MP3 file separately. DOCX does not support embedded audio.",
                    size: 18,
                    italics: true,
                    color: colors.gray,
                    font: "Calibri"
                })
            ],
            spacing: { after: 400 }
        }));
    }

    // ========== INFOGRAPHIC (if generated) ==========
    if (generatedImageBase64) {
        try {
            const binaryString = atob(generatedImageBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const imageArrayBuffer = bytes.buffer;

            children.push(createSectionHeading("Meeting Infographic"));
            children.push(new Paragraph({
                children: [
                    new ImageRun({
                        data: imageArrayBuffer,
                        transformation: {
                            width: 500,
                            height: 500
                        },
                        type: 'png'
                    })
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 150 }
            }));
            children.push(new Paragraph({
                children: [
                    new TextRun({
                        text: "AI-generated infographic visualizing key meeting insights",
                        italics: true,
                        size: 18,
                        color: colors.gray,
                        font: "Calibri"
                    })
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 }
            }));
        } catch (error) {
            console.error('Failed to embed infographic:', error);
        }
    }

    // ========== PROCESSING STATISTICS ==========
    if (state.metrics) {
        const metrics = state.metrics;
        children.push(createSectionHeading("Processing Statistics"));

        // Build stats rows
        const statsRows = [];

        if (metrics.whisperMinutes > 0) {
            statsRows.push(["Audio Transcription", `${metrics.whisperMinutes.toFixed(2)} minutes`, "Whisper"]);
        }

        statsRows.push(["Text Analysis", formatTokens(metrics.totalTokens) + " tokens", "GPT-5.2"]);

        if (metrics.ttsCharacters > 0) {
            statsRows.push(["Audio Generation", metrics.ttsCharacters.toLocaleString() + " characters", "GPT-4o-mini-TTS"]);
        }

        if (metrics.imageTotalTokens > 0) {
            statsRows.push(["Image Generation", formatTokens(metrics.imageTotalTokens) + " tokens", "GPT-Image-1.5"]);
        }

        children.push(createSimpleTable(["Operation", "Usage", "Model"], statsRows));
        children.push(new Paragraph({ spacing: { after: 200 } }));

        // Total cost
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: "Total Estimated Cost: ",
                    size: 22,
                    font: "Calibri"
                }),
                new TextRun({
                    text: formatCost(metrics.totalCost),
                    size: 22,
                    bold: true,
                    font: "Calibri"
                })
            ],
            spacing: { after: 400 }
        }));

        // API calls breakdown table
        if (metrics.apiCalls && metrics.apiCalls.length > 0) {
            children.push(createSubHeading("API Calls Breakdown"));

            const apiRows = metrics.apiCalls.map(call => {
                let detail = '';
                if (call.model === 'gpt-4o-mini-tts') {
                    detail = `${call.characters.toLocaleString()} chars`;
                } else if (call.model === 'gpt-image-1.5') {
                    detail = `${formatTokens(call.inputTokens + call.outputTokens)} tokens`;
                } else if (call.duration) {
                    detail = call.duration;
                } else {
                    detail = `${formatTokens((call.inputTokens || 0) + (call.outputTokens || 0))} tokens`;
                }
                return [call.name, call.model, detail];
            });

            children.push(createSimpleTable(["API Call", "Model", "Usage"], apiRows));
            children.push(new Paragraph({ spacing: { after: 400 } }));
        }
    }
    
    // ========== APPENDIX: FULL TRANSCRIPT ==========
    children.push(new Paragraph({ children: [new PageBreak()] }));

    children.push(new Paragraph({
        children: [
            new TextRun({
                text: "APPENDIX: FULL TRANSCRIPT",
                bold: true,
                size: 26,
                font: "Calibri"
            })
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 300 }
    }));

    // Transcript content
    children.push(new Paragraph({
        children: [
            new TextRun({
                text: state.results.transcription,
                size: 20,
                font: "Calibri"
            })
        ],
        spacing: { after: 400, line: 320 }
    }));
    
    // ========== CREATE DOCUMENT ==========
    const doc = new Document({
        creator: "northstar.LM",
        title: "Meeting Insights Report",
        subject: "AI-Generated Meeting Analysis",
        keywords: "meeting, analysis, insights, transcript, action items",
        description: "Meeting insights report generated by northstar.LM",
        lastModifiedBy: "northstar.LM",
        styles: {
            default: {
                document: {
                    run: {
                        font: "Calibri",
                        size: 22
                    }
                },
                heading1: {
                    run: {
                        font: "Calibri",
                        size: 26,
                        bold: true
                    },
                    paragraph: {
                        spacing: { before: 400, after: 200 }
                    }
                },
                heading2: {
                    run: {
                        font: "Calibri",
                        size: 24,
                        bold: true
                    },
                    paragraph: {
                        spacing: { before: 300, after: 150 }
                    }
                }
            },
            paragraphStyles: [
                {
                    id: "Normal",
                    name: "Normal",
                    run: {
                        font: "Calibri",
                        size: 22
                    },
                    paragraph: {
                        spacing: { line: 276 }
                    }
                }
            ]
        },
        numbering: {
            config: [
                {
                    reference: "actionItems",
                    levels: [
                        {
                            level: 0,
                            format: LevelFormat.DECIMAL,
                            text: "%1.",
                            alignment: AlignmentType.LEFT,
                            style: {
                                paragraph: {
                                    indent: { left: 720, hanging: 360 }
                                }
                            }
                        }
                    ]
                }
            ]
        },
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: convertInchesToTwip(1),
                        right: convertInchesToTwip(1),
                        bottom: convertInchesToTwip(1),
                        left: convertInchesToTwip(1)
                    }
                }
            },
            headers: {
                default: new Header({
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `Meeting Insights Report - ${shortDate}`,
                                    size: 18,
                                    color: colors.gray,
                                    font: "Calibri"
                                })
                            ],
                            alignment: AlignmentType.RIGHT
                        })
                    ]
                })
            },
            footers: {
                default: new Footer({
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "Page ",
                                    size: 16,
                                    color: colors.gray,
                                    font: "Calibri"
                                }),
                                new TextRun({
                                    children: [PageNumber.CURRENT],
                                    size: 16,
                                    color: colors.gray
                                }),
                                new TextRun({
                                    text: " of ",
                                    size: 16,
                                    color: colors.gray
                                }),
                                new TextRun({
                                    children: [PageNumber.TOTAL_PAGES],
                                    size: 16,
                                    color: colors.gray
                                })
                            ],
                            alignment: AlignmentType.CENTER
                        })
                    ]
                })
            },
            children: children
        }]
    });
    
    // Generate and download
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-insights-${new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// Reset / New Analysis
// ============================================
function resetForNewAnalysis() {
    console.log('[resetForNewAnalysis] Starting full reset...');
    
    // Reset all state
    state.results = null;
    state.metrics = null;
    state.selectedFile = null;
    state.selectedPdfFile = null;
    state.selectedImageFile = null;
    state.selectedImageBase64 = null;
    state.selectedVideoFile = null;
    state.urlContent = null;
    state.sourceUrl = null;
    resetExportMeta();
    
    // Reset metrics tracking
    currentMetrics = {
        whisperMinutes: 0,
        gptInputTokens: 0,
        gptOutputTokens: 0,
        chatInputTokens: 0,
        chatOutputTokens: 0,
        ttsCharacters: 0,
        imageInputTokens: 0,
        imageOutputTokens: 0,
        apiCalls: []
    };
    
    // Reset chat history
    resetChatHistory();
    
    // Clean up generated audio/image URLs
    if (generatedAudioUrl) {
        URL.revokeObjectURL(generatedAudioUrl);
        generatedAudioUrl = null;
    }
    generatedAudioBase64 = null;
    generatedImageUrl = null;
    generatedImageBase64 = null;
    
    // Reset all file inputs
    elements.audioFileInput.value = '';
    elements.pdfFileInput.value = '';
    elements.imageFileInput.value = '';
    elements.videoFileInput.value = '';
    elements.textInput.value = '';
    elements.urlInput.value = '';
    
    // Reset audio file UI
    elements.fileInfo.classList.add('hidden');
    elements.dropZone.style.display = 'block';
    
    // Reset PDF file UI
    elements.pdfFileInfo.classList.add('hidden');
    elements.pdfDropZone.style.display = 'block';
    
    // Reset image file UI
    elements.imageFileInfo.classList.add('hidden');
    elements.imagePreview.classList.add('hidden');
    elements.imagePreviewImg.src = '';
    elements.imageDropZone.style.display = 'block';
    
    // Reset video file UI
    elements.videoFileInfo.classList.add('hidden');
    elements.videoDropZone.style.display = 'block';
    
    // Reset URL preview
    elements.urlPreview.classList.add('hidden');
    elements.urlPreviewContent.textContent = '';
    
    // Clear results content (not just hide)
    if (elements.resultSummary) elements.resultSummary.innerHTML = '';
    if (elements.resultKeypoints) elements.resultKeypoints.innerHTML = '';
    if (elements.resultActions) elements.resultActions.innerHTML = '';
    if (elements.resultTranscript) elements.resultTranscript.innerHTML = '';
    if (elements.resultAgenda) {
        elements.resultAgenda.innerHTML = '<p class="muted">Click "Make Agenda" to generate an agenda for your next meeting based on this analysis.</p>';
    }
    if (elements.agendaSection) elements.agendaSection.open = false;
    
    // Reset summary bar metric badges
    const kpiSentiment = document.getElementById('kpi-sentiment');
    const kpiKeypoints = document.getElementById('kpi-keypoints');
    const kpiActions = document.getElementById('kpi-actions');
    if (kpiSentiment) { kpiSentiment.textContent = '📊 --'; kpiSentiment.className = 'metric-badge metric-sentiment'; }
    if (kpiKeypoints) kpiKeypoints.textContent = '💡 --';
    if (kpiActions) kpiActions.textContent = '✅ --';
    
    // Hide results section
    elements.resultsSection.classList.add('hidden');

    // Hide chat widget
    hideChatWidget();

    // Reset audio briefing section
    if (elements.audioPlayerContainer) elements.audioPlayerContainer.classList.add('hidden');
    if (elements.audioPlayer) elements.audioPlayer.src = '';
    if (elements.audioPrompt) elements.audioPrompt.value = '';

    // Reset infographic section
    if (elements.infographicContainer) elements.infographicContainer.classList.add('hidden');
    if (elements.infographicImage) elements.infographicImage.src = '';
    if (elements.infographicPrompt) elements.infographicPrompt.value = '';

    // Reset infographic preset to default
    selectedInfographicPreset = 'executive';
    if (elements.infographicPresetBtns && elements.infographicPresetBtns.length > 0) {
        elements.infographicPresetBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.preset === 'executive');
        });
    }

    updateAnalyzeButton();
    
    // Reopen the setup section
    const setupSection = document.getElementById('setup-section');
    if (setupSection) {
        setupSection.setAttribute('open', '');
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    console.log('[resetForNewAnalysis] Reset complete. State:', {
        results: state.results,
        selectedFile: state.selectedFile,
        selectedPdfFile: state.selectedPdfFile,
        selectedImageFile: state.selectedImageFile,
        selectedVideoFile: state.selectedVideoFile,
        urlContent: state.urlContent
    });
}

// ============================================
// Error Handling
// ============================================
function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorSection.classList.remove('hidden');
    elements.errorSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideError() {
    elements.errorSection.classList.add('hidden');
}

// ============================================
// Audio Briefing (TTS)
// ============================================
async function generateAudioBriefing() {
    if (!state.results) return;

    // Show loading indicator (if button exists from old UI)
    const btn = elements.generateAudioBtn;
    if (btn) {
        const btnText = btn.querySelector('.btn-text');
        const btnLoader = btn.querySelector('.btn-loader');
        if (btnText) btnText.classList.add('hidden');
        if (btnLoader) btnLoader.classList.remove('hidden');
        btn.disabled = true;
    }

    // Show a processing message
    console.log('[Audio] Generating audio briefing...');

    try {
        // Use default upbeat style
        const customStyle = 'upbeat and engaging';
        const styleInstruction = `\n\nIMPORTANT: Use this style/tone: "${customStyle}"`;
        
        const scriptPrompt = `You are an expert at creating concise executive briefings. 
Based on the following meeting analysis, create a 2-minute audio script (approximately 300 words) that:
- Opens with a brief greeting and meeting context
- Summarizes the key discussion points
- Highlights the most important action items
- Closes with the overall meeting sentiment and next steps

Keep the tone professional but conversational, suitable for audio playback.
Do not include any stage directions or speaker notes - just the spoken text.${styleInstruction}

Meeting Summary:
${state.results.summary}

Key Points:
${state.results.keyPoints}

Action Items:
${state.results.actionItems}

Sentiment: ${state.results.sentiment}`;

        const script = await callChatAPI(
            PROMPTS.audioBriefingSystem,
            scriptPrompt,
            'Audio Script'
        );
        
        // Step 2: Convert script to speech using TTS API
        const selectedVoice = elements.voiceSelect?.value || 'nova';
        const audioBlob = await textToSpeech(script, selectedVoice);
        const audioDataUrl = await fileToBase64(audioBlob);
        const audioParts = splitDataUrl(audioDataUrl);
        generatedAudioBase64 = audioParts.base64 || null;
        state.exportMeta.artifacts.audioBriefing = {
            promptStyle: customStyle || '',
            voice: selectedVoice,
            script,
            scriptPrompt,
            audioMimeType: audioParts.mimeType || 'audio/mpeg',
            generatedAt: new Date().toISOString()
        };
        
        // Step 3: Create audio URL and display player
        if (generatedAudioUrl) {
            URL.revokeObjectURL(generatedAudioUrl);
        }
        generatedAudioUrl = URL.createObjectURL(audioBlob);
        
        elements.audioPlayer.src = generatedAudioUrl;
        elements.audioPlayerContainer.classList.remove('hidden');
        
        // Update metrics display
        displayMetrics();
        
    } catch (error) {
        console.error('Audio generation error:', error);
        showError(error.message || 'Failed to generate audio briefing.');
    } finally {
        // Reset button state if it exists
        if (btn) {
            const btnText = btn.querySelector('.btn-text');
            const btnLoader = btn.querySelector('.btn-loader');
            if (btnText) btnText.classList.remove('hidden');
            if (btnLoader) btnLoader.classList.add('hidden');
            btn.disabled = false;
        }
    }
}

async function textToSpeech(text, voice = 'nova') {
    const response = await fetchOpenAI('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini-tts',
            input: text,
            voice: voice
        })
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `TTS failed: ${response.status}`);
    }
    
    // Track metrics
    currentMetrics.ttsCharacters += text.length;
    currentMetrics.apiCalls.push({
        name: 'Text-to-Speech',
        model: 'gpt-4o-mini-tts',
        characters: text.length
    });
    
    // Recalculate and update metrics
    state.metrics = calculateMetrics();
    
    return await response.blob();
}

function downloadAudio() {
    if (!generatedAudioUrl) return;

    const a = document.createElement('a');
    a.href = generatedAudioUrl;
    a.download = `meeting-briefing-${new Date().toISOString().slice(0, 10)}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ============================================
// AGENDA GENERATION
// ============================================
async function generateAgenda() {
    if (!state.results) return;

    const btn = elements.makeAgendaBtn;
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    // Show loading state
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    btn.disabled = true;

    try {
        let agendaText;

        // Build simplified agenda prompt
        const agendaPrompt = `Create a concise half-page agenda based on this meeting:

Action Items: ${state.results.actionItems}

Key Decisions/Topics: ${state.results.keyPoints}

Keep it brief - 4-6 sections max, 1-2 bullets each.`;

        if (state.chatMode === 'rlm' && rlmPipeline) {
            // Use RLM pipeline
            syncMeetingToRLM();

            // Create LLM call wrapper
            const llmCallWrapper = async (systemPrompt, userContent) => {
                return await callChatAPI(systemPrompt, userContent, 'RLM Agenda');
            };

            const result = await rlmPipeline.process(PROMPTS.agendaQuery, llmCallWrapper, {
                apiKey: state.apiKey
            });
            agendaText = result.response;
            console.log('[RLM] Agenda generated via RLM pipeline');
        } else {
            // Direct GPT call with simplified prompt
            agendaText = await callChatAPI(
                PROMPTS.agendaSystem,
                agendaPrompt,
                'Agenda Generation'
            );
        }

        // Display the agenda in the result card
        elements.resultAgenda.innerHTML = marked.parse(agendaText);

        // Open the agenda section
        elements.agendaSection.open = true;

        // Update metrics display
        displayMetrics();

    } catch (error) {
        console.error('Agenda generation error:', error);
        showError(error.message || 'Failed to generate agenda.');
    } finally {
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
        btn.disabled = false;
    }
}

// ============================================
// Infographic Generation (DALL-E 3)
// ============================================
async function generateInfographic() {
    if (!state.results) return;

    // Use default executive preset
    const preset = INFOGRAPHIC_PRESETS['executive'];
    const styleDescription = preset.style;
    const styleName = preset.name;

    console.log(`[Infographic] Generating with preset: executive`);

    // Show loading state if button exists (from old UI)
    const btn = elements.generateInfographicBtn;
    if (btn) {
        const btnText = btn.querySelector('.btn-text');
        const btnLoader = btn.querySelector('.btn-loader');
        if (btnText) btnText.classList.add('hidden');
        if (btnLoader) btnLoader.classList.remove('hidden');
        btn.disabled = true;
    }

    try {
        // Build the DALL-E prompt
        const dallePrompt = `Create a premium meeting infographic.

=== STYLE REQUIREMENTS ===
${styleDescription}

=== MEETING CONTENT TO VISUALIZE ===

TITLE: "Meeting Insights"

SUMMARY (main message):
${state.results.summary.substring(0, 250)}

KEY POINTS (display as 3-4 visual elements):
${state.results.keyPoints.split('\n').slice(0, 4).join('\n')}

ACTION ITEMS (show as tasks/checklist):
${state.results.actionItems.split('\n').slice(0, 3).join('\n')}

OVERALL TONE: ${state.results.sentiment}

=== MANDATORY LAYOUT RULES ===
- Landscape/horizontal orientation (1536x1024)
- Keep ALL content within safe margins (60px padding from edges)
- NO text or elements near edges that could be cut off
- Strong visual hierarchy with clear focal points
- Professional typography - readable at all sizes
- Cohesive design that feels premium and polished
- Make it visually EXCITING and ENGAGING, not boring or generic`;

        const imageUrl = await generateImage(dallePrompt);

        // Display the image
        elements.infographicImage.src = imageUrl;
        elements.infographicContainer.classList.remove('hidden');

        // Store URL for download
        generatedImageUrl = imageUrl;
        state.exportMeta.artifacts.infographic = {
            preset: 'executive',
            styleName,
            customPrompt: null,
            prompt: dallePrompt,
            size: '1536x1024',
            generatedAt: new Date().toISOString()
        };

        // Update metrics display
        displayMetrics();

    } catch (error) {
        console.error('Infographic generation error:', error);
        showError(error.message || 'Failed to generate infographic.');
    } finally {
        // Reset button state if it exists
        if (btn) {
            const btnText = btn.querySelector('.btn-text');
            const btnLoader = btn.querySelector('.btn-loader');
            if (btnText) btnText.classList.remove('hidden');
            if (btnLoader) btnLoader.classList.add('hidden');
            btn.disabled = false;
        }
    }
}

async function generateImage(prompt) {
    const response = await fetchOpenAI('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-image-1.5',
            prompt: prompt,
            n: 1,
            size: '1536x1024' // Landscape format for infographics
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Image generation failed: ${response.status}`);
    }

    const data = await response.json();

    // Track metrics from usage data
    const usage = data.usage || {};
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;

    currentMetrics.imageInputTokens += inputTokens;
    currentMetrics.imageOutputTokens += outputTokens;
    currentMetrics.apiCalls.push({
        name: 'Infographic',
        model: 'gpt-image-1.5',
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        size: '1536x1024'
    });
    
    // Recalculate and update metrics
    state.metrics = calculateMetrics();
    
    // Store base64 data for DOCX embedding
    const base64Data = data.data[0].b64_json;
    generatedImageBase64 = base64Data;
    
    // Return a data URL for display
    return `data:image/png;base64,${base64Data}`;
}

async function downloadInfographic() {
    if (!generatedImageBase64) return;
    
    try {
        // Convert base64 to blob for download
        const binaryString = atob(generatedImageBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `meeting-infographic-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Download error:', error);
        showError('Failed to download infographic. Try right-clicking the image and saving.');
    }
}

// ============================================
// URL Content Fetching
// ============================================
async function fetchUrlContent() {
    const url = elements.urlInput.value.trim();
    
    if (!url) {
        showError('Please enter a URL');
        return;
    }
    
    // Basic URL validation
    try {
        new URL(url);
    } catch {
        showError('Please enter a valid URL (e.g., https://example.com)');
        return;
    }
    
    const btn = elements.fetchUrlBtn;
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');
    
    btn.disabled = true;
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    
    // CORS proxies to try (in order)
    const corsProxies = [
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
    ];
    
    let html = null;
    let lastError = null;
    
    for (const proxyFn of corsProxies) {
        try {
            const proxyUrl = proxyFn(url);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
            
            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                html = await response.text();
                break;
            }
        } catch (e) {
            lastError = e;
            // Try next proxy
            continue;
        }
    }
    
    try {
        if (!html) {
            throw new Error(lastError?.name === 'AbortError' 
                ? 'Request timed out. Please check your connection and try again.'
                : 'Could not fetch the URL. The site may block external access or your connection may be unstable.');
        }
        
        // Extract text content from HTML
        const textContent = extractTextFromHtml(html);
        
        if (!textContent || textContent.length < 20) {
            throw new Error('Could not extract meaningful text from the webpage. The page may be empty or require JavaScript to load content.');
        }
        
        // Store the content
        state.urlContent = textContent;
        state.sourceUrl = url;
        state.exportMeta.source.url = url;
        
        // Show preview
        elements.urlPreviewContent.textContent = textContent.substring(0, 2000) + 
            (textContent.length > 2000 ? '\n\n... (content truncated for preview)' : '');
        elements.urlPreview.classList.remove('hidden');
        
        updateAnalyzeButton();
        
    } catch (error) {
        console.error('URL fetch error:', error);
        showError(error.message || 'Failed to fetch content from URL.');
    } finally {
        btn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
    }
}

function extractTextFromHtml(html) {
    // Create a temporary DOM element to parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Remove unwanted elements (more comprehensive list for better extraction)
    const unwantedSelectors = 'script, style, noscript, iframe, nav, footer, header, aside, [role="navigation"], [role="banner"], [role="contentinfo"], .nav, .navigation, .menu, .sidebar, .advertisement, .ad';
    doc.querySelectorAll(unwantedSelectors).forEach(el => el.remove());
    
    // Get text content from body
    const body = doc.body;
    if (!body) return '';
    
    // Use textContent (more reliable across browsers including mobile)
    let text = body.textContent || '';
    
    // Clean up whitespace more aggressively for consistent results
    text = text
        .replace(/[\t\r]+/g, ' ')       // Replace tabs and carriage returns with spaces
        .replace(/\n{3,}/g, '\n\n')     // Limit consecutive newlines to 2
        .replace(/ {2,}/g, ' ')         // Collapse multiple spaces
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
    
    return text.trim();
}

function clearUrlContent() {
    state.urlContent = null;
    state.sourceUrl = null;
    state.exportMeta.source.url = null;
    elements.urlInput.value = '';
    elements.urlPreview.classList.add('hidden');
    elements.urlPreviewContent.textContent = '';
    updateAnalyzeButton();
}

// ============================================
// Chat with Data
// ============================================


/**
 * Sync meeting data to RLM context store
 */
function syncMeetingToRLM() {
    if (!rlmPipeline || !state.results) return;

    // Create agent-like context from current meeting analysis
    const meetingAgent = {
        id: 'current-meeting',
        displayName: 'Current Meeting',
        title: 'Current Meeting Analysis',
        enabled: true,
        summary: state.results.summary || '',
        keyPoints: state.results.keyPoints || '',
        actionItems: state.results.actionItems || '',
        sentiment: state.results.sentiment || '',
        transcript: state.results.transcription || '',
        // Include extended context for better search
        extendedContext: [
            state.results.summary,
            state.results.keyPoints,
            state.results.actionItems
        ].filter(Boolean).join('\n\n')
    };

    // Load into RLM context store
    rlmPipeline.contextStore.loadAgents([meetingAgent]);
    console.log('[RLM] Meeting data synced to context store');
}

/**
 * Process chat using RLM pipeline
 * @param {string} query - User's question
 * @param {string} thinkingId - ID for thinking indicator updates
 * @returns {Promise<string>} - AI response
 */
async function chatWithRLM(query, thinkingId) {
    // Sync meeting data to RLM context store
    syncMeetingToRLM();

    // Clear RLM cache to ensure fresh results for each query
    // This prevents stale cached responses in Agent Builder mode
    if (rlmPipeline && rlmPipeline.clearCache) {
        rlmPipeline.clearCache();
    }

    // Create LLM call wrapper for RLM pipeline
    const llmCallWrapper = async (systemPrompt, userContent, context) => {
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
        ];

        // Add recent chat history for context continuity
        const recentHistory = state.chatHistory.slice(-4).map(h => ({
            role: h.role,
            content: h.content
        }));
        if (recentHistory.length > 0) {
            messages.splice(1, 0, ...recentHistory);
        }

        // Call GPT
        const response = await callChatAPI(
            systemPrompt,
            userContent,
            'RLM Chat',
            { includeHistory: false } // History already included
        );

        return response;
    };

    // Set up progress callback for thinking indicator
    rlmPipeline.setProgressCallback((step, type) => {
        if (thinkingId) {
            updateThinkingStatus(thinkingId, step);
        }
    });

    // Process through RLM pipeline
    const result = await rlmPipeline.process(query, llmCallWrapper, {
        apiKey: state.apiKey
    });

    // Clear progress callback
    rlmPipeline.setProgressCallback(null);

    // Log RLM metadata for debugging
    if (result.metadata) {
        console.log('[RLM] Query processed:', {
            strategy: result.metadata.strategy,
            subQueries: result.metadata.totalSubQueries,
            time: result.metadata.pipelineTime + 'ms'
        });
    }

    return result.response;
}

async function sendChatMessage() {
    const message = elements.chatInput.value.trim();
    if (!message || !state.results) return;

    // Disable input while processing
    elements.chatInput.disabled = true;
    elements.chatSendBtn.disabled = true;
    elements.chatInput.value = '';

    // Add user message to UI
    appendChatMessage('user', message);

    // Add to chat history
    state.chatHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    });

    // Show thinking indicator with train of thought
    const thinkingId = showThinkingIndicator();

    try {
        let response;

        if (state.chatMode === 'rlm') {
            // RLM Pipeline Processing
            updateThinkingStatus(thinkingId, 'Starting RLM pipeline...');
            response = await chatWithRLM(message, thinkingId);
        } else {
            // Direct GPT Processing (legacy)
            updateThinkingStatus(thinkingId, 'Understanding your question...');
            await sleep(300);

            updateThinkingStatus(thinkingId, 'Searching meeting data...');
            const context = buildChatContext();
            await sleep(200);

            updateThinkingStatus(thinkingId, 'Analyzing with AI...');
            response = await chatWithData(context, state.chatHistory);
        }

        // Processing response
        updateThinkingStatus(thinkingId, 'Preparing response...');
        await sleep(150);

        // Remove thinking indicator
        removeTypingIndicator(thinkingId);

        // Add assistant response to UI and history
        appendChatMessage('assistant', response);
        state.chatHistory.push({
            role: 'assistant',
            content: response,
            model: GPT_52_MODEL,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Chat error:', error);
        removeTypingIndicator(thinkingId);
        appendChatMessage('assistant', 'Sorry, I encountered an error processing your request. Please try again.');
    } finally {
        elements.chatInput.disabled = false;
        elements.chatSendBtn.disabled = false;
        elements.chatInput.focus();
    }
}

function buildChatContext() {
    const results = state.results;
    return `You have access to the following meeting data. Use this information to answer the user's questions accurately and helpfully.

=== MEETING TRANSCRIPT ===
${results.transcription}

=== ANALYSIS RESULTS ===

SUMMARY:
${results.summary}

KEY POINTS:
${results.keyPoints}

ACTION ITEMS:
${results.actionItems}

OVERALL SENTIMENT:
${results.sentiment}

=== END OF MEETING DATA ===

Instructions:
- Answer questions based on the meeting data above
- Be concise but thorough
- If something isn't mentioned in the meeting data, say so
- Use specific quotes or details from the transcript when relevant
- Format responses clearly with bullet points when listing multiple items`;
}

async function chatWithData(context, history) {
    // Build messages array with system context and conversation history
    const messages = [
        {
            role: 'system',
            content: context
        },
        ...history.slice(-10).map(entry => ({
            role: entry.role,
            content: entry.content
        })) // Keep last 10 messages to avoid token limits
    ];
    
    const response = await fetchOpenAI('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: GPT_52_MODEL,
            messages: messages,
            max_completion_tokens: 1000,
            temperature: 0.7
        })
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Chat failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Track metrics (uses same GPT-5.2 as analysis)
    const usage = data.usage || {};
    currentMetrics.gptInputTokens += usage.prompt_tokens || 0;
    currentMetrics.gptOutputTokens += usage.completion_tokens || 0;
    currentMetrics.apiCalls.push({
        name: 'Chat Query',
        model: GPT_52_MODEL,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0
    });
    
    // Update metrics display
    state.metrics = calculateMetrics();
    displayMetrics();
    
    return data.choices[0].message.content;
}

function appendChatMessage(role, content) {
    // Remove welcome message if it exists
    const welcome = elements.chatMessages.querySelector('.chat-welcome');
    if (welcome) {
        welcome.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'chat-message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-message-content';
    
    // Convert markdown-style formatting to HTML
    const formattedContent = formatChatContent(content);
    contentDiv.innerHTML = formattedContent;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);

    elements.chatMessages.appendChild(messageDiv);

    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

    // Increment unread count if widget is collapsed and message is from assistant
    if (role === 'assistant' && !chatWidgetState.isExpanded) {
        incrementUnreadCount();
    }
}

function formatChatContent(content) {
    // Use marked.js for proper markdown rendering if available
    if (typeof marked !== 'undefined') {
        return marked.parse(content);
    }
    
    // Fallback: basic formatting if marked.js not loaded
    let formatted = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^\s*[-•]\s+/gm, '▸ ')
        .replace(/\n/g, '<br>');
    
    return `<p>${formatted}</p>`;
}

function showThinkingIndicator() {
    const id = 'thinking-' + Date.now();
    const thinkingDiv = document.createElement('div');
    thinkingDiv.id = id;
    thinkingDiv.className = 'chat-message assistant';
    thinkingDiv.innerHTML = `
        <div class="chat-message-avatar">🤖</div>
        <div class="chat-thinking">
            <div class="thinking-spinner"></div>
            <span class="thinking-text">Thinking...</span>
        </div>
    `;
    elements.chatMessages.appendChild(thinkingDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    return id;
}

function updateThinkingStatus(id, status) {
    const thinkingDiv = document.getElementById(id);
    if (thinkingDiv) {
        const textSpan = thinkingDiv.querySelector('.thinking-text');
        if (textSpan) {
            textSpan.textContent = status;
        }
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    }
}

// Keep legacy function for compatibility
function showTypingIndicator() {
    return showThinkingIndicator();
}

function removeTypingIndicator(id) {
    const typingDiv = document.getElementById(id);
    if (typingDiv) {
        typingDiv.remove();
    }
}

function resetChatHistory() {
    state.chatHistory = [];
    if (elements.chatMessages) {
        elements.chatMessages.innerHTML = `
            <div class="chat-welcome">
                <div class="chat-welcome-icon">🤖</div>
                <div class="chat-welcome-text">
                    <strong>Meeting Assistant</strong>
                    <p>I have access to your transcript and analysis. Ask me about decisions, action items, specific topics, or anything else from the meeting.</p>
                </div>
            </div>
        `;
    }
}

function restoreChatHistoryUI() {
    if (!elements.chatMessages || state.chatHistory.length === 0) return;
    elements.chatMessages.innerHTML = '';
    state.chatHistory.forEach(message => {
        appendChatMessage(message.role, message.content);
    });
}

// ============================================
// Floating Chat Widget
// ============================================

function initChatWidget() {
    if (!elements.chatWidget) return;

    // Load saved position/state
    loadChatWidgetState();

    // Apply initial position
    applyChatWidgetPosition();

    // Toggle button click - expand widget
    if (elements.chatWidgetToggle) {
        elements.chatWidgetToggle.addEventListener('click', expandChatWidget);
    }

    // Minimize button click - collapse widget
    if (elements.chatWidgetMinimize) {
        elements.chatWidgetMinimize.addEventListener('click', collapseChatWidget);
    }

    // Drag handlers for header
    if (elements.chatWidgetHeader) {
        elements.chatWidgetHeader.addEventListener('mousedown', startWidgetDrag);
        elements.chatWidgetHeader.addEventListener('touchstart', startWidgetDrag, { passive: false });
    }

    // Global move/end handlers
    document.addEventListener('mousemove', moveWidgetDrag);
    document.addEventListener('mouseup', endWidgetDrag);
    document.addEventListener('touchmove', moveWidgetDrag, { passive: false });
    document.addEventListener('touchend', endWidgetDrag);

    console.log('[ChatWidget] Initialized with anchor:', chatWidgetState.anchor);
}

function loadChatWidgetState() {
    try {
        const saved = localStorage.getItem('chat_widget_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            chatWidgetState.anchor = parsed.anchor || 'bottom-right';
            chatWidgetState.isExpanded = parsed.isExpanded || false;
            chatWidgetState.position = parsed.position || { x: null, y: null };
        }
    } catch (e) {
        console.warn('[ChatWidget] Failed to load saved state:', e);
    }
}

function saveChatWidgetState() {
    try {
        localStorage.setItem('chat_widget_state', JSON.stringify({
            anchor: chatWidgetState.anchor,
            isExpanded: chatWidgetState.isExpanded,
            position: chatWidgetState.position
        }));
    } catch (e) {
        console.warn('[ChatWidget] Failed to save state:', e);
    }
}

function applyChatWidgetPosition() {
    if (!elements.chatWidget) return;

    // Remove all anchor classes
    elements.chatWidget.classList.remove(
        'anchor-top-left', 'anchor-top-right',
        'anchor-bottom-left', 'anchor-bottom-right',
        'free-position'
    );

    // Apply anchor or free position
    if (chatWidgetState.position.x !== null && chatWidgetState.position.y !== null) {
        elements.chatWidget.classList.add('free-position');
        elements.chatWidget.style.left = chatWidgetState.position.x + 'px';
        elements.chatWidget.style.top = chatWidgetState.position.y + 'px';
        elements.chatWidget.style.right = 'auto';
        elements.chatWidget.style.bottom = 'auto';
    } else {
        elements.chatWidget.classList.add('anchor-' + chatWidgetState.anchor);
        elements.chatWidget.style.left = '';
        elements.chatWidget.style.top = '';
        elements.chatWidget.style.right = '';
        elements.chatWidget.style.bottom = '';
    }

    // Apply expanded/collapsed state
    if (chatWidgetState.isExpanded) {
        elements.chatWidget.classList.remove('collapsed');
    } else {
        elements.chatWidget.classList.add('collapsed');
    }
}

function showChatWidget() {
    if (!elements.chatWidget) return;
    elements.chatWidget.classList.remove('hidden');
    console.log('[ChatWidget] Shown');
}

function hideChatWidget() {
    if (!elements.chatWidget) return;
    elements.chatWidget.classList.add('hidden');
    console.log('[ChatWidget] Hidden');
}

function expandChatWidget() {
    if (!elements.chatWidget) return;
    chatWidgetState.isExpanded = true;
    elements.chatWidget.classList.remove('collapsed');

    // Clear unread count
    chatWidgetState.unreadCount = 0;
    updateUnreadBadge();

    saveChatWidgetState();
    console.log('[ChatWidget] Expanded');

    // Focus input
    if (elements.chatInput) {
        setTimeout(() => elements.chatInput.focus(), 100);
    }
}

function collapseChatWidget() {
    if (!elements.chatWidget) return;
    chatWidgetState.isExpanded = false;
    elements.chatWidget.classList.add('collapsed');
    saveChatWidgetState();
    console.log('[ChatWidget] Collapsed');
}

function updateUnreadBadge() {
    if (!elements.chatUnreadBadge) return;

    if (chatWidgetState.unreadCount > 0) {
        elements.chatUnreadBadge.textContent = chatWidgetState.unreadCount > 99 ? '99+' : chatWidgetState.unreadCount;
        elements.chatUnreadBadge.classList.remove('hidden');
    } else {
        elements.chatUnreadBadge.classList.add('hidden');
    }
}

function incrementUnreadCount() {
    if (chatWidgetState.isExpanded) return;
    chatWidgetState.unreadCount++;
    updateUnreadBadge();
}

// Drag handlers
function startWidgetDrag(e) {
    // Skip on mobile
    if (window.innerWidth <= 768) return;

    // Only drag from header, not from buttons
    if (e.target.closest('.btn-widget-control')) return;

    e.preventDefault();
    chatWidgetState.isDragging = true;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const rect = elements.chatWidget.getBoundingClientRect();
    chatWidgetState.dragOffset.x = clientX - rect.left;
    chatWidgetState.dragOffset.y = clientY - rect.top;

    elements.chatWidget.classList.add('dragging');

    // Show anchor zones
    if (elements.anchorZones) {
        elements.anchorZones.classList.remove('hidden');
    }
}

function moveWidgetDrag(e) {
    if (!chatWidgetState.isDragging) return;

    e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const newX = clientX - chatWidgetState.dragOffset.x;
    const newY = clientY - chatWidgetState.dragOffset.y;

    // Set free position
    elements.chatWidget.classList.remove(
        'anchor-top-left', 'anchor-top-right',
        'anchor-bottom-left', 'anchor-bottom-right'
    );
    elements.chatWidget.classList.add('free-position');
    elements.chatWidget.style.left = newX + 'px';
    elements.chatWidget.style.top = newY + 'px';
    elements.chatWidget.style.right = 'auto';
    elements.chatWidget.style.bottom = 'auto';

    // Check anchor zones
    checkAnchorZones(clientX, clientY);
}

function endWidgetDrag(e) {
    if (!chatWidgetState.isDragging) return;

    chatWidgetState.isDragging = false;
    elements.chatWidget.classList.remove('dragging');

    // Hide anchor zones
    if (elements.anchorZones) {
        elements.anchorZones.classList.add('hidden');
        // Clear active states
        elements.anchorZones.querySelectorAll('.anchor-zone').forEach(zone => {
            zone.classList.remove('active');
        });
    }

    // Check if snapping to anchor
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

    const anchor = getClosestAnchor(clientX, clientY);
    if (anchor) {
        // Snap to anchor
        chatWidgetState.anchor = anchor;
        chatWidgetState.position = { x: null, y: null };
    } else {
        // Keep free position
        const rect = elements.chatWidget.getBoundingClientRect();
        chatWidgetState.position = { x: rect.left, y: rect.top };
    }

    applyChatWidgetPosition();
    saveChatWidgetState();
}

function checkAnchorZones(x, y) {
    if (!elements.anchorZones) return;

    const threshold = 80;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const zones = elements.anchorZones.querySelectorAll('.anchor-zone');
    zones.forEach(zone => {
        const pos = zone.dataset.position;
        let isActive = false;

        if (pos === 'top-left' && x < threshold && y < threshold) isActive = true;
        if (pos === 'top-right' && x > vw - threshold && y < threshold) isActive = true;
        if (pos === 'bottom-left' && x < threshold && y > vh - threshold) isActive = true;
        if (pos === 'bottom-right' && x > vw - threshold && y > vh - threshold) isActive = true;

        zone.classList.toggle('active', isActive);
    });
}

function getClosestAnchor(x, y) {
    const threshold = 80;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (x < threshold && y < threshold) return 'top-left';
    if (x > vw - threshold && y < threshold) return 'top-right';
    if (x < threshold && y > vh - threshold) return 'bottom-left';
    if (x > vw - threshold && y > vh - threshold) return 'bottom-right';

    return null;
}

// ============================================
// Voice Chat - Turn-Based
// ============================================

let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyser = null;
let volumeAnimationId = null;
let voiceStream = null;
let stopRecordingTimeout = null;
let isRecordingReady = false;

// Configuration
const VOICE_START_DELAY = 500;  // ms to wait before "Start speaking"
const VOICE_STOP_DELAY = 600;   // ms to wait after release before stopping

async function startVoiceRecording() {
    // Prevent multiple recordings
    if (state.isRecording) return;

    try {
        // Show status immediately
        showVoiceStatus('Preparing...', false);
        updateVoiceButtonUI(true);

        // Get microphone access
        voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Set up audio context for volume analysis
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const source = audioContext.createMediaStreamSource(voiceStream);
        source.connect(analyser);

        // Set up media recorder
        mediaRecorder = new MediaRecorder(voiceStream, { mimeType: 'audio/webm' });
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            // Stop volume visualization
            if (volumeAnimationId) {
                cancelAnimationFrame(volumeAnimationId);
                volumeAnimationId = null;
            }

            // Clean up audio context
            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }

            // Stop all tracks
            if (voiceStream) {
                voiceStream.getTracks().forEach(track => track.stop());
                voiceStream = null;
            }

            // Hide status
            hideVoiceStatus();

            // Process the recording
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await processVoiceInput(audioBlob);
        };

        // Start recording after a brief delay
        state.isRecording = true;
        isRecordingReady = false;

        // Brief preparation period
        setTimeout(() => {
            if (state.isRecording && mediaRecorder && mediaRecorder.state === 'inactive') {
                mediaRecorder.start();
                isRecordingReady = true;
                showVoiceStatus('Start speaking...', true);
                startVolumeVisualization();
                console.log('[Voice] Recording started');

                // After a moment, change to "Listening..."
                setTimeout(() => {
                    if (state.isRecording) {
                        updateVoiceStatusText('Listening...');
                    }
                }, 1000);
            }
        }, VOICE_START_DELAY);

    } catch (error) {
        console.error('[Voice] Microphone access denied:', error);
        showError('Microphone access is required for voice input.');
        cleanupVoiceRecording();
    }
}

function stopVoiceRecording() {
    // Clear any pending stop timeout
    if (stopRecordingTimeout) {
        clearTimeout(stopRecordingTimeout);
        stopRecordingTimeout = null;
    }

    if (!state.isRecording) return;

    // Update status to show we're finishing
    updateVoiceStatusText('Finishing...');

    // Add delay before actually stopping to capture trailing audio
    stopRecordingTimeout = setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            console.log('[Voice] Recording stopped');
        }
        state.isRecording = false;
        isRecordingReady = false;
        updateVoiceButtonUI(false);
    }, VOICE_STOP_DELAY);
}

function cleanupVoiceRecording() {
    // Clear timeouts
    if (stopRecordingTimeout) {
        clearTimeout(stopRecordingTimeout);
        stopRecordingTimeout = null;
    }

    // Stop volume visualization
    if (volumeAnimationId) {
        cancelAnimationFrame(volumeAnimationId);
        volumeAnimationId = null;
    }

    // Clean up audio context
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    // Stop all tracks
    if (voiceStream) {
        voiceStream.getTracks().forEach(track => track.stop());
        voiceStream = null;
    }

    // Reset state
    state.isRecording = false;
    isRecordingReady = false;
    mediaRecorder = null;
    audioChunks = [];

    // Update UI
    updateVoiceButtonUI(false);
    hideVoiceStatus();
}

function startVolumeVisualization() {
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function updateVolume() {
        if (!state.isRecording || !analyser) return;

        analyser.getByteFrequencyData(dataArray);

        // Calculate average volume
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const volumePercent = Math.min(100, (average / 128) * 100);

        // Update volume bar
        if (elements.voiceVolumeBar) {
            elements.voiceVolumeBar.style.width = volumePercent + '%';
        }

        volumeAnimationId = requestAnimationFrame(updateVolume);
    }

    updateVolume();
}

function showVoiceStatus(text, isReady) {
    if (elements.voiceRecordingStatus) {
        elements.voiceRecordingStatus.classList.remove('hidden');
    }
    if (elements.voiceStatusText) {
        elements.voiceStatusText.textContent = text;
        elements.voiceStatusText.classList.toggle('ready', isReady);
    }
    if (elements.voiceVolumeBar) {
        elements.voiceVolumeBar.style.width = '0%';
    }
}

function updateVoiceStatusText(text) {
    if (elements.voiceStatusText) {
        elements.voiceStatusText.textContent = text;
    }
}

function hideVoiceStatus() {
    if (elements.voiceRecordingStatus) {
        elements.voiceRecordingStatus.classList.add('hidden');
    }
}

async function processVoiceInput(audioBlob) {
    if (!state.results) {
        showError('Please analyze a meeting first before using voice chat.');
        return;
    }

    // Disable voice button while processing
    if (elements.voiceInputBtn) {
        elements.voiceInputBtn.disabled = true;
    }

    // Show thinking indicator
    const thinkingId = showThinkingIndicator();
    updateThinkingStatus(thinkingId, 'Transcribing your voice...');

    try {
        // Step 1: Transcribe with Whisper
        const transcript = await transcribeVoiceInput(audioBlob);
        if (!transcript || transcript.trim().length === 0) {
            removeTypingIndicator(thinkingId);
            showError('Could not understand audio. Please try again.');
            return;
        }

        // Display transcribed text as user message
        appendChatMessage('user', transcript);
        state.chatHistory.push({
            role: 'user',
            content: transcript,
            timestamp: new Date().toISOString(),
            inputMethod: 'voice'
        });

        // Step 2: Get chat response (RLM or Direct)
        let response;
        if (state.chatMode === 'rlm') {
            updateThinkingStatus(thinkingId, 'Processing with RLM...');
            response = await chatWithRLM(transcript, thinkingId);
        } else {
            updateThinkingStatus(thinkingId, 'Analyzing with AI...');
            const context = buildChatContext();
            response = await chatWithData(context, state.chatHistory);
        }

        // Remove thinking indicator
        removeTypingIndicator(thinkingId);

        // Display text response
        appendChatMessage('assistant', response);
        state.chatHistory.push({
            role: 'assistant',
            content: response,
            model: GPT_52_MODEL,
            timestamp: new Date().toISOString()
        });

        // Step 3: Speak response if enabled
        if (state.voiceResponseEnabled) {
            await speakResponse(response);
        }

    } catch (error) {
        console.error('[Voice] Processing error:', error);
        removeTypingIndicator(thinkingId);
        showError('Voice processing failed. Please try again.');
    } finally {
        if (elements.voiceInputBtn) {
            elements.voiceInputBtn.disabled = false;
        }
    }
}

async function transcribeVoiceInput(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'voice-input.webm');
    formData.append('model', 'whisper-1');

    const response = await fetchOpenAI('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${state.apiKey}`
        },
        body: formData
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || 'Transcription failed');
    }

    const data = await response.json();

    // Track metrics - estimate ~6 seconds for typical voice input
    currentMetrics.whisperMinutes += 0.1;
    currentMetrics.apiCalls.push({
        name: 'Voice Transcription',
        model: 'whisper-1',
        duration: '~6s'
    });

    // Update metrics display
    state.metrics = calculateMetrics();
    displayMetrics();

    return data.text;
}

async function speakResponse(text) {
    // Strip markdown formatting for cleaner TTS
    let cleanText = text
        .replace(/#{1,6}\s*/g, '') // Remove headers
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.+?)\*/g, '$1') // Remove italics
        .replace(/`(.+?)`/g, '$1') // Remove inline code
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/^\s*[-•]\s+/gm, '') // Remove bullet points
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
        .trim();

    // Truncate long responses for TTS (max ~500 chars for reasonable playback)
    if (cleanText.length > 500) {
        cleanText = cleanText.substring(0, 497) + '...';
    }

    if (!cleanText) {
        console.log('[Voice] No text to speak after cleaning');
        return;
    }

    try {
        const audioBlob = await textToSpeech(cleanText, 'nova');
        const audioUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(audioUrl);
        audio.onended = () => URL.revokeObjectURL(audioUrl);
        await audio.play();

        console.log('[Voice] TTS playback started');

    } catch (error) {
        console.error('[Voice] TTS playback failed:', error);
        // Fail silently - text response is already displayed
    }
}

function updateVoiceButtonUI(isRecording) {
    const btn = elements.voiceInputBtn;
    if (!btn) return;

    const icon = btn.querySelector('.voice-icon');
    const recording = btn.querySelector('.voice-recording');

    if (isRecording) {
        btn.classList.add('recording');
        if (icon) icon.classList.add('hidden');
        if (recording) recording.classList.remove('hidden');
    } else {
        btn.classList.remove('recording');
        if (icon) icon.classList.remove('hidden');
        if (recording) recording.classList.add('hidden');
    }
}

function updateVoiceModeUI() {
    const isPushToTalk = state.voiceMode === 'push-to-talk';

    // Show/hide appropriate controls
    if (elements.voiceInputBtn) {
        elements.voiceInputBtn.classList.toggle('hidden', !isPushToTalk);
    }
    if (elements.realtimePanel) {
        elements.realtimePanel.classList.toggle('hidden', isPushToTalk);
    }
}

// ============================================
// Real-time Voice Conversation
// ============================================

let realtimeWs = null;
let realtimeAudioContext = null;
let realtimeMediaStream = null;
let realtimeWorkletNode = null;
let realtimeCostInterval = null;
let realtimeStartTime = null;
let silenceTimeout = null;
let lastAudioTime = null;

// Pricing: $0.06/min input + $0.24/min output ≈ $0.30/min total
const REALTIME_COST_PER_MINUTE = 0.30;
const SILENCE_TIMEOUT_MS = 5000; // 5 seconds

async function startRealtimeConversation() {
    if (state.realtimeActive) return;

    if (!state.results) {
        showError('Please analyze a meeting first before using voice chat.');
        return;
    }

    if (!state.apiKey) {
        showError('Please enter your OpenAI API key first.');
        return;
    }

    try {
        updateRealtimeStatus('Requesting microphone...', false);
        showRealtimeStatus();

        // 1. Get microphone access with 24kHz sample rate
        realtimeMediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 24000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            }
        });

        updateRealtimeStatus('Connecting to OpenAI...', false);

        // 2. Set up audio context at 24kHz for Realtime API
        realtimeAudioContext = new AudioContext({ sampleRate: 24000 });

        // Log actual sample rate (browser may not honor the requested rate)
        console.log('[Realtime] AudioContext sample rate:', realtimeAudioContext.sampleRate);
        if (realtimeAudioContext.sampleRate !== 24000) {
            console.warn('[Realtime] Warning: Browser using', realtimeAudioContext.sampleRate, 'Hz instead of 24000 Hz');
        }

        // 3. Connect to OpenAI Realtime API
        const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';
        realtimeWs = new WebSocket(wsUrl, [
            'realtime',
            `openai-insecure-api-key.${state.apiKey}`
        ]);

        realtimeWs.onopen = async () => {
            console.log('[Realtime] WebSocket connected');
            updateRealtimeStatus('Configuring session...', false);

            // Configure session with meeting context
            // Note: GA Realtime API uses nested audio.input/output structure
            const sessionConfig = {
                type: 'session.update',
                session: {
                    type: 'realtime',
                    output_modalities: ['audio'],
                    instructions: buildRealtimeSystemPrompt(),
                    audio: {
                        input: {
                            format: {
                                type: 'audio/pcm',
                                rate: 24000
                            },
                            turn_detection: {
                                type: 'server_vad',
                                threshold: 0.5,
                                prefix_padding_ms: 300,
                                silence_duration_ms: 500,
                                create_response: true
                            }
                        },
                        output: {
                            format: {
                                type: 'audio/pcm',
                                rate: 24000
                            },
                            voice: 'marin'
                        }
                    }
                }
            };
            console.log('[Realtime] Sending session config:', JSON.stringify(sessionConfig, null, 2));
            realtimeWs.send(JSON.stringify(sessionConfig));

            // Wait briefly for session to configure before starting audio
            await new Promise(resolve => setTimeout(resolve, 500));

            // Start audio streaming
            await startRealtimeAudioStream();

            // Mark as active
            state.realtimeActive = true;
            state.realtimeSessionCost = 0;
            realtimeStartTime = Date.now();
            lastAudioTime = Date.now();

            // Start cost counter
            realtimeCostInterval = setInterval(updateRealtimeCost, 1000);

            // Start silence detection
            startSilenceDetection();

            // Update UI
            updateRealtimeStatus('Listening... speak now!', true);
            updateRealtimeButtons(true);
            console.log('[Realtime] Session started');
        };

        realtimeWs.onmessage = handleRealtimeMessage;

        realtimeWs.onerror = (error) => {
            console.error('[Realtime] WebSocket error:', error);
            updateRealtimeStatus('Connection error', false, true);
            stopRealtimeConversation();
        };

        realtimeWs.onclose = (event) => {
            console.log('[Realtime] WebSocket closed:', event.code, event.reason);
            if (state.realtimeActive) {
                stopRealtimeConversation();
            }
        };

    } catch (error) {
        console.error('[Realtime] Setup failed:', error);
        showError('Failed to start real-time conversation: ' + error.message);
        cleanupRealtimeResources();
    }
}

function stopRealtimeConversation() {
    console.log('[Realtime] Stopping conversation...');

    // Stop silence detection
    if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
    }

    // Stop cost counter
    if (realtimeCostInterval) {
        clearInterval(realtimeCostInterval);
        realtimeCostInterval = null;
    }

    // Clean up resources
    cleanupRealtimeResources();

    // Update state
    state.realtimeActive = false;

    // Update UI
    updateRealtimeButtons(false);
    updateRealtimeStatus('Conversation ended', false);

    // Log final cost
    console.log(`[Realtime] Session ended. Total cost: $${state.realtimeSessionCost.toFixed(4)}`);
}

function cleanupRealtimeResources() {
    // Close WebSocket
    if (realtimeWs) {
        if (realtimeWs.readyState === WebSocket.OPEN) {
            realtimeWs.close();
        }
        realtimeWs = null;
    }

    // Stop worklet
    if (realtimeWorkletNode) {
        realtimeWorkletNode.disconnect();
        realtimeWorkletNode = null;
    }

    // Close audio context
    if (realtimeAudioContext && realtimeAudioContext.state !== 'closed') {
        realtimeAudioContext.close();
        realtimeAudioContext = null;
    }

    // Stop media stream
    if (realtimeMediaStream) {
        realtimeMediaStream.getTracks().forEach(track => track.stop());
        realtimeMediaStream = null;
    }
}

async function startRealtimeAudioStream() {
    // Check if context is still valid (may have been cleaned up due to error)
    if (!realtimeAudioContext || !realtimeMediaStream) {
        console.log('[Realtime] Audio context or stream no longer available, skipping audio setup');
        return;
    }

    try {
        // Load audio worklet
        await realtimeAudioContext.audioWorklet.addModule('js/audio-worklet-processor.js');

        // Create source from microphone
        const source = realtimeAudioContext.createMediaStreamSource(realtimeMediaStream);

        // Create worklet node
        realtimeWorkletNode = new AudioWorkletNode(realtimeAudioContext, 'pcm16-processor');

        // Handle audio data from worklet
        realtimeWorkletNode.port.onmessage = (event) => {
            if (event.data.type === 'audio' && realtimeWs?.readyState === WebSocket.OPEN) {
                // Update last audio time for silence detection
                lastAudioTime = Date.now();

                // Send audio chunk to API
                const base64Audio = arrayBufferToBase64(event.data.data);
                realtimeWs.send(JSON.stringify({
                    type: 'input_audio_buffer.append',
                    audio: base64Audio
                }));
            }
        };

        // Connect: mic → worklet
        source.connect(realtimeWorkletNode);

        console.log('[Realtime] Audio streaming started');

    } catch (error) {
        console.error('[Realtime] Audio stream setup failed:', error);
        throw error;
    }
}

function buildRealtimeSystemPrompt() {
    const results = state.results;
    return `You are a helpful meeting assistant having a voice conversation. You have access to the following meeting data:

SUMMARY: ${results?.summary || 'No summary available'}

KEY POINTS: ${results?.keyPoints || 'No key points'}

ACTION ITEMS: ${results?.actionItems || 'No action items'}

SENTIMENT: ${results?.sentiment || 'Unknown'}

Instructions:
- Answer questions about this meeting concisely and conversationally.
- Keep responses brief (1-3 sentences) for natural conversation flow.
- If asked about something not in the meeting, say you don't have that information.
- Be helpful, friendly, and to the point.`;
}

function handleRealtimeMessage(event) {
    const message = JSON.parse(event.data);

    switch (message.type) {
        case 'session.created':
            console.log('[Realtime] Session created:', message.session?.id);
            break;

        case 'session.updated':
            console.log('[Realtime] Session updated');
            break;

        case 'input_audio_buffer.speech_started':
            updateRealtimeStatus('You are speaking...', true);
            lastAudioTime = Date.now(); // Reset silence timer
            break;

        case 'input_audio_buffer.speech_stopped':
            updateRealtimeStatus('Processing...', true);
            break;

        case 'conversation.item.input_audio_transcription.completed':
            // User's transcribed speech
            if (message.transcript) {
                appendChatMessage('user', message.transcript);
                state.chatHistory.push({
                    role: 'user',
                    content: message.transcript,
                    timestamp: new Date().toISOString(),
                    inputMethod: 'realtime'
                });
            }
            break;

        case 'response.output_audio.delta':
        case 'response.audio.delta': // Keep beta event name for compatibility
            // Play incoming audio chunk
            playRealtimeAudioChunk(message.delta);
            updateRealtimeStatus('Assistant speaking...', true);
            lastAudioTime = Date.now(); // Reset silence timer during response
            break;

        case 'response.output_audio_transcript.delta':
        case 'response.audio_transcript.delta': // Keep beta event name for compatibility
            // Could show live transcript here if needed
            break;

        case 'response.done':
            // Response complete
            if (message.response?.output) {
                const output = message.response.output[0];
                if (output?.content) {
                    const textContent = output.content.find(c => c.type === 'text');
                    const audioContent = output.content.find(c => c.type === 'audio');
                    const transcript = audioContent?.transcript || textContent?.text;

                    if (transcript) {
                        appendChatMessage('assistant', transcript);
                        state.chatHistory.push({
                            role: 'assistant',
                            content: transcript,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
            updateRealtimeStatus('Listening...', true);
            lastAudioTime = Date.now(); // Reset silence timer after response
            break;

        case 'error':
            // Log full error details for debugging
            console.error('[Realtime] API error:', JSON.stringify(message.error, null, 2));
            console.error('[Realtime] Full error message:', message);
            const errorMsg = message.error?.message || message.error?.code || 'Unknown error';
            const errorCode = message.error?.code || '';
            updateRealtimeStatus(`Error: ${errorMsg}`, false, true);

            // Show user-friendly error message
            if (errorCode === 'invalid_api_key' || errorMsg.includes('authentication')) {
                showError('Realtime API authentication failed. Please check your API key has Realtime API access.');
            } else if (errorCode === 'model_not_found' || errorMsg.includes('model')) {
                showError('Realtime API model not available. Please ensure your API key has access to gpt-4o-realtime-preview.');
            } else if (errorMsg.includes('audio') || errorMsg.includes('format')) {
                showError('Audio format error. Please try again or use Push-to-Talk mode.');
            } else {
                showError(`Realtime API error: ${errorMsg}`);
            }

            // Stop the conversation on error
            stopRealtimeConversation();
            break;

        default:
            // Log other message types for debugging
            if (message.type && !message.type.startsWith('response.audio')) {
                console.log('[Realtime] Message:', message.type);
            }
    }
}

// Audio playback queue
let audioPlaybackQueue = [];
let isPlayingRealtimeAudio = false;

async function playRealtimeAudioChunk(base64Audio) {
    if (!realtimeAudioContext || realtimeAudioContext.state === 'closed') return;

    try {
        const audioData = base64ToArrayBuffer(base64Audio);
        audioPlaybackQueue.push(audioData);

        if (!isPlayingRealtimeAudio) {
            playNextRealtimeChunk();
        }
    } catch (error) {
        console.error('[Realtime] Audio playback error:', error);
    }
}

async function playNextRealtimeChunk() {
    if (audioPlaybackQueue.length === 0 || !realtimeAudioContext) {
        isPlayingRealtimeAudio = false;
        return;
    }

    isPlayingRealtimeAudio = true;
    const audioData = audioPlaybackQueue.shift();

    try {
        // Convert PCM16 to AudioBuffer
        const int16Array = new Int16Array(audioData);
        const audioBuffer = realtimeAudioContext.createBuffer(1, int16Array.length, 24000);
        const channelData = audioBuffer.getChannelData(0);

        for (let i = 0; i < int16Array.length; i++) {
            channelData[i] = int16Array[i] / 32768;
        }

        const source = realtimeAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(realtimeAudioContext.destination);
        source.onended = playNextRealtimeChunk;
        source.start();
    } catch (error) {
        console.error('[Realtime] Chunk playback error:', error);
        playNextRealtimeChunk(); // Try next chunk
    }
}

// Silence detection
function startSilenceDetection() {
    checkSilence();
}

function checkSilence() {
    if (!state.realtimeActive) return;

    const timeSinceLastAudio = Date.now() - lastAudioTime;

    if (timeSinceLastAudio >= SILENCE_TIMEOUT_MS) {
        console.log('[Realtime] Silence timeout - stopping conversation');
        updateRealtimeStatus('Stopped (5s silence)', false);
        stopRealtimeConversation();
        return;
    }

    // Check again in 1 second
    silenceTimeout = setTimeout(checkSilence, 1000);
}

// Cost tracking
function updateRealtimeCost() {
    if (!state.realtimeActive || !realtimeStartTime) return;

    const elapsedMinutes = (Date.now() - realtimeStartTime) / 60000;
    state.realtimeSessionCost = elapsedMinutes * REALTIME_COST_PER_MINUTE;

    if (elements.realtimeCost) {
        elements.realtimeCost.textContent = '$' + state.realtimeSessionCost.toFixed(2);
    }
}

// UI helpers
function showRealtimeStatus() {
    if (elements.realtimeStatus) {
        elements.realtimeStatus.classList.remove('hidden');
    }
}

function updateRealtimeStatus(text, isActive, isError = false) {
    if (elements.realtimeStatusText) {
        elements.realtimeStatusText.textContent = text;
    }

    const statusDot = document.querySelector('.realtime-status .status-dot');
    if (statusDot) {
        statusDot.classList.toggle('pulsing', isActive);
        statusDot.classList.toggle('error', isError);
    }
}

function updateRealtimeButtons(isActive) {
    if (elements.startRealtimeBtn) {
        elements.startRealtimeBtn.classList.toggle('hidden', isActive);
    }
    if (elements.stopRealtimeBtn) {
        elements.stopRealtimeBtn.classList.toggle('hidden', !isActive);
    }
}

// Helper functions
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// ============================================
// Agent Export/Import
// ============================================

function generateSuggestedAgentName() {
    if (!state.results) return 'Meeting Agent';
    
    // Try to extract a meaningful name from the summary
    const summary = state.results.summary || '';
    
    // Get first sentence and clean it up
    let title = summary.split('.')[0].trim();
    
    // Remove common prefixes
    title = title.replace(/^(This meeting|The meeting|Meeting|This call|The call|In this meeting|During this meeting)/i, '').trim();
    
    // Capitalize first letter
    if (title.length > 0) {
        title = title.charAt(0).toUpperCase() + title.slice(1);
    }
    
    // Limit length and clean up
    if (title.length > 60) {
        title = title.substring(0, 57) + '...';
    }
    
    // Fallback if title is too short or empty
    if (title.length < 5) {
        const now = new Date();
        title = `Meeting ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    
    return title;
}

function showAgentNameModal() {
    if (!state.results) {
        showError('No analysis results to export. Please analyze content first.');
        return;
    }
    
    // Generate and pre-populate suggested name
    const suggestedName = generateSuggestedAgentName();
    elements.agentNameInput.value = suggestedName;
    
    // Show modal
    elements.agentNameModal.classList.remove('hidden');
    
    // Focus and select the input
    setTimeout(() => {
        elements.agentNameInput.focus();
        elements.agentNameInput.select();
    }, 100);
}

function hideAgentNameModal() {
    elements.agentNameModal.classList.add('hidden');
    elements.agentNameInput.value = '';
}

function showHelpModal() {
    elements.helpModal.classList.remove('hidden');
}

function hideHelpModal() {
    elements.helpModal.classList.add('hidden');
}

function toggleAboutDropdown() {
    elements.aboutDropdown.classList.toggle('hidden');
}

// ============================================
// Settings Panel
// ============================================
function openSettingsPanel() {
    if (elements.settingsPanel && elements.settingsOverlay) {
        elements.settingsPanel.classList.add('visible');
        elements.settingsPanel.classList.remove('hidden');
        elements.settingsOverlay.classList.add('visible');
        elements.settingsOverlay.classList.remove('hidden');
        // Sync API key from main input to settings
        if (elements.settingsApiKey && state.apiKey) {
            elements.settingsApiKey.value = state.apiKey;
        }
    }
}

function closeSettingsPanel() {
    if (elements.settingsPanel && elements.settingsOverlay) {
        elements.settingsPanel.classList.remove('visible');
        elements.settingsOverlay.classList.remove('visible');
    }
}

function toggleSettingsApiKeyVisibility() {
    if (elements.settingsApiKey && elements.settingsToggleKey) {
        const isPassword = elements.settingsApiKey.type === 'password';
        elements.settingsApiKey.type = isPassword ? 'text' : 'password';
        elements.settingsToggleKey.textContent = isPassword ? '🙈' : '👁️';
    }
}

function saveSettingsApiKey() {
    if (elements.settingsApiKey) {
        const newKey = elements.settingsApiKey.value.trim();
        if (newKey && newKey !== state.apiKey) {
            state.apiKey = newKey;
            // Sync to main API key input
            if (elements.apiKeyInput) {
                elements.apiKeyInput.value = newKey;
            }
            localStorage.setItem('openai_api_key', newKey);
            updateAnalyzeButton();
            console.log('[Settings] API key saved');
        }
    }
}

function loadSettings() {
    // Load voice response toggle
    const voiceResponse = localStorage.getItem('settings_voice_response');
    if (voiceResponse !== null) {
        const enabled = voiceResponse === 'true';
        state.voiceResponseEnabled = enabled;
        if (elements.settingsVoiceResponse) {
            elements.settingsVoiceResponse.checked = enabled;
        }
        if (elements.voiceResponseToggle) {
            elements.voiceResponseToggle.checked = enabled;
        }
    }

    // Load default voice
    const defaultVoice = localStorage.getItem('settings_default_voice');
    if (defaultVoice && elements.settingsVoice) {
        elements.settingsVoice.value = defaultVoice;
    }

    // Load show metrics
    const showMetrics = localStorage.getItem('settings_show_metrics');
    if (showMetrics !== null) {
        const enabled = showMetrics === 'true';
        if (elements.settingsShowMetrics) {
            elements.settingsShowMetrics.checked = enabled;
        }
        // Apply metrics visibility
        const metricsCard = document.getElementById('metrics-card');
        if (metricsCard) {
            if (enabled) {
                metricsCard.classList.remove('hidden');
            } else {
                metricsCard.classList.add('hidden');
            }
        }
    }

    // Load debug mode
    const debugMode = localStorage.getItem('settings_debug_mode');
    if (debugMode !== null) {
        const enabled = debugMode === 'true';
        if (elements.settingsDebugMode) {
            elements.settingsDebugMode.checked = enabled;
        }
        window.DEBUG_MODE = enabled;
    }
}

function saveSettings() {
    // Save voice response toggle
    if (elements.settingsVoiceResponse) {
        const enabled = elements.settingsVoiceResponse.checked;
        localStorage.setItem('settings_voice_response', enabled.toString());
        state.voiceResponseEnabled = enabled;
        // Sync to chat voice toggle
        if (elements.voiceResponseToggle) {
            elements.voiceResponseToggle.checked = enabled;
        }
    }

    // Save default voice
    if (elements.settingsVoice) {
        localStorage.setItem('settings_default_voice', elements.settingsVoice.value);
    }

    // Save debug mode
    if (elements.settingsDebugMode) {
        const enabled = elements.settingsDebugMode.checked;
        localStorage.setItem('settings_debug_mode', enabled.toString());
        window.DEBUG_MODE = enabled;
        console.log('[Settings] Debug mode:', enabled ? 'enabled' : 'disabled');
    }
}

function handleMetricsToggle() {
    if (elements.settingsShowMetrics) {
        const enabled = elements.settingsShowMetrics.checked;
        localStorage.setItem('settings_show_metrics', enabled.toString());
        const metricsCard = document.getElementById('metrics-card');
        if (metricsCard) {
            if (enabled) {
                metricsCard.classList.remove('hidden');
            } else {
                metricsCard.classList.add('hidden');
            }
        }
        console.log('[Settings] Show metrics:', enabled ? 'enabled' : 'disabled');
    }
}


function confirmExportAgent() {
    const agentName = elements.agentNameInput.value.trim();
    
    if (!agentName) {
        elements.agentNameInput.focus();
        elements.agentNameInput.style.borderColor = 'var(--error)';
        setTimeout(() => {
            elements.agentNameInput.style.borderColor = '';
        }, 2000);
        return;
    }
    
    // Hide modal
    hideAgentNameModal();
    
    // Proceed with export
    exportAgentWithName(agentName);
}

function createExportMeta() {
    return {
        agentId: null,
        source: {
            audio: null,
            pdf: null,
            image: null,
            video: null,
            url: null
        },
        processing: {
            inputMode: null,
            analysis: null,
            transcriptionMethod: null,
            pdf: {
                totalPages: null,
                usedVisionOcr: false,
                ocrPagesAnalyzed: 0,
                ocrPageLimit: 0
            }
        },
        artifacts: {
            audioBriefing: null,
            infographic: null
        }
    };
}

function resetExportMeta() {
    state.exportMeta = createExportMeta();
}

function getFileMeta(file) {
    if (!file) return null;
    return {
        name: file.name,
        sizeBytes: file.size,
        type: file.type || '',
        lastModified: file.lastModified || null,
        lastModifiedIso: file.lastModified ? new Date(file.lastModified).toISOString() : null
    };
}

function splitDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return { mimeType: '', base64: '' };
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return { mimeType: '', base64: '' };
    return { mimeType: match[1], base64: match[2] };
}

function getAgentId() {
    if (!state.exportMeta.agentId) {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            state.exportMeta.agentId = crypto.randomUUID();
        } else {
            state.exportMeta.agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }
    }
    return state.exportMeta.agentId;
}

function getWordCount(text) {
    if (!text) return 0;
    return text.split(/\s+/).filter(word => word.length > 0).length;
}

function escapeYamlValue(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/"/g, '\\"');
}

function buildExportPayload(agentName, now, readableDate) {
    const results = state.results || {};
    const transcript = results.transcription || '';
    const wordCount = getWordCount(transcript);
    const keyPointsCount = (results.keyPoints || '').split('\n').filter(line => line.trim().length > 0).length;
    const actionItemsCount = (results.actionItems || '').split('\n').filter(line => line.trim().length > 0).length;
    const readTimeMinutes = wordCount ? Math.ceil(wordCount / 200) : 0;
    const topicsCount = Math.min(keyPointsCount, 10);

    const imageInput = splitDataUrl(state.selectedImageBase64);

    const audioBriefingMeta = state.exportMeta.artifacts.audioBriefing
        ? { ...state.exportMeta.artifacts.audioBriefing }
        : null;

    const infographicMeta = state.exportMeta.artifacts.infographic
        ? { ...state.exportMeta.artifacts.infographic }
        : null;

    const attachments = {
        sourceImage: imageInput.base64
            ? { mimeType: imageInput.mimeType, base64: imageInput.base64 }
            : null,
        audioBriefing: generatedAudioBase64
            ? { mimeType: audioBriefingMeta?.audioMimeType || 'audio/mpeg', base64: generatedAudioBase64 }
            : null,
        infographic: generatedImageBase64
            ? { mimeType: 'image/png', base64: generatedImageBase64 }
            : null
    };

    return {
        schema: 'northstar-agent-md',
        schemaVersion: 2,
        exportedAt: now.toISOString(),
        agent: {
            id: getAgentId(),
            name: agentName,
            created: now.toISOString(),
            readableDate,
            sourceType: state.inputMode,
            sourceLabel: getSourceTypeLabel(state.inputMode),
            app: 'northstar.LM'
        },
        source: {
            inputMode: state.inputMode,
            sourceLabel: getSourceTypeLabel(state.inputMode),
            url: state.sourceUrl || state.exportMeta.source.url || null,
            audioFile: state.exportMeta.source.audio,
            pdfFile: state.exportMeta.source.pdf,
            imageFile: state.exportMeta.source.image,
            videoFile: state.exportMeta.source.video
        },
        processing: {
            inputMode: state.exportMeta.processing.inputMode || state.inputMode,
            analysis: state.exportMeta.processing.analysis,
            transcriptionMethod: state.exportMeta.processing.transcriptionMethod || null,
            pdf: state.exportMeta.processing.pdf
        },
        analysis: {
            summary: results.summary || '',
            keyPoints: results.keyPoints || '',
            actionItems: results.actionItems || '',
            sentiment: results.sentiment || '',
            transcript,
            model: GPT_52_MODEL
        },
        // SoT metadata for Orchestrator perspective assignment and grouping
        sotMetadata: {
            meetingType: results.meetingType || 'general',
            keyEntities: results.keyEntities || {
                people: [], projects: [], organizations: [], products: []
            },
            temporalContext: results.temporalContext || null,
            topicTags: Array.isArray(results.topicTags) ? results.topicTags : [],
            contentSignals: results.contentSignals || {
                riskMentions: 0, decisionsMade: 0, actionsAssigned: 0,
                questionsRaised: 0, conflictIndicators: 0
            },
            suggestedPerspective: results.suggestedPerspective || null
        },
        kpis: {
            wordsAnalyzed: wordCount,
            keyPointsCount,
            actionItemsCount,
            readTimeMinutes,
            topicsCount
        },
        metrics: state.metrics || null,
        currentMetrics: currentMetrics || null,
        apiCalls: currentMetrics?.apiCalls || [],
        chatHistory: state.chatHistory || [],
        prompts: {
            analysisBatchSystem: PROMPTS.analysisBatchSystem,
            summarySystem: PROMPTS.summarySystem,
            keyPointsSystem: PROMPTS.keyPointsSystem,
            actionItemsSystem: PROMPTS.actionItemsSystem,
            sentimentSystem: PROMPTS.sentimentSystem,
            visionOcrSystem: PROMPTS.visionOcrSystem,
            audioBriefingSystem: PROMPTS.audioBriefingSystem,
            audioBriefingScriptPrompt: audioBriefingMeta?.scriptPrompt || null,
            infographicPrompt: infographicMeta?.prompt || null,
            chatContext: buildChatContext()
        },
        artifacts: {
            audioBriefing: audioBriefingMeta,
            infographic: infographicMeta,
            sourceImage: imageInput.base64 ? { mimeType: imageInput.mimeType } : null
        },
        attachments
    };
}

function exportAgentWithName(agentName) {
    if (!state.results) {
        showError('No analysis results to export. Please analyze content first.');
        return;
    }
    
    const now = new Date();
    const dateStr = now.toISOString();
    const readableDate = now.toLocaleDateString('en-US', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    const exportPayload = buildExportPayload(agentName, now, readableDate);
    const agentId = exportPayload.agent.id;
    const exportJson = JSON.stringify(exportPayload, null, 2);
    
    // Build the markdown content with YAML frontmatter
    const markdown = `---
agent_type: northstar-meeting-agent
version: 2.0
created: ${dateStr}
source_type: ${state.inputMode}
agent_name: "${escapeYamlValue(agentName)}"
agent_id: "${agentId}"
export_format: northstar-agent-md
---

# Meeting Agent: ${agentName}

## Metadata
- **Created**: ${readableDate}
- **Source**: ${getSourceTypeLabel(state.inputMode)}
- **Agent ID**: ${agentId}
- **Export Format**: northstar-agent-md v2
- **Exported At**: ${now.toLocaleString('en-US')}
- **Powered by**: northstar.LM
- **API Key Included**: No

---

## Source Details (JSON)

\`\`\`json
${JSON.stringify(exportPayload.source, null, 2)}
\`\`\`

---

## Processing Details (JSON)

\`\`\`json
${JSON.stringify(exportPayload.processing, null, 2)}
\`\`\`

---

## KPI Dashboard (JSON)

\`\`\`json
${JSON.stringify(exportPayload.kpis, null, 2)}
\`\`\`

---

## Metrics (JSON)

\`\`\`json
${JSON.stringify(exportPayload.metrics, null, 2)}
\`\`\`

---

## Executive Summary

${state.results.summary}

---

## Key Points

${formatAsMarkdownList(state.results.keyPoints)}

---

## Action Items

${formatAsCheckboxList(state.results.actionItems)}

---

## Sentiment Analysis

**Overall Sentiment**: ${state.results.sentiment}

---

## Full Transcript

\`\`\`
${state.results.transcription}
\`\`\`

---

## Chat History (JSON)

\`\`\`json
${JSON.stringify(exportPayload.chatHistory, null, 2)}
\`\`\`

---

## Artifacts (JSON)

\`\`\`json
${JSON.stringify(exportPayload.artifacts, null, 2)}
\`\`\`

---

## API Calls (JSON)

\`\`\`json
${JSON.stringify(exportPayload.apiCalls, null, 2)}
\`\`\`

---

## Prompts (JSON)

\`\`\`json
${JSON.stringify(exportPayload.prompts, null, 2)}
\`\`\`

---

## Current Metrics (JSON)

\`\`\`json
${JSON.stringify(exportPayload.currentMetrics, null, 2)}
\`\`\`

---

## Export Payload (JSON)

\`\`\`json
${exportJson}
\`\`\`
`;

    // Create filename from agent name (sanitized)
    const safeFileName = agentName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);
    
    // Create and download the file
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileName}-${now.toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function getSourceTypeLabel(inputMode) {
    const labels = {
        'audio': 'Audio Transcription',
        'pdf': 'PDF Document',
        'image': 'Image (Vision OCR)',
        'video': 'Video Transcription',
        'text': 'Text Input',
        'url': 'Web Page',
        'agent': 'Imported Agent'
    };
    return labels[inputMode] || 'Unknown';
}

function formatAsMarkdownList(text) {
    return text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
            // Remove existing bullets/dashes and add markdown bullet
            const cleanLine = line.replace(/^[-•*▸]\s*/, '');
            return `- ${cleanLine}`;
        })
        .join('\n');
}

function formatAsCheckboxList(text) {
    return text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
            // Remove existing bullets/dashes and add markdown checkbox
            const cleanLine = line.replace(/^[-•*▸☐]\s*/, '');
            return `- [ ] ${cleanLine}`;
        })
        .join('\n');
}

async function handleAgentFileSelect(e) {
    if (e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    
    // Validate file type
    if (!file.name.endsWith('.md')) {
        showError('Please select a valid .md agent file.');
        e.target.value = '';
        return;
    }
    
    try {
        const content = await file.text();
        const agentData = parseAgentFile(content);
        
        if (!agentData) {
            throw new Error('Could not parse agent file. Please ensure it is a valid northstar.LM agent.');
        }
        
        // Restore the session from the agent data
        importAgentSession(agentData);
        
    } catch (error) {
        console.error('Agent import error:', error);
        showError(error.message || 'Failed to import agent file.');
    } finally {
        e.target.value = ''; // Reset file input
    }
}

function parseAgentFile(content) {
    // Check for YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) {
        // Try to parse as a legacy or simple format
        return parseLegacyAgentFile(content);
    }
    
    // Parse frontmatter
    const frontmatter = {};
    frontmatterMatch[1].split('\n').forEach(line => {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length) {
            frontmatter[key.trim()] = valueParts.join(':').trim();
        }
    });
    
    // Validate it's a northstar agent
    if (frontmatter.agent_type !== 'northstar-meeting-agent') {
        return null;
    }
    
    // Extract sections from markdown
    const bodyContent = content.substring(frontmatterMatch[0].length);
    
    const summary = extractSection(bodyContent, 'Executive Summary');
    const keyPoints = extractSection(bodyContent, 'Key Points');
    const actionItems = extractSection(bodyContent, 'Action Items');
    const sentiment = extractSentimentFromSection(bodyContent);
    const transcription = extractTranscript(bodyContent);
    const payload = extractJsonSection(bodyContent, 'Export Payload (JSON)');
    const payloadAnalysis = payload?.analysis || null;
    
    if (!summary && !transcription && !payloadAnalysis?.summary && !payloadAnalysis?.transcript) {
        return null;
    }
    
    return {
        frontmatter,
        summary: summary || payloadAnalysis?.summary || '',
        keyPoints: keyPoints || payloadAnalysis?.keyPoints || '',
        actionItems: actionItems || payloadAnalysis?.actionItems || '',
        sentiment: sentiment || payloadAnalysis?.sentiment || 'Neutral',
        transcription: transcription || payloadAnalysis?.transcript || '',
        payload
    };
}

function parseLegacyAgentFile(content) {
    // Attempt to parse content that might not have proper frontmatter
    // Look for key sections
    const summary = extractSection(content, 'Executive Summary') || 
                    extractSection(content, 'Summary');
    const keyPoints = extractSection(content, 'Key Points');
    const actionItems = extractSection(content, 'Action Items');
    const sentiment = extractSentimentFromSection(content);
    const transcription = extractTranscript(content) || 
                          extractSection(content, 'Transcript');
    const payload = extractJsonSection(content, 'Export Payload (JSON)');
    const payloadAnalysis = payload?.analysis || null;
    
    if (!summary && !transcription && !payloadAnalysis?.summary && !payloadAnalysis?.transcript) {
        return null;
    }
    
    return {
        frontmatter: { source_type: 'agent' },
        summary: summary || payloadAnalysis?.summary || '',
        keyPoints: keyPoints || payloadAnalysis?.keyPoints || '',
        actionItems: actionItems || payloadAnalysis?.actionItems || '',
        sentiment: sentiment || payloadAnalysis?.sentiment || 'Neutral',
        transcription: transcription || payloadAnalysis?.transcript || '',
        payload
    };
}

function extractSection(content, sectionName) {
    // Match section header (## Section Name) and capture until next ## or ---
    const regex = new RegExp(`## ${sectionName}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n---\\n|\\n## |$)`, 'i');
    const match = content.match(regex);
    
    if (match && match[1]) {
        return match[1].trim();
    }
    return null;
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractJsonSection(content, sectionName) {
    const safeName = escapeRegex(sectionName);
    const regex = new RegExp(`## ${safeName}[\\s\\S]*?\\n\`\`\`json\\s*\\n([\\s\\S]*?)\\n\`\`\``, 'i');
    const match = content.match(regex);
    if (!match || !match[1]) return null;
    try {
        return JSON.parse(match[1].trim());
    } catch (error) {
        console.warn('Failed to parse JSON section:', sectionName, error);
        return null;
    }
}

function extractSentimentFromSection(content) {
    const section = extractSection(content, 'Sentiment Analysis');
    if (section) {
        // Look for "Overall Sentiment: X" pattern
        const match = section.match(/\*\*Overall Sentiment\*\*:\s*(.+)/i) ||
                      section.match(/Overall Sentiment:\s*(.+)/i);
        if (match) {
            return match[1].trim();
        }
        // Just return the section content if no pattern found
        return section.split('\n')[0].trim();
    }
    return null;
}

function extractTranscript(content) {
    // Look for transcript in code block
    const codeBlockMatch = content.match(/## Full Transcript[\s\S]*?```[\s\S]*?\n([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
        return codeBlockMatch[1].trim();
    }
    
    // Fallback: look for section without code block
    const section = extractSection(content, 'Full Transcript');
    return section;
}

function importAgentSession(agentData) {
    // Reset any existing state
    resetChatHistory();
    
    // Clean up any generated audio/image URLs
    if (generatedAudioUrl) {
        URL.revokeObjectURL(generatedAudioUrl);
        generatedAudioUrl = null;
    }
    generatedAudioBase64 = null;
    generatedImageUrl = null;
    generatedImageBase64 = null;
    
    // Set the results from the imported agent
    state.results = {
        transcription: agentData.transcription,
        summary: agentData.summary,
        keyPoints: agentData.keyPoints,
        actionItems: agentData.actionItems,
        sentiment: agentData.sentiment
    };
    
    // Set input mode to indicate this is from an agent
    state.inputMode = agentData.frontmatter?.source_type || 'agent';
    const payload = agentData.payload || null;
    resetExportMeta();
    if (payload) {
        state.exportMeta.agentId = payload.agent?.id || null;
        state.exportMeta.source = {
            audio: payload.source?.audioFile || null,
            pdf: payload.source?.pdfFile || null,
            image: payload.source?.imageFile || null,
            video: payload.source?.videoFile || null,
            url: payload.source?.url || null
        };
        state.exportMeta.processing = payload.processing || state.exportMeta.processing;
        state.exportMeta.artifacts = {
            audioBriefing: payload.artifacts?.audioBriefing || null,
            infographic: payload.artifacts?.infographic || null
        };
        state.sourceUrl = payload.source?.url || null;
    } else {
        state.sourceUrl = null;
    }
    
    if (payload?.currentMetrics) {
        currentMetrics = {
            whisperMinutes: payload.currentMetrics.whisperMinutes || 0,
            gptInputTokens: payload.currentMetrics.gptInputTokens || 0,
            gptOutputTokens: payload.currentMetrics.gptOutputTokens || 0,
            chatInputTokens: payload.currentMetrics.chatInputTokens || 0,
            chatOutputTokens: payload.currentMetrics.chatOutputTokens || 0,
            ttsCharacters: payload.currentMetrics.ttsCharacters || 0,
            imageInputTokens: payload.currentMetrics.imageInputTokens || 0,
            imageOutputTokens: payload.currentMetrics.imageOutputTokens || 0,
            apiCalls: payload.apiCalls || payload.currentMetrics.apiCalls || []
        };
        state.metrics = calculateMetrics();
    } else if (payload?.metrics) {
        currentMetrics = {
            whisperMinutes: payload.metrics.whisperMinutes || 0,
            gptInputTokens: payload.metrics.gptInputTokens || 0,
            gptOutputTokens: payload.metrics.gptOutputTokens || 0,
            chatInputTokens: payload.metrics.chatInputTokens || 0,
            chatOutputTokens: payload.metrics.chatOutputTokens || 0,
            ttsCharacters: payload.metrics.ttsCharacters || 0,
            imageInputTokens: payload.metrics.imageInputTokens || 0,
            imageOutputTokens: payload.metrics.imageOutputTokens || 0,
            apiCalls: payload.apiCalls || []
        };
        state.metrics = { ...payload.metrics, apiCalls: payload.apiCalls || payload.metrics.apiCalls || [] };
    } else {
        // Reset metrics (no API calls were made for import)
        currentMetrics = {
            whisperMinutes: 0,
            gptInputTokens: 0,
            gptOutputTokens: 0,
            chatInputTokens: 0,
            chatOutputTokens: 0,
            ttsCharacters: 0,
            imageInputTokens: 0,
            imageOutputTokens: 0,
            apiCalls: []
        };
        // Provide all expected metric fields for displayMetrics
        state.metrics = {
            whisperMinutes: 0,
            gptInputTokens: 0,
            gptOutputTokens: 0,
            totalTokens: 0,
            ttsCharacters: 0,
            imageInputTokens: 0,
            imageOutputTokens: 0,
            imageTotalTokens: 0,
            whisperCost: 0,
            gptInputCost: 0,
            gptOutputCost: 0,
            ttsCost: 0,
            imageInputCost: 0,
            imageOutputCost: 0,
            imageCost: 0,
            totalCost: 0,
            apiCalls: [],
            isImported: true  // Flag to indicate this is an imported agent
        };
    }

    if (payload?.chatHistory && Array.isArray(payload.chatHistory)) {
        state.chatHistory = payload.chatHistory;
        restoreChatHistoryUI();
    }

    const audioAttachment = payload?.attachments?.audioBriefing;
    if (audioAttachment?.base64) {
        generatedAudioBase64 = audioAttachment.base64;
        const audioBlob = base64ToBlob(audioAttachment.base64, audioAttachment.mimeType || 'audio/mpeg');
        if (audioBlob) {
            generatedAudioUrl = URL.createObjectURL(audioBlob);
            elements.audioPlayer.src = generatedAudioUrl;
            elements.audioPlayerContainer.classList.remove('hidden');
        }
    }

    const infographicAttachment = payload?.attachments?.infographic;
    if (infographicAttachment?.base64) {
        generatedImageBase64 = infographicAttachment.base64;
        const imageMime = infographicAttachment.mimeType || 'image/png';
        elements.infographicImage.src = `data:${imageMime};base64,${infographicAttachment.base64}`;
        elements.infographicContainer.classList.remove('hidden');
    }

    const sourceImageAttachment = payload?.attachments?.sourceImage;
    if (sourceImageAttachment?.base64) {
        const sourceImageUrl = `data:${sourceImageAttachment.mimeType || 'image/png'};base64,${sourceImageAttachment.base64}`;
        state.selectedImageBase64 = sourceImageUrl;
        elements.imagePreviewImg.src = sourceImageUrl;
        elements.imagePreview.classList.remove('hidden');
    }
    
    // Hide progress if visible
    hideProgress();
    
    // Display the results
    displayResults();
    
    // Show a success message
    console.log('[Agent] Successfully imported agent');
    
    // Scroll to results
    elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================
// Start the App
// ============================================
// Handle both cases: DOM already loaded (module scripts) or still loading
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
