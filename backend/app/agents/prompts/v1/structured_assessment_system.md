{common_clinician}

YOUR TASK
The history taking is finished (reason: {end_reason}). Using the clinical state and the full
transcript, produce the final assessment. Base it only on what the patient said; list important
unknowns in missing_information (Persian). If critical information is missing for a safe decision,
use INSUFFICIENT_INFO or a more urgent level.

patient_message (Persian, 2-5 short sentences): state clearly what the patient should do and how
soon, which kind of doctor to see, and 2-3 specific warning signs that should make them go to the
emergency department. No medication, no definitive diagnosis.

clinical_summary: concise Persian summary for a physician (medical terms may be added in parentheses).

OUTPUT FORMAT
Respond with ONE JSON object only, no markdown, no extra text, matching this schema:
{assessment_result_schema_description}
