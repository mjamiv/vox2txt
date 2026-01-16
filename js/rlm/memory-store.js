/**
 * RLM Memory Store
 *
 * Stores structured memory slices and a compact state block (SWM).
 * Milestone 1: Capture memory without affecting prompt assembly.
 */

const MEMORY_TYPES = [
    'decision',
    'action',
    'risk',
    'entity',
    'constraint',
    'open_question',
    'episode'
];

export class MemoryStore {
    constructor() {
        this.reset();
    }

    reset() {
        this.stateBlock = {
            decisions: [],
            actions: [],
            risks: [],
            entities: [],
            constraints: [],
            openQuestions: []
        };

        this.workingWindow = {
            lastUserTurns: [],
            lastAssistantSummary: ''
        };

        this.slices = [];
        this.stats = {
            totalSlices: 0,
            lastCapturedAt: null
        };
        this._idCounter = 0;
    }

    /**
     * Capture memory from an assistant completion.
     * @param {Object} payload
     * @param {string} payload.query
     * @param {string} payload.response
     * @param {Object} payload.metadata
     */
    captureCompletion({ query, response, metadata = {} }) {
        if (!query && !response) return;

        this._updateWorkingWindow(query, response);

        const extracted = this._extractStructuredSlices(response);
        const timestamp = new Date().toISOString();

        extracted.forEach(slice => {
            const entry = {
                id: this._nextId(),
                type: slice.type,
                text: slice.text,
                summary: slice.text,
                tags: slice.tags,
                entities: slice.entities,
                source_agent_ids: metadata.agentIds || [],
                source_tool_ids: metadata.toolIds || [],
                timestamp,
                recency_score: 1,
                importance_score: slice.importance,
                retrieval_count: 0,
                last_retrieved_at: null,
                token_estimate: this._estimateTokens(slice.text),
                confidence: slice.confidence,
                source_hash: this._hashText(slice.text)
            };

            this.slices.push(entry);
            this._mergeIntoStateBlock(entry);
        });

        this.stats.totalSlices = this.slices.length;
        this.stats.lastCapturedAt = timestamp;
    }

    getStateBlock() {
        return { ...this.stateBlock };
    }

    getWorkingWindow() {
        return { ...this.workingWindow };
    }

    getSlices() {
        return [...this.slices];
    }

    getStats() {
        return {
            ...this.stats,
            stateBlockSize: Object.values(this.stateBlock).reduce((sum, items) => sum + items.length, 0)
        };
    }

    _updateWorkingWindow(query, response) {
        if (query) {
            this.workingWindow.lastUserTurns = [query, ...this.workingWindow.lastUserTurns].slice(0, 2);
        }

        if (response) {
            this.workingWindow.lastAssistantSummary = this._summarizeResponse(response);
        }
    }

    _summarizeResponse(response) {
        if (!response) return '';
        const trimmed = response.replace(/\s+/g, ' ').trim();
        if (trimmed.length <= 320) return trimmed;
        const cutoff = trimmed.lastIndexOf('.', 320);
        if (cutoff > 120) {
            return trimmed.slice(0, cutoff + 1);
        }
        return trimmed.slice(0, 320) + '...';
    }

    _extractStructuredSlices(response) {
        if (!response) return [];

        const lines = response.split('\n').map(line => line.trim()).filter(Boolean);
        const buckets = {
            decision: [],
            action: [],
            risk: [],
            constraint: [],
            entity: [],
            open_question: []
        };

        let activeType = null;
        lines.forEach(line => {
            const headingMatch = line.match(/^(decisions?|actions?|risks?|constraints?|entities?|open questions?)[:\s-]*/i);
            if (headingMatch) {
                activeType = this._normalizeType(headingMatch[1]);
                const remainder = line.slice(headingMatch[0].length).trim();
                if (remainder) {
                    buckets[activeType].push(remainder);
                }
                return;
            }

            if (activeType && /^[-•\d]/.test(line)) {
                buckets[activeType].push(line.replace(/^[-•\d.\s]+/, '').trim());
                return;
            }

            activeType = null;
        });

        const slices = [];
        MEMORY_TYPES.forEach(type => {
            if (type === 'episode') return;
            const entries = buckets[type] || [];
            entries.forEach(text => {
                if (!text) return;
                slices.push({
                    type,
                    text,
                    tags: [type],
                    entities: this._extractEntities(text),
                    confidence: 0.6,
                    importance: this._importanceForType(type)
                });
            });
        });

        if (slices.length === 0) {
            const fallback = this._summarizeResponse(response);
            if (fallback) {
                slices.push({
                    type: 'episode',
                    text: fallback,
                    tags: ['episode'],
                    entities: this._extractEntities(fallback),
                    confidence: 0.4,
                    importance: 0.4
                });
            }
        }

        return slices;
    }

    _normalizeType(label) {
        const normalized = label.toLowerCase();
        if (normalized.startsWith('decision')) return 'decision';
        if (normalized.startsWith('action')) return 'action';
        if (normalized.startsWith('risk')) return 'risk';
        if (normalized.startsWith('constraint')) return 'constraint';
        if (normalized.startsWith('entity')) return 'entity';
        if (normalized.startsWith('open')) return 'open_question';
        return 'episode';
    }

    _mergeIntoStateBlock(entry) {
        const map = {
            decision: 'decisions',
            action: 'actions',
            risk: 'risks',
            constraint: 'constraints',
            entity: 'entities',
            open_question: 'openQuestions'
        };
        const key = map[entry.type];
        if (!key) return;

        const existing = this.stateBlock[key];
        if (!existing.find(item => item.source_hash === entry.source_hash)) {
            existing.push({
                text: entry.text,
                confidence: entry.confidence,
                source_hash: entry.source_hash,
                timestamp: entry.timestamp
            });
        }
    }

    _importanceForType(type) {
        switch (type) {
            case 'decision':
                return 0.9;
            case 'risk':
                return 0.8;
            case 'action':
                return 0.7;
            case 'constraint':
                return 0.6;
            case 'entity':
                return 0.5;
            case 'open_question':
                return 0.4;
            default:
                return 0.3;
        }
    }

    _extractEntities(text) {
        if (!text) return [];
        const candidates = text.match(/\b[A-Z][a-zA-Z0-9_-]{2,}\b/g) || [];
        return [...new Set(candidates)].slice(0, 8);
    }

    _estimateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    }

    _hashText(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i += 1) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return `h${Math.abs(hash)}`;
    }

    _nextId() {
        this._idCounter += 1;
        return `mem-${Date.now()}-${this._idCounter}`;
    }
}

let memoryStoreInstance = null;

export function getMemoryStore() {
    if (!memoryStoreInstance) {
        memoryStoreInstance = new MemoryStore();
    }
    return memoryStoreInstance;
}

export function resetMemoryStore() {
    memoryStoreInstance = new MemoryStore();
    return memoryStoreInstance;
}
