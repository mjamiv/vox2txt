---
version: "1.0"
agent_name: "Societies of Thought Expert"
created: "2026-01-20T12:00:00Z"
source_type: "documentation"
description: "Expert knowledge agent on the Societies of Thought (SoT) feature implementation in northstar.LM"
tags: ["sot", "rlm", "cognitive-perspectives", "multi-agent", "conflict-detection"]
---

# Societies of Thought Expert

## Summary

The Societies of Thought (SoT) feature enhances northstar.LM's RLM (Recursive Language Model) pipeline by introducing diverse cognitive perspectives inspired by the research paper "Reasoning Models Generate Societies of Thought" (arXiv:2601.10825). The implementation adds seven cognitive perspective roles (Analyst, Advocate, Critic, Synthesizer, Historian, Stakeholder, Pragmatist) that are assigned to agents during query processing to simulate multi-agent-like interactions. Key components include perspective role assignment based on query intent, conflict detection between perspectives, diversity-aware agent selection, an optional debate phase for complex queries, and group-level query decomposition for large agent sets. The feature enables richer, more nuanced responses by surfacing agreements, tensions, and multiple viewpoints across meeting data.

## Key Points

- SoT is based on arXiv:2601.10825 research showing enhanced reasoning emerges from simulating multi-agent interactions with diverse cognitive perspectives
- Seven cognitive perspective roles are defined: Analyst (factual/data-driven), Advocate (supportive/opportunity-focused), Critic (skeptical/risk-aware), Synthesizer (holistic/pattern-finding), Historian (temporal/evolutionary), Stakeholder (empathetic/impact-focused), Pragmatist (practical/action-oriented)
- Primary roles (Analyst, Advocate, Critic, Synthesizer) are used most frequently; specialized roles (Historian, Stakeholder, Pragmatist) are triggered by specific query patterns
- Four role assignment strategies available: UNIFORM (same role for all), ROTATING (cycle through roles), ADAPTIVE (match to agent content), PRIMARY_ONLY (only use 4 primary roles)
- ConflictDetector module identifies disagreements using marker-based analysis (conflict markers like "however", "but", "despite" vs agreement markers like "similarly", "confirms", "supports")
- Conflict detection uses Jaccard similarity scoring to measure text overlap between responses
- Group-level query decomposition reduces API calls by treating agent groups as unified perspectives (e.g., temporal groups get Historian perspective)
- MAP-DEBATE-REDUCE execution strategy adds explicit debate phase for complex analytical/comparative queries
- Diversity-aware agent selection prevents over-representation of similar sources using diversityWeight scoring
- Agent Builder now extracts SoT metadata (meetingType, keyEntities, temporalContext, topicTags, contentSignals, suggestedPerspective) during analysis
- UI enhancements include perspective badges with role-specific colors and conflict summary indicators
- Settings toggles allow enabling/disabling SoT, conflict detection, debate phase, and diversity selection independently

## Action Items

- Enable SoT for multi-agent queries (3+ agents) to get diverse perspective analysis
- Use ROTATING role strategy for maximum perspective diversity across agents
- Monitor conflict detection rate (target 15-30% of queries) to ensure meaningful tensions are surfaced
- Consider GROUP decomposition for 6+ agents to reduce token costs by 40-60%
- Use ADAPTIVE strategy when agents have SoT metadata for intelligent role matching
- Enable debate phase for complex analytical queries requiring explicit tension resolution
- Review perspective badges in responses to understand which viewpoints contributed to synthesis
- Disable SoT for simple factual queries to reduce unnecessary overhead
- Track token overhead (target less than 20% increase) to balance richness vs cost

## Sentiment

Neutral

## Transcript

# Societies of Thought (SoT) Implementation Documentation

## Overview

The Societies of Thought feature implements insights from the research paper "Reasoning Models Generate Societies of Thought" (arXiv:2601.10825) by Kim et al. The key insight is that enhanced reasoning emerges from simulating multi-agent-like interactions - a "society of thought" - which enables diversification and debate among internal cognitive perspectives characterized by distinct personality traits and domain expertise.

## Architecture

### Core Files

1. **js/rlm/perspective-roles.js** - Defines cognitive perspective roles and assignment strategies
2. **js/rlm/conflict-detector.js** - Identifies conflicts and agreements between perspectives
3. **js/rlm/query-decomposer.js** - Modified to include role-aware query generation
4. **js/rlm/aggregator.js** - Enhanced with conflict-aware synthesis
5. **js/rlm/context-store.js** - Added diversity-weighted agent selection
6. **js/rlm/sub-executor.js** - Added MAP-DEBATE-REDUCE execution strategy
7. **js/rlm/index.js** - Updated configuration passing for SoT settings
8. **js/app.js** - Enhanced analysis to extract SoT metadata
9. **js/orchestrator.js** - UI enhancements and settings management
10. **css/styles.css** - Perspective badge and conflict summary styles

### Cognitive Perspective Roles

The PerspectiveRoles object defines seven distinct cognitive perspectives:

**Primary Roles (used most frequently):**

1. ANALYST
   - ID: 'analyst'
   - Description: Examines data critically and objectively
   - Prompt Prefix: "As an objective analyst, examine the facts and data:"
   - Traits: factual, data-driven, precise
   - Weight: 1.0

2. ADVOCATE
   - ID: 'advocate'
   - Description: Identifies supporting evidence and positive aspects
   - Prompt Prefix: "As an advocate, identify what supports and strengthens this:"
   - Traits: supportive, constructive, opportunity-focused
   - Weight: 0.8

3. CRITIC
   - ID: 'critic'
   - Description: Identifies weaknesses, risks, and counterarguments
   - Prompt Prefix: "As a critical reviewer, identify potential issues, risks, or contradictions:"
   - Traits: skeptical, risk-aware, thorough
   - Weight: 0.9

4. SYNTHESIZER
   - ID: 'synthesizer'
   - Description: Connects ideas and finds patterns across sources
   - Prompt Prefix: "As a synthesizer, identify connections, patterns, and broader implications:"
   - Traits: holistic, integrative, pattern-finding
   - Weight: 0.85

**Specialized Roles (used selectively based on triggers):**

5. HISTORIAN
   - ID: 'historian'
   - Description: Focuses on temporal context and evolution
   - Prompt Prefix: "From a historical perspective, trace how this evolved over time:"
   - Traits: temporal, contextual, evolutionary
   - Weight: 0.7
   - Triggers: over time, evolution, history, progress, changed

6. STAKEHOLDER
   - ID: 'stakeholder'
   - Description: Considers impact on different parties
   - Prompt Prefix: "From a stakeholder perspective, consider impacts on different parties:"
   - Traits: empathetic, multi-viewpoint, impact-focused
   - Weight: 0.75
   - Triggers: impact, stakeholder, team, customer, user

7. PRAGMATIST
   - ID: 'pragmatist'
   - Description: Focuses on actionable outcomes and feasibility
   - Prompt Prefix: "As a pragmatist, focus on what is actionable and feasible:"
   - Traits: practical, action-oriented, realistic
   - Weight: 0.8
   - Triggers: action, do, implement, next steps, practical

### Role Assignment Strategies

The RoleAssignmentStrategy enum defines four strategies:

1. UNIFORM - All agents get the same role (first selected role)
2. ROTATING - Cycle through roles across agents for maximum diversity
3. ADAPTIVE - Match roles to agent content based on SoT metadata
4. PRIMARY_ONLY - Only use the four primary roles (analyst, advocate, critic, synthesizer)

### Query Intent to Role Mapping

The selectRolesForQuery function maps query classification to appropriate roles:

- Comparative queries: Analyst + Critic + Synthesizer
- Aggregative queries: Analyst + Advocate + Synthesizer
- Analytical queries: Analyst + Critic + Advocate + Synthesizer
- Temporal queries: Analyst + Historian + Synthesizer
- Factual queries (default): Analyst + Advocate + Critic

### Conflict Detection

The ConflictDetector class analyzes responses for conflicts and agreements:

**Conflict Markers:**
however, but, although, despite, contrary, disagree, conflict, tension, risk, concern, alternatively, on the other hand, versus, vs, challenge, issue, problem, limitation, obstacle, whereas, unlike, contrast, differ, instead

**Agreement Markers:**
also, similarly, agrees, confirms, supports, consistent, aligns, reinforces, validates, likewise, as well, in line with, corroborates, echoes, mirrors, matches, concurs

**Analysis Process:**
1. Pairwise comparison of all responses
2. Count conflict and agreement markers in each pair
3. Calculate Jaccard similarity (word overlap)
4. Classify as conflict if conflictScore > agreementScore AND similarity < 0.75
5. Classify as agreement if agreementScore > conflictScore OR similarity >= 0.75
6. Extract conflict themes from frequently occurring words
7. Generate summary (e.g., "2 tension(s) detected; 3 point(s) of agreement")

**Output Format:**
```javascript
{
    hasConflicts: boolean,
    conflicts: Array<{
        type: 'conflict',
        confidence: number,
        source1: { agentName, perspective, excerpt },
        source2: { agentName, perspective, excerpt },
        similarity: number
    }>,
    agreements: Array<...>,
    conflictThemes: string[],
    summary: string
}
```

### Group-Level Query Decomposition

For 6+ agents with groups, the system can use group-level decomposition:

**Group Type to Perspective Mapping:**
- temporal groups -> Historian perspective
- thematic groups -> Synthesizer perspective
- source groups -> Analyst perspective
- custom groups -> Inferred from name (risk keywords -> Critic, action keywords -> Pragmatist)

**Benefits:**
- Reduces API calls (1 per group vs 1 per agent)
- Leverages existing semantic clustering
- Natural inter-group conflict detection
- 40-60% token savings for 15+ agent datasets

**Conditions for Group Decomposition:**
- At least 2 active groups
- At least 6 total agents
- Query complexity is not 'simple'

### MAP-DEBATE-REDUCE Execution Strategy

For complex analytical/comparative queries, an explicit debate phase is added:

**Phase 1: MAP**
- Execute sub-queries in parallel
- Each agent analyzes from assigned perspective

**Phase 2: DEBATE**
- Analyze all map results for conflicts
- Generate explicit tension identification
- Format: "Key Tensions:" with sources and recommendations

**Phase 3: REDUCE**
- Synthesize with debate insights included
- Address identified tensions explicitly
- Cite which perspective insights came from

**Debate Query Prompt:**
```
Analyze the following perspectives for CONFLICTS and TENSIONS.

For the question: "[original query]"

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
- [How to reconcile or present these tensions]
```

### Diversity-Aware Agent Selection

The queryAgentsWithDiversity function in context-store.js prevents over-representation:

**Parameters:**
- maxResults: number of agents to select
- minScore: minimum relevance score
- diversityWeight: 0-1 balance between relevance and diversity (default 0.3)
- diversityFields: fields to diversify on (default: sourceType, createdDate)

**Algorithm:**
1. Get 2x candidates from standard relevance search
2. Greedy selection with diversity bonus
3. For each candidate, add diversityWeight bonus if field value is new
4. Combined score = relevance * (1 - diversityWeight) + diversityBonus
5. Track seen values to penalize repeated sources

### Agent Builder SoT Metadata

The enhanced analysis prompt extracts additional fields:

**New Fields:**
- meetingType: planning, review, standup, brainstorm, decision, retrospective, report, general
- keyEntities: { people[], projects[], organizations[], products[] }
- temporalContext: { quarter, explicitDates[], deadlines[], timeframe }
- topicTags: 3-7 semantic topic tags
- contentSignals: { riskMentions, decisionsMade, actionsAssigned, questionsRaised, conflictIndicators }
- suggestedPerspective: analyst, advocate, critic, synthesizer, historian, pragmatist, stakeholder

**Perspective Assignment from Signals:**
- riskMentions > 3 -> Critic
- actionsAssigned > 5 -> Pragmatist
- decisionsMade > 2 -> Analyst
- questionsRaised > 3 -> Advocate

### UI Enhancements

**Perspective Badges:**
Color-coded badges showing which perspectives contributed:
- Analyst: #3b82f6 (blue)
- Advocate: #22c55e (green)
- Critic: #ef4444 (red)
- Synthesizer: #a855f7 (purple)
- Historian: #f59e0b (amber)
- Stakeholder: #06b6d4 (cyan)
- Pragmatist: #64748b (slate)

**Conflict Summary:**
Red-accented box with lightning bolt icon showing:
- Number of tensions detected
- Number of agreements found
- Key conflict themes

**Thinking Step Display:**
New 'debate' step type with pink color for train-of-thought progress.

### Configuration Options

```javascript
// In RLM_CONFIG
enableSocietiesOfThought: true,      // Master toggle
roleAssignmentStrategy: 'rotating',   // Assignment strategy
minAgentsForSoT: 2,                   // Minimum agents to enable SoT
minAgentsForGroupDecomposition: 6,    // Minimum for group-level queries
includePerspectiveInResponse: true,   // Show perspective labels

// In state.settings (orchestrator)
enableSocietiesOfThought: true,
enableConflictDetection: true,
enableDebatePhase: true,
enableDiversitySelection: true
```

### Performance Metrics

**Target Metrics:**
- Response Quality: +10% user satisfaction
- Conflict Detection Rate: 15-30% of queries
- Token Overhead: <20% increase
- Latency Impact: <15% increase
- Group Decomposition Rate: >60% when groups exist
- Token Savings with Groups: 40-60% for 15+ agents
- Inter-Group Conflict Rate: 20-40%
- SoT Metadata Coverage: >95% of new agents

### Testing Configurations

**A/B Test Configs:**
- Control: SoT disabled, standard RLM
- SoT-Rotating: SoT enabled, rotating roles
- SoT-Primary: SoT enabled, primary roles only
- SoT-Debate: SoT + debate phase enabled
- SoT-Groups: SoT with group-level decomposition
- SoT-Groups+Debate: Group perspectives + inter-group debate

### API Functions Reference

**perspective-roles.js:**
- getPrimaryRoles() -> Array of 4 primary roles
- getAllRoles() -> Array of all 7 roles
- selectRolesForQuery(classification, agentCount) -> Selected roles
- assignRolesToAgents(agents, roles, strategy) -> Role assignments
- perspectiveFromGroupType(group) -> Role or null
- perspectiveFromAgentMetadata(agent) -> Role or null
- perspectiveFromContentSignals(signals) -> Role or null
- assignPerspectivesToGroups(groups, classification) -> Group assignments
- getRoleById(roleId) -> Role or null
- isPrimaryRole(role) -> boolean

**conflict-detector.js:**
- analyze(responses) -> Analysis result
- formatForSynthesis(analysis) -> Formatted string
- getConflictIndicator(analysis) -> UI indicator object

**query-decomposer.js (additions):**
- generateGroupLevelSubQueries(query, groups, classification, context) -> Sub-queries
- shouldUseGroupDecomposition(groups, agentCount, classification) -> boolean
- _createRoleAwareQuery(query, agent, role) -> Modified query
- _createRoleAwareMapQuery(query, intent, role) -> Map query
- _createSynthesisReduceQuery(query, intent) -> Reduce query
- _createGroupPerspectiveQuery(query, group, perspective) -> Group query
- _createDebateQuery(query, intent) -> Debate query

**sub-executor.js (additions):**
- _executeMapDebateReduce(subQueries, llmCall, context) -> Results
- _executeGroupQuery(query, llmCall, context) -> Result
- _executeDebate(mapResults, debateQuery, llmCall, context) -> Debate result

---

## Export Payload (JSON)

```json
{
  "agent": {
    "id": "sot-expert-20260120",
    "name": "Societies of Thought Expert",
    "created": "2026-01-20T12:00:00Z"
  },
  "source": {
    "type": "documentation",
    "description": "Technical documentation for SoT feature implementation"
  },
  "processing": {
    "inputMode": "text",
    "model": "manual"
  },
  "analysis": {
    "summary": "The Societies of Thought (SoT) feature enhances northstar.LM's RLM pipeline by introducing diverse cognitive perspectives based on arXiv:2601.10825 research. It implements seven roles (Analyst, Advocate, Critic, Synthesizer, Historian, Stakeholder, Pragmatist) with conflict detection, group-level decomposition, and MAP-DEBATE-REDUCE execution for richer multi-perspective responses.",
    "keyPoints": "- Seven cognitive perspective roles defined in perspective-roles.js\n- Four role assignment strategies: UNIFORM, ROTATING, ADAPTIVE, PRIMARY_ONLY\n- ConflictDetector uses marker-based analysis and Jaccard similarity\n- Group-level decomposition for 6+ agents reduces tokens 40-60%\n- MAP-DEBATE-REDUCE adds explicit tension identification\n- SoT metadata extracted during Agent Builder analysis\n- UI shows perspective badges and conflict summaries",
    "actionItems": "- Enable SoT for 3+ agent queries\n- Use ROTATING strategy for diversity\n- Monitor 15-30% conflict detection rate\n- Use GROUP decomposition for 6+ agents\n- Track token overhead under 20%",
    "sentiment": "Neutral"
  },
  "sotMetadata": {
    "meetingType": "report",
    "keyEntities": {
      "people": [],
      "projects": ["northstar.LM", "RLM Pipeline"],
      "organizations": [],
      "products": ["Societies of Thought", "ConflictDetector", "PerspectiveRoles"]
    },
    "temporalContext": {
      "quarter": "Q1 2026",
      "timeframe": "present"
    },
    "topicTags": ["sot", "rlm", "perspectives", "conflict-detection", "multi-agent", "cognitive-diversity"],
    "contentSignals": {
      "riskMentions": 0,
      "decisionsMade": 7,
      "actionsAssigned": 5,
      "questionsRaised": 0,
      "conflictIndicators": 0
    },
    "suggestedPerspective": "analyst"
  },
  "metrics": {
    "tokenCount": 0,
    "analysisTime": 0
  },
  "chatHistory": [],
  "artifacts": {}
}
```
