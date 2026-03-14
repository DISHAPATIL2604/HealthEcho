# HealthEcho - Personalized Medical Recommendation System using RAG

HealthEcho is a full-stack AI web app for blood-report risk assessment powered by OCR + PDF parsing + Retrieval-Augmented Generation (RAG) over local medical documents.

## Tech Stack
- Frontend: React + Vite + Tailwind + React Router + Axios
- Backend: FastAPI + Pydantic
- RAG: LangChain + FAISS + sentence-transformers
- OCR: Tesseract (`pytesseract`)
- PDF parsing: PyMuPDF
- LLM: Mistral via Ollama (`http://localhost:11434`)

## Project Structure

```text
HealthEcho/
+-- healthecho-backend/
¦   +-- app/
¦   ¦   +-- main.py
¦   ¦   +-- core/
¦   ¦   ¦   +-- config.py
¦   ¦   ¦   +-- schemas.py
¦   ¦   +-- modules/
¦   ¦   ¦   +-- pdf_parser.py
¦   ¦   ¦   +-- ocr.py
¦   ¦   ¦   +-- extract_values.py
¦   ¦   ¦   +-- retriever.py
¦   ¦   ¦   +-- analyzer.py
¦   ¦   +-- routes/
¦   ¦       +-- analyze.py
¦   ¦       +-- chat.py
¦   ¦       +-- ingest.py
¦   +-- scripts/ingest.py
¦   +-- requirements.txt
¦   +-- .env.example
+-- healthecho-frontend/
¦   +-- src/
¦   ¦   +-- pages/
¦   ¦   +-- components/
¦   ¦   +-- services/
¦   ¦   +-- App.jsx
¦   ¦   +-- main.jsx
¦   +-- package.json
¦   +-- .env.example
+-- medical_docs/
¦   +-- README.md
+-- vectorstore/
```

## Features Implemented
- Upload blood reports via PDF, image, or manual text
- Automatic text extraction (PyMuPDF for PDF, Tesseract for images)
- Lab-value extraction to structured JSON:
  - Hemoglobin, WBC, RBC, Platelets, Glucose, Cholesterol, TSH, Creatinine, Vitamin D, Iron
- RAG pipeline:
  - Ingest local medical PDFs from `medical_docs/`
  - Chunk documents
  - Embed with sentence-transformers
  - Store in FAISS (`vectorstore/`)
  - Retrieve top-5 relevant chunks
- Rule pre-check + RAG reasoning:
  - Hemoglobin < 12 => anemia risk possibility
  - Glucose > 126 => diabetes risk possibility
- Structured analysis output with risk level + recommendations
- Follow-up chatbot (`/chat`)
- Frontend pages: Home, Dashboard, Chat, About
- Components required in prompt implemented
- Health risk meter + confidence indicator
- Downloadable summary PDF
- Local-storage report history + chat persistence
- Lab trend graph (Recharts)
- Dark mode toggle
- Global disclaimer displayed

## Safety Constraints
- Backend prompt enforces evidence-grounded responses.
- Disease explanations are not hardcoded in code.
- Clinical context is retrieved from `medical_docs/*.pdf`.
- Responses are risk-oriented and include disclaimer.

## Backend Setup

### 1) Prerequisites
- Python 3.10+
- Ollama installed and running
- Tesseract installed

Windows Tesseract common path:
`C:\Program Files\Tesseract-OCR\tesseract.exe`

### 2) Install

```bash
cd healthecho-backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

If Tesseract is not on PATH, set `TESSERACT_CMD` in `.env`.

### 3) Start backend

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4) Ingest medical PDFs

Place your PDFs in `../medical_docs/`, then:

```bash
python scripts/ingest.py
```

or call API:

```bash
POST http://localhost:8000/ingest
```

## Frontend Setup

### 1) Install

```bash
cd healthecho-frontend
npm install
copy .env.example .env
```

Set:
`VITE_API_BASE_URL=http://localhost:8000`

### 2) Start frontend

```bash
npm run dev
```

## API Endpoints

### `POST /ingest`
Indexes PDFs from `medical_docs` into FAISS.

Success example:

```json
{
  "message": "Medical documents ingested successfully.",
  "chunk_count": 142,
  "source_files": ["hematology-guideline.pdf", "endocrine-overview.pdf"]
}
```

### `POST /analyze`
Multipart form-data:
- `file` (optional: PDF/image)
- `manual_text` (optional)

At least one is required.

Success example:

```json
{
  "predicted_conditions": ["Anemia risk possibility"],
  "risk_level": "Moderate",
  "clinical_explanation": "Based on low hemoglobin and supporting retrieved medical text...",
  "diet_recommendations": ["Iron-rich foods", "Vitamin C with meals"],
  "lifestyle_changes": ["Hydration", "Follow-up monitoring"],
  "recommended_tests": ["CBC repeat", "Ferritin"],
  "doctor_specialist": "Hematologist",
  "confidence_level": "Medium",
  "disclaimer": "This system provides AI-based health risk insights and is not a substitute for professional medical advice.",
  "extracted_values": {
    "Hemoglobin": 10.9,
    "WBC": 7.3,
    "RBC": 4.1,
    "Platelets": 250,
    "Glucose": 95,
    "Cholesterol": null,
    "TSH": null,
    "Creatinine": 0.9,
    "Vitamin D": null,
    "Iron": null
  },
  "supporting_context": ["...", "...", "..."]
}
```

### `POST /chat`

```json
{
  "question": "What food choices can support this risk profile?",
  "analysis_summary": {},
  "history": [{"role": "user", "content": "..."}]
}
```

Response:

```json
{
  "answer": "...\n\nThis system provides AI-based health risk insights and is not a substitute for professional medical advice.",
  "disclaimer": "This system provides AI-based health risk insights and is not a substitute for professional medical advice."
}
```

## Error Handling Standardization
- `400` for invalid input (missing file/text, unsupported type, no PDFs for ingest)
- `500` for unexpected server errors
- Error payload shape:

```json
{
  "error": "message"
}
```

## Free Deployment

### Frontend (Vercel)
1. Push repo to GitHub.
2. Import `healthecho-frontend` project in Vercel.
3. Set `VITE_API_BASE_URL` to your backend URL.
4. Deploy.

### Backend (Render free tier)
1. Create new Web Service from repo.
2. Root directory: `healthecho-backend`.
3. Build command: `pip install -r requirements.txt`.
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
5. Set env vars from `.env.example`.

Notes:
- FAISS index is local to backend runtime.
- Ollama is local by default; for cloud deploy, host model endpoint accessible by backend.

## Optional Supabase
Current project works without database. Supabase can be added for multi-user report storage later.

## Beginner Run Order
1. Add medical PDFs into `medical_docs/`.
2. Start Ollama and run `ollama pull mistral`.
3. Start backend.
4. Call `/ingest` once.
5. Start frontend.
6. Upload report and analyze.

## Disclaimer
This system provides AI-based health risk insights and is not a substitute for professional medical advice.
