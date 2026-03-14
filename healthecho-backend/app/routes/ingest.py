from fastapi import APIRouter, HTTPException

from app.core.schemas import IngestResponse
from app.modules.retriever import ingest_medical_docs

router = APIRouter(prefix="", tags=["ingest"])


@router.post("/ingest", response_model=IngestResponse)
def ingest_docs():
    chunk_count, source_files = ingest_medical_docs()
    if not source_files:
        raise HTTPException(
            status_code=400,
            detail=(
                "No trusted medical docs found. Place files under medical_docs/CDC, medical_docs/WHO, "
                "medical_docs/NIH, or medical_docs/ICMR (or include these authority tags in filename)."
            ),
        )
    return IngestResponse(
        message="Trusted medical documents ingested successfully.",
        chunk_count=chunk_count,
        source_files=source_files,
    )
