/**
 * Cognitive Perspective Roles for Societies of Thought
 *
 * Based on: "Reasoning Models Generate Societies of Thought" (arXiv:2601.10825)
 * These roles mirror the diverse cognitive perspectives that reasoning models
 * spontaneously generate during chain-of-thought reasoning.
 *
 * @module perspective-roles
 */

/**
 * Perspective role definitions
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
 * Get primary roles only (no specialized roles)
 * @returns {Array} Array of primary perspective roles
 */
export function getPrimaryRoles() {
    return [
        PerspectiveRoles.ANALYST,
        PerspectiveRoles.ADVOCATE,
        PerspectiveRoles.CRITIC,
        PerspectiveRoles.SYNTHESIZER
    ];
}

/**
 * Get all roles including specialized ones
 * @returns {Array} Array of all perspective roles
 */
export function getAllRoles() {
    return Object.values(PerspectiveRoles);
}

/**
 * Select appropriate roles based on query classification
 * @param {Object} classification - Query classification with intent and complexity
 * @param {number} agentCount - Number of agents to assign roles to
 * @returns {Array} Array of perspective roles
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
 * @param {Array} agents - Array of agent objects
 * @param {Array} roles - Array of perspective roles
 * @param {string} strategy - Assignment strategy
 * @returns {Array} Array of { agent, role } assignments
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
            // Match roles to agent content based on SoT metadata
            agents.forEach((agent, index) => {
                const suggestedRole = perspectiveFromAgentMetadata(agent);
                assignments.push({
                    agent,
                    role: suggestedRole || roles[index % roles.length]
                });
            });
            break;

        case RoleAssignmentStrategy.PRIMARY_ONLY:
            // Only use analyst, advocate, critic, synthesizer
            const primaryRoles = getPrimaryRoles();
            agents.forEach((agent, index) => {
                assignments.push({ agent, role: primaryRoles[index % 4] });
            });
            break;

        default:
            // Default to rotating
            agents.forEach((agent, index) => {
                assignments.push({ agent, role: roles[index % roles.length] });
            });
    }

    return assignments;
}

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
        'meeting-type': null, // Infer from meeting type
        'perspective': null,  // Already assigned
        'custom': null        // Infer from name/description
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
 * Get perspective from agent's SoT metadata
 * @param {Object} agent - Agent with sotMetadata
 * @returns {Object|null} Perspective role or null
 */
export function perspectiveFromAgentMetadata(agent) {
    const suggested = agent?.sotMetadata?.suggestedPerspective;
    if (!suggested) return null;

    const mapping = {
        'analyst': PerspectiveRoles.ANALYST,
        'advocate': PerspectiveRoles.ADVOCATE,
        'critic': PerspectiveRoles.CRITIC,
        'synthesizer': PerspectiveRoles.SYNTHESIZER,
        'historian': PerspectiveRoles.HISTORIAN,
        'pragmatist': PerspectiveRoles.PRAGMATIST,
        'stakeholder': PerspectiveRoles.STAKEHOLDER
    };

    return mapping[suggested.toLowerCase()] || null;
}

/**
 * Infer perspective from content signals
 * @param {Object} signals - contentSignals from SoT metadata
 * @returns {Object|null} Perspective role or null
 */
export function perspectiveFromContentSignals(signals) {
    if (!signals) return null;

    const { riskMentions, decisionsMade, actionsAssigned, questionsRaised } = signals;

    // Prioritize based on dominant signal
    if (riskMentions > 3) return PerspectiveRoles.CRITIC;
    if (actionsAssigned > 5) return PerspectiveRoles.PRAGMATIST;
    if (decisionsMade > 2) return PerspectiveRoles.ANALYST;
    if (questionsRaised > 3) return PerspectiveRoles.ADVOCATE;

    return null;
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
    const availablePerspectives = getPrimaryRoles().filter(p => !usedPerspectives.has(p.id));

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

/**
 * Get role by ID
 * @param {string} roleId - Role ID (e.g., 'analyst', 'critic')
 * @returns {Object|null} Perspective role or null
 */
export function getRoleById(roleId) {
    if (!roleId) return null;
    const key = roleId.toUpperCase();
    return PerspectiveRoles[key] || null;
}

/**
 * Check if a role is a primary role
 * @param {Object|string} role - Role object or ID
 * @returns {boolean} True if primary role
 */
export function isPrimaryRole(role) {
    const id = typeof role === 'string' ? role : role?.id;
    const primaryIds = ['analyst', 'advocate', 'critic', 'synthesizer'];
    return primaryIds.includes(id);
}
