/**
 * RLM Sub-Executor
 *
 * Executes sub-queries in parallel or sequentially based on strategy.
 * Manages concurrency, rate limiting, and depth tracking.
 *
 * Enhanced with Societies of Thought (SoT) debate phase for complex
 * analytical queries: MAP -> DEBATE -> REDUCE.
 *
 * Future RLM expansion: This will support recursive sub-LM calls where
 * a sub-query can spawn its own sub-queries up to maxDepth.
 */

import { getContextStore } from './context-store.js';
import { PerspectiveRoles } from './perspective-roles.js';

export class SubExecutor {
    constructor(options = {}) {
        this.options = {
            maxConcurrent: options.maxConcurrent || 3,
            maxDepth: options.maxDepth || 2,
            tokensPerSubQuery: options.tokensPerSubQuery || 800,
            timeout: options.timeout || 30000,
            reduceTimeout: options.reduceTimeout || 45000,
            retryAttempts: options.retryAttempts || 2,
            enforcePromptBudget: options.enforcePromptBudget || false,
            promptTokenBudget: options.promptTokenBudget || 0,
            promptTokenReserve: options.promptTokenReserve || 0,
            promptTokensForSubQuery: options.promptTokensForSubQuery || null,
            // Societies of Thought debate phase settings
            enableDebatePhase: options.enableDebatePhase !== false,
            debateMinPerspectives: options.debateMinPerspectives || 3,
            debateTimeout: options.debateTimeout || 30000,
            ...options
        };

        this.currentDepth = 0;
        this.executionLog = [];
    }

    /**
     * Update executor options at runtime.
     * @param {Object} nextOptions
     */
    updateOptions(nextOptions = {}) {
        this.options = {
            ...this.options,
            ...nextOptions
        };
    }

    /**
     * Execute sub-queries based on decomposition result
     * @param {Object} decomposition - Result from QueryDecomposer
     * @param {Function} llmCall - Function to call LLM (injected from orchestrator)
     * @param {Object} context - Additional context (apiKey, etc.)
     * @returns {Promise<Object>} Execution results
     */
    async execute(decomposition, llmCall, context = {}) {
        const { subQueries, strategy } = decomposition;
        const startTime = Date.now();

        this.executionLog = [];
        this.currentDepth = context.depth || 0;

        // Check depth limit
        if (this.currentDepth >= this.options.maxDepth) {
            return {
                success: false,
                error: `Maximum recursion depth (${this.options.maxDepth}) reached`,
                results: [],
                executionLog: this.executionLog
            };
        }

        let results;

        try {
            switch (strategy.type) {
                case 'direct':
                    results = await this._executeDirect(subQueries, llmCall, context);
                    break;

                case 'parallel':
                    results = await this._executeParallel(subQueries, llmCall, context);
                    break;

                case 'map-reduce':
                    results = await this._executeMapReduce(subQueries, llmCall, context);
                    break;

                case 'map-reduce-debate':
                    // SoT Phase 4: MAP -> DEBATE -> REDUCE
                    results = await this._executeMapReduceDebate(subQueries, llmCall, context);
                    break;

                case 'iterative':
                    results = await this._executeIterative(subQueries, llmCall, context);
                    break;

                default:
                    results = await this._executeParallel(subQueries, llmCall, context);
            }

            return {
                success: true,
                results,
                strategy: strategy.type,
                executionTime: Date.now() - startTime,
                executionLog: this.executionLog,
                depth: this.currentDepth
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                results: [],
                executionTime: Date.now() - startTime,
                executionLog: this.executionLog,
                depth: this.currentDepth
            };
        }
    }

    /**
     * Execute single direct query
     * @private
     */
    async _executeDirect(subQueries, llmCall, context) {
        const query = subQueries[0];
        if (!query) return [];

        const store = getContextStore();
        const { agentContext, budgetInfo } = this._resolveContext(store, query);

        this._log('direct', query.id, 'started');
        if (budgetInfo) {
            this._log('direct', query.id, budgetInfo);
        }

        const result = await this._executeWithRetry(
            () => llmCall(query.query, agentContext, context),
            query.id
        );

        this._log('direct', query.id, 'completed');

        return [{
            queryId: query.id,
            type: query.type,
            response: result,
            targetAgents: query.targetAgents,
            agentName: query.agentName,
            success: true
        }];
    }

    /**
     * Execute queries in parallel with concurrency limit
     * @private
     */
    async _executeParallel(subQueries, llmCall, context) {
        const store = getContextStore();
        const results = [];

        // Filter out reduce/followup queries (handled separately)
        const parallelQueries = subQueries.filter(sq =>
            sq.type !== 'reduce' && sq.type !== 'followup' && !sq.dynamic
        );

        if (parallelQueries.length === 0) {
            return results;
        }

        const maxConcurrent = Math.max(1, Math.min(this.options.maxConcurrent, parallelQueries.length));
        let cursor = 0;

        const runQuery = async (query) => {
            try {
                const { agentContext, budgetInfo } = this._resolveContext(store, query);

                this._log('parallel', query.id, 'executing');
                if (budgetInfo) {
                    this._log('parallel', query.id, budgetInfo);
                }

                const response = await this._executeWithRetry(
                    () => llmCall(query.query, agentContext, context),
                    query.id
                );

                return {
                    queryId: query.id,
                    type: query.type,
                    response,
                    targetAgents: query.targetAgents,
                    agentName: query.agentName,
                    success: true
                };
            } catch (error) {
                this._log('parallel', query.id, `failed: ${error.message}`);
                return {
                    queryId: query.id,
                    type: query.type,
                    response: null,
                    error: error.message,
                    targetAgents: query.targetAgents,
                    agentName: query.agentName,
                    success: false
                };
            }
        };

        const worker = async () => {
            while (cursor < parallelQueries.length) {
                const query = parallelQueries[cursor];
                cursor += 1;
                const result = await runQuery(query);
                results.push(result);
            }
        };

        this._log('parallel', 'pool', `started (${parallelQueries.length} queries, max ${maxConcurrent})`);
        const workers = Array.from({ length: maxConcurrent }, () => worker());
        await Promise.all(workers);
        this._log('parallel', 'pool', 'completed');

        return results;
    }

    /**
     * Execute map-reduce strategy
     * @private
     */
    async _executeMapReduce(subQueries, llmCall, context) {
        // Separate map and reduce queries
        const mapQueries = subQueries.filter(sq => sq.type === 'map');
        const reduceQuery = subQueries.find(sq => sq.type === 'reduce');

        // Execute map phase in parallel
        this._log('map-reduce', 'map-phase', 'started');
        const mapResults = await this._executeParallel(mapQueries, llmCall, context);
        this._log('map-reduce', 'map-phase', 'completed');

        // Build reduce context from map results
        if (reduceQuery) {
            this._log('map-reduce', 'reduce-phase', 'started');

            const mapContext = mapResults
                .filter(r => r.success && r.response)
                .map(r => `[From ${r.agentName || 'Meeting'}]:\n${r.response}`)
                .join('\n\n---\n\n');

            if (this._shouldEnforcePromptBudget()) {
                const contextTokens = this._estimatePromptTokens(mapContext);
                const maxInputTokens = Math.max(0, this.options.promptTokenBudget - this.options.promptTokenReserve);
                const budgetLog = this._buildBudgetLog('reduce', maxInputTokens, contextTokens, contextTokens > maxInputTokens);
                if (budgetLog) {
                    this._log('map-reduce', reduceQuery.id, budgetLog);
                }
            }

            const reduceResult = await this._executeWithRetry(
                () => llmCall(reduceQuery.query, mapContext, context),
                reduceQuery.id,
                { timeout: this.options.reduceTimeout }
            );

            this._log('map-reduce', 'reduce-phase', 'completed');

            return [
                ...mapResults,
                {
                    queryId: reduceQuery.id,
                    type: 'reduce',
                    response: reduceResult,
                    success: true,
                    isAggregation: true
                }
            ];
        }

        return mapResults;
    }

    /**
     * Execute MAP -> DEBATE -> REDUCE strategy (SoT Phase 4)
     * Adds a debate phase between map and reduce for complex queries
     * @private
     */
    async _executeMapReduceDebate(subQueries, llmCall, context) {
        // Separate map, debate, and reduce queries
        const mapQueries = subQueries.filter(sq => sq.type === 'map');
        const reduceQuery = subQueries.find(sq => sq.type === 'reduce');

        // Execute map phase in parallel
        this._log('map-reduce-debate', 'map-phase', 'started');
        const mapResults = await this._executeParallel(mapQueries, llmCall, context);
        this._log('map-reduce-debate', 'map-phase', 'completed');

        // Filter successful results with perspectives for debate
        const debateCandidates = mapResults.filter(r =>
            r.success && r.response && r.perspective?.roleId
        );

        // Only run debate if we have enough diverse perspectives
        let debateResults = null;
        if (this.options.enableDebatePhase &&
            debateCandidates.length >= this.options.debateMinPerspectives) {

            this._log('map-reduce-debate', 'debate-phase', 'started');
            debateResults = await this._executeDebate(debateCandidates, llmCall, context);
            this._log('map-reduce-debate', 'debate-phase', 'completed');
        }

        // Build reduce context from map results (and optionally debate insights)
        if (reduceQuery) {
            this._log('map-reduce-debate', 'reduce-phase', 'started');

            // Build context with perspective labels
            let mapContext = mapResults
                .filter(r => r.success && r.response)
                .map(r => {
                    const label = r.perspective?.roleLabel || r.agentName || 'Meeting';
                    return `[${label} - ${r.agentName || 'Source'}]:\n${r.response}`;
                })
                .join('\n\n---\n\n');

            // Append debate insights if available
            if (debateResults && debateResults.insights) {
                mapContext += `\n\n---\n\n**DEBATE INSIGHTS:**\n${debateResults.insights}`;
                if (debateResults.tensions.length > 0) {
                    mapContext += `\n\n**KEY TENSIONS:**\n${debateResults.tensions.map(t => `- ${t}`).join('\n')}`;
                }
            }

            const reduceResult = await this._executeWithRetry(
                () => llmCall(reduceQuery.query, mapContext, context),
                reduceQuery.id,
                { timeout: this.options.reduceTimeout }
            );

            this._log('map-reduce-debate', 'reduce-phase', 'completed');

            return [
                ...mapResults,
                ...(debateResults ? [{
                    queryId: 'debate',
                    type: 'debate',
                    response: debateResults.insights,
                    tensions: debateResults.tensions,
                    success: true
                }] : []),
                {
                    queryId: reduceQuery.id,
                    type: 'reduce',
                    response: reduceResult,
                    success: true,
                    isAggregation: true,
                    hadDebatePhase: !!debateResults
                }
            ];
        }

        return mapResults;
    }

    /**
     * Execute debate phase between perspectives (SoT Phase 4)
     * Pits perspectives against each other to surface tensions
     * @private
     */
    async _executeDebate(candidates, llmCall, context) {
        // Group by perspective role
        const byRole = {};
        candidates.forEach(c => {
            const role = c.perspective?.roleId || 'default';
            if (!byRole[role]) byRole[role] = [];
            byRole[role].push(c);
        });

        const roles = Object.keys(byRole);
        const tensions = [];
        const agreements = [];

        // Generate debate prompts between key opposing perspectives
        const debatePairs = [
            ['advocate', 'critic'],
            ['analyst', 'synthesizer'],
            ['pragmatist', 'critic']
        ];

        const debateInsights = [];

        for (const [role1, role2] of debatePairs) {
            if (byRole[role1] && byRole[role2]) {
                const view1 = byRole[role1].map(c => c.response).join('\n');
                const view2 = byRole[role2].map(c => c.response).join('\n');

                const debatePrompt = `You are moderating a structured debate between two analytical perspectives.

**${(PerspectiveRoles[role1.toUpperCase()]?.label || role1)} Position:**
${view1}

**${(PerspectiveRoles[role2.toUpperCase()]?.label || role2)} Position:**
${view2}

Identify:
1. Key points of AGREEMENT between these perspectives
2. Key points of TENSION or DISAGREEMENT
3. Which perspective has the stronger evidence

Be concise (3-5 bullet points total).`;

                try {
                    const debateResult = await this._executeWithRetry(
                        () => llmCall(debatePrompt, '', context),
                        `debate-${role1}-vs-${role2}`,
                        { timeout: this.options.debateTimeout }
                    );

                    debateInsights.push({
                        pair: [role1, role2],
                        insights: debateResult
                    });

                    // Extract tensions from the response
                    if (debateResult.toLowerCase().includes('tension') ||
                        debateResult.toLowerCase().includes('disagree')) {
                        tensions.push(`${role1} vs ${role2}: See debate notes`);
                    }
                } catch (error) {
                    this._log('debate', `${role1}-vs-${role2}`, `failed: ${error.message}`);
                }
            }
        }

        // Combine insights
        const combinedInsights = debateInsights.length > 0
            ? debateInsights.map(d =>
                `**${d.pair[0]} vs ${d.pair[1]}:**\n${d.insights}`
            ).join('\n\n')
            : 'No significant debates could be generated between perspectives.';

        return {
            insights: combinedInsights,
            tensions,
            agreements,
            debateCount: debateInsights.length
        };
    }

    /**
     * Execute iterative strategy (initial + followup)
     * @private
     */
    async _executeIterative(subQueries, llmCall, context) {
        const store = getContextStore();
        const results = [];

        // Execute initial query
        const initialQuery = subQueries.find(sq => sq.type === 'exploratory');
        if (!initialQuery) return results;

        this._log('iterative', 'initial', 'started');

        const { agentContext: initialContext, budgetInfo: initialBudget } = this._resolveContext(store, initialQuery);
        if (initialBudget) {
            this._log('iterative', initialQuery.id, initialBudget);
        }

        const initialResult = await this._executeWithRetry(
            () => llmCall(initialQuery.query, initialContext, context),
            initialQuery.id
        );

        results.push({
            queryId: initialQuery.id,
            type: 'exploratory',
            response: initialResult,
            success: true
        });

        this._log('iterative', 'initial', 'completed');

        // Check if followup is needed (simplified heuristic)
        const followupQuery = subQueries.find(sq => sq.type === 'followup');
        if (followupQuery && this._needsFollowup(initialResult)) {
            this._log('iterative', 'followup', 'started');

            // Expand context for followup
            const allActiveAgents = store.getActiveAgents();
            const followupQueryContext = {
                query: followupQuery.query,
                targetAgents: allActiveAgents.map(agent => agent.id),
                contextLevel: 'full'
            };
            const { agentContext: followupContext, budgetInfo: followupBudget } = this._resolveContext(store, followupQueryContext);
            if (followupBudget) {
                this._log('iterative', followupQuery.id, followupBudget);
            }

            // Generate followup query based on initial result
            const dynamicFollowupQuery = `Based on the initial finding: "${initialResult.substring(0, 200)}..."

Please provide more details and check all meetings for related information.`;

            const followupResult = await this._executeWithRetry(
                () => llmCall(dynamicFollowupQuery, followupContext, context),
                followupQuery.id
            );

            results.push({
                queryId: followupQuery.id,
                type: 'followup',
                response: followupResult,
                success: true
            });

            this._log('iterative', 'followup', 'completed');
        }

        return results;
    }

    _resolveContext(store, query) {
        if (!this._shouldEnforcePromptBudget()) {
            return {
                agentContext: store.getCombinedContext(query.targetAgents, query.contextLevel),
                budgetInfo: null
            };
        }

        const baseTokens = this.options.promptTokensForSubQuery
            ? this.options.promptTokensForSubQuery(query.query)
            : 0;
        const maxInputTokens = Math.max(0, this.options.promptTokenBudget - this.options.promptTokenReserve);
        const availableForContext = Math.max(0, maxInputTokens - baseTokens);

        if (!availableForContext) {
            return {
                agentContext: '',
                budgetInfo: this._buildBudgetLog('context', maxInputTokens, 0, true)
            };
        }

        const budgeted = store.getCombinedContextWithBudget(query.targetAgents, availableForContext, {
            preferredLevel: query.contextLevel
        });

        return {
            agentContext: budgeted.context,
            budgetInfo: this._buildBudgetLog(
                'context',
                maxInputTokens,
                budgeted.tokenEstimate,
                budgeted.skippedAgents?.length > 0
            )
        };
    }

    _shouldEnforcePromptBudget() {
        return Boolean(this.options.enforcePromptBudget && this.options.promptTokenBudget);
    }

    _estimatePromptTokens(text) {
        const store = getContextStore();
        return store.estimateTokens(text);
    }

    _buildBudgetLog(scope, maxInputTokens, contextTokens, truncated = false) {
        if (!maxInputTokens) {
            return null;
        }
        const status = truncated ? 'trimmed' : 'ok';
        return `Prompt budget (${scope}): ${contextTokens}/${maxInputTokens} tokens (${status}).`;
    }

    /**
     * Check if followup query is needed
     * @private
     */
    _needsFollowup(initialResult) {
        // Simple heuristics for now
        const uncertaintyMarkers = [
            'not sure',
            'unclear',
            'might be',
            'could be',
            'no information',
            'not found',
            'limited data'
        ];

        const lowerResult = initialResult.toLowerCase();
        return uncertaintyMarkers.some(marker => lowerResult.includes(marker));
    }

    /**
     * Execute with retry logic
     * @private
     * @param {Function} fn - Function to execute
     * @param {string} queryId - Query identifier for logging
     * @param {Object} execOptions - Execution options
     * @param {number} execOptions.timeout - Override timeout for this execution
     */
    async _executeWithRetry(fn, queryId, execOptions = {}) {
        const timeout = execOptions.timeout || this.options.timeout;
        let lastError;

        for (let attempt = 0; attempt <= this.options.retryAttempts; attempt++) {
            try {
                return await Promise.race([
                    fn(),
                    this._timeout(timeout, queryId)
                ]);
            } catch (error) {
                lastError = error;
                this._log('retry', queryId, `attempt ${attempt + 1} failed: ${error.message}`);

                if (attempt < this.options.retryAttempts) {
                    await this._sleep(1000 * Math.pow(2, attempt)); // Exponential backoff
                }
            }
        }

        throw lastError;
    }

    /**
     * Create timeout promise
     * @private
     */
    _timeout(ms, queryId) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Query ${queryId} timed out after ${ms}ms`)), ms);
        });
    }

    /**
     * Sleep utility
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Log execution event
     * @private
     */
    _log(phase, queryId, message) {
        const entry = {
            timestamp: new Date().toISOString(),
            phase,
            queryId,
            message,
            depth: this.currentDepth
        };
        this.executionLog.push(entry);
        console.log(`[RLM:${phase}] ${queryId}: ${message}`);
    }

    /**
     * Future RLM hook: Execute with recursive sub-calls
     * @param {Object} decomposition - Query decomposition
     * @param {Function} llmCall - LLM call function
     * @param {Object} context - Context including depth
     * @returns {Promise<Object>} Results with potential sub-results
     */
    async executeRecursive(decomposition, llmCall, context = {}) {
        // Placeholder for full RLM recursive execution
        // In full RLM, sub-queries could spawn their own decompositions
        console.warn('executeRecursive: Recursive execution not fully implemented');

        return this.execute(decomposition, llmCall, {
            ...context,
            depth: (context.depth || 0) + 1
        });
    }

    /**
     * Get execution statistics
     */
    getStats() {
        return {
            totalExecutions: this.executionLog.length,
            currentDepth: this.currentDepth,
            log: this.executionLog
        };
    }
}

// Factory function
export function createExecutor(options = {}) {
    return new SubExecutor(options);
}
