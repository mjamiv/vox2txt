/**
 * Conflict Detector for Societies of Thought
 *
 * Identifies disagreements, tensions, and contradictions between
 * sub-query responses from different perspectives.
 *
 * @module conflict-detector
 */

export class ConflictDetector {
    constructor(options = {}) {
        this.options = {
            // Minimum number of responses to analyze for conflicts
            minResponsesForConflict: 2,

            // Threshold for semantic similarity to consider as agreement
            agreementThreshold: 0.75,

            // Keywords that indicate disagreement
            conflictMarkers: [
                'however', 'but', 'although', 'despite', 'contrary',
                'disagree', 'conflict', 'tension', 'risk', 'concern',
                'alternatively', 'on the other hand', 'versus', 'vs',
                'challenge', 'issue', 'problem', 'limitation', 'obstacle',
                'whereas', 'unlike', 'contrast', 'differ', 'instead'
            ],

            // Keywords that indicate agreement
            agreementMarkers: [
                'also', 'similarly', 'agrees', 'confirms', 'supports',
                'consistent', 'aligns', 'reinforces', 'validates',
                'likewise', 'as well', 'in line with', 'corroborates',
                'echoes', 'mirrors', 'matches', 'concurs'
            ],

            ...options
        };
    }

    /**
     * Analyze responses for conflicts and agreements
     * @param {Array} responses - Array of { response, agentName, perspective }
     * @returns {Object} Analysis result
     */
    analyze(responses) {
        if (!responses || responses.length < this.options.minResponsesForConflict) {
            return {
                hasConflicts: false,
                conflicts: [],
                agreements: [],
                conflictThemes: [],
                summary: null
            };
        }

        const conflicts = [];
        const agreements = [];

        // Pairwise comparison of responses
        for (let i = 0; i < responses.length; i++) {
            for (let j = i + 1; j < responses.length; j++) {
                const comparison = this._compareResponses(responses[i], responses[j]);

                if (comparison.type === 'conflict') {
                    conflicts.push(comparison);
                } else if (comparison.type === 'agreement') {
                    agreements.push(comparison);
                }
            }
        }

        // Extract key themes from conflicts
        const conflictThemes = this._extractConflictThemes(conflicts);

        return {
            hasConflicts: conflicts.length > 0,
            conflicts,
            agreements,
            conflictThemes,
            summary: this._generateConflictSummary(conflicts, agreements)
        };
    }

    /**
     * Compare two responses for conflict/agreement
     * @private
     */
    _compareResponses(resp1, resp2) {
        const text1 = (resp1.response || '').toLowerCase();
        const text2 = (resp2.response || '').toLowerCase();

        // Skip empty responses
        if (!text1.trim() || !text2.trim()) {
            return { type: 'neutral', confidence: 0 };
        }

        // Count conflict and agreement markers
        const conflictScore = this._countMarkers(text1, this.options.conflictMarkers) +
                             this._countMarkers(text2, this.options.conflictMarkers);
        const agreementScore = this._countMarkers(text1, this.options.agreementMarkers) +
                              this._countMarkers(text2, this.options.agreementMarkers);

        // Calculate semantic similarity (simple word overlap)
        const similarity = this._calculateSimilarity(text1, text2);

        // Determine relationship
        let type = 'neutral';
        let confidence = 0.5;

        if (conflictScore > agreementScore && similarity < this.options.agreementThreshold) {
            type = 'conflict';
            confidence = Math.min(1.0, 0.5 + (conflictScore * 0.1));
        } else if (agreementScore > conflictScore || similarity >= this.options.agreementThreshold) {
            type = 'agreement';
            confidence = Math.min(1.0, 0.5 + (agreementScore * 0.1) + (similarity * 0.3));
        }

        return {
            type,
            confidence,
            source1: {
                agentName: resp1.agentName || 'Source 1',
                perspective: resp1.perspective?.roleLabel || 'Default',
                excerpt: this._extractKeyExcerpt(resp1.response)
            },
            source2: {
                agentName: resp2.agentName || 'Source 2',
                perspective: resp2.perspective?.roleLabel || 'Default',
                excerpt: this._extractKeyExcerpt(resp2.response)
            },
            similarity,
            conflictScore,
            agreementScore
        };
    }

    /**
     * Count marker occurrences in text
     * @private
     */
    _countMarkers(text, markers) {
        return markers.reduce((count, marker) => {
            const regex = new RegExp(`\\b${marker}\\b`, 'gi');
            const matches = text.match(regex);
            return count + (matches ? matches.length : 0);
        }, 0);
    }

    /**
     * Calculate text similarity (Jaccard-like)
     * @private
     */
    _calculateSimilarity(text1, text2) {
        const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 3));
        const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 3));

        if (words1.size === 0 || words2.size === 0) return 0;

        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);

        return union.size > 0 ? intersection.size / union.size : 0;
    }

    /**
     * Extract key excerpt from response
     * @private
     */
    _extractKeyExcerpt(response, maxLength = 150) {
        if (!response) return '';
        const trimmed = response.trim();
        if (trimmed.length <= maxLength) return trimmed;

        // Try to break at sentence boundary
        const cutoff = trimmed.lastIndexOf('.', maxLength);
        if (cutoff > maxLength * 0.5) {
            return trimmed.substring(0, cutoff + 1);
        }
        return trimmed.substring(0, maxLength) + '...';
    }

    /**
     * Extract common themes from conflicts
     * @private
     */
    _extractConflictThemes(conflicts) {
        if (conflicts.length === 0) return [];

        // Simple keyword extraction from conflict excerpts
        const allText = conflicts.map(c =>
            `${c.source1.excerpt} ${c.source2.excerpt}`
        ).join(' ').toLowerCase();

        const words = allText.split(/\s+/).filter(w => w.length > 4);
        const wordFreq = {};
        words.forEach(w => {
            // Normalize word
            const normalized = w.replace(/[^a-z]/g, '');
            if (normalized.length > 4) {
                wordFreq[normalized] = (wordFreq[normalized] || 0) + 1;
            }
        });

        // Return top 5 most frequent meaningful words
        return Object.entries(wordFreq)
            .filter(([word]) => !this._isStopWord(word))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([word]) => word);
    }

    /**
     * Check if word is a stop word
     * @private
     */
    _isStopWord(word) {
        const stopWords = new Set([
            'that', 'this', 'with', 'from', 'have', 'been',
            'were', 'their', 'would', 'could', 'should', 'about',
            'which', 'there', 'these', 'those', 'being', 'other',
            'meeting', 'discussed', 'mentioned', 'noted', 'stated',
            'regarding', 'related', 'based', 'according', 'following'
        ]);
        return stopWords.has(word);
    }

    /**
     * Generate human-readable conflict summary
     * @private
     */
    _generateConflictSummary(conflicts, agreements) {
        if (conflicts.length === 0 && agreements.length === 0) {
            return null;
        }

        const parts = [];

        if (agreements.length > 0) {
            parts.push(`${agreements.length} point(s) of agreement found`);
        }

        if (conflicts.length > 0) {
            parts.push(`${conflicts.length} tension(s) or disagreement(s) detected`);
        }

        return parts.join('; ');
    }

    /**
     * Format conflicts for inclusion in synthesis prompt
     * @param {Object} analysis - Result from analyze()
     * @returns {string} Formatted conflict context
     */
    formatForSynthesis(analysis) {
        if (!analysis || !analysis.hasConflicts) {
            return '';
        }

        let output = '\n\n**Identified Tensions:**\n';

        analysis.conflicts.forEach((conflict, index) => {
            output += `\n${index + 1}. ${conflict.source1.perspective} (${conflict.source1.agentName}) vs ${conflict.source2.perspective} (${conflict.source2.agentName}):\n`;
            output += `   - View A: "${conflict.source1.excerpt}"\n`;
            output += `   - View B: "${conflict.source2.excerpt}"\n`;
        });

        if (analysis.conflictThemes.length > 0) {
            output += `\nKey themes in tensions: ${analysis.conflictThemes.join(', ')}\n`;
        }

        return output;
    }

    /**
     * Get a brief conflict indicator for UI display
     * @param {Object} analysis - Result from analyze()
     * @returns {Object|null} Brief indicator with icon and text
     */
    getConflictIndicator(analysis) {
        if (!analysis || !analysis.hasConflicts) {
            return null;
        }

        return {
            icon: '\u26a1', // Lightning bolt
            count: analysis.conflicts.length,
            text: analysis.summary,
            themes: analysis.conflictThemes
        };
    }
}

/**
 * Factory function for creating conflict detector
 * @param {Object} options - Configuration options
 * @returns {ConflictDetector} New conflict detector instance
 */
export function createConflictDetector(options = {}) {
    return new ConflictDetector(options);
}
