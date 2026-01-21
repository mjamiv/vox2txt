/**
 * RLM Query Decomposer
 *
 * Analyzes user queries and decomposes them into targeted sub-queries.
 * Each sub-query is designed to be answered by a specific agent or subset.
 *
 * Enhanced with Societies of Thought (SoT) perspective roles for
 * diverse cognitive viewpoints during query decomposition.
 *
 * Future RLM expansion: This will generate executable code that the REPL
 * can run to programmatically query the context store.
 */

import { getContextStore } from './context-store.js';
import {
    selectRolesForQuery,
    assignRolesToAgents,
    assignPerspectivesToGroups,
    perspectiveFromGroupType,
    RoleAssignmentStrategy,
    PerspectiveRoles
} from './perspective-roles.js';

/**
 * Query complexity classification
 */
export const QueryComplexity = {
    SIMPLE: 'simple',           // Single agent, direct answer
    COMPARATIVE: 'comparative', // 2-3 agents, compare/contrast
    AGGREGATE: 'aggregate',     // All agents, synthesize patterns
    EXPLORATORY: 'exploratory'  // Unknown scope, needs discovery
};

/**
 * Query intent classification
 */
export const QueryIntent = {
    FACTUAL: 'factual',           // "What was decided about X?"
    COMPARATIVE: 'comparative',   // "How does X differ from Y?"
    AGGREGATIVE: 'aggregative',   // "What are all the action items?"
    ANALYTICAL: 'analytical',     // "What patterns emerge across meetings?"
    TEMPORAL: 'temporal'          // "How has X evolved over time?"
};

export class QueryDecomposer {
    constructor(options = {}) {
        this.options = {
            maxSubQueries: options.maxSubQueries || 10,
            summaryMaxSubQueries: options.summaryMaxSubQueries || 4,
            minRelevanceScore: options.minRelevanceScore || 2,
            enableLLMDecomposition: options.enableLLMDecomposition !== false,
            // Societies of Thought settings
            enableSocietiesOfThought: options.enableSocietiesOfThought !== false,
            roleAssignmentStrategy: options.roleAssignmentStrategy || RoleAssignmentStrategy.ROTATING,
            minAgentsForSoT: options.minAgentsForSoT || 2,
            minAgentsForGroupDecomposition: options.minAgentsForGroupDecomposition || 6,
            ...options
        };
        this.groups = []; // Groups data from state
    }

    /**
     * Set groups data for reference detection
     * @param {Array} groups - Array of group objects
     */
    setGroups(groups) {
        this.groups = groups || [];
    }

    /**
     * Analyze and decompose a user query
     * @param {string} query - User's natural language query
     * @param {Object} context - Additional context (apiKey, etc.)
     * @returns {Promise<Object>} Decomposition result
     */
    async decompose(query, context = {}) {
        const store = getContextStore();
        const stats = store.getStats();

        // Classify the query
        const classification = this._classifyQuery(query);

        // Detect group references
        const groupReferences = this.detectGroupReferences(query);
        classification.groupReferences = groupReferences.matchedGroups;
        classification.usesGroups = groupReferences.hasGroupReferences;
        classification.groupFilterIds = groupReferences.groupFilterIds;
        classification.isGroupComparison = groupReferences.isGroupComparison;

        // Extract depth override from context (for "Go Deeper" feature)
        const depthOverride = context.depthOverride ?? null;

        // Get relevant agents - uses conservative default or depth override
        // If group filter specified, restrict to those agents
        const maxResults = this._resolveMaxResults(classification, stats.activeAgents, depthOverride);
        let queryOptions = {
            maxResults,
            minScore: this.options.minRelevanceScore
        };

        // Apply group filter if groups are referenced
        if (groupReferences.hasGroupReferences && groupReferences.groupFilterIds.length > 0) {
            queryOptions.agentFilter = this.getAgentIdsForGroups(groupReferences.groupFilterIds);
        }

        const relevantAgents = store.queryAgents(query, queryOptions);

        // Determine decomposition strategy
        const strategy = this._determineStrategy(classification, relevantAgents, stats);

        // Generate sub-queries based on strategy
        const subQueries = await this._generateSubQueries(
            query,
            classification,
            strategy,
            relevantAgents,
            context
        );

        // Calculate depth info for progressive depth feature
        const defaultDepth = this.options.defaultSubQueryDepth || 10;
        const currentDepth = depthOverride ?? Math.min(defaultDepth, stats.activeAgents);
        const depthIncrement = this.options.depthIncrement || 5;
        const depthInfo = {
            currentDepth: relevantAgents.length,
            maxDepth: stats.activeAgents,
            agentsQueried: relevantAgents.length,
            canGoDeeper: relevantAgents.length < stats.activeAgents,
            nextDepth: Math.min(currentDepth + depthIncrement, stats.activeAgents),
            depthIncrement
        };

        return {
            originalQuery: query,
            classification,
            strategy,
            relevantAgents,
            subQueries,
            depthInfo,
            metadata: {
                totalAgents: stats.totalAgents,
                activeAgents: stats.activeAgents,
                selectedAgents: relevantAgents.length,
                decomposedAt: new Date().toISOString()
            }
        };
    }

    /**
     * Classify query complexity and intent
     * @private
     */
    _classifyQuery(query) {
        const lowerQuery = query.toLowerCase();
        const summaryRequest = /\b(summary|summarize|overview|highlights?)\b/i.test(query);
        const summaryFullScope = summaryRequest && /\b(all|across|overall|entire|conversation|meetings?)\b/i.test(query);

        // Detect intent
        let intent = QueryIntent.FACTUAL;

        if (/compare|differ|versus|vs\.?|between/i.test(query)) {
            intent = QueryIntent.COMPARATIVE;
        } else if (/all|every|total|combined|across|overall/i.test(query)) {
            intent = QueryIntent.AGGREGATIVE;
        } else if (/pattern|trend|theme|common|recurring|emerge/i.test(query)) {
            intent = QueryIntent.ANALYTICAL;
        } else if (/over time|evolution|change|progress|history/i.test(query)) {
            intent = QueryIntent.TEMPORAL;
        }
        if (summaryRequest && intent === QueryIntent.FACTUAL) {
            intent = QueryIntent.AGGREGATIVE;
        }

        // Detect complexity
        let complexity = QueryComplexity.SIMPLE;

        if (intent === QueryIntent.COMPARATIVE) {
            complexity = QueryComplexity.COMPARATIVE;
        } else if (intent === QueryIntent.AGGREGATIVE || intent === QueryIntent.ANALYTICAL) {
            complexity = QueryComplexity.AGGREGATE;
        } else if (/\?.*\?|and also|additionally|furthermore/i.test(query)) {
            complexity = QueryComplexity.EXPLORATORY;
        }
        if (summaryRequest && complexity === QueryComplexity.SIMPLE) {
            complexity = QueryComplexity.AGGREGATE;
        }

        // Detect if query targets specific meetings
        const mentionsMeeting = /meeting|session|call|discussion|sync/i.test(query);
        const mentionsTimeframe = /last|recent|this week|yesterday|today/i.test(query);
        const formatConstraints = this._detectFormatConstraints(query);
        const dataPreference = this._inferDataPreference(query);
        const intentTags = this._inferIntentTags(query);
        const summaryScope = summaryRequest
            ? (summaryFullScope || !mentionsMeeting ? 'full' : 'scoped')
            : null;

        return {
            intent,
            complexity,
            mentionsMeeting,
            mentionsTimeframe,
            dataPreference,
            formatConstraints,
            intentTags,
            estimatedScope: this._estimateScope(complexity),
            summaryRequest,
            summaryScope
        };
    }

    /**
     * Estimate query scope (how many agents likely needed)
     * @private
     */
    _estimateScope(complexity) {
        switch (complexity) {
            case QueryComplexity.SIMPLE:
                return { min: 1, max: 2 };
            case QueryComplexity.COMPARATIVE:
                return { min: 2, max: 3 };
            case QueryComplexity.AGGREGATE:
                return { min: 3, max: 10 };
            case QueryComplexity.EXPLORATORY:
                return { min: 1, max: 5 };
            default:
                return { min: 1, max: 3 };
        }
    }

    _resolveMaxResults(classification, activeAgentCount = 5, depthOverride = null) {
        // If explicit depth override (from "Go Deeper"), use it
        if (depthOverride !== null && depthOverride > 0) {
            return Math.min(depthOverride, activeAgentCount, this.options.maxSubQueries);
        }

        // For full-scope summaries, use dedicated limit
        if (classification?.summaryScope === 'full') {
            return Math.min(this.options.summaryMaxSubQueries, activeAgentCount);
        }

        // Default: use conservative default (cost-effective) instead of full agent count
        const defaultDepth = this.options.defaultSubQueryDepth || 10;
        return Math.min(defaultDepth, activeAgentCount, this.options.maxSubQueries);
    }

    _detectFormatConstraints(query) {
        const constraints = {};
        const bulletMatch = query.match(/(\d+)\s+bullets?\s+(?:per|each)\s+(topic|section|meeting)/i);
        if (bulletMatch) {
            constraints.bulletsPerSection = Number.parseInt(bulletMatch[1], 10);
            constraints.sectionType = bulletMatch[2].toLowerCase();
        }
        if (/\btable|matrix|spreadsheet\b/i.test(query)) {
            constraints.preferredFormat = 'table';
        }
        if (/\bcsv\b/i.test(query)) {
            constraints.preferredFormat = 'csv';
        }
        if (/\bexactly\b/i.test(query) || /\bstrict\b/i.test(query)) {
            constraints.strict = true;
        }
        return constraints;
    }

    _inferDataPreference(query) {
        if (/\b(metrics?|kpis?|numbers?|percent|percentage|budget|revenue|cost|forecast|quota|pipeline)\b/i.test(query)) {
            return 'structured';
        }
        if (/\b(transcript|verbatim|exact wording|who said|quote)\b/i.test(query)) {
            return 'transcript';
        }
        if (/\b(summary|overview|highlights)\b/i.test(query)) {
            return 'hybrid';
        }
        return 'hybrid';
    }

    _inferIntentTags(query) {
        const tags = [];
        if (/\bdecision(s)?\b/i.test(query)) tags.push('decision');
        if (/\baction(s| items?)\b/i.test(query)) tags.push('action');
        if (/\brisk(s)?\b|\bblocker(s)?\b/i.test(query)) tags.push('risk');
        if (/\bconstraint(s)?\b|\blimit(s)?\b/i.test(query)) tags.push('constraint');
        if (/\bentity|stakeholder|partner|customer|vendor\b/i.test(query)) tags.push('entity');
        if (/\bopen question(s)?\b|\bunknowns?\b/i.test(query)) tags.push('open_question');
        if (/\bsummary|overview\b/i.test(query)) tags.push('episode');
        return [...new Set(tags)];
    }

    /**
     * Detect group references in the query
     * @param {string} query - User query
     * @returns {Object} Group reference info
     */
    detectGroupReferences(query) {
        if (!this.groups || this.groups.length === 0) {
            return {
                hasGroupReferences: false,
                matchedGroups: [],
                groupFilterIds: [],
                isGroupComparison: false
            };
        }

        const lowerQuery = query.toLowerCase();
        const matchedGroups = [];

        // Check for direct group name matches
        for (const group of this.groups) {
            const groupNameLower = group.name.toLowerCase();
            // Match exact name or close variations
            if (lowerQuery.includes(groupNameLower)) {
                matchedGroups.push(group);
                continue;
            }

            // Match temporal patterns like "Q4 2025" or "Q1 group"
            const temporalMatch = groupNameLower.match(/^q(\d)\s+(\d{4})$/i);
            if (temporalMatch) {
                const quarterPattern = new RegExp(`q${temporalMatch[1]}\\s*(group|meetings?)?`, 'i');
                if (quarterPattern.test(lowerQuery)) {
                    matchedGroups.push(group);
                }
            }

            // Match month names
            const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                               'july', 'august', 'september', 'october', 'november', 'december'];
            for (const month of monthNames) {
                if (groupNameLower.includes(month) && lowerQuery.includes(month)) {
                    matchedGroups.push(group);
                    break;
                }
            }
        }

        // Detect group comparison patterns
        const comparisonPatterns = [
            /compare\s+(.+?)\s+(?:with|to|and|vs\.?)\s+(.+)/i,
            /(.+?)\s+versus\s+(.+)/i,
            /(.+?)\s+vs\.?\s+(.+)/i,
            /difference\s+between\s+(.+?)\s+and\s+(.+)/i
        ];

        let isGroupComparison = false;
        for (const pattern of comparisonPatterns) {
            if (pattern.test(query) && matchedGroups.length >= 2) {
                isGroupComparison = true;
                break;
            }
        }

        // Also detect "group" keyword
        if (/\bgroup(s)?\b/i.test(query) && matchedGroups.length > 0) {
            isGroupComparison = isGroupComparison || /\bcompare|versus|vs\.?|between\b/i.test(query);
        }

        return {
            hasGroupReferences: matchedGroups.length > 0,
            matchedGroups: [...new Set(matchedGroups)],
            groupFilterIds: [...new Set(matchedGroups.map(g => g.id))],
            isGroupComparison
        };
    }

    /**
     * Get agent IDs for a set of groups
     * @param {Array} groupIds - Array of group IDs
     * @returns {Array} Array of agent IDs
     */
    getAgentIdsForGroups(groupIds) {
        if (!groupIds || groupIds.length === 0) return [];

        const agentIds = new Set();
        for (const groupId of groupIds) {
            const group = this.groups.find(g => g.id === groupId);
            if (group && group.agentIds) {
                group.agentIds.forEach(id => agentIds.add(id));
            }
        }
        return [...agentIds];
    }

    /**
     * Determine decomposition strategy
     * @private
     */
    _determineStrategy(classification, relevantAgents, stats) {
        const { complexity, intent } = classification;
        const agentCount = relevantAgents.length;

        // No decomposition needed for simple queries with few agents
        if (complexity === QueryComplexity.SIMPLE && agentCount <= 2) {
            return {
                type: 'direct',
                reason: 'Simple query with limited scope',
                parallelization: false,
                estimatedCalls: 1
            };
        }

        // Parallel decomposition for comparative queries
        if (complexity === QueryComplexity.COMPARATIVE) {
            return {
                type: 'parallel',
                reason: 'Comparative query benefits from parallel agent analysis',
                parallelization: true,
                estimatedCalls: Math.min(agentCount, 3)
            };
        }

        // Map-reduce for aggregate queries
        if (complexity === QueryComplexity.AGGREGATE) {
            return {
                type: 'map-reduce',
                reason: 'Aggregate query requires gathering from all agents then synthesizing',
                parallelization: true,
                estimatedCalls: agentCount + 1 // +1 for aggregation
            };
        }

        // Iterative for exploratory queries
        if (complexity === QueryComplexity.EXPLORATORY) {
            return {
                type: 'iterative',
                reason: 'Exploratory query may need multiple rounds',
                parallelization: false,
                estimatedCalls: 2 // Initial + refinement
            };
        }

        // Default to parallel for efficiency
        return {
            type: 'parallel',
            reason: 'Default parallel strategy for efficiency',
            parallelization: true,
            estimatedCalls: agentCount // Already limited by _resolveMaxResults
        };
    }

    /**
     * Generate sub-queries based on strategy
     * @private
     */
    async _generateSubQueries(query, classification, strategy, relevantAgents, context) {
        const subQueries = [];

        // Check if SoT perspective roles should be applied
        const enableSoT = this.options.enableSocietiesOfThought &&
            context.enableSocietiesOfThought !== false &&
            relevantAgents.length >= this.options.minAgentsForSoT;

        // Select and assign perspective roles if SoT is enabled
        let roleAssignments = null;
        if (enableSoT) {
            const roles = selectRolesForQuery(classification, relevantAgents.length);
            roleAssignments = assignRolesToAgents(
                relevantAgents,
                roles,
                this.options.roleAssignmentStrategy
            );
        }

        switch (strategy.type) {
            case 'direct':
                // Single query to all relevant agents combined
                subQueries.push({
                    id: 'sq-0',
                    type: 'direct',
                    query: query,
                    targetAgents: relevantAgents.map(a => a.id),
                    contextLevel: 'standard',
                    priority: 1
                });
                break;

            case 'parallel':
                // One sub-query per relevant agent with perspective roles
                relevantAgents.forEach((agent, index) => {
                    const assignment = roleAssignments?.[index];
                    subQueries.push({
                        id: `sq-${index}`,
                        type: 'agent-specific',
                        query: this._createRoleAwareQuery(query, agent, assignment?.role),
                        targetAgents: [agent.id],
                        contextLevel: 'standard',
                        priority: 1,
                        agentName: agent.displayName || agent.title,
                        // Include perspective metadata for aggregation
                        perspective: assignment?.role ? {
                            roleId: assignment.role.id,
                            roleLabel: assignment.role.label,
                            traits: assignment.role.traits
                        } : null
                    });
                });
                break;

            case 'map-reduce':
                // Map phase: query each agent with perspective roles
                relevantAgents.forEach((agent, index) => {
                    const assignment = roleAssignments?.[index];
                    subQueries.push({
                        id: `sq-map-${index}`,
                        type: 'map',
                        query: this._createRoleAwareMapQuery(query, classification.intent, assignment?.role),
                        targetAgents: [agent.id],
                        contextLevel: 'summary', // Lighter context for map phase
                        priority: 1,
                        agentName: agent.displayName || agent.title,
                        perspective: assignment?.role ? {
                            roleId: assignment.role.id,
                            roleLabel: assignment.role.label,
                            traits: assignment.role.traits
                        } : null
                    });
                });

                // Reduce phase with synthesis-aware prompt
                subQueries.push({
                    id: 'sq-reduce',
                    type: 'reduce',
                    query: enableSoT
                        ? this._createSynthesisReduceQuery(query, classification.intent)
                        : this._createReduceQuery(query, classification.intent),
                    targetAgents: [], // Uses map results, not agent context
                    contextLevel: 'none',
                    priority: 2,
                    dependsOn: subQueries.filter(sq => sq.type === 'map').map(sq => sq.id),
                    perspective: { roleId: 'synthesizer', roleLabel: 'Synthesizer' }
                });
                break;

            case 'iterative':
                // Initial broad query
                subQueries.push({
                    id: 'sq-initial',
                    type: 'exploratory',
                    query: query,
                    targetAgents: relevantAgents.slice(0, 3).map(a => a.id),
                    contextLevel: 'summary',
                    priority: 1
                });

                // Placeholder for follow-up (determined at runtime)
                subQueries.push({
                    id: 'sq-followup',
                    type: 'followup',
                    query: null, // Generated based on initial response
                    targetAgents: [], // Determined at runtime
                    contextLevel: 'full',
                    priority: 2,
                    dependsOn: ['sq-initial'],
                    dynamic: true
                });
                break;
        }

        return subQueries;
    }

    /**
     * Create agent-specific sub-query
     * @private
     */
    _createAgentSpecificQuery(originalQuery, agent) {
        // Maintain the original query but scope it to the agent
        return `Regarding the "${agent.displayName || agent.title}" meeting: ${originalQuery}`;
    }

    /**
     * Create map-phase query (extracts relevant info from single agent)
     * @private
     */
    _createMapQuery(originalQuery, intent) {
        const extractionPrompts = {
            [QueryIntent.FACTUAL]: `Extract any relevant facts or decisions related to: ${originalQuery}`,
            [QueryIntent.AGGREGATIVE]: `List all items related to: ${originalQuery}`,
            [QueryIntent.ANALYTICAL]: `Identify patterns or themes related to: ${originalQuery}`,
            [QueryIntent.TEMPORAL]: `Note any timeline or progression related to: ${originalQuery}`,
            [QueryIntent.COMPARATIVE]: `Summarize the key points about: ${originalQuery}`
        };

        return extractionPrompts[intent] || `Find information about: ${originalQuery}`;
    }

    /**
     * Create reduce-phase query (synthesizes map results)
     * @private
     */
    _createReduceQuery(originalQuery, intent) {
        const synthesisPrompts = {
            [QueryIntent.FACTUAL]: `Based on the gathered information, answer: ${originalQuery}`,
            [QueryIntent.AGGREGATIVE]: `Combine and organize all the gathered items for: ${originalQuery}`,
            [QueryIntent.ANALYTICAL]: `Synthesize the patterns found across meetings for: ${originalQuery}`,
            [QueryIntent.TEMPORAL]: `Create a timeline or progression summary for: ${originalQuery}`,
            [QueryIntent.COMPARATIVE]: `Compare and contrast the findings for: ${originalQuery}`
        };

        return synthesisPrompts[intent] || `Synthesize the findings to answer: ${originalQuery}`;
    }

    /**
     * Create role-aware query for an agent (SoT)
     * @private
     */
    _createRoleAwareQuery(originalQuery, agent, role) {
        const agentContext = `Regarding the "${agent.displayName || agent.title}" meeting`;

        if (!role) {
            return `${agentContext}: ${originalQuery}`;
        }

        return `${agentContext}:

${role.promptPrefix}
${originalQuery}

Focus on your ${role.label.toLowerCase()} perspective while answering.`;
    }

    /**
     * Create role-aware map query (SoT)
     * @private
     */
    _createRoleAwareMapQuery(originalQuery, intent, role) {
        const baseQuery = this._createMapQuery(originalQuery, intent);

        if (!role) {
            return baseQuery;
        }

        return `${role.promptPrefix}

${baseQuery}

Approach this from a ${role.label.toLowerCase()}'s perspective, focusing on: ${role.traits.join(', ')}.`;
    }

    /**
     * Create synthesis-focused reduce query with perspective awareness (SoT)
     * @private
     */
    _createSynthesisReduceQuery(originalQuery, intent) {
        return `You are synthesizing diverse perspectives on: "${originalQuery}"

The responses below come from different analytical perspectives (analyst, advocate, critic, etc.).

Instructions:
1. Identify points of AGREEMENT across perspectives
2. Highlight any CONFLICTS or TENSIONS between perspectives
3. Synthesize a balanced answer that acknowledges multiple viewpoints
4. Note which perspective(s) each key insight came from

${this._createReduceQuery(originalQuery, intent)}`;
    }

    /**
     * Generate group-level sub-queries (SoT Phase 1.5)
     * @param {string} query - User query
     * @param {Array} groups - Active groups with agents
     * @param {Object} classification - Query classification
     * @param {Object} context - Additional context
     * @returns {Array|null} Sub-queries at group level, or null to fall back to agent-level
     */
    generateGroupLevelSubQueries(query, groups, classification, context) {
        // Get groups with agents
        const activeGroups = (groups || []).filter(g =>
            g.enabled && g.agentIds && g.agentIds.length > 0
        );

        if (activeGroups.length < 2) {
            return null; // Fall back to agent-level decomposition
        }

        const subQueries = [];

        // Assign perspectives to groups
        const groupAssignments = assignPerspectivesToGroups(activeGroups, classification);

        // Create one sub-query per group
        groupAssignments.forEach((assignment, index) => {
            const { group, perspective, source } = assignment;

            subQueries.push({
                id: `sq-group-${index}`,
                type: 'group-query',
                query: this._createGroupPerspectiveQuery(query, group, perspective),
                targetAgents: group.agentIds,  // All agents in the group
                targetGroup: {
                    id: group.id,
                    name: group.name,
                    type: group.criteria?.type,
                    agentCount: group.agentIds.length
                },
                contextLevel: 'standard',
                priority: 1,
                perspective: {
                    roleId: perspective.id,
                    roleLabel: perspective.label,
                    traits: perspective.traits,
                    assignmentSource: source
                }
            });
        });

        // Add reduce query for synthesis
        subQueries.push({
            id: 'sq-reduce',
            type: 'reduce',
            query: this._createGroupSynthesisQuery(query, classification, activeGroups.length),
            targetAgents: [],
            contextLevel: 'none',
            priority: 2,
            dependsOn: subQueries.filter(sq => sq.type === 'group-query').map(sq => sq.id),
            perspective: { roleId: 'synthesizer', roleLabel: 'Synthesizer' }
        });

        return subQueries;
    }

    /**
     * Create perspective-aware query for a group (SoT Phase 1.5)
     * @private
     */
    _createGroupPerspectiveQuery(originalQuery, group, perspective) {
        const groupContext = `Analyzing the "${group.name}" group (${group.agentIds.length} meetings)`;

        return `${groupContext}:

${perspective.promptPrefix}
${originalQuery}

Consider all meetings in this group collectively. Focus on your ${perspective.label.toLowerCase()} perspective (${perspective.traits.join(', ')}).`;
    }

    /**
     * Create synthesis query for group-level results (SoT Phase 1.5)
     * @private
     */
    _createGroupSynthesisQuery(originalQuery, classification, groupCount) {
        return `You are synthesizing perspectives from ${groupCount} distinct meeting groups.

Each group analyzed the question from a different cognitive perspective.

Original question: "${originalQuery}"

Instructions:
1. Identify where groups AGREE (consensus across perspectives)
2. Highlight where groups DISAGREE (conflicting perspectives)
3. Note which perspective's insights are most relevant to the question
4. Synthesize a balanced answer that acknowledges the diversity of viewpoints
5. Cite which group each key insight came from`;
    }

    /**
     * Determine whether to use group-level or agent-level decomposition
     * @param {Array} groups - Available groups
     * @param {number} agentCount - Total agent count
     * @param {Object} classification - Query classification
     * @returns {boolean} True if group decomposition should be used
     */
    shouldUseGroupDecomposition(groups, agentCount, classification) {
        // Use group decomposition if:
        // 1. Groups exist and have agents
        // 2. Agent count is high enough to benefit
        // 3. Query is complex enough to warrant perspectives

        const activeGroups = (groups || []).filter(g =>
            g.enabled && g.agentIds && g.agentIds.length > 0
        );

        if (activeGroups.length < 2) return false;  // Need multiple groups
        if (agentCount < this.options.minAgentsForGroupDecomposition) return false;
        if (classification.complexity === QueryComplexity.SIMPLE) return false;

        return true;
    }

    /**
     * Future RLM hook: Generate executable code for REPL
     * @param {string} query - User query
     * @returns {string} Generated code
     */
    generateREPLCode(query) {
        // Placeholder for full RLM implementation
        // In full RLM, this would generate Python code like:
        // ```
        // results = []
        // for agent in context.agents:
        //     if relevant(agent, query):
        //         results.append(sub_llm(agent, query))
        // return aggregate(results)
        // ```
        console.warn('generateREPLCode: Code generation not yet implemented');
        return `# RLM-Lite: Code generation placeholder
# Query: ${query}
# This would generate executable analysis code in full RLM`;
    }
}

// Factory function
export function createDecomposer(options = {}) {
    return new QueryDecomposer(options);
}
