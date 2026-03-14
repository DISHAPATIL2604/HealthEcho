from pathlib import Path

from langchain_community.docstore.document import Document
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import settings
from app.modules.pdf_parser import parse_pdf_text

_EMBEDDING_CACHE: HuggingFaceEmbeddings | None = None
_VECTORSTORE_CACHE: FAISS | None = None
_TRUSTED_AUTHORITIES = ("WHO", "CDC", "NIH", "ICMR")


def _detect_authority(source_rel_path: str) -> str | None:
    # Strict trust mode: authority must be present in folder path or filename.
    source_path = Path(source_rel_path)
    upper_parts = [part.upper() for part in source_path.parts]

    for authority in _TRUSTED_AUTHORITIES:
        if authority in upper_parts:
            return authority

    file_name_upper = source_path.name.upper()
    for authority in _TRUSTED_AUTHORITIES:
        if authority in file_name_upper:
            return authority

    text = source_rel_path.lower()
    if "world health organization" in text:
        return "WHO"
    if "centers for disease control" in text:
        return "CDC"
    if any(x in text for x in ["nlm.nih", "niddk.nih", "nhlbi.nih"]):
        return "NIH"
    if "indian council of medical research" in text:
        return "ICMR"

    return None


def _is_trusted_authority(authority: str | None) -> bool:
    return authority in _TRUSTED_AUTHORITIES


def _embedding_model() -> HuggingFaceEmbeddings:
    global _EMBEDDING_CACHE
    if _EMBEDDING_CACHE is None:
        _EMBEDDING_CACHE = HuggingFaceEmbeddings(model_name=settings.embeddings_model)
    return _EMBEDDING_CACHE


def _ensure_vector_dir() -> Path:
    vector_dir = Path(settings.vectorstore_dir)
    vector_dir.mkdir(parents=True, exist_ok=True)
    return vector_dir


def _text_file_content(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore").strip()
    except Exception:
        return ""


def load_vectorstore() -> FAISS | None:
    global _VECTORSTORE_CACHE
    if _VECTORSTORE_CACHE is not None:
        return _VECTORSTORE_CACHE

    vector_dir = _ensure_vector_dir()
    index_file = vector_dir / "index.faiss"
    if not index_file.exists():
        return None

    _VECTORSTORE_CACHE = FAISS.load_local(
        str(vector_dir),
        _embedding_model(),
        allow_dangerous_deserialization=True,
    )
    return _VECTORSTORE_CACHE


def ingest_medical_docs() -> tuple[int, list[str]]:
    global _VECTORSTORE_CACHE
    docs_dir = Path(settings.medical_docs_dir)
    docs_dir.mkdir(parents=True, exist_ok=True)

    documents: list[Document] = []
    source_files: list[str] = []

    for pdf_path in docs_dir.rglob("*.pdf"):
        source_rel = str(pdf_path.relative_to(docs_dir))
        authority = _detect_authority(source_rel)
        if not _is_trusted_authority(authority):
            continue

        text = parse_pdf_text(pdf_path)
        if not text.strip():
            continue

        source_files.append(source_rel)
        documents.append(
            Document(
                page_content=text,
                metadata={
                    "source": source_rel,
                    "authority": authority,
                },
            )
        )

    for ext in ("*.txt", "*.md"):
        for text_path in docs_dir.rglob(ext):
            if text_path.name.lower() == "readme.md":
                continue

            source_rel = str(text_path.relative_to(docs_dir))
            authority = _detect_authority(source_rel)
            if not _is_trusted_authority(authority):
                continue

            text = _text_file_content(text_path)
            if not text:
                continue

            source_files.append(source_rel)
            documents.append(
                Document(
                    page_content=text,
                    metadata={
                        "source": source_rel,
                        "authority": authority,
                    },
                )
            )

    splitter = RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=120)
    chunks = splitter.split_documents(documents)

    vector_dir = _ensure_vector_dir()
    if chunks:
        store = FAISS.from_documents(chunks, _embedding_model())
        store.save_local(str(vector_dir))
        _VECTORSTORE_CACHE = store

    return len(chunks), sorted(set(source_files))


def retrieve_context(query: str, top_k: int = 5) -> list[dict[str, str | float]]:
    store = load_vectorstore()
    if store is None:
        return []

    fetch_k = max(top_k * 6, 12)
    docs_with_scores = store.similarity_search_with_score(query, k=fetch_k)
    contexts: list[dict[str, str | float]] = []

    for doc, score in docs_with_scores:
        authority = doc.metadata.get("authority")
        if not _is_trusted_authority(authority):
            continue

        contexts.append(
            {
                "source": str(doc.metadata.get("source", "unknown")),
                "content": doc.page_content,
                "score": float(score),
                "authority": str(authority),
            }
        )
        if len(contexts) >= top_k:
            break

    return contexts
