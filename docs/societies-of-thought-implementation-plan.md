# Societies of Thought Implementation Plan

## Overview

This document outlines a detailed implementation plan for incorporating insights from the research paper ["Reasoning Models Generate Societies of Thought"](https://arxiv.org/abs/2601.10825) (Kim et al., 2026) into northstar.LM's RLM (Recursive Language Model) architecture.

**Key Insight from Paper:** Enhanced reasoning emerges from simulating multi-agent-like interactions—a "society of thought"—which enables diversification and debate among internal cognitive perspectives characterized by distinct personality traits and domain expertise.

**Current State:** The RLM already implements external multi-agent decomposition via parallel sub-queries. This plan enhances that architecture to leverage perspective diversity and conflict resolution.

**Key Integration Point:** The existing **Agent Grouping** system (temporal, thematic, source-based, custom) provides a natural foundation for perspective assignment. Groups already represent semantic/temporal clusters that can map to distinct cognitive perspectives.

---

## Agent Grouping Integration

The orchestrator's grouping system offers three integration strategies with Societies of Thought:

### Strategy A: Groups as Perspective Containers (Recommended)

Each group becomes a unified "perspective" in the SoT framework:

| Group Type | Default Perspective | Rationale |
|------------|---------------------|-----------|
| `temporal` | Historian | Focus on evolution over time |
| `thematic` | Synthesizer | Already semantically clustered |
| `source` | Analyst | Objective data source analysis |
| `custom` | Varies by criteria | User-defined focus |

**Benefits:**
- Reduces sub-query count (1 per group vs 1 per agent)
- Leverages existing semantic clustering
- Natural inter-group conflict detection

### Strategy B: Group-Level Then Agent-Level Decomposition

Two-tier query decomposition:
1. **Group Level**: Each group provides a unified perspective
2. **Agent Level**: For complex queries, drill into specific agents within a group

**Best for:** Large agent counts (15+) where per-agent queries are expensive

### Strategy C: Adaptive Perspective from Group Metadata

Use group metadata to inform perspective assignment:

```javascript
function perspectiveFromGroup(group) {
    // Use group criteria type
    switch (group.criteria?.type) {
        case 'temporal':
            return PerspectiveRoles.HISTORIAN;
        case 'thematic':
            return PerspectiveRoles.SYNTHESIZER;
        case 'source':
            return PerspectiveRoles.ANALYST;
        case 'custom':
            // Infer from criteria parameters or name
            if (/risk|issue|problem/i.test(group.name)) {
                return PerspectiveRoles.CRITIC;
            }
            if (/action|task|todo/i.test(group.name)) {
                return PerspectiveRoles.PRAGMATIST;
            }
            return PerspectiveRoles.ANALYST;
        default:
            return null; // Use rotating assignment
    }
}
```

### Recommended Approach: Hybrid

1. **If groups exist**: Use Strategy A (group-as-perspective)
2. **For ungrouped agents**: Use rotating perspective assignment
3. **For single-group scenarios**: Fall back to per-agent perspectives within the group

---

## Implementation Phases

### Phase 1: Cognitive Perspective Roles
**Priority: High | Complexity: Medium | Files: 2**

#### Objective
Introduce distinct "cognitive perspective" roles for sub-queries, mimicking how reasoning models internally generate diverse viewpoints.

#### 1.1 Define Perspective Role Types

**File: `js/rlm/perspective-roles.js` (NEW)**

```javascript
/**
 * Cognitive Perspective Roles for Societies of Thought
 *
 * Based on: "Reasoning Models Generate Societies of Thought" (arXiv:2601.10825)
 * These roles mirror the diverse cognitive perspectives that reasoning models
 * spontaneously generate during chain-of-thought reasoning.
 */

export const PerspectiveRoles = {
    // Primary analytical perspectives
    ANALYST: {
        id: 'analyst',
        label: 'Analyst',
        description: 'Examines data critically and objectively',
        promptPrefix: 'As an objective analyst, examine the facts and data:',
        traits: ['factual', 'data-driven', 'precise'],
        weight: 1.0
    },

    ADVOCATE: {
        id: 'advocate',
        label: 'Advocate',
        description: 'Identifies supporting evidence and positive aspects',
        promptPrefix: 'As an advocate, identify what supports and strengthens this:',
        traits: ['supportive', 'constructive', 'opportunity-focused'],
        weight: 0.8
    },

    CRITIC: {
        id: 'critic',
        label: 'Critic',
        description: 'Identifies weaknesses, risks, and counterarguments',
        promptPrefix: 'As a critical reviewer, identify potential issues, risks, or contradictions:',
        traits: ['skeptical', 'risk-aware', 'thorough'],
        weight: 0.9
    },

    SYNTHESIZER: {
        id: 'synthesizer',
        label: 'Synthesizer',
        description: 'Connects ideas and finds patterns across sources',
        promptPrefix: 'As a synthesizer, identify connections, patterns, and broader implications:',
        traits: ['holistic', 'integrative', 'pattern-finding'],
        weight: 0.85
    },

    // Specialized perspectives (used selectively)
    HISTORIAN: {
        id: 'historian',
        label: 'Historian',
        description: 'Focuses on temporal context and evolution',
        promptPrefix: 'From a historical perspective, trace how this evolved over time:',
        traits: ['temporal', 'contextual', 'evolutionary'],
        weight: 0.7,
        triggers: ['over time', 'evolution', 'history', 'progress', 'changed']
    },

    STAKEHOLDER: {
        id: 'stakeholder',
        label: 'Stakeholder',
        description: 'Considers impact on different parties',
        promptPrefix: 'From a stakeholder perspective, consider impacts on different parties:',
        traits: ['empathetic', 'multi-viewpoint', 'impact-focused'],
        weight: 0.75,
        triggers: ['impact', 'stakeholder', 'team', 'customer', 'user']
    },

    PRAGMATIST: {
        id: 'pragmatist',
        label: 'Pragmatist',
        description: 'Focuses on actionable outcomes and feasibility',
        promptPrefix: 'As a pragmatist, focus on what is actionable and feasible:',
        traits: ['practical', 'action-oriented', 'realistic'],
        weight: 0.8,
        triggers: ['action', 'do', 'implement', 'next steps', 'practical']
    }
};

/**
 * Role assignment strategies
 */
export const RoleAssignmentStrategy = {
    // Assign same role to all agents (uniform perspective)
    UNIFORM: 'uniform',

    // Cycle through roles (diverse perspectives)
    ROTATING: 'rotating',

    // Assign based on query intent and agent content
    ADAPTIVE: 'adaptive',

    // Use primary roles (analyst, advocate, critic, synthesizer) only
    PRIMARY_ONLY: 'primary-only'
};

/**
 * Select appropriate roles based on query classification
 */
export function selectRolesForQuery(classification, agentCount) {
    const { intent, complexity } = classification;
    const roles = [];

    // Always include analyst for factual grounding
    roles.push(PerspectiveRoles.ANALYST);

    // Add roles based on intent
    switch (intent) {
        case 'comparative':
            roles.push(PerspectiveRoles.CRITIC);
            roles.push(PerspectiveRoles.SYNTHESIZER);
            break;

        case 'aggregative':
            roles.push(PerspectiveRoles.ADVOCATE);
            roles.push(PerspectiveRoles.SYNTHESIZER);
            break;

        case 'analytical':
            roles.push(PerspectiveRoles.CRITIC);
            roles.push(PerspectiveRoles.ADVOCATE);
            roles.push(PerspectiveRoles.SYNTHESIZER);
            break;

        case 'temporal':
            roles.push(PerspectiveRoles.HISTORIAN);
            roles.push(PerspectiveRoles.SYNTHESIZER);
            break;

        default: // factual
            roles.push(PerspectiveRoles.ADVOCATE);
            roles.push(PerspectiveRoles.CRITIC);
    }

    // Ensure we have enough roles for agents (cycle if needed)
    while (roles.length < agentCount) {
        roles.push(roles[roles.length % 4]); // Cycle through first 4
    }

    return roles.slice(0, agentCount);
}

/**
 * Assign roles to agents based on strategy
 */
export function assignRolesToAgents(agents, roles, strategy = RoleAssignmentStrategy.ROTATING) {
    const assignments = [];

    switch (strategy) {
        case RoleAssignmentStrategy.UNIFORM:
            // All agents get the same role (first one)
            agents.forEach(agent => {
                assignments.push({ agent, role: roles[0] });
            });
            break;

        case RoleAssignmentStrategy.ROTATING:
            // Cycle through roles
            agents.forEach((agent, index) => {
                assignments.push({ agent, role: roles[index % roles.length] });
            });
            break;

        case RoleAssignmentStrategy.ADAPTIVE:
            // Match roles to agent content (future enhancement)
            // For now, fall back to rotating
            agents.forEach((agent, index) => {
                assignments.push({ agent, role: roles[index % roles.length] });
            });
            break;

        case RoleAssignmentStrategy.PRIMARY_ONLY:
            // Only use analyst, advocate, critic, synthesizer
            const primaryRoles = [
                PerspectiveRoles.ANALYST,
                PerspectiveRoles.ADVOCATE,
                PerspectiveRoles.CRITIC,
                PerspectiveRoles.SYNTHESIZER
            ];
            agents.forEach((agent, index) => {
                assignments.push({ agent, role: primaryRoles[index % 4] });
            });
            break;
    }

    return assignments;
}
```

#### 1.2 Integrate Roles into Query Decomposer

**File: `js/rlm/query-decomposer.js` (MODIFY)**

Add role-aware sub-query generation:

```javascript
// Add import at top
import { selectRolesForQuery, assignRolesToAgents, RoleAssignmentStrategy } from './perspective-roles.js';

// Modify _generateSubQueries method to include role assignment
async _generateSubQueries(query, classification, strategy, relevantAgents, context) {
    const subQueries = [];

    // NEW: Select and assign perspective roles
    const enableSoT = context.enableSocietiesOfThought !== false;
    const roles = enableSoT ? selectRolesForQuery(classification, relevantAgents.length) : null;
    const roleAssignments = enableSoT
        ? assignRolesToAgents(relevantAgents, roles, RoleAssignmentStrategy.ROTATING)
        : null;

    switch (strategy.type) {
        case 'parallel':
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
                    // NEW: Include role metadata
                    perspective: assignment?.role ? {
                        roleId: assignment.role.id,
                        roleLabel: assignment.role.label,
                        traits: assignment.role.traits
                    } : null
                });
            });
            break;

        case 'map-reduce':
            relevantAgents.forEach((agent, index) => {
                const assignment = roleAssignments?.[index];
                subQueries.push({
                    id: `sq-map-${index}`,
                    type: 'map',
                    query: this._createRoleAwareMapQuery(query, classification.intent, assignment?.role),
                    targetAgents: [agent.id],
                    contextLevel: 'summary',
                    priority: 1,
                    agentName: agent.displayName || agent.title,
                    perspective: assignment?.role ? {
                        roleId: assignment.role.id,
                        roleLabel: assignment.role.label,
                        traits: assignment.role.traits
                    } : null
                });
            });

            // Reduce query includes synthesis instruction
            subQueries.push({
                id: 'sq-reduce',
                type: 'reduce',
                query: this._createSynthesisReduceQuery(query, classification.intent),
                targetAgents: [],
                contextLevel: 'none',
                priority: 2,
                dependsOn: subQueries.filter(sq => sq.type === 'map').map(sq => sq.id),
                perspective: { roleId: 'synthesizer', roleLabel: 'Synthesizer' }
            });
            break;

        // ... other cases remain similar but with role integration
    }

    return subQueries;
}

/**
 * Create role-aware query for an agent
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
 * Create role-aware map query
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
 * Create synthesis-focused reduce query
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
```

#### 1.3 Update RLM Configuration

**File: `js/rlm/index.js` (MODIFY)**

Add configuration options:

```javascript
// Add to RLM_CONFIG
export const RLM_CONFIG = {
    // ... existing config ...

    // Societies of Thought settings
    enableSocietiesOfThought: true,           // Master toggle
    roleAssignmentStrategy: 'rotating',        // 'uniform', 'rotating', 'adaptive', 'primary-only'
    minAgentsForSoT: 2,                        // Minimum agents to enable SoT
    includePerspectiveInResponse: true,        // Show perspective labels in aggregated response
};
```

---

### Phase 1.5: Group-Aware Perspective Assignment
**Priority: High | Complexity: Medium | Files: 3**

#### Objective
Leverage existing agent groups as natural perspective boundaries, enabling group-level sub-queries and automatic perspective assignment based on group metadata.

#### 1.5.1 Extend Perspective Roles with Group Mapping

**File: `js/rlm/perspective-roles.js` (MODIFY)**

Add group-to-perspective mapping:

```javascript
/**
 * Map group criteria type to default perspective
 * @param {Object} group - Group object with criteria
 * @returns {Object|null} Perspective role or null for default assignment
 */
export function perspectiveFromGroupType(group) {
    if (!group?.criteria?.type) return null;

    const typeMapping = {
        'temporal': PerspectiveRoles.HISTORIAN,
        'thematic': PerspectiveRoles.SYNTHESIZER,
        'source': PerspectiveRoles.ANALYST,
        'custom': null // Infer from name/description
    };

    const mapped = typeMapping[group.criteria.type];
    if (mapped) return mapped;

    // For custom groups, infer from name
    const name = (group.name || '').toLowerCase();
    const description = (group.description || '').toLowerCase();
    const text = `${name} ${description}`;

    if (/risk|issue|problem|blocker|concern/i.test(text)) {
        return PerspectiveRoles.CRITIC;
    }
    if (/action|task|todo|next step|implement/i.test(text)) {
        return PerspectiveRoles.PRAGMATIST;
    }
    if (/stakeholder|team|customer|impact/i.test(text)) {
        return PerspectiveRoles.STAKEHOLDER;
    }
    if (/timeline|history|evolution|progress/i.test(text)) {
        return PerspectiveRoles.HISTORIAN;
    }

    return null; // Use rotating assignment
}

/**
 * Assign perspectives to groups
 * @param {Array} groups - Array of group objects
 * @param {Object} classification - Query classification
 * @returns {Array} Groups with assigned perspectives
 */
export function assignPerspectivesToGroups(groups, classification) {
    const assignments = [];
    const usedPerspectives = new Set();

    // First pass: assign based on group type
    groups.forEach(group => {
        const perspective = perspectiveFromGroupType(group);
        if (perspective && !usedPerspectives.has(perspective.id)) {
            assignments.push({ group, perspective, source: 'group-type' });
            usedPerspectives.add(perspective.id);
        } else {
            assignments.push({ group, perspective: null, source: 'pending' });
        }
    });

    // Second pass: fill in missing perspectives with rotating assignment
    const availablePerspectives = [
        PerspectiveRoles.ANALYST,
        PerspectiveRoles.ADVOCATE,
        PerspectiveRoles.CRITIC,
        PerspectiveRoles.SYNTHESIZER
    ].filter(p => !usedPerspectives.has(p.id));

    let perspectiveIndex = 0;
    assignments.forEach(assignment => {
        if (!assignment.perspective) {
            assignment.perspective = availablePerspectives[perspectiveIndex % availablePerspectives.length];
            assignment.source = 'rotating';
            perspectiveIndex++;
        }
    });

    return assignments;
}
```

#### 1.5.2 Add Group-Level Query Decomposition

**File: `js/rlm/query-decomposer.js` (MODIFY)**

Add group-aware decomposition strategy:

```javascript
// Import group perspective functions
import { assignPerspectivesToGroups, perspectiveFromGroupType } from './perspective-roles.js';

/**
 * Decompose query using group-level perspectives
 * @param {string} query - User query
 * @param {Array} groups - Active groups with agents
 * @param {Object} classification - Query classification
 * @param {Object} context - Additional context
 * @returns {Array} Sub-queries at group level
 */
_generateGroupLevelSubQueries(query, groups, classification, context) {
    const subQueries = [];

    // Get groups with agents
    const activeGroups = groups.filter(g =>
        g.enabled && g.agentIds && g.agentIds.length > 0
    );

    if (activeGroups.length === 0) {
        return null; // Fall back to agent-level decomposition
    }

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

    // Add reduce query
    subQueries.push({
        id: 'sq-reduce',
        type: 'reduce',
        query: this._createGroupSynthesisQuery(query, classification, activeGroups.length),
        targetAgents: [],
        contextLevel: 'none',
        priority: 2,
        dependsOn: subQueries.filter(sq => sq.type === 'group-query').map(sq => sq.id)
    });

    return subQueries;
}

/**
 * Create perspective-aware query for a group
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
 * Create synthesis query for group-level results
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
 * @private
 */
_shouldUseGroupDecomposition(groups, agentCount, classification) {
    // Use group decomposition if:
    // 1. Groups exist and have agents
    // 2. Agent count is high enough to benefit
    // 3. Query is complex enough to warrant perspectives

    const activeGroups = (groups || []).filter(g =>
        g.enabled && g.agentIds && g.agentIds.length > 0
    );

    if (activeGroups.length < 2) return false;  // Need multiple groups
    if (agentCount < 6) return false;           // Not enough agents to justify
    if (classification.complexity === 'simple') return false;

    return true;
}
```

#### 1.5.3 Update RLM Pipeline to Use Groups

**File: `js/rlm/index.js` (MODIFY)**

Add group handling:

```javascript
// Add groups storage
this.groups = [];

/**
 * Set groups for group-aware queries
 * @param {Array} groups - Array of group objects
 */
setGroups(groups) {
    this.groups = groups || [];
    console.log(`[RLM] Loaded ${this.groups.length} groups`);
}

/**
 * Get active groups with their agents
 * @returns {Array} Groups with agent details
 */
getActiveGroups() {
    return this.groups.filter(g => g.enabled);
}

// In process() method, check for group decomposition
async process(query, context = {}) {
    // ... existing code ...

    // Check if group-level decomposition should be used
    const activeGroups = this.getActiveGroups();
    const activeAgentCount = this.contextStore.getActiveAgents().length;

    const useGroupDecomposition = this.decomposer._shouldUseGroupDecomposition(
        activeGroups,
        activeAgentCount,
        classification
    );

    if (useGroupDecomposition) {
        // Use group-level sub-queries
        const groupSubQueries = this.decomposer._generateGroupLevelSubQueries(
            query,
            activeGroups,
            classification,
            context
        );

        if (groupSubQueries) {
            decomposition.subQueries = groupSubQueries;
            decomposition.strategy = {
                type: 'group-parallel',
                reason: 'Using group-level perspectives for multi-group query',
                parallelization: true,
                estimatedCalls: activeGroups.length + 1
            };
        }
    }

    // ... rest of existing code ...
}
```

#### 1.5.4 Handle Group Context in Sub-Executor

**File: `js/rlm/sub-executor.js` (MODIFY)**

Add group-query handling:

```javascript
/**
 * Execute group-level query (combines context from all agents in group)
 * @private
 */
async _executeGroupQuery(query, llmCall, context) {
    const store = getContextStore();

    // Get combined context for all agents in the group
    const agentIds = query.targetAgents;
    const groupContext = store.getCombinedContext(agentIds, 'standard');

    this._log('group-query', query.id, `executing for group "${query.targetGroup?.name}" (${agentIds.length} agents)`);

    const result = await this._executeWithRetry(
        () => llmCall(query.query, groupContext, context),
        query.id
    );

    return {
        queryId: query.id,
        type: query.type,
        response: result,
        targetAgents: query.targetAgents,
        targetGroup: query.targetGroup,
        perspective: query.perspective,
        success: true
    };
}

// In _executeParallel, handle group-query type
async _executeParallel(subQueries, llmCall, context) {
    // ... existing code ...

    // Handle group queries
    const groupQueries = subQueries.filter(sq => sq.type === 'group-query');
    if (groupQueries.length > 0) {
        const groupResults = await Promise.all(
            groupQueries.map(q => this._executeGroupQuery(q, llmCall, context))
        );
        results.push(...groupResults);
    }

    // ... rest of existing code ...
}
```

---

### Phase 2: Conflict Detection & Surfacing
**Priority: High | Complexity: Medium | Files: 2**

#### Objective
Implement explicit conflict detection between perspectives to leverage the "debate" aspect of Societies of Thought.

#### 2.1 Create Conflict Detector Module

**File: `js/rlm/conflict-detector.js` (NEW)**

```javascript
/**
 * Conflict Detector for Societies of Thought
 *
 * Identifies disagreements, tensions, and contradictions between
 * sub-query responses from different perspectives.
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
                'challenge', 'issue', 'problem', 'limitation'
            ],

            // Keywords that indicate agreement
            agreementMarkers: [
                'also', 'similarly', 'agrees', 'confirms', 'supports',
                'consistent', 'aligns', 'reinforces', 'validates'
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
        if (responses.length < this.options.minResponsesForConflict) {
            return {
                hasConflicts: false,
                conflicts: [],
                agreements: [],
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
                agentName: resp1.agentName,
                perspective: resp1.perspective?.roleLabel || 'Default',
                excerpt: this._extractKeyExcerpt(resp1.response)
            },
            source2: {
                agentName: resp2.agentName,
                perspective: resp2.perspective?.roleLabel || 'Default',
                excerpt: this._extractKeyExcerpt(resp2.response)
            },
            similarity
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
            wordFreq[w] = (wordFreq[w] || 0) + 1;
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
            'which', 'there', 'these', 'those', 'being', 'other'
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
        if (!analysis.hasConflicts) {
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
}

export function createConflictDetector(options = {}) {
    return new ConflictDetector(options);
}
```

#### 2.2 Integrate Conflict Detection into Aggregator

**File: `js/rlm/aggregator.js` (MODIFY)**

```javascript
// Add import at top
import { createConflictDetector } from './conflict-detector.js';

// Modify constructor
constructor(options = {}) {
    this.options = {
        // ... existing options ...

        // Conflict detection settings
        enableConflictDetection: true,
        surfaceConflictsInResponse: true,
        conflictDetectionThreshold: 0.6,

        ...options
    };

    this.conflictDetector = createConflictDetector({
        agreementThreshold: options.conflictDetectionThreshold || 0.6
    });
}

// Modify _llmAggregate to include conflict analysis
async _llmAggregate(results, originalQuery, classification, llmCall, context, executionResult, decomposition) {
    // NEW: Analyze for conflicts before synthesis
    let conflictContext = '';
    let conflictAnalysis = null;

    if (this.options.enableConflictDetection) {
        conflictAnalysis = this.conflictDetector.analyze(
            results.map(r => ({
                response: r.response,
                agentName: r.agentName,
                perspective: r.perspective
            }))
        );

        if (conflictAnalysis.hasConflicts && this.options.surfaceConflictsInResponse) {
            conflictContext = this.conflictDetector.formatForSynthesis(conflictAnalysis);
        }
    }

    // Build context from all results (with perspective labels)
    const resultsContext = results.map((r, i) => {
        const source = r.agentName || `Source ${i + 1}`;
        const perspective = r.perspective?.roleLabel ? ` [${r.perspective.roleLabel}]` : '';
        return `[${source}${perspective}]:\n${r.response}`;
    }).join('\n\n---\n\n');

    // Build enhanced synthesis prompt
    const synthesisPrompt = this._buildEnhancedSynthesisPrompt(
        originalQuery,
        classification,
        conflictContext,
        conflictAnalysis
    );

    try {
        const synthesizedResponse = await llmCall(
            synthesisPrompt,
            resultsContext,
            context
        );

        return {
            success: true,
            response: synthesizedResponse,
            aggregationType: 'llm-synthesis',
            sources: results.map(r => ({
                agentName: r.agentName,
                queryId: r.queryId,
                perspective: r.perspective?.roleLabel
            })),
            conflictAnalysis,  // NEW: Include conflict analysis in result
            metadata: this._buildMetadata(executionResult, decomposition)
        };
    } catch (error) {
        console.warn('LLM synthesis failed, falling back to simple aggregation:', error.message);
        return this._simpleAggregate(results, originalQuery, executionResult, decomposition);
    }
}

/**
 * Build enhanced synthesis prompt with conflict awareness
 * @private
 */
_buildEnhancedSynthesisPrompt(originalQuery, classification, conflictContext, conflictAnalysis) {
    let prompt = `You are synthesizing diverse perspectives to answer: "${originalQuery}"

The responses below come from different analytical perspectives analyzing meeting data.

Instructions:
- Combine information coherently from all perspectives
- IMPORTANT: If perspectives disagree, acknowledge the disagreement explicitly
- Present the strongest argument from each side before synthesizing
- Be concise but comprehensive
- Cite which meeting/perspective insights came from
- Use bullet points for lists`;

    // Add intent-specific guidance
    const intentSpecific = {
        'factual': '\n- Focus on factual consensus; note any factual disagreements',
        'comparative': '\n- Highlight how different perspectives view the comparison',
        'aggregative': '\n- Compile items, noting if any perspective flagged concerns',
        'analytical': '\n- Present the analytical tension before your synthesis',
        'temporal': '\n- Note if perspectives disagree on timeline or causation'
    };

    prompt += intentSpecific[classification?.intent] || '';

    // Add conflict context if present
    if (conflictContext) {
        prompt += `\n\n---\n${conflictContext}`;
        prompt += '\n\nAddress these tensions explicitly in your response.';
    }

    return prompt;
}
```

---

### Phase 3: Diversity-Aware Agent Selection
**Priority: Medium | Complexity: Low | Files: 1**

#### Objective
Ensure diverse agent types are selected for sub-queries, avoiding over-representation of similar sources.

#### 3.1 Add Diversity Scoring to Context Store

**File: `js/rlm/context-store.js` (MODIFY)**

```javascript
/**
 * Query agents with diversity consideration
 * @param {string} query - Search query
 * @param {Object} options - Query options
 * @returns {Array} Ranked agents with diversity bonus
 */
queryAgentsWithDiversity(query, options = {}) {
    const {
        maxResults = 5,
        minScore = 0,
        diversityWeight = 0.3,  // How much to weight diversity vs relevance
        diversityFields = ['sourceType', 'createdDate']  // Fields to diversify on
    } = options;

    // Get initial relevance-ranked results (more than needed)
    const candidates = this.queryAgents(query, {
        maxResults: maxResults * 2,
        minScore
    });

    if (candidates.length <= maxResults) {
        return candidates;
    }

    // Apply diversity re-ranking
    const selected = [];
    const seenValues = {};
    diversityFields.forEach(field => seenValues[field] = new Set());

    // Greedy selection with diversity penalty
    const remaining = [...candidates];

    while (selected.length < maxResults && remaining.length > 0) {
        let bestIdx = 0;
        let bestScore = -Infinity;

        remaining.forEach((agent, idx) => {
            // Calculate diversity bonus
            let diversityBonus = 0;
            diversityFields.forEach(field => {
                const value = agent[field];
                if (value && !seenValues[field].has(value)) {
                    diversityBonus += diversityWeight / diversityFields.length;
                }
            });

            // Combined score = relevance + diversity
            const combinedScore = (agent.score || 1) * (1 - diversityWeight) + diversityBonus;

            if (combinedScore > bestScore) {
                bestScore = combinedScore;
                bestIdx = idx;
            }
        });

        // Add best candidate
        const chosen = remaining.splice(bestIdx, 1)[0];
        selected.push(chosen);

        // Update seen values
        diversityFields.forEach(field => {
            const value = chosen[field];
            if (value) seenValues[field].add(value);
        });
    }

    return selected;
}
```

---

### Phase 4: Debate Phase for Complex Queries
**Priority: Medium | Complexity: High | Files: 2**

#### Objective
Add an explicit "debate" phase between MAP and REDUCE for complex analytical queries.

#### 4.1 Extend Execution Strategy

**File: `js/rlm/sub-executor.js` (MODIFY)**

```javascript
/**
 * Execute map-debate-reduce strategy
 * @private
 */
async _executeMapDebateReduce(subQueries, llmCall, context) {
    const mapQueries = subQueries.filter(sq => sq.type === 'map');
    const debateQuery = subQueries.find(sq => sq.type === 'debate');
    const reduceQuery = subQueries.find(sq => sq.type === 'reduce');

    // Phase 1: Map - gather perspectives
    this._log('map-debate-reduce', 'map-phase', 'started');
    const mapResults = await this._executeParallel(mapQueries, llmCall, context);
    this._log('map-debate-reduce', 'map-phase', 'completed');

    // Phase 2: Debate - surface conflicts
    let debateResult = null;
    if (debateQuery && mapResults.filter(r => r.success).length >= 2) {
        this._log('map-debate-reduce', 'debate-phase', 'started');

        const debateContext = this._buildDebateContext(mapResults);

        debateResult = await this._executeWithRetry(
            () => llmCall(debateQuery.query, debateContext, context),
            debateQuery.id
        );

        this._log('map-debate-reduce', 'debate-phase', 'completed');
    }

    // Phase 3: Reduce - synthesize with debate insights
    if (reduceQuery) {
        this._log('map-debate-reduce', 'reduce-phase', 'started');

        let reduceContext = mapResults
            .filter(r => r.success && r.response)
            .map(r => `[${r.agentName}]:\n${r.response}`)
            .join('\n\n---\n\n');

        // Include debate insights if available
        if (debateResult) {
            reduceContext += `\n\n---\n\n[Debate Analysis]:\n${debateResult}`;
        }

        const reduceResult = await this._executeWithRetry(
            () => llmCall(reduceQuery.query, reduceContext, context),
            reduceQuery.id,
            { timeout: this.options.reduceTimeout }
        );

        this._log('map-debate-reduce', 'reduce-phase', 'completed');

        return [
            ...mapResults,
            ...(debateResult ? [{
                queryId: debateQuery.id,
                type: 'debate',
                response: debateResult,
                success: true
            }] : []),
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
 * Build context for debate phase
 * @private
 */
_buildDebateContext(mapResults) {
    const successfulResults = mapResults.filter(r => r.success && r.response);

    return successfulResults.map((r, i) => {
        const perspective = r.perspective?.roleLabel || `Perspective ${i + 1}`;
        const source = r.agentName || 'Meeting';
        return `[${perspective} - ${source}]:\n${r.response}`;
    }).join('\n\n---\n\n');
}
```

#### 4.2 Add Debate Query Generation

**File: `js/rlm/query-decomposer.js` (MODIFY)**

```javascript
// Add debate query generation for analytical/comparative queries
case 'map-reduce':
    // Map phase queries...
    relevantAgents.forEach((agent, index) => {
        // ... existing map query generation
    });

    // NEW: Debate phase for complex queries
    if (classification.complexity === QueryComplexity.AGGREGATE &&
        (classification.intent === QueryIntent.ANALYTICAL ||
         classification.intent === QueryIntent.COMPARATIVE)) {

        subQueries.push({
            id: 'sq-debate',
            type: 'debate',
            query: this._createDebateQuery(query, classification.intent),
            targetAgents: [],
            contextLevel: 'none',
            priority: 1.5,  // Between map (1) and reduce (2)
            dependsOn: subQueries.filter(sq => sq.type === 'map').map(sq => sq.id)
        });
    }

    // Reduce phase...
    subQueries.push({
        id: 'sq-reduce',
        type: 'reduce',
        query: this._createSynthesisReduceQuery(query, classification.intent),
        targetAgents: [],
        contextLevel: 'none',
        priority: 2,
        dependsOn: ['sq-debate'] // Now depends on debate if present
    });
    break;

/**
 * Create debate phase query
 * @private
 */
_createDebateQuery(originalQuery, intent) {
    return `Analyze the following perspectives for CONFLICTS and TENSIONS.

For the question: "${originalQuery}"

Your task:
1. Identify where perspectives DISAGREE or present conflicting information
2. Note any RISKS or CONCERNS raised by one perspective but not others
3. Highlight any ASSUMPTIONS that differ between perspectives
4. List 2-3 key tensions that the final synthesis should address

Format your response as:
**Key Tensions:**
1. [Tension description with sources]
2. [Tension description with sources]

**Recommendations for Synthesis:**
- [How to reconcile or present these tensions]`;
}
```

---

### Phase 5: UI Enhancements
**Priority: Low | Complexity: Low | Files: 2**

#### Objective
Surface perspective diversity and conflicts in the UI for transparency.

#### 5.1 Display Perspective Badges

**File: `js/orchestrator.js` (MODIFY)**

Add visual indicators for perspectives used:

```javascript
// In response display, after aggregation
function displayPerspectiveBadges(sources) {
    if (!sources || sources.length === 0) return '';

    const perspectives = sources
        .filter(s => s.perspective)
        .map(s => s.perspective);

    if (perspectives.length === 0) return '';

    const uniquePerspectives = [...new Set(perspectives)];

    return `<div class="perspective-badges">
        <span class="badge-label">Perspectives:</span>
        ${uniquePerspectives.map(p =>
            `<span class="perspective-badge perspective-${p.toLowerCase()}">${p}</span>`
        ).join('')}
    </div>`;
}
```

#### 5.2 Show Conflict Summary

```javascript
// Display conflict summary if present
function displayConflictSummary(conflictAnalysis) {
    if (!conflictAnalysis?.hasConflicts) return '';

    return `<div class="conflict-summary">
        <span class="conflict-icon">⚡</span>
        <span class="conflict-text">${conflictAnalysis.summary}</span>
    </div>`;
}
```

#### 5.3 Add CSS Styles

**File: `css/styles.css` (MODIFY)**

```css
/* Societies of Thought - Perspective Badges */
.perspective-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0;
    padding: 8px;
    background: rgba(212, 168, 83, 0.05);
    border-radius: 6px;
}

.badge-label {
    color: var(--text-secondary);
    font-size: 0.85em;
    margin-right: 4px;
}

.perspective-badge {
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
}

.perspective-analyst { background: #3b82f6; color: white; }
.perspective-advocate { background: #22c55e; color: white; }
.perspective-critic { background: #ef4444; color: white; }
.perspective-synthesizer { background: #a855f7; color: white; }
.perspective-historian { background: #f59e0b; color: white; }
.perspective-stakeholder { background: #06b6d4; color: white; }
.perspective-pragmatist { background: #64748b; color: white; }

/* Conflict Summary */
.conflict-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin: 8px 0;
    background: rgba(239, 68, 68, 0.1);
    border-left: 3px solid #ef4444;
    border-radius: 0 6px 6px 0;
    font-size: 0.9em;
}

.conflict-icon {
    font-size: 1.1em;
}

.conflict-text {
    color: var(--text-primary);
}
```

---

### Phase 6: Settings & Toggle
**Priority: Low | Complexity: Low | Files: 2**

#### Objective
Add user controls to enable/disable Societies of Thought features.

#### 6.1 Add Settings Toggle

**File: `js/orchestrator.js` (MODIFY)**

```javascript
// Add to state.settings
state.settings = {
    // ... existing settings ...
    enableSocietiesOfThought: true,
    sotRoleStrategy: 'rotating',  // 'uniform', 'rotating', 'primary-only'
    sotSurfaceConflicts: true
};

// Add settings UI
function renderSoTSettings() {
    return `
    <div class="settings-group">
        <h4>Societies of Thought</h4>
        <label class="toggle-setting">
            <input type="checkbox" id="sot-enabled"
                   ${state.settings.enableSocietiesOfThought ? 'checked' : ''}>
            <span>Enable diverse perspectives</span>
        </label>
        <label class="toggle-setting">
            <input type="checkbox" id="sot-conflicts"
                   ${state.settings.sotSurfaceConflicts ? 'checked' : ''}>
            <span>Surface conflicts in responses</span>
        </label>
        <label class="select-setting">
            <span>Role Strategy:</span>
            <select id="sot-strategy">
                <option value="rotating" ${state.settings.sotRoleStrategy === 'rotating' ? 'selected' : ''}>
                    Rotating (Diverse)
                </option>
                <option value="primary-only" ${state.settings.sotRoleStrategy === 'primary-only' ? 'selected' : ''}>
                    Primary Only
                </option>
                <option value="uniform" ${state.settings.sotRoleStrategy === 'uniform' ? 'selected' : ''}>
                    Uniform (Same role)
                </option>
            </select>
        </label>
    </div>
    `;
}
```

---

## Testing Plan

### Unit Tests

| Module | Test Cases |
|--------|------------|
| `perspective-roles.js` | Role selection by intent, role assignment strategies, role cycling, **group-to-perspective mapping**, **perspectiveFromGroupType()** |
| `conflict-detector.js` | Conflict identification, agreement detection, threshold tuning |
| `query-decomposer.js` | Role-aware query generation, debate query creation, **group-level decomposition**, **_shouldUseGroupDecomposition()** |
| `aggregator.js` | Conflict-aware synthesis prompt, perspective attribution, **group source attribution** |

### Integration Tests

| Scenario | Expected Behavior |
|----------|-------------------|
| 3+ agents, comparative query | Different perspectives assigned, conflicts surfaced |
| 2 agents, simple query | Minimal SoT overhead, still functional |
| Analytical query with disagreement | Debate phase triggered, tensions noted |
| All agents agree | No false conflicts reported |
| **3 groups (temporal, thematic, custom)** | **Each group gets appropriate perspective (historian, synthesizer, analyst)** |
| **10+ agents in 2 groups** | **Group-level decomposition used instead of per-agent** |
| **Ungrouped + grouped agents** | **Groups get perspectives, ungrouped use rotating assignment** |
| **Single group with 5 agents** | **Falls back to per-agent within group** |

### A/B Test Configuration

Create test configurations in Test Builder:

| Config | Settings |
|--------|----------|
| Control | SoT disabled, standard RLM |
| SoT-Rotating | SoT enabled, rotating roles |
| SoT-Primary | SoT enabled, primary roles only |
| SoT-Debate | SoT + debate phase enabled |
| **SoT-Groups** | **SoT enabled with group-level decomposition** |
| **SoT-Groups+Debate** | **Group perspectives + inter-group debate phase** |

### Group Integration Test Scenarios

| Scenario | Groups Setup | Expected Behavior |
|----------|--------------|-------------------|
| Thematic groups | 3 AI-generated thematic groups | Each group = Synthesizer perspective, inter-group conflicts surfaced |
| Temporal groups | Q1, Q2, Q3 quarterly groups | Each group = Historian perspective, timeline synthesis |
| Mixed grouping | 2 temporal + 1 custom "Risks" | Temporal=Historian, Custom=Critic, diverse analysis |
| Large dataset | 20 agents in 4 groups | Group-level queries (4 calls) vs agent-level (20 calls) |

---

## Rollout Plan

| Phase | Scope | Timeline |
|-------|-------|----------|
| 1. Perspective Roles | Core implementation | First |
| **1.5. Group Integration** | **Group-aware perspectives** | **Second** |
| 2. Conflict Detection | Enhance aggregation | Third |
| 3. Diversity Selection | Improve agent selection | Fourth |
| 4. Debate Phase | Complex queries only | Fifth |
| 5. UI Enhancements | Visual feedback | Sixth |
| 6. Settings Toggle | User control | Final |

---

## Metrics to Track

| Metric | Description | Target |
|--------|-------------|--------|
| Response Quality | User satisfaction with multi-perspective answers | ↑ 10% |
| Conflict Detection Rate | % of queries with detected tensions | 15-30% |
| Token Overhead | Additional tokens from SoT prompts | < 20% increase |
| Latency Impact | Processing time increase | < 15% increase |
| User Engagement | Time spent reading perspective-enriched responses | ↑ 5% |
| **Group Decomposition Rate** | **% of queries using group-level vs agent-level** | **> 60% when groups exist** |
| **Token Savings (Groups)** | **Reduction vs per-agent queries for large datasets** | **↓ 40-60% for 15+ agents** |
| **Inter-Group Conflict Rate** | **% of group queries with cross-group disagreements** | **20-40%** |
| **Perspective Assignment Accuracy** | **% of group types correctly mapped to perspectives** | **> 90%** |

---

## References

- [Reasoning Models Generate Societies of Thought](https://arxiv.org/abs/2601.10825) - Kim et al., 2026
- [The Assistant Axis](https://arxiv.org/abs/2601.10387) - Lu et al., 2026 (Anthropic)
- Current RLM Architecture: `CLAUDE.md` § RLM-Lite Architecture
