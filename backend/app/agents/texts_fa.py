"""Fixed Persian texts (AGENT_SPEC §2.1–§2.3). Copied verbatim; do not edit."""

from app.agents.clinical_schemas import Specialty, TriageLevel

GREETING_FA = "سلام، وقت\u200cتون بخیر. من پزشک مجازی تریاژ هستم. لطفاً بفرمایید چه مشکلی دارید و از کی شروع شده؟"
EMERGENCY_TEMPLATE_FA = "با توجه به علائمی که گفتید، ممکن است وضعیت شما اورژانسی باشد. لطفاً همین حالا با اورژانس ۱۱۵ تماس بگیرید یا به نزدیک\u200cترین اورژانس بروید. اگر تنها هستید، از یک نفر کمک بخواهید."
DISCLAIMER_FA = "این پیام جایگزین معاینه پزشک نیست. اگر حالتان بدتر شد یا علامت جدیدی پیدا کردید، فوراً به پزشک یا اورژانس مراجعه کنید."
ERROR_FA = "متأسفانه در پردازش پیام مشکلی پیش آمد. لطفاً پیام خود را دوباره ارسال کنید."

TRIAGE_LABELS_FA: dict[TriageLevel, str] = {
    TriageLevel.EMERGENCY_NOW: "اورژانسی — همین حالا با ۱۱۵ تماس بگیرید یا به نزدیک\u200cترین اورژانس بروید",
    TriageLevel.URGENT_24H: "فوری — امروز و حداکثر ظرف ۲۴ ساعت پزشک را ببینید",
    TriageLevel.ROUTINE_DAYS: "غیرفوری — ظرف چند روز آینده به پزشک مراجعه کنید",
    TriageLevel.SELF_CARE: "مراقبت در منزل — با توجه به علائم هشدار برای مراجعه",
    TriageLevel.INSUFFICIENT_INFO: "اطلاعات کافی برای ارزیابی نیست — لطفاً با پزشک مشورت کنید",
}

SPECIALTY_LABELS_FA: dict[Specialty, str] = {
    Specialty.general_practice: "پزشک عمومی",
    Specialty.emergency_medicine: "طب اورژانس",
    Specialty.internal_medicine: "داخلی",
    Specialty.cardiology: "قلب و عروق",
    Specialty.gastroenterology: "گوارش و کبد",
    Specialty.pulmonology: "ریه",
    Specialty.neurology: "مغز و اعصاب",
    Specialty.infectious_disease: "عفونی",
    Specialty.nephrology: "کلیه",
    Specialty.urology: "اورولوژی",
    Specialty.obstetrics_gynecology: "زنان و زایمان",
    Specialty.general_surgery: "جراحی عمومی",
    Specialty.orthopedics: "ارتوپدی",
    Specialty.dermatology: "پوست",
    Specialty.ent: "گوش و حلق و بینی",
    Specialty.ophthalmology: "چشم",
    Specialty.psychiatry: "روان\u200cپزشکی",
    Specialty.endocrinology: "غدد و متابولیسم",
    Specialty.rheumatology: "روماتولوژی",
    Specialty.hematology_oncology: "خون و سرطان",
    Specialty.pediatrics: "کودکان",
}
