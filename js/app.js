/**
 * Meeting Minute Men - Client-Side Application
 * Transforms meeting audio/text into actionable insights using OpenAI
 */

// ============================================
// State Management
// ============================================
const state = {
    apiKey: '',
    selectedFile: null,
    inputMode: 'audio', // 'audio' or 'text'
    isProcessing: false,
    results: null
};

// ============================================
// DOM Elements
// ============================================
const elements = {
    // API Key
    apiKeyInput: document.getElementById('api-key'),
    toggleKeyBtn: document.getElementById('toggle-key'),
    saveKeyBtn: document.getElementById('save-key'),
    
    // Tabs
    tabBtns: document.querySelectorAll('.tab-btn'),
    audioTab: document.getElementById('audio-tab'),
    textTab: document.getElementById('text-tab'),
    
    // Audio Upload
    dropZone: document.getElementById('drop-zone'),
    audioFileInput: document.getElementById('audio-file'),
    fileInfo: document.getElementById('file-info'),
    fileName: document.querySelector('.file-name'),
    removeFileBtn: document.querySelector('.remove-file'),
    
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
    resultSentiment: document.getElementById('result-sentiment'),
    
    // Error
    errorSection: document.getElementById('error-section'),
    errorMessage: document.getElementById('error-message'),
    dismissErrorBtn: document.getElementById('dismiss-error')
};

// ============================================
// Initialization
// ============================================
function init() {
    loadSavedApiKey();
    setupEventListeners();
    updateAnalyzeButton();
}

function loadSavedApiKey() {
    const savedKey = localStorage.getItem('mmm_api_key');
    if (savedKey) {
        state.apiKey = savedKey;
        elements.apiKeyInput.value = savedKey;
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
    
    // Tabs
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Drag and Drop
    elements.dropZone.addEventListener('click', () => elements.audioFileInput.click());
    elements.dropZone.addEventListener('dragover', handleDragOver);
    elements.dropZone.addEventListener('dragleave', handleDragLeave);
    elements.dropZone.addEventListener('drop', handleDrop);
    elements.audioFileInput.addEventListener('change', handleFileSelect);
    elements.removeFileBtn.addEventListener('click', removeSelectedFile);
    
    // Text Input
    elements.textInput.addEventListener('input', updateAnalyzeButton);
    
    // Actions
    elements.analyzeBtn.addEventListener('click', startAnalysis);
    elements.downloadBtn.addEventListener('click', downloadDocx);
    elements.newAnalysisBtn.addEventListener('click', resetForNewAnalysis);
    elements.dismissErrorBtn.addEventListener('click', hideError);
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
        localStorage.setItem('mmm_api_key', state.apiKey);
        showTemporaryMessage(elements.saveKeyBtn, 'Saved!', 'Save');
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
    state.inputMode = tab;
    
    elements.tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    elements.audioTab.classList.toggle('active', tab === 'audio');
    elements.textTab.classList.toggle('active', tab === 'text');
    
    updateAnalyzeButton();
}

// ============================================
// File Handling
// ============================================
function handleDragOver(e) {
    e.preventDefault();
    elements.dropZone.classList.add('dragover');
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
    elements.fileName.textContent = file.name;
    elements.fileInfo.classList.remove('hidden');
    elements.dropZone.style.display = 'none';
    updateAnalyzeButton();
}

function removeSelectedFile() {
    state.selectedFile = null;
    elements.audioFileInput.value = '';
    elements.fileInfo.classList.add('hidden');
    elements.dropZone.style.display = 'block';
    updateAnalyzeButton();
}

// ============================================
// Analyze Button State
// ============================================
function updateAnalyzeButton() {
    let canAnalyze = false;
    
    if (state.apiKey) {
        if (state.inputMode === 'audio' && state.selectedFile) {
            canAnalyze = true;
        } else if (state.inputMode === 'text' && elements.textInput.value.trim()) {
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
    
    try {
        let transcriptionText;
        
        if (state.inputMode === 'audio') {
            updateProgress(10, 'Transcribing audio with Whisper...');
            transcriptionText = await transcribeAudio(state.selectedFile);
        } else {
            transcriptionText = elements.textInput.value.trim();
        }
        
        updateProgress(30, 'Generating summary...');
        const summary = await extractSummary(transcriptionText);
        
        updateProgress(50, 'Extracting key points...');
        const keyPoints = await extractKeyPoints(transcriptionText);
        
        updateProgress(70, 'Identifying action items...');
        const actionItems = await extractActionItems(transcriptionText);
        
        updateProgress(85, 'Analyzing sentiment...');
        const sentiment = await analyzeSentiment(transcriptionText);
        
        updateProgress(100, 'Complete!');
        
        state.results = {
            transcription: transcriptionText,
            summary,
            keyPoints,
            actionItems,
            sentiment
        };
        
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
// OpenAI API Calls
// ============================================
async function transcribeAudio(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'whisper-1');
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${state.apiKey}`
        },
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Transcription failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.text;
}

async function callChatAPI(systemPrompt, userContent) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
            ]
        })
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `API call failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
}

async function extractSummary(text) {
    const systemPrompt = `You are a highly skilled AI trained in language comprehension and summarization. 
Read the following text and summarize it into a concise abstract paragraph. 
Retain the most important points, providing a coherent and readable summary that helps someone understand the main points without reading the entire text. 
Avoid unnecessary details or tangential points.`;
    
    return await callChatAPI(systemPrompt, text);
}

async function extractKeyPoints(text) {
    const systemPrompt = `You are a proficient AI with a specialty in distilling information into key points. 
Based on the following text, identify and list the main points that were discussed or brought up. 
These should be the most important ideas, findings, or topics that are crucial to the essence of the discussion. 
Format each point on its own line starting with a dash (-).`;
    
    return await callChatAPI(systemPrompt, text);
}

async function extractActionItems(text) {
    const systemPrompt = `You are a highly skilled AI trained in identifying action items. 
Review the following text and identify any specific tasks or action items that were assigned or discussed. 
Format each action item on its own line starting with a dash (-).
If no action items are found, respond with "No specific action items identified."`;
    
    return await callChatAPI(systemPrompt, text);
}

async function analyzeSentiment(text) {
    const systemPrompt = `You are an AI trained in sentiment analysis. 
Analyze the overall sentiment of the following text. 
Respond with exactly one word: "Positive", "Negative", or "Neutral".`;
    
    return await callChatAPI(systemPrompt, text);
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
    
    elements.resultsSection.classList.remove('hidden');
    
    // Summary
    elements.resultSummary.innerHTML = `<p>${escapeHtml(state.results.summary)}</p>`;
    
    // Key Points
    elements.resultKeypoints.innerHTML = formatListContent(state.results.keyPoints);
    
    // Action Items
    elements.resultActions.innerHTML = formatListContent(state.results.actionItems);
    
    // Sentiment
    const sentiment = state.results.sentiment.trim().toLowerCase();
    let sentimentClass = 'sentiment-neutral';
    let sentimentEmoji = '😐';
    
    if (sentiment.includes('positive')) {
        sentimentClass = 'sentiment-positive';
        sentimentEmoji = '😊';
    } else if (sentiment.includes('negative')) {
        sentimentClass = 'sentiment-negative';
        sentimentEmoji = '😟';
    }
    
    elements.resultSentiment.innerHTML = `
        <span class="${sentimentClass}">${sentimentEmoji} ${capitalize(state.results.sentiment)}</span>
    `;
    
    // Scroll to results
    elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// ============================================
// DOCX Generation
// ============================================
async function downloadDocx() {
    if (!state.results) return;
    
    const { Document, Paragraph, TextRun, HeadingLevel, Packer } = docx;
    
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                // Title
                new Paragraph({
                    text: "Meeting Minutes",
                    heading: HeadingLevel.TITLE,
                    spacing: { after: 300 }
                }),
                
                // Generated by
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Generated by Meeting Minute Men",
                            italics: true,
                            color: "666666"
                        })
                    ],
                    spacing: { after: 400 }
                }),
                
                // Transcription
                new Paragraph({
                    text: "Full Transcription",
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 400, after: 200 }
                }),
                new Paragraph({
                    text: state.results.transcription,
                    spacing: { after: 400 }
                }),
                
                // Summary
                new Paragraph({
                    text: "Summary",
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 400, after: 200 }
                }),
                new Paragraph({
                    text: state.results.summary,
                    spacing: { after: 400 }
                }),
                
                // Key Points
                new Paragraph({
                    text: "Key Points",
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 400, after: 200 }
                }),
                ...state.results.keyPoints.split('\n')
                    .filter(line => line.trim())
                    .map(point => new Paragraph({
                        text: point.replace(/^[-•*]\s*/, '• '),
                        spacing: { after: 100 }
                    })),
                
                // Action Items
                new Paragraph({
                    text: "Action Items",
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 400, after: 200 }
                }),
                ...state.results.actionItems.split('\n')
                    .filter(line => line.trim())
                    .map(item => new Paragraph({
                        text: item.replace(/^[-•*]\s*/, '☐ '),
                        spacing: { after: 100 }
                    })),
                
                // Sentiment
                new Paragraph({
                    text: "Overall Sentiment",
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 400, after: 200 }
                }),
                new Paragraph({
                    text: state.results.sentiment,
                    spacing: { after: 200 }
                })
            ]
        }]
    });
    
    // Generate and download
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-minutes-${new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// Reset / New Analysis
// ============================================
function resetForNewAnalysis() {
    state.results = null;
    state.selectedFile = null;
    
    elements.audioFileInput.value = '';
    elements.textInput.value = '';
    elements.fileInfo.classList.add('hidden');
    elements.dropZone.style.display = 'block';
    elements.resultsSection.classList.add('hidden');
    
    updateAnalyzeButton();
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
// Start the App
// ============================================
document.addEventListener('DOMContentLoaded', init);
