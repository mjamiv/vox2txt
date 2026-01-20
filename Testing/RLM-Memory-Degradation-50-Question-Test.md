# RLM Memory Degradation 50-Question Stress Test

**Version:** 1.0
**Created:** January 2026
**Purpose:** Comprehensive validation that RLM maintains consistent memory with zero degradation over extended conversations, with specific focus on Shadow Mode effectiveness over long time horizons.

---

## Test Overview

This 50-question test is designed to rigorously evaluate memory retention across three processing modes:
- **Direct Chat** - Single context window (expected to degrade after ~15 turns)
- **RLM Standard (SWM)** - RLM with Signal-Weighted Memory
- **RLM Hybrid** - RLM + Shadow Prompts + Focus Episodes

### Key Objectives

1. **Prove RLM Memory Consistency** - Demonstrate zero memory degradation even at turn 50
2. **Test Shadow Mode Effectiveness** - Evaluate whether Shadow Mode provides measurable benefit in long conversations where memory accumulates
3. **Identify Direct Chat Degradation Point** - Pinpoint exactly when Direct Chat begins losing context
4. **Measure Cost vs Reliability Tradeoff** - Compare token usage across modes while measuring recall accuracy

### Test Design: 10 Phases

| Phase | Prompts | Purpose | Memory Challenge |
|-------|---------|---------|-----------------|
| **Phase 1: Foundation** | 1-5 | Establish baseline facts | Building initial context |
| **Phase 2: Immediate Recall** | 6-10 | Reference recent responses (1-5 turns back) | Short-term memory |
| **Phase 3: Early Cross-Reference** | 11-15 | Reference Phase 1 responses | Medium-term recall |
| **Phase 4: Synthesis** | 16-20 | Combine 3-5 prior responses | Multi-point synthesis |
| **Phase 5: Deep Memory** | 21-25 | Reference specific details from turns 1-10 | Long-term precision |
| **Phase 6: Distractor Overload** | 26-30 | New complex questions before testing recall | Context pollution |
| **Phase 7: Recovery Test** | 31-35 | Return to Phase 1-3 references after distractors | Memory persistence |
| **Phase 8: Comprehensive Synthesis** | 36-40 | Synthesize 7-10 prior responses | Maximum synthesis load |
| **Phase 9: Trap Questions** | 41-45 | Test for hallucination/fabrication | Precision under pressure |
| **Phase 10: Final Validation** | 46-50 | Explicit memory tests referencing specific turn numbers | Ultimate stress test |

---

## Test Prompts

### Phase 1: Foundation (Prompts 1-5)
*Goal: Establish baseline facts to reference later*

```csv
prompt_number,prompt_text,phase,memory_challenge
1,"What are the main topics discussed across all loaded meetings? List them with one sentence of context each.",Phase 1: Foundation,None - establishing baseline
2,"Who are the key decision-makers mentioned in these meetings? For each person, note their role and at least one decision they influenced.",Phase 1: Foundation,None - establishing baseline
3,"List all explicit decisions made across the meetings. Format as: Decision | Meeting Source | Stakeholders Affected",Phase 1: Foundation,None - establishing baseline
4,"What action items were assigned? For each, include: Task | Owner | Deadline (if mentioned) | Meeting Source",Phase 1: Foundation,None - establishing baseline
5,"What risks or concerns were raised across the meetings? Categorize them by severity: Critical, High, Medium, Low.",Phase 1: Foundation,None - establishing baseline
```

### Phase 2: Immediate Recall (Prompts 6-10)
*Goal: Reference recent responses (1-5 turns back)*

```csv
prompt_number,prompt_text,phase,memory_challenge
6,"Looking at the topics you listed in response #1, which topic appeared most frequently across meetings?",Phase 2: Immediate Recall,Recall from 5 turns back
7,"From the decision-makers in response #2, which person was involved in the most decisions?",Phase 2: Immediate Recall,Recall from 4 turns back
8,"Of the decisions you listed in response #3, which one has the broadest stakeholder impact?",Phase 2: Immediate Recall,Recall from 3 turns back
9,"Looking at the action items from response #4, are there any that depend on other action items? Identify any dependencies.",Phase 2: Immediate Recall,Recall from 2 turns back
10,"From the risks you categorized in response #5, what patterns do you see across the 'Critical' and 'High' risks?",Phase 2: Immediate Recall,Recall from 1 turn back
```

### Phase 3: Early Cross-Reference (Prompts 11-15)
*Goal: Reference Phase 1 responses while building new content*

```csv
prompt_number,prompt_text,phase,memory_challenge
11,"Create a timeline of key events mentioned across the meetings. Start with the earliest date and work forward.",Phase 3: Early Cross-Reference,Building new reference point
12,"Cross-reference the decision-makers from response #2 with the action items from response #4. Which person has the most action items assigned to them?",Phase 3: Early Cross-Reference,Cross-reference turns 2 and 4
13,"Looking back at the risks from response #5 and the decisions from response #3, are there any decisions that directly address the Critical risks?",Phase 3: Early Cross-Reference,Cross-reference turns 3 and 5
14,"Based on the topics from response #1 and the timeline from response #11, which topics evolved the most over time?",Phase 3: Early Cross-Reference,Cross-reference turns 1 and 11
15,"Combine the insights from responses #6, #7, and #8 to identify the single most impactful element discussed across all meetings.",Phase 3: Early Cross-Reference,Synthesize 3 recent responses
```

### Phase 4: Synthesis (Prompts 16-20)
*Goal: Combine 3-5 prior responses into new analysis*

```csv
prompt_number,prompt_text,phase,memory_challenge
16,"Using responses #1-5 as your foundation, create a one-paragraph executive summary of all meetings.",Phase 4: Synthesis,Synthesize 5 responses
17,"Compare the 'most frequent topic' from response #6 with the 'broadest stakeholder impact decision' from response #8. How are they related?",Phase 4: Synthesis,Compare specific earlier findings
18,"Based on the timeline from response #11 and the action item dependencies from response #9, which action items are time-critical?",Phase 4: Synthesis,Cross-reference across phases
19,"Synthesize responses #10, #13, and #15 to create a risk mitigation priority list.",Phase 4: Synthesis,Synthesize 3 non-sequential responses
20,"Looking at responses #2, #4, #7, and #12, create a 'stakeholder accountability matrix' showing who owns what.",Phase 4: Synthesis,Synthesize 4 responses across phases
```

### Phase 5: Deep Memory (Prompts 21-25)
*Goal: Reference specific details from turns 1-10 with precision*

```csv
prompt_number,prompt_text,phase,memory_challenge
21,"In response #3, you listed decisions in a specific format. What was the FIRST decision you listed?",Phase 5: Deep Memory,Precise recall turn 3
22,"In response #5, how many risks did you categorize as 'Critical'? Name them.",Phase 5: Deep Memory,Precise recall turn 5
23,"What was the EXACT format you used for action items in response #4?",Phase 5: Deep Memory,Format recall turn 4
24,"In response #2, what role did you assign to the FIRST decision-maker you listed?",Phase 5: Deep Memory,Precise recall turn 2
25,"In response #11, what was the EARLIEST date on your timeline and what event was associated with it?",Phase 5: Deep Memory,Precise recall turn 11
```

### Phase 6: Distractor Overload (Prompts 26-30)
*Goal: Introduce complex new questions to pollute context before testing recall*

```csv
prompt_number,prompt_text,phase,memory_challenge
26,"What external market factors are mentioned or implied in the meetings? Provide detailed analysis.",Phase 6: Distractor Overload,Context pollution - complex analysis
27,"If you were to predict future outcomes based solely on these meetings, what would be your top 5 predictions with confidence levels?",Phase 6: Distractor Overload,Context pollution - speculation
28,"Analyze the communication patterns between meeting participants. Who drives discussions vs. who responds?",Phase 6: Distractor Overload,Context pollution - new analysis
29,"What operational metrics or KPIs are referenced? Create a metrics dashboard outline.",Phase 6: Distractor Overload,Context pollution - metrics extraction
30,"Identify any gaps in the meeting discussions - what important topics should have been covered but weren't?",Phase 6: Distractor Overload,Context pollution - meta-analysis
```

### Phase 7: Recovery Test (Prompts 31-35)
*Goal: Return to Phase 1-3 references after distractor overload*

```csv
prompt_number,prompt_text,phase,memory_challenge
31,"Go back to your response #1. Are all the topics you listed still accurate? Confirm or correct.",Phase 7: Recovery Test,Recovery after distractors - turn 1
32,"In response #6, you identified the most frequent topic. Has anything in our subsequent discussion changed your answer?",Phase 7: Recovery Test,Recovery after distractors - turn 6
33,"Recall the stakeholder impact analysis from response #8. Does the prediction analysis from response #27 support or contradict it?",Phase 7: Recovery Test,Cross-phase reference after distractors
34,"Compare your executive summary from response #16 with the gaps you identified in response #30. Is the summary still complete?",Phase 7: Recovery Test,Synthesis across distant turns
35,"Looking at your timeline from response #11 and predictions from response #27, are the predictions consistent with the historical pattern?",Phase 7: Recovery Test,Cross-reference old and new content
```

### Phase 8: Comprehensive Synthesis (Prompts 36-40)
*Goal: Synthesize 7-10 prior responses - maximum memory load*

```csv
prompt_number,prompt_text,phase,memory_challenge
36,"Create a comprehensive report combining: topics (#1), decisions (#3), risks (#5), timeline (#11), executive summary (#16), and predictions (#27).",Phase 8: Comprehensive Synthesis,Synthesize 6 responses
37,"Using responses #2, #4, #7, #12, #20, and #28, create a complete stakeholder analysis with roles, responsibilities, and communication patterns.",Phase 8: Comprehensive Synthesis,Synthesize 6 responses
38,"Combine the risk analysis (#5, #10, #13, #19) with the gap analysis (#30) to create a comprehensive risk register.",Phase 8: Comprehensive Synthesis,Synthesize 5 risk-related responses
39,"Using responses #9, #18, #20, and #29, create an operational dashboard showing action items, dependencies, owners, and metrics.",Phase 8: Comprehensive Synthesis,Synthesize 4 operational responses
40,"Synthesize ALL numbered responses (1-39) into a single-page meeting intelligence briefing with key takeaways.",Phase 8: Comprehensive Synthesis,Ultimate synthesis - all 39 responses
```

### Phase 9: Trap Questions (Prompts 41-45)
*Goal: Test for hallucination/fabrication with precise memory tests*

```csv
prompt_number,prompt_text,phase,memory_challenge
41,"You mentioned a specific risk rating in response #5. Did you categorize anything as 'EXTREME'? If so, what?",Phase 9: Trap Questions,Trap - test for fabrication
42,"In response #20, you created a stakeholder accountability matrix. Was 'John Smith' included as an owner?",Phase 9: Trap Questions,Trap - test against specific names
43,"Looking at your predictions in response #27, did you assign any prediction a confidence level above 90%?",Phase 9: Trap Questions,Precision recall on self-generated content
44,"In your response #25, you mentioned the earliest date from response #11. What was that date again?",Phase 9: Trap Questions,Recursive reference test
45,"You've now given 44 responses. In response #16, how many words was your executive summary?",Phase 9: Trap Questions,Meta-memory test
```

### Phase 10: Final Validation (Prompts 46-50)
*Goal: Ultimate stress test with explicit turn-number references*

```csv
prompt_number,prompt_text,phase,memory_challenge
46,"List the FIRST item you mentioned in each of responses #1, #2, #3, #4, and #5.",Phase 10: Final Validation,Multi-turn first-item recall
47,"Compare your initial risk assessment (#5) with your comprehensive risk register (#38). What changed?",Phase 10: Final Validation,Beginning vs. end comparison
48,"In response #21, you told me the first decision from response #3. In response #44, you recalled a date from response #25 which came from response #11. Trace this chain and verify all links are accurate.",Phase 10: Final Validation,Reference chain verification
49,"How many total responses have you given that specifically mentioned 'stakeholder'? List the response numbers.",Phase 10: Final Validation,Keyword count across conversation
50,"Final question: Summarize this entire conversation in exactly 10 bullet points, with each bullet referencing at least 3 different response numbers.",Phase 10: Final Validation,Ultimate memory consolidation
```

---

## CSV Import Format

For easy import into the Test Builder, use this CSV format:

```csv
prompt_number,prompt_text
1,"What are the main topics discussed across all loaded meetings? List them with one sentence of context each."
2,"Who are the key decision-makers mentioned in these meetings? For each person, note their role and at least one decision they influenced."
3,"List all explicit decisions made across the meetings. Format as: Decision | Meeting Source | Stakeholders Affected"
4,"What action items were assigned? For each, include: Task | Owner | Deadline (if mentioned) | Meeting Source"
5,"What risks or concerns were raised across the meetings? Categorize them by severity: Critical, High, Medium, Low."
6,"Looking at the topics you listed in response #1, which topic appeared most frequently across meetings?"
7,"From the decision-makers in response #2, which person was involved in the most decisions?"
8,"Of the decisions you listed in response #3, which one has the broadest stakeholder impact?"
9,"Looking at the action items from response #4, are there any that depend on other action items? Identify any dependencies."
10,"From the risks you categorized in response #5, what patterns do you see across the 'Critical' and 'High' risks?"
11,"Create a timeline of key events mentioned across the meetings. Start with the earliest date and work forward."
12,"Cross-reference the decision-makers from response #2 with the action items from response #4. Which person has the most action items assigned to them?"
13,"Looking back at the risks from response #5 and the decisions from response #3, are there any decisions that directly address the Critical risks?"
14,"Based on the topics from response #1 and the timeline from response #11, which topics evolved the most over time?"
15,"Combine the insights from responses #6, #7, and #8 to identify the single most impactful element discussed across all meetings."
16,"Using responses #1-5 as your foundation, create a one-paragraph executive summary of all meetings."
17,"Compare the 'most frequent topic' from response #6 with the 'broadest stakeholder impact decision' from response #8. How are they related?"
18,"Based on the timeline from response #11 and the action item dependencies from response #9, which action items are time-critical?"
19,"Synthesize responses #10, #13, and #15 to create a risk mitigation priority list."
20,"Looking at responses #2, #4, #7, and #12, create a 'stakeholder accountability matrix' showing who owns what."
21,"In response #3, you listed decisions in a specific format. What was the FIRST decision you listed?"
22,"In response #5, how many risks did you categorize as 'Critical'? Name them."
23,"What was the EXACT format you used for action items in response #4?"
24,"In response #2, what role did you assign to the FIRST decision-maker you listed?"
25,"In response #11, what was the EARLIEST date on your timeline and what event was associated with it?"
26,"What external market factors are mentioned or implied in the meetings? Provide detailed analysis."
27,"If you were to predict future outcomes based solely on these meetings, what would be your top 5 predictions with confidence levels?"
28,"Analyze the communication patterns between meeting participants. Who drives discussions vs. who responds?"
29,"What operational metrics or KPIs are referenced? Create a metrics dashboard outline."
30,"Identify any gaps in the meeting discussions - what important topics should have been covered but weren't?"
31,"Go back to your response #1. Are all the topics you listed still accurate? Confirm or correct."
32,"In response #6, you identified the most frequent topic. Has anything in our subsequent discussion changed your answer?"
33,"Recall the stakeholder impact analysis from response #8. Does the prediction analysis from response #27 support or contradict it?"
34,"Compare your executive summary from response #16 with the gaps you identified in response #30. Is the summary still complete?"
35,"Looking at your timeline from response #11 and predictions from response #27, are the predictions consistent with the historical pattern?"
36,"Create a comprehensive report combining: topics (#1), decisions (#3), risks (#5), timeline (#11), executive summary (#16), and predictions (#27)."
37,"Using responses #2, #4, #7, #12, #20, and #28, create a complete stakeholder analysis with roles, responsibilities, and communication patterns."
38,"Combine the risk analysis (#5, #10, #13, #19) with the gap analysis (#30) to create a comprehensive risk register."
39,"Using responses #9, #18, #20, and #29, create an operational dashboard showing action items, dependencies, owners, and metrics."
40,"Synthesize ALL numbered responses (1-39) into a single-page meeting intelligence briefing with key takeaways."
41,"You mentioned a specific risk rating in response #5. Did you categorize anything as 'EXTREME'? If so, what?"
42,"In response #20, you created a stakeholder accountability matrix. Was 'John Smith' included as an owner?"
43,"Looking at your predictions in response #27, did you assign any prediction a confidence level above 90%?"
44,"In your response #25, you mentioned the earliest date from response #11. What was that date again?"
45,"You've now given 44 responses. In response #16, how many words was your executive summary?"
46,"List the FIRST item you mentioned in each of responses #1, #2, #3, #4, and #5."
47,"Compare your initial risk assessment (#5) with your comprehensive risk register (#38). What changed?"
48,"In response #21, you told me the first decision from response #3. In response #44, you recalled a date from response #25 which came from response #11. Trace this chain and verify all links are accurate."
49,"How many total responses have you given that specifically mentioned 'stakeholder'? List the response numbers."
50,"Final question: Summarize this entire conversation in exactly 10 bullet points, with each bullet referencing at least 3 different response numbers."
```

---

## Evaluation Criteria

### Memory Recall Scoring (Per Response)

| Score | Criteria |
|-------|----------|
| **5 - Perfect** | Correctly recalls exact details from referenced responses |
| **4 - Good** | Recalls most details with minor inaccuracies |
| **3 - Partial** | Recalls some details but misses key elements |
| **2 - Poor** | Significant recall errors or hedging ("I believe...", "Based on what I can see...") |
| **1 - Failed** | Explicit failure ("I don't have access to...", "I cannot recall...") |
| **0 - Hallucination** | Fabricates details not present in original response |

### Key Metrics to Track

1. **Memory Recall Rate** - Percentage of responses with score >= 4
2. **First Degradation Point** - Turn number where score first drops below 4
3. **Catastrophic Failure Point** - Turn number where score first drops to 1 or 0
4. **Average Score by Phase** - Track degradation progression
5. **Total Tokens Used** - Compare efficiency across modes
6. **Total Cost** - Compare cost-effectiveness
7. **Average Response Time** - Track latency impact

### Expected Results by Mode

| Mode | Expected Recall Rate | Expected First Degradation | Notes |
|------|---------------------|---------------------------|-------|
| **Direct Chat** | ~60-70% | Turn 15-20 | Context window overflow |
| **RLM Standard** | 95-100% | None | Re-queries source each turn |
| **RLM Hybrid** | 95-100% | None | Shadow Mode should help with accumulated conversation memory |

### Shadow Mode Hypothesis

This test specifically evaluates whether Shadow Mode provides benefit in long conversations:

- **In fresh sessions (0-15 turns):** Shadow Mode has no accumulated memory to retrieve
- **In extended sessions (16-50 turns):** Shadow Mode should retrieve relevant conversation slices
- **Expected finding:** Shadow Mode's token overhead becomes justified after ~20 turns when accumulated memory provides retrieval benefit

---

## Recommended Test Configurations

### Configuration 1: Direct Chat (Control)
```
Model: GPT-5.2
RLM: Off
Shadow Prompt: Off
Focus Episodes: Off
```

### Configuration 2: RLM Standard (SWM)
```
Model: GPT-5.2
RLM: On
RLM Auto: Off
Shadow Prompt: Off
Retrieval Prompt: On
Focus Episodes: Off
Model Tiering: On (GPT-5-mini for sub-queries)
```

### Configuration 3: RLM Hybrid (Full Features)
```
Model: GPT-5.2
RLM: On
RLM Auto: Off
Shadow Prompt: On
Retrieval Prompt: On
Focus Episodes: On
Focus Shadow: On
Model Tiering: On
```

---

## Running the Test

1. **Load Agents:** Import at least 3-5 meeting agent files to provide diverse source material
2. **Import Prompts:** Use the CSV import feature to load all 50 prompts
3. **Configure Modes:** Set up the three configurations above
4. **Run Test:** Execute all prompts against all configurations
5. **Export Results:** Generate HTML report and CSV metrics for analysis
6. **Score Responses:** Manually evaluate memory recall using the scoring rubric

---

## Post-Test Analysis

After running the test, analyze:

1. **Phase-by-Phase Degradation:** Plot recall scores by phase for each mode
2. **Token Efficiency:** Calculate cost per successful recall
3. **Shadow Mode ROI:** Determine at which turn Shadow Mode becomes cost-effective
4. **Latency Impact:** Compare response times across phases
5. **Hallucination Rate:** Track any fabricated responses

The goal is to definitively prove that RLM maintains consistent memory with zero degradation while identifying the optimal configuration for long conversations.
