from typing import Any, Literal

from pydantic import BaseModel, Field


class AnalyzeResponse(BaseModel):
    mode: Literal["report_analysis", "symptom_text"] = "symptom_text"
    interpreted_lab_values: dict[str, dict[str, Any]] = Field(default_factory=dict)
    symptoms_summary: str = ""
    predicted_conditions: list[dict[str, Any]] = Field(default_factory=list)
    risk_level: Literal["Low", "Moderate", "High"]
    clinical_explanation: str
    diet_recommendations: list[str] = Field(default_factory=list)
    lifestyle_changes: list[str] = Field(default_factory=list)
    recommended_tests: list[str] = Field(default_factory=list)
    doctor_specialist: str
    confidence_level: str
    disclaimer: str = (
        "This system provides AI-based health risk insights and is not a substitute for professional medical advice."
    )
    extracted_values: dict[str, float | str | None] = Field(default_factory=dict)
    supporting_context: list[dict[str, Any]] = Field(default_factory=list)
    report_findings: list[str] = Field(default_factory=list)
    symptom_insights: list[str] = Field(default_factory=list)
    suggested_blood_tests: list[str] = Field(default_factory=list)
    precautions: list[str] = Field(default_factory=list)
    evidence_sources: list[str] = Field(default_factory=list)
    evidence_summary: str = ""


class AnalyzeRequest(BaseModel):
    manual_text: str | None = None


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    question: str = Field(min_length=2)
    analysis_summary: dict[str, Any] = Field(default_factory=dict)
    history: list[ChatTurn] = Field(default_factory=list)


class ChatResponse(BaseModel):
    answer: str
    disclaimer: str = (
        "This system provides AI-based health risk insights and is not a substitute for professional medical advice."
    )


class IngestResponse(BaseModel):
    message: str
    chunk_count: int
    source_files: list[str]
