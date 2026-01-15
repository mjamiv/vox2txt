/**
 * northstar.LM - Agent Orchestrator
 * Combines multiple meeting agents for cross-meeting insights
 */

// ============================================
// State Management
// ============================================

const state = {
    apiKey: '',
    agents: [],  // In-memory storage (session-only)
    insights: null,
    chatHistory: [],
    isProcessing: false
};

// Model pricing (per 1M tokens)
const PRICING = {
    'gpt-5.2': { input: 2.50, output: 10.00 }
};

// Metrics tracking for current session
let currentMetrics = {
    gptInputTokens: 0,
    gptOutputTokens: 0,
    apiCalls: []
};

// Metrics card state
let metricsState = {
    isPinned: false,
    autoCollapseTimeout: null
};

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

// ============================================
// DOM Elements
// ============================================

let elements = {};

function initElements() {
    elements = {
        // API Key
        apiKeyInput: document.getElementById('api-key'),
        apiKeyContainer: document.getElementById('api-key-container'),
        apiKeyCollapsed: document.getElementById('api-key-collapsed'),
        expandKeyBtn: document.getElementById('expand-key-btn'),
        toggleKeyBtn: document.getElementById('toggle-key'),
        saveKeyBtn: document.getElementById('save-key'),

        // Agent Upload
        agentFilesInput: document.getElementById('agent-files'),
        agentsDropZone: document.getElementById('agents-drop-zone'),
        agentsListSection: document.getElementById('agents-list-section'),
        agentsList: document.getElementById('agents-list'),
        agentsCount: document.getElementById('agents-count'),
        clearAllBtn: document.getElementById('clear-all-agents'),
        generateInsightsBtn: document.getElementById('generate-insights-btn'),

        // Insights
        insightsSection: document.getElementById('insights-section'),
        insightThemes: document.getElementById('insight-themes'),
        insightTrends: document.getElementById('insight-trends'),
        insightRisks: document.getElementById('insight-risks'),
        insightRecommendations: document.getElementById('insight-recommendations'),
        insightActions: document.getElementById('insight-actions'),

        // Chat
        chatSection: document.getElementById('chat-section'),
        chatMessages: document.getElementById('chat-messages'),
        chatInput: document.getElementById('chat-input'),
        chatSendBtn: document.getElementById('chat-send-btn'),

        // Metrics
        metricsCard: document.getElementById('metrics-card'),
        metricsToggle: document.getElementById('metrics-toggle'),
        metricsContent: document.getElementById('metrics-content'),

        // Error
        errorSection: document.getElementById('error-section'),
        errorMessage: document.getElementById('error-message'),
        dismissErrorBtn: document.getElementById('dismiss-error'),

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
        exportTestHtmlBtn: document.getElementById('export-test-html-btn')
    };
}

// ============================================
// Initialization
// ============================================

function init() {
    initElements();
    loadApiKey();
    setupEventListeners();
    updateUI();
}

function setupEventListeners() {
    // API Key
    elements.toggleKeyBtn.addEventListener('click', toggleApiKeyVisibility);
    elements.saveKeyBtn.addEventListener('click', saveApiKey);
    if (elements.expandKeyBtn) {
        elements.expandKeyBtn.addEventListener('click', expandApiKeySection);
    }

    // Agent Upload
    elements.agentsDropZone.addEventListener('dragover', handleDragOver);
    elements.agentsDropZone.addEventListener('dragleave', handleDragLeave);
    elements.agentsDropZone.addEventListener('drop', handleDrop);
    elements.agentFilesInput.addEventListener('change', handleFileSelect);
    elements.clearAllBtn.addEventListener('click', clearAllAgents);

    // Generate Insights
    elements.generateInsightsBtn.addEventListener('click', generateCrossInsights);

    // Chat
    elements.chatSendBtn.addEventListener('click', sendChatMessage);
    elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    // Metrics
    if (elements.metricsToggle) {
        elements.metricsToggle.addEventListener('click', toggleMetricsCard);
    }

    const metricsPinBtn = document.getElementById('metrics-pin-btn');
    if (metricsPinBtn) {
        metricsPinBtn.addEventListener('click', toggleMetricsPin);
    }

    // Error
    elements.dismissErrorBtn.addEventListener('click', hideError);

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
    if (elements.testRunnerScreen) {
        elements.testRunnerScreen.querySelector('.modal-overlay')?.addEventListener('click', (e) => {
            // Prevent closing while test is running
            if (!testState.isRunning) {
                hideTestRunnerScreen();
            }
        });
    }
}

// ============================================
// API Key Management
// ============================================

function loadApiKey() {
    const savedKey = localStorage.getItem('northstar.LM_api_key');
    if (savedKey) {
        state.apiKey = savedKey;
        elements.apiKeyInput.value = savedKey;
        collapseApiKeySection();
    }
}

function saveApiKey() {
    const key = elements.apiKeyInput.value.trim();
    if (key) {
        state.apiKey = key;
        localStorage.setItem('northstar.LM_api_key', key);
        showTemporaryMessage(elements.saveKeyBtn, 'Saved!', 'Save');
        // Collapse after showing saved message
        setTimeout(() => {
            collapseApiKeySection();
        }, 1000);
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

function toggleApiKeyVisibility() {
    const type = elements.apiKeyInput.type === 'password' ? 'text' : 'password';
    elements.apiKeyInput.type = type;
    elements.toggleKeyBtn.textContent = type === 'password' ? '👁' : '🙈';
}

function showTemporaryMessage(button, message, originalText) {
    const originalHtml = button.innerHTML;
    button.textContent = message;
    setTimeout(() => {
        button.innerHTML = originalHtml;
    }, 1500);
}

// ============================================
// File Upload Handling
// ============================================

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.agentsDropZone.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.agentsDropZone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.agentsDropZone.classList.remove('dragover');
    
    const allFiles = Array.from(e.dataTransfer.files);
    const mdFiles = allFiles.filter(f => f.name.endsWith('.md') || f.name.endsWith('.markdown'));
    
    if (mdFiles.length > 0) {
        processAgentFiles(mdFiles);
    } else if (allFiles.length > 0) {
        showError(`Please upload .md files. You selected: ${allFiles.map(f => f.name).join(', ')}`);
    }
}

function handleFileSelect(e) {
    const allFiles = Array.from(e.target.files);
    const mdFiles = allFiles.filter(f => f.name.endsWith('.md') || f.name.endsWith('.markdown'));
    
    if (mdFiles.length > 0) {
        processAgentFiles(mdFiles);
    } else if (allFiles.length > 0) {
        showError(`Please upload .md files. You selected: ${allFiles.map(f => f.name).join(', ')}`);
    }
    e.target.value = ''; // Reset for re-upload
}

async function processAgentFiles(files) {
    for (const file of files) {
        try {
            const content = await readFileContent(file);
            const agentData = parseAgentFile(content);
            
            if (agentData) {
                // Check for duplicates by title
                const existingIndex = state.agents.findIndex(a => a.title === agentData.title);
                if (existingIndex >= 0) {
                    state.agents[existingIndex] = agentData; // Update existing
                } else {
                    state.agents.push(agentData);
                }
            }
        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            showError(`Failed to parse ${file.name}: ${error.message}`);
        }
    }
    
    updateUI();
}

function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

// ============================================
// Agent File Parsing
// ============================================

function parseAgentFile(content) {
    const result = {
        title: 'Untitled Meeting',
        date: null,
        sourceType: 'unknown',
        summary: '',
        keyPoints: '',
        actionItems: '',
        sentiment: '',
        transcript: ''
    };
    
    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        
        // Get creation date
        const createdMatch = frontmatter.match(/created:\s*"?([^"\n]+)"?/);
        if (createdMatch) {
            try {
                const date = new Date(createdMatch[1].trim());
                result.date = date.toLocaleDateString('en-US', { 
                    year: 'numeric', month: 'short', day: 'numeric' 
                });
            } catch (e) {
                result.date = createdMatch[1].trim();
            }
        }
        
        const sourceMatch = frontmatter.match(/source_type:\s*(\w+)/);
        if (sourceMatch) result.sourceType = sourceMatch[1].trim();
    }
    
    // Parse title from heading (# Meeting Agent: <title>)
    const titleMatch = content.match(/# Meeting Agent:\s*(.+)/);
    if (titleMatch) {
        result.title = titleMatch[1].trim();
    }
    
    // Parse sections with flexible matching (handles both old and new formats)
    // Executive Summary or Summary
    const summaryMatch = content.match(/## (?:Executive )?Summary\n\n?([\s\S]*?)(?=\n---|\n## |$)/);
    if (summaryMatch) result.summary = summaryMatch[1].trim();
    
    // Key Points
    const keyPointsMatch = content.match(/## Key Points\n\n?([\s\S]*?)(?=\n---|\n## |$)/);
    if (keyPointsMatch) result.keyPoints = keyPointsMatch[1].trim();
    
    // Action Items
    const actionItemsMatch = content.match(/## Action Items\n\n?([\s\S]*?)(?=\n---|\n## |$)/);
    if (actionItemsMatch) result.actionItems = actionItemsMatch[1].trim();
    
    // Sentiment Analysis or Sentiment
    const sentimentMatch = content.match(/## Sentiment(?: Analysis)?\n\n?([\s\S]*?)(?=\n---|\n## |$)/);
    if (sentimentMatch) result.sentiment = sentimentMatch[1].trim();
    
    // Full Transcript (may be in code block)
    const transcriptMatch = content.match(/## Full Transcript[\s\S]*?```\n?([\s\S]*?)```/);
    if (transcriptMatch) {
        result.transcript = transcriptMatch[1].trim();
    } else {
        // Try without code block
        const plainTranscriptMatch = content.match(/## (?:Full )?Transcript\n\n?([\s\S]*?)(?=\n## |$)/);
        if (plainTranscriptMatch) result.transcript = plainTranscriptMatch[1].trim();
    }
    
    return result;
}

// ============================================
// Agent Management
// ============================================

function removeAgent(index) {
    state.agents.splice(index, 1);
    updateUI();
}

function clearAllAgents() {
    state.agents = [];
    state.insights = null;
    state.chatHistory = [];
    resetMetrics();
    updateUI();
}

// ============================================
// UI Updates
// ============================================

function updateUI() {
    updateAgentsList();
    updateButtonStates();
    updateSectionsVisibility();
}

function updateAgentsList() {
    elements.agentsCount.textContent = state.agents.length;
    
    if (state.agents.length === 0) {
        elements.agentsListSection.classList.add('hidden');
        return;
    }
    
    elements.agentsListSection.classList.remove('hidden');
    
    elements.agentsList.innerHTML = state.agents.map((agent, index) => `
        <div class="agent-card">
            <div class="agent-info">
                <span class="agent-icon">📋</span>
                <div class="agent-details">
                    <strong class="agent-title">${escapeHtml(agent.title)}</strong>
                    <span class="agent-meta">${agent.date || 'No date'} • ${agent.sourceType}</span>
                </div>
            </div>
            <button class="remove-agent-btn" data-index="${index}" title="Remove agent">
                ✕
            </button>
        </div>
    `).join('');
    
    // Add remove handlers
    elements.agentsList.querySelectorAll('.remove-agent-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            removeAgent(parseInt(btn.dataset.index));
        });
    });
}

function updateButtonStates() {
    const hasAgents = state.agents.length >= 2;
    const hasApiKey = state.apiKey.trim().length > 0;

    elements.generateInsightsBtn.disabled = !hasAgents || !hasApiKey || state.isProcessing;

    if (state.agents.length === 1) {
        elements.generateInsightsBtn.title = 'Upload at least 2 agents for cross-meeting insights';
    } else if (!hasApiKey) {
        elements.generateInsightsBtn.title = 'Enter your API key first';
    } else {
        elements.generateInsightsBtn.title = '';
    }

    // Update test button state
    updateTestButtonState();
}

function updateTestButtonState() {
    if (elements.runTestBtn) {
        const hasAgents = state.agents.length > 0;
        const hasApiKey = state.apiKey.trim().length > 0;

        elements.runTestBtn.disabled = !hasAgents || !hasApiKey;

        if (!hasAgents) {
            elements.runTestBtn.title = 'Upload agents first';
        } else if (!hasApiKey) {
            elements.runTestBtn.title = 'Enter API key first';
        } else {
            elements.runTestBtn.title = 'Test your agents with pre-defined prompts';
        }
    }
}

function updateSectionsVisibility() {
    // Show insights if available
    if (state.insights) {
        elements.insightsSection.classList.remove('hidden');
        elements.chatSection.classList.remove('hidden');
    } else {
        elements.insightsSection.classList.add('hidden');
        elements.chatSection.classList.add('hidden');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Cross-Meeting Insights Generation
// ============================================

async function generateCrossInsights() {
    if (state.agents.length < 2 || !state.apiKey) {
        showError('Please upload at least 2 agent files and enter your API key.');
        return;
    }
    
    state.isProcessing = true;
    showButtonLoader(elements.generateInsightsBtn);
    updateButtonStates();
    
    try {
        const combinedContext = buildCombinedContext();
        
        const systemPrompt = `You are an expert business analyst specializing in meeting synthesis and strategic insights. 
You have been given data from multiple meetings and must identify cross-meeting patterns, themes, and actionable recommendations.

Analyze the meetings holistically and provide insights in the following categories:
1. COMMON THEMES: Recurring topics, concerns, or focus areas across meetings
2. TRENDS & PATTERNS: Evolution of discussions, emerging priorities, or shifting focus
3. RISKS & BLOCKERS: Common challenges, dependencies, or concerns that appear across meetings
4. RECOMMENDATIONS: Strategic suggestions based on the aggregate meeting data
5. CONSOLIDATED ACTIONS: All action items organized by priority or theme

Format your response as JSON with these keys: themes, trends, risks, recommendations, actions
Each should be an array of strings (bullet points).`;

        const response = await callGPT(systemPrompt, combinedContext, 'Cross-Meeting Insights');
        
        // Parse JSON response
        let insights;
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                insights = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            // Fallback: treat response as plain text
            insights = {
                themes: [response],
                trends: [],
                risks: [],
                recommendations: [],
                actions: []
            };
        }
        
        state.insights = insights;
        displayInsights(insights);
        resetChatHistory();
        updateUI();
        
    } catch (error) {
        console.error('Insights generation error:', error);
        showError(`Failed to generate insights: ${error.message}`);
    } finally {
        state.isProcessing = false;
        hideButtonLoader(elements.generateInsightsBtn);
        updateButtonStates();
    }
}

function buildCombinedContext() {
    return state.agents.map((agent, index) => `
=== MEETING ${index + 1}: ${agent.title} ===
Date: ${agent.date || 'Unknown'}
Source: ${agent.sourceType}

SUMMARY:
${agent.summary}

KEY POINTS:
${agent.keyPoints}

ACTION ITEMS:
${agent.actionItems}

SENTIMENT:
${agent.sentiment}
`).join('\n\n---\n\n');
}

function displayInsights(insights) {
    elements.insightThemes.innerHTML = formatInsightList(insights.themes);
    elements.insightTrends.innerHTML = formatInsightList(insights.trends);
    elements.insightRisks.innerHTML = formatInsightList(insights.risks);
    elements.insightRecommendations.innerHTML = formatInsightList(insights.recommendations);
    elements.insightActions.innerHTML = formatInsightList(insights.actions);
}

function formatInsightList(items) {
    if (!items || items.length === 0) {
        return '<p class="no-data">No data available</p>';
    }
    return `<ul class="insight-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

// ============================================
// Chat Functionality
// ============================================

async function sendChatMessage() {
    const message = elements.chatInput.value.trim();
    if (!message || state.isProcessing || state.agents.length === 0) return;
    
    // Clear input
    elements.chatInput.value = '';
    
    // Add user message to UI
    appendChatMessage('user', message);
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
        const response = await chatWithAgents(message);
        removeTypingIndicator();
        appendChatMessage('assistant', response);
    } catch (error) {
        removeTypingIndicator();
        appendChatMessage('assistant', `Sorry, I encountered an error: ${error.message}`);
    }
}

async function chatWithAgents(userMessage) {
    // Build context with smart agent selection
    const context = buildChatContext(userMessage);

    const systemPrompt = `You are a helpful meeting assistant with access to data from multiple meetings.
Use the following meeting data to answer questions accurately and comprehensively.
If information isn't available in the meeting data, say so clearly.
Be concise but thorough. Use bullet points when listing multiple items.

${context}`;

    // Build messages array with history
    const messages = [
        { role: 'system', content: systemPrompt }
    ];

    // Add recent chat history (last 10 exchanges)
    const recentHistory = state.chatHistory.slice(-20);
    messages.push(...recentHistory);

    // Add current message
    messages.push({ role: 'user', content: userMessage });

    const response = await callGPTWithMessages(messages, `Chat: ${userMessage.substring(0, 30)}...`);

    // Store in history
    state.chatHistory.push({ role: 'user', content: userMessage });
    state.chatHistory.push({ role: 'assistant', content: response });

    return response;
}

function extractKeywords(text) {
    // Simple keyword extraction - remove common words and extract significant ones
    const commonWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by', 'from', 'what', 'where', 'when', 'why', 'how', 'who', 'about', 'can', 'could', 'should', 'would', 'will', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'me', 'my', 'you', 'your', 'it', 'its', 'this', 'that', 'these', 'those']);

    const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !commonWords.has(word));

    return [...new Set(words)];
}

function selectRelevantAgents(userQuery, allAgents, maxAgents = 5) {
    if (allAgents.length <= maxAgents) {
        return allAgents; // Return all if we have fewer than max
    }

    const queryKeywords = extractKeywords(userQuery);

    const scored = allAgents.map(agent => {
        let score = 0;

        // Keyword matching
        queryKeywords.forEach(keyword => {
            if (agent.title.toLowerCase().includes(keyword)) score += 5;
            if (agent.summary.toLowerCase().includes(keyword)) score += 3;
            if (agent.keyPoints.toLowerCase().includes(keyword)) score += 2;
            if (agent.actionItems.toLowerCase().includes(keyword)) score += 2;
        });

        // Recency boost (recent meetings are more likely to be relevant)
        if (agent.date) {
            try {
                const agentDate = new Date(agent.date);
                if (!isNaN(agentDate.getTime())) {
                    const age = Date.now() - agentDate.getTime();
                    const daysSince = age / (1000 * 60 * 60 * 24);
                    score += Math.max(0, 10 - (daysSince / 7)); // Decay over weeks
                }
            } catch (e) {
                // Invalid date, skip recency boost
            }
        }

        return { agent, score };
    });

    // Sort by score and return top N agents
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, maxAgents)
        .map(s => s.agent);
}

function buildChatContext(userQuery = '') {
    // Select only relevant agents for this query
    const relevantAgents = userQuery ?
        selectRelevantAgents(userQuery, state.agents, 5) :
        state.agents.slice(0, 5); // Default to first 5 if no query

    return relevantAgents.map((agent, index) => `
--- Meeting ${index + 1}: ${agent.title} (${agent.date || 'No date'}) ---
Summary: ${agent.summary}
Key Points: ${agent.keyPoints}
Action Items: ${agent.actionItems}
Sentiment: ${agent.sentiment}
${agent.transcript ? `Transcript excerpt: ${agent.transcript.substring(0, 1500)}...` : ''}
`).join('\n\n');
}

function appendChatMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}-message`;
    
    if (role === 'assistant' && typeof marked !== 'undefined') {
        messageDiv.innerHTML = marked.parse(content);
    } else {
        messageDiv.textContent = content;
    }
    
    elements.chatMessages.appendChild(messageDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'chat-message assistant-message typing-indicator';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    elements.chatMessages.appendChild(indicator);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

function resetChatHistory() {
    state.chatHistory = [];
    elements.chatMessages.innerHTML = `
        <div class="chat-welcome">
            <div class="chat-welcome-icon">🤖</div>
            <div class="chat-welcome-text">
                <strong>Multi-Agent Assistant</strong>
                <p>I have access to all your uploaded meeting agents. Ask me about decisions, action items, patterns across meetings, or anything else from your meeting data.</p>
            </div>
        </div>
    `;
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
// API Calls
// ============================================

async function callGPT(systemPrompt, userContent, callName = 'API Call') {
    return await callAPIWithRetry(async () => {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-5.2',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ],
                max_completion_tokens: 4000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const err = new Error(error.error?.message || `API error: ${response.status}`);
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
                model: 'gpt-5.2',
                inputTokens: data.usage.prompt_tokens || 0,
                outputTokens: data.usage.completion_tokens || 0
            });
            updateMetricsDisplay();
        }

        return data.choices[0].message.content;
    }, 3, callName);
}

async function callGPTWithMessages(messages, callName = 'Chat Query') {
    return await callAPIWithRetry(async () => {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-5.2',
                messages: messages,
                max_completion_tokens: 2000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const err = new Error(error.error?.message || `API error: ${response.status}`);
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
                model: 'gpt-5.2',
                inputTokens: data.usage.prompt_tokens || 0,
                outputTokens: data.usage.completion_tokens || 0
            });
            updateMetricsDisplay();
        }

        return data.choices[0].message.content;
    }, 3, callName);
}

// ============================================
// Metrics Display & Management
// ============================================

function calculateMetrics() {
    const inputCost = (currentMetrics.gptInputTokens / 1000000) * PRICING['gpt-5.2'].input;
    const outputCost = (currentMetrics.gptOutputTokens / 1000000) * PRICING['gpt-5.2'].output;
    const totalCost = inputCost + outputCost;

    return {
        gptInputTokens: currentMetrics.gptInputTokens,
        gptOutputTokens: currentMetrics.gptOutputTokens,
        totalTokens: currentMetrics.gptInputTokens + currentMetrics.gptOutputTokens,
        inputCost,
        outputCost,
        totalCost,
        apiCalls: currentMetrics.apiCalls
    };
}

function formatTokens(tokens) {
    return tokens.toLocaleString();
}

function formatCost(cost) {
    return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(4)}`;
}

function updateMetricsDisplay() {
    if (!elements.metricsContent) return;

    const metrics = calculateMetrics();

    // Build API calls breakdown
    let breakdownHtml = '';
    metrics.apiCalls.forEach((call, idx) => {
        const totalTokens = call.inputTokens + call.outputTokens;
        breakdownHtml += `
            <div class="metric-breakdown-item">
                <span>${call.name}</span>
                <span>${formatTokens(totalTokens)} tokens</span>
            </div>`;
    });

    elements.metricsContent.innerHTML = `
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
                <span>${formatTokens(metrics.gptInputTokens)} tokens (${formatCost(metrics.inputCost)})</span>
            </div>
            <div class="metric-breakdown-item">
                <span>GPT-5.2 Output</span>
                <span>${formatTokens(metrics.gptOutputTokens)} tokens (${formatCost(metrics.outputCost)})</span>
            </div>
        </div>
        ${metrics.apiCalls.length > 0 ? `
        <div class="metric-breakdown" style="margin-top: var(--space-sm);">
            <strong style="color: var(--text-secondary);">API Calls (${metrics.apiCalls.length}):</strong>
            ${breakdownHtml}
        </div>` : ''}
    `;

    // Show metrics card if hidden, default content to collapsed
    if (elements.metricsCard && metrics.totalTokens > 0) {
        elements.metricsCard.classList.remove('hidden');

        // Default content to collapsed unless already expanded
        if (!elements.metricsContent.dataset.initialized) {
            elements.metricsContent.classList.add('hidden');
            elements.metricsContent.dataset.initialized = 'true';
        }

        // Auto-collapse after 10 seconds if not pinned
        scheduleAutoCollapse();
    }
}

function scheduleAutoCollapse() {
    // Clear any existing timeout
    if (metricsState.autoCollapseTimeout) {
        clearTimeout(metricsState.autoCollapseTimeout);
    }

    // Don't auto-collapse if pinned or already collapsed
    if (metricsState.isPinned || elements.metricsContent.classList.contains('hidden')) {
        return;
    }

    // Schedule auto-collapse in 10 seconds
    metricsState.autoCollapseTimeout = setTimeout(() => {
        if (!metricsState.isPinned && !elements.metricsContent.classList.contains('hidden')) {
            elements.metricsContent.classList.add('hidden');
            updateToggleIcon();
        }
    }, 10000);
}

function resetMetrics() {
    currentMetrics = {
        gptInputTokens: 0,
        gptOutputTokens: 0,
        apiCalls: []
    };
    updateMetricsDisplay();
    if (elements.metricsCard) {
        elements.metricsCard.classList.add('hidden');
    }
}

function toggleMetricsCard() {
    if (elements.metricsContent) {
        elements.metricsContent.classList.toggle('hidden');
        updateToggleIcon();

        // If expanding, schedule auto-collapse (unless pinned)
        if (!elements.metricsContent.classList.contains('hidden')) {
            scheduleAutoCollapse();
        }
    }
}

function updateToggleIcon() {
    if (!elements.metricsToggle) return;

    const isCollapsed = elements.metricsContent.classList.contains('hidden');
    elements.metricsToggle.textContent = isCollapsed ? '▶' : '▼';
}

function toggleMetricsPin() {
    metricsState.isPinned = !metricsState.isPinned;

    const pinBtn = document.getElementById('metrics-pin-btn');
    if (pinBtn) {
        pinBtn.textContent = metricsState.isPinned ? '📌' : '📍';
        pinBtn.title = metricsState.isPinned ? 'Unpin metrics' : 'Pin metrics open';
        pinBtn.style.opacity = metricsState.isPinned ? '1' : '0.6';
    }

    // If pinning, cancel auto-collapse
    if (metricsState.isPinned && metricsState.autoCollapseTimeout) {
        clearTimeout(metricsState.autoCollapseTimeout);
    }

    // If unpinning and expanded, schedule auto-collapse
    if (!metricsState.isPinned && !elements.metricsContent.classList.contains('hidden')) {
        scheduleAutoCollapse();
    }
}

// ============================================
// Error Handling
// ============================================

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorSection.classList.remove('hidden');
}

function hideError() {
    elements.errorSection.classList.add('hidden');
}

// ============================================
// Button Loader Helpers
// ============================================

function showButtonLoader(button) {
    button.querySelector('.btn-text')?.classList.add('hidden');
    button.querySelector('.btn-loader')?.classList.remove('hidden');
}

function hideButtonLoader(button) {
    button.querySelector('.btn-text')?.classList.remove('hidden');
    button.querySelector('.btn-loader')?.classList.add('hidden');
}

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
    if (testState.customPrompts.length >= 10) {
        showError('Maximum 10 custom prompts allowed');
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

// ============================================
// Analytics Dashboard
// ============================================

function showAnalyticsDashboard() {
    // Calculate totals
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
        elements.contextGaugeFill.style.background = 'linear-gradient(90deg, #4ade80, #a3e635)';
    } else if (percentage < 80) {
        elements.contextGaugeFill.style.background = 'linear-gradient(90deg, #fbbf24, #f59e0b)';
    } else {
        elements.contextGaugeFill.style.background = 'linear-gradient(90deg, #f59e0b, #f87171)';
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
                        <span style="color: var(--error);">❌ Failed</span>
                    `}
                    <span class="expand-indicator">▼</span>
                </div>
            </div>
            <div class="result-item-body" id="result-body-${index}">
                ${result.success ? `
                    <div class="result-response">${escapeHtml(result.response)}</div>
                ` : `
                    <div class="result-error">
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
        .result-item.success { border-left: 4px solid #4ade80; }
        .result-item.error { border-left: 4px solid #f87171; }
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
            color: #f87171;
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
            <span class="value" style="color: #4ade80;">${successCount}</span>
            <span class="label">Successful</span>
        </div>
        <div class="summary-card">
            <span class="icon">✗</span>
            <span class="value" style="color: ${failCount > 0 ? '#f87171' : '#4ade80'};">${failCount}</span>
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

// ============================================
// Initialize on DOM Ready
// ============================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    setTimeout(init, 0);
}
