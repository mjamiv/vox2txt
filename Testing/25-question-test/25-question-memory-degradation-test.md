================================================================================
MEMORY DEGRADATION TEST PROMPTS
For northstar.LM Agent Orchestrator
================================================================================

PURPOSE:
These prompts are designed to test context retention in long conversations.
Direct Chat mode must maintain full context in a single window, while RLM modes
use map-reduce to query agents individually. As conversation length increases,
Direct Chat should show degradation (missed details, contradictions,
forgotten earlier responses) while RLM modes should maintain quality.

TEST SETUP:
- Load 5 agents with substantial content (meeting transcripts, documents)
- Run prompts sequentially in a single conversation
- Compare responses between Direct Chat and RLM modes
- Look for: missed details, forgotten context, contradictions, incomplete answers

================================================================================
PHASE 1: BASELINE QUESTIONS (Establish Context)
================================================================================

1. "What are the main topics discussed across all the meetings?"
   PURPOSE: Establishes baseline understanding, creates initial context

2. "List the key participants mentioned in each meeting and their roles."
   PURPOSE: Tests initial recall, creates names/roles to reference later

3. "What were the 3 most important decisions made, and in which meetings?"
   PURPOSE: Creates specific facts to test recall against later

4. "Summarize the action items from each meeting."
   PURPOSE: Generates structured data for cross-reference testing

5. "What concerns or risks were raised? Group them by category."
   PURPOSE: Creates categorized information for later probing

================================================================================
PHASE 2: FOLLOW-UP QUESTIONS (Test Immediate Recall)
================================================================================

6. "You mentioned a few participants earlier - what specific contributions did they make?"
   PURPOSE: Tests recall of earlier response content

7. "Going back to decision #2 you listed - what was the context around it?"
   PURPOSE: Tests ability to reference own previous structured output

8. "Which risks you identified earlier are related to the action items?"
   PURPOSE: Tests cross-referencing between two previous responses

9. "Are there any contradictions between what different meetings concluded?"
   PURPOSE: Tests analytical capability across retained context

10. "Based on the topics and decisions you summarized, what's the overall narrative?"
    PURPOSE: Tests synthesis of accumulated context

================================================================================
PHASE 3: DEEP REFERENCE QUESTIONS (Test Extended Memory)
================================================================================

11. "In your first response about main topics - you mentioned [TOPIC].
    How does that connect to the risks you identified in response 5?"
    PURPOSE: Forces recall of response #1 content (now 10 turns ago)

12. "Compare the action items from the first and last meetings. What evolved?"
    PURPOSE: Tests both source agent recall AND earlier response recall

13. "You listed participants earlier. Which ones appear in multiple meetings?"
    PURPOSE: Tests recall of response #2 (participant list)

14. "Revisit the decisions from question 3. Have any of them been contradicted
    by information in subsequent responses?"
    PURPOSE: Tests coherent recall across full conversation

15. "Create a timeline combining: key decisions, action items, and risks."
    PURPOSE: Requires synthesizing responses #3, #4, and #5

================================================================================
PHASE 4: STRESS TEST (Maximum Context Load)
================================================================================

16. "Now add more context: What were the specific dates mentioned in each meeting?"
    PURPOSE: Adds new detailed information layer

17. "Cross-reference: Which participants were assigned which action items?"
    PURPOSE: Requires combining responses #2 and #4

18. "What topics from response #1 were NOT addressed in any action items?"
    PURPOSE: Gap analysis requiring recall of both responses

19. "Identify any participants mentioned in response #2 who never appeared in
    the risk discussions from response #5."
    PURPOSE: Set difference operation across old responses

20. "Create a comprehensive summary that includes:
    - All topics from response #1
    - Key participants from response #2
    - Decisions from response #3
    - Action items from response #4
    - Risks from response #5
    - Any contradictions from response #9
    - The timeline from response #15"
    PURPOSE: Ultimate memory stress test - requires recalling 7 prior responses

================================================================================
PHASE 5: TRAP QUESTIONS (Detect Hallucination/Confusion)
================================================================================

21. "In response #7, you mentioned the context around decision #2.
    Did that context include any budget figures?"
    PURPOSE: Tests accurate recall vs. fabrication

22. "Were there any action items you listed that had no owner assigned?"
    PURPOSE: Tests precise recall of structured data

23. "You mentioned risks in response #5. Which one did you categorize as
    'high priority'? Or did you use a different categorization?"
    PURPOSE: Tests recall of own output structure

24. "Going back to your timeline in response #15 - what was the earliest date
    and what event was associated with it?"
    PURPOSE: Tests recall of synthesized content

25. "Looking at all your responses: did you ever change your mind or
    provide conflicting information about any topic?"
    PURPOSE: Self-consistency check across full context

================================================================================
MEASUREMENT CRITERIA
================================================================================

For each response, evaluate:

1. COMPLETENESS (1-5)
   - Does the answer address all parts of the question?
   - Are there gaps or missing elements?

2. ACCURACY (1-5)
   - Does it correctly recall information from earlier responses?
   - Are there factual errors or contradictions?

3. COHERENCE (1-5)
   - Is the response logically connected to the conversation history?
   - Does it show awareness of what was said before?

4. SOURCE ATTRIBUTION (1-5)
   - Does it correctly identify which meeting/agent information came from?
   - Does it reference its own prior responses accurately?

5. DEGRADATION INDICATORS:
   - Vague references to "earlier" without specifics
   - Contradictions with prior responses
   - "I don't recall" or "I'm not sure" hedging
   - Generic responses that don't use conversation context
   - Hallucinated details not in source material or prior responses

================================================================================
EXPECTED OUTCOMES
================================================================================

DIRECT CHAT (expected to degrade):
- Phase 1-2: High quality (context fits in window)
- Phase 3: Moderate degradation (older context pushed out)
- Phase 4-5: Significant degradation (cannot recall early responses)

RLM MODES (expected to maintain quality):
- All phases: Consistent quality
- Map-reduce re-queries agents each time
- No accumulated context window pressure
- May show slight format variations but content accuracy maintained

KEY METRICS TO TRACK:
- Token count per response
- Time per response
- Accuracy score (manual evaluation)
- Number of "I don't recall" or hedging statements
- Contradictions with earlier responses
- Hallucinated vs. accurate details

================================================================================
NOTES FOR TESTER
================================================================================

1. Run the SAME prompts against both Direct Chat and RLM+SWM in parallel sessions

2. Document the exact responses - don't rely on memory

3. Pay special attention to Phase 3-5 questions where degradation should appear

4. The trap questions in Phase 5 are designed to catch fabrication -
   the model shouldn't have mentioned budget figures unless the source did

5. Consider adding domain-specific questions based on your actual agent content

6. For longer tests, you can double the question count by inserting
   "Now provide more detail on..." follow-ups between phases

================================================================================
