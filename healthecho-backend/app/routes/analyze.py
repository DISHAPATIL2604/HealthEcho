from fastapi import APIRouter, File, Form, HTTPException, UploadFile
import re

from app.core.config import settings
from app.core.schemas import AnalyzeResponse
from app.modules.analyzer import analyze_with_rag
from app.modules.extract_values import extract_lab_values
from app.modules.ocr import image_bytes_to_text
from app.modules.pdf_parser import parse_pdf_bytes
from app.modules.retriever import retrieve_context

router = APIRouter(prefix="", tags=["analyze"])


def _extract_report_findings(raw_text: str, limit: int = 20) -> list[str]:
    findings: list[str] = []
    for line in (raw_text or "").splitlines():
        clean = line.strip()
        if not clean:
            continue
        if re.search(r"\b\d+(?:\.\d+)?\b", clean) and (
            ":" in clean or "-" in clean or any(k in clean.lower() for k in ["hemoglobin", "wbc", "rbc", "platelet", "glucose", "cholesterol", "tsh", "creatinine", "iron", "vitamin"])
        ):
            findings.append(clean[:140])
        if len(findings) >= limit:
            break
    return findings


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_report(
    file: UploadFile | None = File(default=None),
    manual_text: str | None = Form(default=None),
):
    if not file and not (manual_text and manual_text.strip()):
        raise HTTPException(status_code=400, detail="Provide a file upload or manual_text.")

    extracted_text_parts: list[str] = []

    if file:
        content = await file.read()
        content_type = (file.content_type or "").lower()

        if "pdf" in content_type or (file.filename or "").lower().endswith(".pdf"):
            extracted_text_parts.append(parse_pdf_bytes(content))
        elif content_type.startswith("image/"):
            extracted_text_parts.append(image_bytes_to_text(content))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF or image.")

    if manual_text and manual_text.strip():
        extracted_text_parts.append(manual_text.strip())

    merged_text = "\n\n".join(part for part in extracted_text_parts if part)
    if not merged_text:
        raise HTTPException(status_code=400, detail="Could not extract readable text from input.")

    values = extract_lab_values(merged_text)
    context = retrieve_context(query=merged_text, top_k=settings.rag_top_k)
    result = analyze_with_rag(lab_values=values, context_chunks=context, raw_text=merged_text)

    result["extracted_values"] = values
    result["supporting_context"] = [
        {
            "authority": item.get("authority", "unknown"),
            "source": item.get("source", "unknown"),
            "score": item.get("score", 0.0),
            "content": str(item.get("content", ""))[:500],
        }
        for item in context[:3]
    ]
    result["report_findings"] = _extract_report_findings(merged_text)
    if not result.get("suggested_blood_tests"):
        result["suggested_blood_tests"] = result.get("recommended_tests", [])
    return AnalyzeResponse(**result)


