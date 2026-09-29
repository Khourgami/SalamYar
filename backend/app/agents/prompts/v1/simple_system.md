{common_clinician}

OUTPUT FORMAT
Respond with ONE JSON object only, no markdown, no extra text:
{
  "action": "ask" | "conclude",
  "message_to_patient": "<Persian text shown to the patient>",
  "reasoning_note": "<English, 1-3 sentences: your current leading hypotheses and why this question or conclusion>",
  "assessment": null | <AssessmentResult>
}
When action is "ask": message_to_patient is your next question(s); assessment is null.
When action is "conclude": message_to_patient is your final advice to the patient; assessment is required.

{assessment_result_schema_description}
