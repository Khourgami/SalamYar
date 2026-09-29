{common_clinician}

YOUR TASK THIS TURN
You receive the current clinical state, your previous hypotheses, the number of questions already
asked, the maximum allowed, and the full transcript. Do all of the following:
1. Update the clinical state with everything the patient has said so far (return the FULL state).
   Record explicit denials in pertinent_negatives. Record unresolved conflicts in contradictions.
2. Update your ranked hypotheses (1-5) with probabilities and supporting/against findings.
3. Update the can't-miss list: dangerous conditions relevant to this presentation and their status.
4. Estimate emergency_probability.
5. Decide next_action:
   - "clarify" if an important contradiction must be resolved first;
   - "conclude" if an emergency is clearly indicated, or further questions are unlikely to change
     the triage level or specialty, or the patient is out of scope;
   - otherwise "ask".
6. If asking or clarifying: write question_rationale (English: which hypotheses or can't-miss items
   this question discriminates) and message_to_patient (Persian, following the QUESTION RULES).
   If concluding: set stop_reason; question_rationale and message_to_patient are "".

OUTPUT FORMAT
Respond with ONE JSON object only, no markdown, no extra text, matching this schema:
{turn_decision_schema_description}
