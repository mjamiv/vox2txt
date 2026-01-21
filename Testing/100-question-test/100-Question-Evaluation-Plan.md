# 100-Question Test Evaluation Plan

**Purpose:** Systematic grading of Direct Chat vs RLM+SWM responses against memory retention rubric.

---

## What I'll Need From You

Once the test completes, export these artifacts:

1. **HTML Report** - Export from Test Builder (includes all responses)
2. **CSV Metrics** - Download metrics CSV (token/cost/timing data)
3. **Raw Response Text** - If HTML doesn't capture full responses, copy key ones

---

## Grading Rubric (Per Response)

| Score | Label | Criteria |
|-------|-------|----------|
| **5** | Perfect | Correctly recalls exact details from referenced responses |
| **4** | Good | Recalls most details with minor inaccuracies |
| **3** | Partial | Recalls some details but misses key elements |
| **2** | Poor | Significant errors or hedging ("I believe...", "Based on what I can see...") |
| **1** | Failed | Explicit failure ("I don't have access to...", "I cannot recall...") |
| **0** | Hallucination | Fabricates details not present in original response |

---

## Evaluation Methodology

### Phase 1: Automated Flags
I'll scan all responses for failure indicators:

**Failure Keywords (Score 1):**
- "I don't have access to"
- "I cannot recall"
- "I don't see response #"
- "that information isn't available"
- "I'm unable to retrieve"

**Hedging Keywords (Score 2):**
- "I believe"
- "Based on what I can see"
- "If I recall correctly"
- "I think"
- "It seems like"

### Phase 2: Memory Reference Validation
For each prompt that references prior responses, I'll verify:

1. **Does the response acknowledge the referenced turn?**
2. **Is the recalled content accurate?** (Compare to actual earlier response)
3. **Are specific details preserved?** (names, numbers, formats)

### Phase 3: Synthesis Quality Check
For synthesis prompts (combining multiple responses):

1. **Coverage:** Did it reference all requested responses?
2. **Accuracy:** Are the combined facts correct?
3. **Coherence:** Does the synthesis make logical sense?

### Phase 4: Trap Question Analysis
For trap/hallucination prompts (41-45, 91-95):

1. **Did it correctly identify non-existent items?** (e.g., "EXTREME" risk rating)
2. **Did it fabricate details that weren't there?**
3. **Did it admit uncertainty when appropriate?**

---

## Scoring Workflow

### Step 1: Establish Ground Truth
Grade the **first 5 responses** (Phase 1: Foundation) for both configs:
- These are baseline facts with no memory challenge
- Both should score 5/5
- This establishes the "correct answers" for later recall tests

### Step 2: Phase-by-Phase Grading
I'll grade each phase separately, tracking:

| Phase | Prompts | Memory Challenge | Direct Chat Expected | RLM Expected |
|-------|---------|------------------|---------------------|--------------|
| 1 | 1-5 | None | 5.0 | 5.0 |
| 2 | 6-10 | 1-5 turn recall | 5.0 | 5.0 |
| 3 | 11-15 | Cross-reference | 4.5-5.0 | 5.0 |
| 4 | 16-20 | Synthesis (3-5) | 4.0-4.5 | 5.0 |
| 5 | 21-25 | Precise recall | 3.5-4.0 | 5.0 |
| 6 | 26-30 | Distractor | 4.0-5.0 | 5.0 |
| 7 | 31-35 | Recovery | 2.5-3.5 | 5.0 |
| 8 | 36-40 | Heavy synthesis | 2.0-3.0 | 4.5-5.0 |
| 9 | 41-45 | Trap questions | 1.5-2.5 | 4.5-5.0 |
| 10 | 46-50 | Mid-validation | 1.0-2.0 | 4.5-5.0 |
| 11 | 51-55 | New foundation | 1.0-2.0 | 5.0 |
| 12 | 56-60 | Long-range (55 turns) | 0.5-1.5 | 4.5-5.0 |
| 13 | 61-65 | Cross-phase | 0.5-1.0 | 4.5-5.0 |
| 14 | 66-70 | Deep synthesis (8-12) | 0.5-1.0 | 4.0-5.0 |
| 15 | 71-75 | Extreme memory | 0-1.0 | 4.0-5.0 |
| 16 | 76-80 | Distractor wave 2 | 0-1.0 | 5.0 |
| 17 | 81-85 | Double recovery | 0-0.5 | 4.5-5.0 |
| 18 | 86-90 | Ultimate synthesis | 0-0.5 | 4.0-5.0 |
| 19 | 91-95 | Advanced traps | 0-0.5 | 4.0-5.0 |
| 20 | 96-100 | Final gauntlet | 0-0.5 | 4.0-5.0 |

### Step 3: Calculate Metrics

**Per Config:**
- Total Score (out of 500)
- Average Score (out of 5)
- Memory Recall Rate (% with score ≥ 4)
- First Degradation Point (turn where score first < 4)
- Catastrophic Failure Point (turn where score first ≤ 1)
- Hallucination Count (score = 0)

**Comparative:**
- Score Delta per Phase
- Cost per Successful Recall (cost ÷ responses with score ≥ 4)
- Reliability Factor (RLM recall rate ÷ Direct recall rate)

---

## Deliverables

### 1. Grading Spreadsheet
| Prompt # | Phase | Direct Score | Direct Notes | RLM Score | RLM Notes |
|----------|-------|--------------|--------------|-----------|-----------|
| 1 | Foundation | 5 | Baseline | 5 | Baseline |
| ... | ... | ... | ... | ... | ... |

### 2. Phase Summary Chart
```
Phase  | Direct Avg | RLM Avg | Delta
-------|------------|---------|------
1      | 5.0        | 5.0     | 0.0
2      | 5.0        | 5.0     | 0.0
...
10     | 1.5        | 4.8     | +3.3
...
20     | 0.3        | 4.5     | +4.2
```

### 3. Key Findings Report
- Exact turn where Direct Chat first failed
- Exact turn where Direct Chat catastrophically failed
- RLM's lowest-scoring prompts (if any)
- Hallucination incidents
- Cost-per-success comparison
- Reliability multiplier (e.g., "RLM is 22x more reliable")

### 4. Recommendations
- When to use Direct Chat vs RLM
- Optimal configuration for different conversation lengths
- Any RLM weaknesses identified

---

## Grading Timeline

Once you provide the results:

1. **Initial scan** (10 min) - Flag obvious failures/successes
2. **Phase 1-5 grading** (20 min) - Establish ground truth
3. **Phase 6-10 grading** (30 min) - Track degradation onset
4. **Phase 11-20 grading** (45 min) - Deep memory validation
5. **Analysis & report** (15 min) - Calculate metrics, write findings

**Total: ~2 hours for complete evaluation**

---

## How to Share Results

When test completes:

1. Export HTML report → share file or paste key sections
2. Export CSV metrics → share file
3. For any prompts I need to see in detail, paste the full response text

I'll grade systematically and produce a comprehensive evaluation report.
