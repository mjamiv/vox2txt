# Tomorrow's Plan - January 20, 2026

## Priority 1: Testing Strategy Revision (Human Task)

**Task**: Go back to running with 5-10 agents and revise testing strategy.

### Why This Matters
Run-7 results showed that with 23 agents loaded, the RLM only queries 5 agents (21% coverage). While this achieves 73% cost savings, comprehensive summary queries may miss important context from the other 18 agents.

### Recommended Approach
1. **Reduce agent count to 5-10 agents** for testing
   - This ensures each sub-query covers a meaningful portion of the knowledge base
   - With 5 agents: 5 sub-queries = 100% coverage
   - With 10 agents: 5 sub-queries = 50% coverage (then "Go Deeper" for full)

2. **Select diverse meeting types** for the test set
   - Include different meeting categories (planning, review, sync, decision)
   - Ensure some overlap in topics for cross-meeting analysis testing

3. **Re-run the 7-prompt test suite** with reduced agent count
   - Compare quality metrics to run-7
   - Verify "Go Deeper" functionality reaches 100% coverage

---

## Priority 2: Potential Code Improvements (Based on Run-7 Analysis)

### Consider for Future Sprints

| Issue | Current Behavior | Potential Fix |
|-------|-----------------|---------------|
| Summary queries get limited coverage | 5 of 23 agents queried | Auto-detect "full-scope" summaries and use higher default depth |
| "Go Deeper" requires manual clicks | User must click multiple times | Add "Query All" option for known comprehensive queries |
| Method column shows "RLM" generically | Can't distinguish RLM variants in CSV | Add sub-method indicator (Hybrid vs Standard) |

### Quality Observations from Run-7

**RLM Strengths** (keep as-is):
- Aggregative queries ("blockers across meetings") - excellent synthesis
- Analytical queries ("risks showing up") - good pattern detection
- Cost efficiency - 73% savings vs Direct Chat

**RLM Gaps** (needs work):
- Comprehensive summaries - only 5/23 agents queried
- Q3/Q4 specific queries - may miss relevant agents outside top-5 retrieval

---

## Verification Checklist

After re-running tests with 5-10 agents:

- [ ] RLM cost savings maintained (~70%+)
- [ ] Quality scores comparable to Direct Chat
- [ ] "Go Deeper" reaches 100% agent coverage
- [ ] Response column in CSV shows actual text (not `[object Object]`)
- [ ] Depth controls render correctly in UI

---

## Notes

- Current branch: `enhance-csv-method-column`
- Last successful run: run-7 (with CSV fix applied)
- Test files location: `Test Results/run-7-milestone-end-try3/`
