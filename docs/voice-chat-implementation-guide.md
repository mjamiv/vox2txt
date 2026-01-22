# Voice Chat Implementation Guide

> A comprehensive guide for adding voice conversation capabilities to web-based chat applications using OpenAI's APIs.

---

## Overview

This guide covers two voice chat implementation approaches:

| Mode | Description | Cost | Latency | Best For |
|------|-------------|------|---------|----------|
| **Push-to-Talk** | Record → Whisper → Chat → TTS | ~$0.02/exchange | 3-5s | Controlled interactions, mobile |
| **Real-time** | Continuous WebSocket streaming | ~$0.30/min | <500ms | Natural conversation, interviews |

---

## Architecture

### Push-to-Talk Flow

```
[User holds button] → [MediaRecorder] → [Whisper API] → [Chat API] → [TTS API] → [Audio playback]
```

### Real-time Flow

```
[Microphone stream] ←→ [WebSocket @ 24kHz PCM16] ←→ [OpenAI Realtime API] ←→ [Audio playback]
```

---

## Implementation: Push-to-Talk

### 1. HTML Structure

```html
<!-- Voice Input Button -->
<button id="voice-input-btn" class="btn-voice" title="Hold to speak">
    <span class="voice-icon">🎤</span>
    <span class="voice-recording hidden">
        <span class="recording-dot"></span>
    </span>
</button>

<!-- Voice Response Toggle -->
<label class="toggle-inline">
    <input type="checkbox" id="voice-response-toggle" checked>
    <span>Speak responses</span>
</label>

<!-- Volume Indicator -->
<div id="voice-status" class="voice-status hidden">
    <span class="status-text">Listening...</span>
    <div class="volume-meter">
        <div class="volume-bar"></div>
    </div>
</div>
```

### 2. State Variables

```javascript
const state = {
    isRecording: false,
    voiceResponseEnabled: true
};

let mediaRecorder = null;
let audioChunks = [];
let voiceStream = null;
let audioContext = null;
let analyser = null;

const VOICE_START_DELAY = 500;  // ms before recording starts
const VOICE_STOP_DELAY = 600;   // ms after button release
```

### 3. Recording Implementation

```javascript
async function startVoiceRecording() {
    try {
        showVoiceStatus('Preparing...', false);
        updateVoiceButtonUI(true);

        // Get microphone access
        voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Set up audio context for volume visualization
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const source = audioContext.createMediaStreamSource(voiceStream);
        source.connect(analyser);

        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(voiceStream, { mimeType: 'audio/webm' });
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            hideVoiceStatus();
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            cleanupRecording();
            await processVoiceInput(audioBlob);
        };

        // Start recording after brief delay
        setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state === 'inactive') {
                mediaRecorder.start();
                state.isRecording = true;
                showVoiceStatus('Start speaking...', true);
                startVolumeVisualization();
            }
        }, VOICE_START_DELAY);

    } catch (error) {
        console.error('[Voice] Microphone access denied:', error);
        showError('Microphone access is required for voice input.');
        cleanupRecording();
    }
}

function stopVoiceRecording() {
    if (!state.isRecording) return;

    updateVoiceStatusText('Finishing...');

    // Delay to capture final audio
    setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            state.isRecording = false;
            updateVoiceButtonUI(false);
        }
    }, VOICE_STOP_DELAY);
}
```

### 4. Whisper Transcription

```javascript
async function transcribeVoiceInput(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'voice-input.webm');
    formData.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${state.apiKey}`
        },
        body: formData
    });

    if (!response.ok) {
        throw new Error('Transcription failed');
    }

    const data = await response.json();
    return data.text;
}
```

### 5. Text-to-Speech Response

```javascript
async function speakResponse(text) {
    // Truncate long responses for TTS
    const truncatedText = text.length > 500
        ? text.substring(0, 497) + '...'
        : text;

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini-tts',
            voice: 'nova',  // Options: alloy, echo, fable, onyx, nova, shimmer
            input: truncatedText
        })
    });

    if (!response.ok) throw new Error('TTS failed');

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.onended = () => URL.revokeObjectURL(audioUrl);
    await audio.play();
}
```

### 6. Volume Visualization

```javascript
function startVolumeVisualization() {
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function updateVolume() {
        if (!state.isRecording || !analyser) return;

        analyser.getByteFrequencyData(dataArray);

        // Calculate average volume
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const volumePercent = Math.min(100, (average / 128) * 100);

        // Update volume bar width
        const volumeBar = document.querySelector('.volume-bar');
        if (volumeBar) {
            volumeBar.style.width = `${volumePercent}%`;
        }

        requestAnimationFrame(updateVolume);
    }

    updateVolume();
}
```

### 7. Event Listeners

```javascript
// Push-to-talk with mouse
voiceInputBtn.addEventListener('mousedown', startVoiceRecording);
voiceInputBtn.addEventListener('mouseup', stopVoiceRecording);
voiceInputBtn.addEventListener('mouseleave', () => {
    if (state.isRecording) stopVoiceRecording();
});

// Touch support for mobile
voiceInputBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startVoiceRecording();
});
voiceInputBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    stopVoiceRecording();
});
```

---

## Implementation: Real-time Voice (OpenAI Realtime API)

### 1. Prerequisites

- OpenAI API key with Realtime API access
- AudioWorklet support (Chrome 66+, Firefox 76+, Safari 14.1+)
- HTTPS or localhost (required for getUserMedia)

### 2. Audio Worklet Processor

Create `js/audio-worklet-processor.js`:

```javascript
/**
 * Audio Worklet Processor for PCM16 conversion
 * Converts Float32 audio to Int16 PCM for OpenAI Realtime API
 */
class PCM16Processor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 2400; // 100ms at 24kHz
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            const channelData = input[0];

            for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.bufferIndex++] = channelData[i];

                if (this.bufferIndex >= this.bufferSize) {
                    this.sendBuffer();
                }
            }
        }
        return true;
    }

    sendBuffer() {
        // Convert float32 to int16 PCM
        const int16Data = new Int16Array(this.bufferIndex);
        for (let i = 0; i < this.bufferIndex; i++) {
            const s = Math.max(-1, Math.min(1, this.buffer[i]));
            int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        this.port.postMessage({
            type: 'audio',
            data: int16Data.buffer
        }, [int16Data.buffer]);

        this.bufferIndex = 0;
    }
}

registerProcessor('pcm16-processor', PCM16Processor);
```

### 3. State Variables

```javascript
const state = {
    voiceMode: 'push-to-talk',  // 'push-to-talk' or 'realtime'
    realtimeActive: false,
    realtimeSessionCost: 0
};

let realtimeWs = null;
let realtimeAudioContext = null;
let realtimeMediaStream = null;
let realtimeWorkletNode = null;
let realtimeStartTime = null;
let lastAudioTime = null;

const REALTIME_COST_PER_MINUTE = 0.30;  // ~$0.30/min combined input/output
const SILENCE_TIMEOUT_MS = 5000;        // Auto-stop after 5s silence
```

### 4. WebSocket Connection

```javascript
async function startRealtimeConversation() {
    if (state.realtimeActive) return;

    try {
        // 1. Get microphone access
        realtimeMediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 24000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            }
        });

        // 2. Set up audio context at 24kHz
        realtimeAudioContext = new AudioContext({ sampleRate: 24000 });
        console.log('[Realtime] AudioContext sample rate:', realtimeAudioContext.sampleRate);

        // 3. Connect to OpenAI Realtime API
        const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';
        realtimeWs = new WebSocket(wsUrl, [
            'realtime',
            `openai-insecure-api-key.${state.apiKey}`
        ]);

        realtimeWs.onopen = async () => {
            console.log('[Realtime] WebSocket connected');

            // Configure session (GA API format)
            const sessionConfig = {
                type: 'session.update',
                session: {
                    type: 'realtime',
                    output_modalities: ['audio'],
                    instructions: buildSystemPrompt(),
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
                            voice: 'marin'  // Recommended: marin, cedar
                        }
                    }
                }
            };

            realtimeWs.send(JSON.stringify(sessionConfig));

            // Wait for session to configure
            await new Promise(resolve => setTimeout(resolve, 500));

            // Start audio streaming
            await startRealtimeAudioStream();

            // Initialize tracking
            state.realtimeActive = true;
            state.realtimeSessionCost = 0;
            realtimeStartTime = Date.now();
            lastAudioTime = Date.now();

            // Start cost counter
            startCostCounter();

            // Start silence detection
            startSilenceDetection();
        };

        realtimeWs.onmessage = handleRealtimeMessage;

        realtimeWs.onerror = (error) => {
            console.error('[Realtime] WebSocket error:', error);
            stopRealtimeConversation();
        };

        realtimeWs.onclose = () => {
            console.log('[Realtime] WebSocket closed');
            if (state.realtimeActive) {
                stopRealtimeConversation();
            }
        };

    } catch (error) {
        console.error('[Realtime] Setup failed:', error);
        showError('Failed to start real-time conversation: ' + error.message);
    }
}
```

### 5. Audio Streaming

```javascript
async function startRealtimeAudioStream() {
    if (!realtimeAudioContext || !realtimeMediaStream) {
        console.log('[Realtime] Audio context or stream not available');
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
```

### 6. Message Handler

```javascript
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
            updateStatus('You are speaking...');
            lastAudioTime = Date.now();
            break;

        case 'input_audio_buffer.speech_stopped':
            updateStatus('Processing...');
            break;

        case 'conversation.item.input_audio_transcription.completed':
            if (message.transcript) {
                appendChatMessage('user', message.transcript);
            }
            break;

        case 'response.output_audio.delta':
        case 'response.audio.delta':  // Beta compatibility
            playRealtimeAudioChunk(message.delta);
            updateStatus('Assistant speaking...');
            lastAudioTime = Date.now();
            break;

        case 'response.done':
            if (message.response?.output?.[0]?.content) {
                const content = message.response.output[0].content;
                const audioContent = content.find(c => c.type === 'audio');
                if (audioContent?.transcript) {
                    appendChatMessage('assistant', audioContent.transcript);
                }
            }
            updateStatus('Listening...');
            lastAudioTime = Date.now();
            break;

        case 'error':
            console.error('[Realtime] API error:', JSON.stringify(message.error, null, 2));
            handleRealtimeError(message.error);
            break;
    }
}
```

### 7. Audio Playback

```javascript
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

    // Convert PCM16 to AudioBuffer
    const audioBuffer = realtimeAudioContext.createBuffer(1, audioData.byteLength / 2, 24000);
    const channelData = audioBuffer.getChannelData(0);
    const int16Array = new Int16Array(audioData);

    for (let i = 0; i < int16Array.length; i++) {
        channelData[i] = int16Array[i] / 32768;
    }

    const source = realtimeAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(realtimeAudioContext.destination);
    source.onended = playNextRealtimeChunk;
    source.start();
}
```

### 8. Utility Functions

```javascript
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
```

### 9. Cost Tracking & Silence Detection

```javascript
function startCostCounter() {
    realtimeCostInterval = setInterval(() => {
        if (!state.realtimeActive) return;

        const elapsedMinutes = (Date.now() - realtimeStartTime) / 60000;
        state.realtimeSessionCost = elapsedMinutes * REALTIME_COST_PER_MINUTE;

        updateCostDisplay(state.realtimeSessionCost);
    }, 1000);
}

function startSilenceDetection() {
    silenceCheckInterval = setInterval(() => {
        if (!state.realtimeActive) return;

        const silenceDuration = Date.now() - lastAudioTime;
        if (silenceDuration > SILENCE_TIMEOUT_MS) {
            console.log('[Realtime] Auto-stopping due to silence');
            stopRealtimeConversation();
        }
    }, 1000);
}
```

### 10. Cleanup

```javascript
function stopRealtimeConversation() {
    console.log('[Realtime] Stopping conversation...');

    // Stop intervals
    if (realtimeCostInterval) {
        clearInterval(realtimeCostInterval);
        realtimeCostInterval = null;
    }
    if (silenceCheckInterval) {
        clearInterval(silenceCheckInterval);
        silenceCheckInterval = null;
    }

    // Close WebSocket
    if (realtimeWs) {
        realtimeWs.close();
        realtimeWs = null;
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

    // Clear playback queue
    audioPlaybackQueue = [];
    isPlayingRealtimeAudio = false;

    state.realtimeActive = false;
    updateUI(false);

    console.log('[Realtime] Session ended. Total cost: $' + state.realtimeSessionCost.toFixed(4));
}
```

---

## CSS Styling

```css
/* Voice Input Button */
.btn-voice {
    width: 42px;
    height: 42px;
    border: none;
    border-radius: 50%;
    background: var(--bg-secondary);
    border: 2px solid rgba(255, 255, 255, 0.15);
    color: var(--text-secondary);
    font-size: 1.1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.btn-voice:hover {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
}

.btn-voice.recording {
    background: rgba(239, 68, 68, 0.2);
    border-color: #ef4444;
    animation: pulse-recording 1s infinite;
}

@keyframes pulse-recording {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
    50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
}

/* Volume Meter */
.volume-meter {
    width: 100px;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
}

.volume-bar {
    height: 100%;
    background: linear-gradient(90deg, #4ade80, #fbbf24, #ef4444);
    width: 0%;
    transition: width 0.05s;
}

/* Recording Indicator */
.recording-dot {
    width: 12px;
    height: 12px;
    background: #ef4444;
    border-radius: 50%;
    animation: pulse-dot 0.8s infinite;
}

@keyframes pulse-dot {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.2); opacity: 0.7; }
}

/* Real-time Warning */
.realtime-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(251, 191, 36, 0.1);
    border: 1px solid rgba(251, 191, 36, 0.3);
    border-radius: 8px;
    font-size: 0.85rem;
    color: #fbbf24;
}
```

---

## Cost Comparison

| Mode | API | Cost |
|------|-----|------|
| Whisper Transcription | whisper-1 | $0.006/min |
| TTS Response | gpt-4o-mini-tts | $0.015/1K chars |
| **Push-to-Talk Total** | Combined | ~$0.02/exchange |
| **Real-time Voice** | Realtime API | ~$0.30/min (input + output) |

---

## Browser Requirements

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| MediaRecorder | 49+ | 25+ | 14.1+ | 79+ |
| getUserMedia | 53+ | 36+ | 11+ | 12+ |
| AudioWorklet | 66+ | 76+ | 14.1+ | 79+ |
| WebSocket | 4+ | 11+ | 5+ | 12+ |

**Note:** HTTPS is required for getUserMedia (except localhost).

---

## Troubleshooting

### Common Issues

1. **"Microphone access denied"**
   - Ensure HTTPS or localhost
   - Check browser permissions
   - Try different browser

2. **"AudioContext sample rate mismatch"**
   - Browser may not support 24kHz
   - Audio worklet handles resampling

3. **"Missing required parameter"**
   - Ensure GA API format (nested audio.input/output)
   - Include all required fields (type, rate)

4. **"WebSocket connection failed"**
   - Verify API key has Realtime API access
   - Check network connectivity

### Debug Logging

```javascript
// Enable verbose logging
realtimeWs.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log('[Realtime] Message:', message.type, message);
    handleRealtimeMessage(event);
};
```

---

## References

- [OpenAI Realtime API Guide](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Realtime API Reference](https://platform.openai.com/docs/api-reference/realtime)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
