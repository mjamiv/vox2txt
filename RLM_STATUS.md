# RLM Implementation Status

> **Last Updated:** January 13, 2026  
> **Based on:** "Recursive Language Models" by Zhang, Kraska & Khattab ([arXiv:2512.24601](https://arxiv.org/abs/2512.24601))

---

## Executive Summary

The northstar.LM Agent Orchestrator now includes a functional **RLM-Lite** implementation with **Phase 1: REPL Environment** complete. This enables intelligent query decomposition, parallel execution, response aggregation, and in-browser Python code execution via Pyodide.

| Component | Status | Notes |
|-----------|--------|-------|
| Query Decomposition | ✅ Complete | 4 strategies: direct, parallel, map-reduce, iterative |
| Sub-Query Execution | ✅ Complete | Parallel execution with concurrency control |
| Response Aggregation | ✅ Complete | LLM synthesis with source attribution |
| REPL Environment | ✅ Complete | Pyodide-based Python execution in Web Worker |
| Code Generator | ✅ Complete | Prompt templates and output parsing |
| True Recursion | 🔲 Planned | `sub_lm()` calls with depth > 1 |
| Async Execution | 🔲 Planned | Non-blocking parallel sub-queries |

---

## Phase 1: REPL Environment Foundation ✅ COMPLETE

### What Was Implemented

#### 1. REPL Worker (`js/rlm/repl-worker.js`)
- Web Worker running Pyodide v0.25.0
- Sandboxed Python execution environment
- Message-based communication with main thread
- Built-in Python API functions:
  - `partition(predicate)` - Filter agents by condition
  - `grep(pattern, field)` - Search agent content
  - `search_agents(query)` - Semantic search
  - `get_agent(id)` - Retrieve single agent
  - `list_agents()` - List all agents
  - `get_all_action_items()` - Aggregate action items
  - `get_all_summaries()` - Aggregate summaries
  - `FINAL(answer)` - Mark final answer
  - `FINAL_VAR(name)` - Return variable as final answer

#### 2. REPL Environment (`js/rlm/repl-environment.js`)
- Main interface for REPL operations
- Lazy initialization (Pyodide loads ~10MB on first use)
- Context synchronization with ContextStore
- Execution with configurable timeout
- Ready state management

#### 3. Code Generator (`js/rlm/code-generator.js`)
- LLM prompt generation for Python code
- Code validation and sanitization
- Output parsing for `FINAL()` and `FINAL_VAR()` tags
- Error handling and fallback logic

#### 4. Context Store Updates (`js/rlm/context-store.js`)
- `toPythonDict()` method for REPL integration
- Agent data export at multiple detail levels
- Relevance scoring for query-agent matching

#### 5. RLM Pipeline Integration (`js/rlm/index.js`)
- `initializeREPL()` - Lazy REPL initialization
- `processWithREPL()` - Code-assisted query handling
- `shouldUseREPL()` - Query routing logic
- REPL stats tracking

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Orchestrator                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │   Query     │     │   Context   │     │    Code     │       │
│  │ Decomposer  │     │    Store    │     │  Generator  │       │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘       │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌─────────────────────────────────────────────────────┐       │
│  │               RLM Pipeline (index.js)                │       │
│  │                                                       │       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │       │
│  │  │Decompose│→ │ Execute │→ │Aggregate│→ │ Format  │  │       │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │       │
│  │       │                                      ▲        │       │
│  │       │   ┌──────────────────────────────────┘        │       │
│  │       ▼   ▼                                           │       │
│  │  ┌─────────────────────────────────────────────────┐  │       │
│  │  │            REPL Environment                      │  │       │
│  │  │  ┌─────────────────────────────────────────┐    │  │       │
│  │  │  │         Web Worker (Pyodide)            │    │  │       │
│  │  │  │                                          │    │  │       │
│  │  │  │  agents_data = [...]  # From Context    │    │  │       │
│  │  │  │  result = analyze(agents_data)           │    │  │       │
│  │  │  │  FINAL(result)                           │    │  │       │
│  │  │  └─────────────────────────────────────────┘    │  │       │
│  │  └─────────────────────────────────────────────────┘  │       │
│  └───────────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Files Created/Modified

| File | Type | Description |
|------|------|-------------|
| `js/rlm/repl-worker.js` | New | Pyodide Web Worker |
| `js/rlm/repl-environment.js` | New | REPL interface class |
| `js/rlm/code-generator.js` | New | Code generation & parsing |
| `js/rlm/context-store.js` | Modified | Added `toPythonDict()` |
| `js/rlm/index.js` | Modified | REPL integration in pipeline |
| `orchestrator.html` | Modified | Pyodide preconnect, About section |
| `CLAUDE.md` | Modified | Documentation updates |

---

## Current Capabilities

### Query Routing

The RLM pipeline automatically routes queries based on complexity:

| Condition | Route | Strategy |
|-----------|-------|----------|
| ≤2 active agents, simple query | Legacy | Direct LLM call |
| 3+ agents, comparative query | RLM | Parallel decomposition |
| "all", "every", "across" keywords | RLM | Map-reduce |
| Code/calculation keywords | REPL | Python execution |
| Complex multi-part query | RLM | Iterative with follow-up |

### Decomposition Strategies

```javascript
// Direct - Simple queries, few agents
{ type: 'direct', subQueries: 1 }

// Parallel - Compare across agents
{ type: 'parallel', subQueries: N (one per relevant agent) }

// Map-Reduce - Aggregate across all
{ type: 'map-reduce', subQueries: N + 1 (gather + synthesize) }

// Iterative - Exploratory with uncertainty
{ type: 'iterative', subQueries: 2-3 (initial + follow-ups) }
```

### REPL Triggers

Queries containing these patterns trigger REPL-based processing:

- `"calculate"`, `"compute"`, `"count"`
- `"find all"`, `"list all"`, `"filter"`
- `"aggregate"`, `"sum"`, `"average"`
- `"python"`, `"code"`, `"script"`

---

## Phase 2: Full RLM Integration Plan

### Overview

Phase 2 transforms RLM-Lite into a complete RLM implementation with true recursion, async execution, and LLM-driven code generation.

### Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| 2.1 LLM Code Generation | 1-2 days | Phase 1 ✅ |
| 2.2 True Recursion | 2-3 days | Phase 2.1 |
| 2.3 Async Execution | 1-2 days | Phase 2.2 |
| 2.4 Optimization | 1-2 days | Phase 2.3 |
| 2.5 Testing & Polish | 2-3 days | Phase 2.4 |
| **Total** | **7-12 days** | |

---

### Phase 2.1: LLM-Driven Code Generation

**Goal:** Replace template-based code generation with LLM-generated Python.

#### Tasks

1. **Create Code Generation Prompt**
   ```javascript
   // code-generator.js
   generateCodePrompt(query, agentsMetadata, contextHint) {
       return `You are a Python expert. Write code to answer this query:
       
       Query: "${query}"
       
       Available data:
       - agents_data: List[Dict] with keys: id, displayName, summary, keyPoints, actionItems
       
       Available functions:
       - partition(predicate): Filter agents
       - grep(pattern, field): Search content
       - FINAL(answer): Return final answer
       
       Write ONLY Python code. No explanations.`;
   }
   ```

2. **Integrate with OpenAI API**
   ```javascript
   async generateCode(query, context) {
       const prompt = this.generateCodePrompt(query, this.contextStore.getAgentsMetadata());
       const response = await llmCall(prompt, { model: 'gpt-5.2', temperature: 0.2 });
       return this.extractCode(response);
   }
   ```

3. **Code Validation Pipeline**
   - Syntax check before execution
   - Security scan for dangerous patterns
   - Timeout enforcement
   - Error recovery with retry

#### Success Criteria
- [ ] LLM generates valid Python for 90%+ of test queries
- [ ] Code executes successfully in REPL
- [ ] Fallback to template generation if LLM fails

---

### Phase 2.2: True Recursion (`sub_lm`)

**Goal:** Enable recursive LLM calls from within Python code.

#### The `sub_lm()` Function

```python
# Available in REPL environment
def sub_lm(query: str, context: dict = None) -> str:
    """
    Make a recursive LLM call from within Python code.
    
    Args:
        query: Natural language question
        context: Optional context override
    
    Returns:
        LLM response as string
    """
    # Implemented via postMessage to main thread
    pass
```

#### Implementation

1. **Worker-to-Main Communication**
   ```javascript
   // repl-worker.js
   function sub_lm(query, context) {
       return new Promise((resolve) => {
           const id = generateId();
           pendingSubLM.set(id, resolve);
           self.postMessage({ type: 'SUB_LM', id, query, context });
       });
   }
   ```

2. **Main Thread Handler**
   ```javascript
   // repl-environment.js
   worker.onmessage = async (event) => {
       if (event.data.type === 'SUB_LM') {
           const { id, query, context } = event.data;
           const response = await this.llmCall(query, context);
           worker.postMessage({ type: 'SUB_LM_RESPONSE', id, response });
       }
   };
   ```

3. **Depth Tracking**
   ```javascript
   // Prevent infinite recursion
   const MAX_DEPTH = 3;
   let currentDepth = 0;
   
   async function sub_lm(query, context) {
       if (currentDepth >= MAX_DEPTH) {
           throw new Error('Max recursion depth exceeded');
       }
       currentDepth++;
       try {
           return await _sub_lm_impl(query, context);
       } finally {
           currentDepth--;
       }
   }
   ```

#### Example Use Case

```python
# User query: "Compare action items across all meetings"

agents = list_agents()
comparisons = []

for agent in agents:
    # Recursive LLM call for each agent
    analysis = sub_lm(f"Analyze priority of action items in {agent['displayName']}")
    comparisons.append({
        'agent': agent['displayName'],
        'analysis': analysis
    })

# Final synthesis
summary = sub_lm(f"Synthesize these analyses: {comparisons}")
FINAL(summary)
```

#### Success Criteria
- [ ] `sub_lm()` calls work from Python code
- [ ] Depth limit enforced
- [ ] Results properly returned to Python context
- [ ] Token usage tracked across recursive calls

---

### Phase 2.3: Async Parallel Execution

**Goal:** Execute sub-queries in parallel without blocking.

#### Implementation

1. **Async Sub-Executor**
   ```javascript
   // sub-executor.js
   async executeParallel(subQueries, llmCall, options = {}) {
       const { maxConcurrent = 3, timeout = 30000 } = options;
       
       const results = [];
       const executing = new Set();
       
       for (const subQuery of subQueries) {
           if (executing.size >= maxConcurrent) {
               // Wait for one to complete
               await Promise.race([...executing]);
           }
           
           const promise = this.executeOne(subQuery, llmCall, timeout)
               .finally(() => executing.delete(promise));
           
           executing.add(promise);
           results.push(promise);
       }
       
       return Promise.all(results);
   }
   ```

2. **Progress Streaming**
   ```javascript
   // Report progress as sub-queries complete
   onProgress(completed, total, latestResult) {
       this.emit('progress', { completed, total, latestResult });
   }
   ```

3. **Cancellation Support**
   ```javascript
   const controller = new AbortController();
   const { signal } = controller;
   
   // User can cancel long-running queries
   executeWithCancellation(subQueries, llmCall, { signal });
   ```

#### Success Criteria
- [ ] Parallel execution with configurable concurrency
- [ ] Progress updates during execution
- [ ] Cancellation support
- [ ] Proper error handling for partial failures

---

### Phase 2.4: Optimization & Caching

**Goal:** Improve performance and reduce API costs.

#### 1. Result Caching
```javascript
class ResultCache {
    constructor(ttl = 300000) { // 5 minutes
        this.cache = new Map();
        this.ttl = ttl;
    }
    
    getKey(query, agentIds) {
        return `${query}::${agentIds.sort().join(',')}`;
    }
    
    get(query, agentIds) {
        const key = this.getKey(query, agentIds);
        const entry = this.cache.get(key);
        if (entry && Date.now() - entry.timestamp < this.ttl) {
            return entry.result;
        }
        return null;
    }
    
    set(query, agentIds, result) {
        const key = this.getKey(query, agentIds);
        this.cache.set(key, { result, timestamp: Date.now() });
    }
}
```

#### 2. Token Optimization
- Compress agent data before sending to LLM
- Use summaries instead of full content when possible
- Batch similar sub-queries

#### 3. REPL Preloading
- Preload Pyodide when user opens Orchestrator
- Keep REPL warm between queries
- Cache compiled Python code

#### Success Criteria
- [ ] 50%+ cache hit rate for repeated queries
- [ ] 30%+ token reduction for typical queries
- [ ] Pyodide initialization < 3 seconds on repeat visits

---

### Phase 2.5: Testing & Polish

**Goal:** Ensure reliability and improve UX.

#### Test Cases

| Category | Test |
|----------|------|
| Decomposition | Simple query → direct strategy |
| Decomposition | "Compare X and Y" → parallel strategy |
| Decomposition | "All action items" → map-reduce strategy |
| REPL | Basic Python execution |
| REPL | Context access via `agents_data` |
| REPL | `FINAL()` output parsing |
| Recursion | Single `sub_lm()` call |
| Recursion | Nested `sub_lm()` calls |
| Recursion | Max depth enforcement |
| Error | Invalid Python syntax |
| Error | REPL timeout |
| Error | API rate limiting |

#### UX Improvements

1. **Progress Indicators**
   - "Decomposing query..." → "Analyzing 3 agents..." → "Synthesizing..."
   - Show which agent is currently being processed

2. **Source Attribution**
   - "[From Q4 Planning meeting]" inline citations
   - Expandable source details

3. **Fallback Transparency**
   - Notify user when falling back to legacy
   - Explain why (e.g., "REPL unavailable")

---

## Configuration Reference

```javascript
// js/rlm/index.js - RLM_CONFIG

{
    // Decomposition
    maxSubQueries: 5,        // Max sub-queries per decomposition
    minRelevanceScore: 2,    // Min score to include agent
    
    // Execution
    maxConcurrent: 3,        // Parallel execution limit
    maxDepth: 2,             // Max recursion depth
    tokensPerSubQuery: 800,  // Token budget per sub-query
    timeout: 30000,          // Execution timeout (ms)
    
    // Aggregation
    maxFinalLength: 4000,    // Max response length
    enableLLMSynthesis: true, // Use LLM to synthesize
    deduplicationThreshold: 0.7, // Similarity threshold
    
    // REPL
    enableREPL: true,        // Master REPL switch
    replTimeout: 30000,      // REPL execution timeout
    autoInitREPL: false,     // Lazy vs eager init
    preferREPL: false,       // REPL over decomposition
    
    // Feature Flags
    enableRLM: true,         // Master RLM switch
    fallbackToLegacy: true   // Fallback on error
}
```

---

## API Reference

### RLMPipeline

```javascript
const pipeline = getRLMPipeline(config);

// Load agents
pipeline.loadAgents(agentsArray);

// Process query
const result = await pipeline.process(query, llmCall, context);

// Check REPL status
const ready = pipeline.isREPLReady();
await pipeline.initializeREPL();

// Get statistics
const stats = pipeline.getStats();

// Reset
pipeline.reset();
```

### ContextStore

```javascript
const store = getContextStore();

store.loadAgents(agents);
store.getActiveAgents();
store.getAgentsForQuery(query); // Returns relevance-scored agents
store.toPythonDict();           // Export for REPL
```

### REPLEnvironment

```javascript
const repl = getREPLEnvironment(options);

await repl.initialize();
const result = await repl.execute(pythonCode);
await repl.setContext(agentsData);
repl.isReady();
repl.terminate();
```

---

## Metrics & Monitoring

The RLM pipeline tracks these metrics:

```javascript
pipeline.getStats();
// Returns:
{
    queriesProcessed: 42,
    totalSubQueries: 156,
    avgExecutionTime: 2340,  // ms
    strategies: {
        direct: 12,
        parallel: 18,
        'map-reduce': 8,
        iterative: 4
    },
    replExecutions: 15,
    replErrors: 2
}
```

---

## Known Limitations

1. **Pyodide Size**: ~10MB initial download (cached after first load)
2. **No NumPy/Pandas**: Only standard library available in REPL
3. **Synchronous Python**: Async Python not supported in Pyodide
4. **Context Size**: Large agent data may slow REPL operations
5. **No Persistence**: REPL state resets on page reload

---

## Next Steps

1. **Immediate**: Complete Phase 2.1 (LLM Code Generation)
2. **Short-term**: Implement Phase 2.2 (True Recursion)
3. **Medium-term**: Add async execution and caching
4. **Long-term**: Explore fine-tuning for domain-specific queries

---

## References

- [RLM Paper](https://arxiv.org/abs/2512.24601) - Zhang, Kraska & Khattab
- [Pyodide Documentation](https://pyodide.org/en/stable/)
- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
