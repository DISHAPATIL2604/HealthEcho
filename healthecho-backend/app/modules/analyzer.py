import json
from typing import Any

import httpx

from app.core.config import settings

DISCLAIMER = "This system provides AI-based health assessment and is not a substitute for professional medical advice."

REFERENCE_RANGES: dict[str, tuple[float, float, str]] = {
    "Hemoglobin": (12.0, 16.0, "12-16 g/dL"),
    "WBC": (4.0, 11.0, "4.0-11.0 x10^3/uL"),
    "RBC": (4.0, 5.5, "4.0-5.5 x10^6/uL"),
    "Platelets": (150.0, 450.0, "150-450 x10^3/uL"),
    "Glucose": (70.0, 99.0, "70-99 mg/dL (fasting)"),
    "Cholesterol": (0.0, 200.0, "<200 mg/dL"),
    "TSH": (0.4, 4.5, "0.4-4.5 uIU/mL"),
    "Creatinine": (0.6, 1.3, "0.6-1.3 mg/dL"),
    "Vitamin D": (20.0, 50.0, "20-50 ng/mL"),
    "Iron": (60.0, 170.0, "60-170 ug/dL"),
}

SYSTEM_PROMPT = """
Use pretrained medical reasoning plus provided input data.
Do not fabricate lab values.
Do not provide medical diagnosis.
Use only risk-based language.
Return strict JSON only.
""".strip()


def _llm_generate(prompt: str) -> str:
    timeout_seconds = min(settings.ollama_timeout_seconds, settings.llm_fast_timeout_seconds)

    provider = (settings.llm_provider or "ollama").strip().lower()
    if provider == "gemini":
        if not settings.gemini_api_key:
            return ""
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2},
        }
        endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent"
        )
        try:
            with httpx.Client(timeout=timeout_seconds) as client:
                response = client.post(
                    endpoint,
                    params={"key": settings.gemini_api_key},
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
            candidates = data.get("candidates", [])
            if not candidates:
                return ""
            parts = candidates[0].get("content", {}).get("parts", [])
            if not parts:
                return ""
            return str(parts[0].get("text", "")).strip()
        except Exception:
            return ""

    payload = {"model": settings.ollama_model, "prompt": prompt, "stream": False}
    try:
        with httpx.Client(timeout=timeout_seconds) as client:
            response = client.post(f"{settings.ollama_base_url}/api/generate", json=payload)
            response.raise_for_status()
            data = response.json()
        return str(data.get("response", "")).strip()
    except Exception:
        return ""


def _safe_json(text: str) -> dict[str, Any]:
    text = text.strip()
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}


def _condition(rule: str, risk: str, reason: str) -> dict[str, str]:
    return {"condition": rule, "risk_level": risk, "reason": reason}


def _evidence_sources(context_chunks: list[dict[str, Any]]) -> list[str]:
    sources = [str(item.get("source", "unknown")) for item in context_chunks if item.get("source")]
    return list(dict.fromkeys(sources))


def _evidence_summary(context_chunks: list[dict[str, Any]]) -> str:
    if not context_chunks:
        return "No external medical context was retrieved for this run."
    sources = _evidence_sources(context_chunks)
    return f"Recommendations are supported by retrieved references from: {', '.join(sources[:5])}."


def _status_for_value(marker: str, value: float) -> tuple[str, str]:
    ref = REFERENCE_RANGES.get(marker)
    if not ref:
        return "Unknown", "No standard range configured in this build."

    low, high, _ = ref
    if marker == "Cholesterol":
        if value > high:
            return "High", "Higher cholesterol can raise cardiovascular risk indication."
        return "Normal", "Value is within common reference threshold."

    if value < low:
        return "Low", f"{marker} below reference range may indicate related deficiency or physiologic stress."
    if value > high:
        return "High", f"{marker} above reference range may indicate metabolic, endocrine, inflammatory, or organ stress risk."
    return "Normal", "Value is within common reference range."


def _interpreted_values(lab_values: dict[str, float | None]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for marker, value in lab_values.items():
        if value is None:
            continue
        status, explanation = _status_for_value(marker, float(value))
        normal_range = REFERENCE_RANGES.get(marker, (0.0, 0.0, "not_available"))[2]
        out[marker] = {
            "value": float(value),
            "normal_range": normal_range,
            "status": status,
            "explanation": explanation,
        }
    return out


def _conditions_from_labs(
    interpreted: dict[str, dict[str, Any]], lab_values: dict[str, float | None]
) -> list[dict[str, str]]:
    conditions: list[dict[str, str]] = []

    hb = interpreted.get("Hemoglobin", {})
    glucose = interpreted.get("Glucose", {})
    tsh = interpreted.get("TSH", {})
    creatinine = interpreted.get("Creatinine", {})
    vitamin_d = interpreted.get("Vitamin D", {})
    iron = interpreted.get("Iron", {})
    cholesterol = interpreted.get("Cholesterol", {})

    if hb.get("status") == "Low" or iron.get("status") == "Low":
        conditions.append(_condition("Anemia risk indication", "Moderate", "Low hemoglobin or low iron pattern can align with anemia-related risk."))
    if glucose.get("status") == "High":
        conditions.append(_condition("Glucose imbalance risk indication", "High", "Elevated glucose can align with glucose dysregulation risk pattern."))
    tsh_value = lab_values.get("TSH")
    if tsh.get("status") in {"Low", "High"}:
        if tsh_value is not None and tsh_value >= 10:
            conditions.append(
                _condition(
                    "Thyroid regulation risk indication",
                    "High",
                    "TSH is markedly above common reference range, which may indicate higher thyroid regulation risk and needs prompt endocrine review.",
                )
            )
        else:
            conditions.append(
                _condition(
                    "Thyroid regulation risk indication",
                    "Moderate",
                    "TSH outside reference range may indicate thyroid function imbalance risk.",
                )
            )
    if creatinine.get("status") == "High":
        conditions.append(_condition("Kidney function risk indication", "High", "Higher creatinine can indicate kidney filtration stress risk."))
    if vitamin_d.get("status") == "Low":
        conditions.append(_condition("Vitamin D deficiency risk indication", "Low", "Low vitamin D may be associated with bone and immune health risk."))
    if cholesterol.get("status") == "High":
        conditions.append(_condition("Cardiometabolic risk indication", "Moderate", "Higher cholesterol may increase cardiovascular risk indication."))

    return conditions


def _symptom_mode(raw_text: str, context_chunks: list[dict[str, Any]]) -> dict[str, Any]:
    text = (raw_text or "").lower()
    keywords = [
        "fatigue",
        "tired",
        "weakness",
        "headache",
        "dizziness",
        "fever",
        "rash",
        "nausea",
        "vomiting",
        "stomach pain",
        "diarrhea",
        "constipation",
        "thirst",
        "frequent urination",
    ]
    hits = [k for k in keywords if k in text]
    symptoms_summary = ", ".join(dict.fromkeys(hits))

    predicted: list[dict[str, str]] = []
    tests: list[str] = []
    diet: list[str] = [
        "Maintain balanced meals with adequate hydration",
        "Reduce highly processed foods and added sugar",
        "Prefer whole grains, vegetables, and lean protein",
    ]
    lifestyle: list[str] = [
        "Maintain sleep routine (7-8 hours)",
        "Track symptoms daily with timing and triggers",
        "Avoid self-medication without clinician guidance",
    ]
    precautions: list[str] = []

    if any(k in text for k in ["fever", "rash", "weakness"]):
        predicted.append(_condition("Infection or inflammation risk indication", "Moderate", "Fever/rash/weakness combination can align with inflammatory or infectious risk patterns."))
        tests.extend(["CBC with differential", "CRP", "ESR"])
    if any(k in text for k in ["tired", "fatigue", "dizziness"]):
        predicted.append(_condition("Anemia or micronutrient deficiency risk indication", "Moderate", "Fatigue and dizziness may align with low oxygen-carrying capacity or nutrient deficits."))
        tests.extend(["CBC", "Ferritin", "Iron profile", "Vitamin B12", "Vitamin D"])
    if any(k in text for k in ["thirst", "frequent urination"]):
        predicted.append(_condition("Glucose regulation risk indication", "Moderate", "Excess thirst and frequent urination can align with glucose imbalance risk."))
        tests.extend(["Fasting glucose", "HbA1c"])
    if any(k in text for k in ["headache", "dizziness"]):
        predicted.append(_condition("Hydration/electrolyte imbalance risk indication", "Low", "Headache and dizziness can be associated with hydration or electrolyte imbalance risk patterns."))
        tests.extend(["Serum electrolytes", "Basic metabolic panel"])

    emergency = any(k in text for k in ["chest pain", "fainting", "shortness of breath", "confusion", "seizure", "unconscious"])
    if emergency:
        precautions.append("Emergency warning signs detected. Seek immediate medical consultation.")

    if not hits:
        return {
            "mode": "symptom_text",
            "interpreted_lab_values": {},
            "symptoms_summary": "",
            "predicted_conditions": [],
            "risk_level": "Low",
            "recommended_tests": ["CBC with differential"],
            "diet_recommendations": diet,
            "lifestyle_changes": lifestyle,
            "clinical_explanation": "insufficient data to make prediction",
            "doctor_specialist": "General Physician",
            "confidence_level": "Low",
            "symptom_insights": [],
            "suggested_blood_tests": ["CBC with differential"],
            "precautions": precautions,
            "evidence_sources": _evidence_sources(context_chunks),
            "evidence_summary": _evidence_summary(context_chunks),
            "disclaimer": DISCLAIMER,
        }

    risk_order = {"Low": 1, "Moderate": 2, "High": 3}
    risk = "Low"
    for c in predicted:
        if risk_order[c["risk_level"]] > risk_order[risk]:
            risk = c["risk_level"]

    if not predicted:
        predicted = [
            _condition(
                "Non-specific symptom risk indication",
                "Low",
                "Symptoms are not specific enough for a confident pattern. Blood tests are recommended for objective assessment.",
            )
        ]

    tests = list(dict.fromkeys(tests or ["CBC with differential", "CRP", "Basic metabolic panel"]))
    explanation = (
        "Symptoms were grouped into risk patterns and mapped to objective blood tests to reduce uncertainty. "
        "Because symptom-only input is non-specific, laboratory confirmation is recommended."
    )

    return {
        "mode": "symptom_text",
        "interpreted_lab_values": {},
        "symptoms_summary": symptoms_summary,
        "predicted_conditions": predicted,
        "risk_level": risk,
        "recommended_tests": tests,
        "diet_recommendations": list(dict.fromkeys(diet)),
        "lifestyle_changes": list(dict.fromkeys(lifestyle)),
        "clinical_explanation": explanation,
        "doctor_specialist": "General Physician",
        "confidence_level": "Low" if len(hits) < 2 else "Medium",
        "symptom_insights": [f"Detected symptoms: {symptoms_summary}"] if symptoms_summary else [],
        "suggested_blood_tests": tests,
        "precautions": precautions,
        "evidence_sources": _evidence_sources(context_chunks),
        "evidence_summary": _evidence_summary(context_chunks),
        "disclaimer": DISCLAIMER,
    }


def _report_mode(lab_values: dict[str, float | None], context_chunks: list[dict[str, Any]]) -> dict[str, Any]:
    interpreted = _interpreted_values(lab_values)
    conditions = _conditions_from_labs(interpreted, lab_values)

    tests: list[str] = []
    diet: list[str] = [
        "Maintain balanced nutrition with adequate protein and vegetables",
        "Stay hydrated through the day",
        "Limit ultra-processed foods",
    ]
    lifestyle: list[str] = [
        "Maintain regular physical activity",
        "Sleep 7-8 hours nightly",
        "Follow periodic blood monitoring",
    ]
    precautions: list[str] = []

    if any(c["condition"].startswith("Anemia") for c in conditions):
        tests.extend(["Ferritin", "Iron profile"])
        diet.extend(["Increase iron-rich foods", "Add vitamin C with meals"])
    if any("Glucose imbalance" in c["condition"] for c in conditions):
        tests.extend(["HbA1c", "Repeat fasting glucose"])
        diet.append("Reduce refined sugar intake")
        lifestyle.append("Daily moderate exercise")
    if any("Kidney function" in c["condition"] for c in conditions):
        tests.extend(["eGFR", "Urine albumin"])
        precautions.append("Consult clinician promptly for kidney-related marker elevation.")
    if any("Thyroid regulation" in c["condition"] for c in conditions):
        tests.extend(["Free T3", "Free T4", "Repeat TSH"])
        precautions.append("High thyroid marker patterns should be reviewed by an endocrinologist.")

    risk_order = {"Low": 1, "Moderate": 2, "High": 3}
    risk = "Low"
    for c in conditions:
        if risk_order[c["risk_level"]] > risk_order[risk]:
            risk = c["risk_level"]

    if not conditions:
        conditions = [
            _condition(
                "No clear high-risk blood pattern",
                "Low",
                "Most extracted values appear within common reference ranges in this assessment.",
            )
        ]
        tests.extend(["Repeat CBC", "Repeat TSH (if symptomatic)"])

    abnormal = [k for k, v in interpreted.items() if v.get("status") in {"Low", "High"}]
    if abnormal:
        detail_lines = [f"{k}: {interpreted[k]['status']} (value {interpreted[k]['value']}, range {interpreted[k]['normal_range']})" for k in abnormal]
        explanation = (
            "Abnormal markers were detected and mapped to risk indications. "
            + " ".join(detail_lines)
            + " Follow-up blood testing is recommended to confirm trend and reduce uncertainty."
        )
    else:
        explanation = (
            "Extracted lab markers are mostly within common reference ranges. "
            "Continue wellness maintenance and periodic preventive screening."
        )

    specialist = "General Physician"
    if any("Kidney function" in c["condition"] for c in conditions):
        specialist = "Nephrologist"
    elif any("Glucose imbalance" in c["condition"] for c in conditions) or any("Thyroid" in c["condition"] for c in conditions):
        specialist = "Endocrinologist"
    elif any("Anemia" in c["condition"] for c in conditions):
        specialist = "Hematologist"

    confidence = "High" if len(interpreted) >= 6 else "Medium" if len(interpreted) >= 3 else "Low"

    return {
        "mode": "report_analysis",
        "interpreted_lab_values": interpreted,
        "symptoms_summary": "",
        "predicted_conditions": conditions,
        "risk_level": risk,
        "recommended_tests": list(dict.fromkeys(tests)),
        "diet_recommendations": list(dict.fromkeys(diet)),
        "lifestyle_changes": list(dict.fromkeys(lifestyle)),
        "clinical_explanation": explanation,
        "doctor_specialist": specialist,
        "confidence_level": confidence,
        "symptom_insights": [],
        "suggested_blood_tests": [],
        "precautions": precautions,
        "evidence_sources": _evidence_sources(context_chunks),
        "evidence_summary": _evidence_summary(context_chunks),
        "disclaimer": DISCLAIMER,
    }


def analyze_with_rag(
    lab_values: dict[str, float | None], context_chunks: list[dict[str, Any]], raw_text: str = ""
) -> dict[str, Any]:
    extracted_count = sum(1 for v in lab_values.values() if v is not None)
    detected_mode = "report_analysis" if extracted_count > 0 else "symptom_text"
    context_evidence = [
        {
            "source": item.get("source", "unknown"),
            "score": item.get("score", 0.0),
            "content": str(item.get("content", ""))[:1200],
        }
        for item in context_chunks[:5]
    ]

    prompt = f"""
{SYSTEM_PROMPT}
Input mode: {detected_mode}
Lab values: {json.dumps(lab_values, indent=2)}
Raw text: {raw_text}
Retrieved context with sources: {json.dumps(context_evidence, indent=2)}

Return strict JSON with keys:
mode, interpreted_lab_values, symptoms_summary, predicted_conditions, recommended_tests,
diet_recommendations, lifestyle_changes, clinical_explanation, risk_level, doctor_specialist,
confidence_level, symptom_insights, suggested_blood_tests, precautions, evidence_sources,
evidence_summary, disclaimer
""".strip()

    out = _report_mode(lab_values, context_chunks) if detected_mode == "report_analysis" else _symptom_mode(raw_text, context_chunks)

    if settings.llm_enhancement_enabled:
        llm_raw = _llm_generate(prompt)
        llm_parsed = _safe_json(llm_raw)

        has_required = (
            isinstance(llm_parsed.get("mode"), str)
            and isinstance(llm_parsed.get("predicted_conditions"), list)
            and isinstance(llm_parsed.get("clinical_explanation"), str)
            and len(llm_parsed.get("clinical_explanation", "")) > 40
        )
        if has_required:
            out = llm_parsed

    out.setdefault("mode", detected_mode)
    out.setdefault("interpreted_lab_values", {})
    out.setdefault("symptoms_summary", "")
    out.setdefault("predicted_conditions", [])
    out.setdefault("recommended_tests", [])
    out.setdefault("diet_recommendations", [])
    out.setdefault("lifestyle_changes", [])
    out.setdefault("clinical_explanation", "Insufficient data to make prediction.")
    out.setdefault("risk_level", "Low")
    out.setdefault("doctor_specialist", "General Physician")
    out.setdefault("confidence_level", "Low")
    out.setdefault("symptom_insights", [])
    out.setdefault("suggested_blood_tests", [])
    out.setdefault("precautions", [])
    out.setdefault("evidence_sources", _evidence_sources(context_chunks))
    out.setdefault("evidence_summary", _evidence_summary(context_chunks))
    out["disclaimer"] = DISCLAIMER

    return out


def chat_follow_up(question: str, analysis_summary: dict[str, Any], history: list[dict[str, str]]) -> str:
    prompt = f"""
Use available assessment summary and provide safe, risk-based follow-up guidance.
No fabricated values. No diagnosis claim.

Summary:
{json.dumps(analysis_summary, indent=2)}

History:
{json.dumps(history, indent=2)}

Question:
{question}
""".strip()

    reply = _llm_generate(prompt)
    if not reply.strip():
        reply = "Based on current data, continue follow-up blood testing and clinician review for personalized interpretation."
    if DISCLAIMER not in reply:
        reply = f"{reply}\n\n{DISCLAIMER}"
    return reply
