from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import subprocess, json, os, re
import pytesseract
from PIL import Image
import requests
import sqlite3
from datetime import datetime

# Load environment variables from local .env file (in same folder as main.py)
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip().strip('"').strip("'")

app = FastAPI(title="HealthEcho API", version="5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# SQLite database for local storage
def init_db():
    conn = sqlite3.connect('healthecho.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS consultations
                 (id INTEGER PRIMARY KEY, symptoms TEXT, result TEXT, timestamp TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS reports
                 (id INTEGER PRIMARY KEY, filename TEXT, extracted_text TEXT, timestamp TEXT)''')
    conn.commit()
    conn.close()

init_db()

TRUSTED_SOURCES = [
    {"name": "WHO", "url": "https://www.who.int"},
    {"name": "ICMR", "url": "https://www.icmr.gov.in"},
    {"name": "CDC", "url": "https://www.cdc.gov"},
    {"name": "AIIMS", "url": "https://www.aiims.edu"},
    {"name": "NIH", "url": "https://www.nih.gov"},
    {"name": "Mayo Clinic", "url": "https://www.mayoclinic.org"},
]

MEDICAL_SYSTEM_PROMPT = """You are HealthEcho, an expert AI medical assistant trained on:
WHO, ICMR, CDC, AIIMS, NIH, Mayo Clinic guidelines.
Focus: Diseases prevalent in India — Diabetes, TB, Dengue, Malaria, Typhoid, Thyroid, PCOS, Anemia, Hypertension, Asthma.

STRICT RULES:
1. Never fabricate medical information
2. Always cite specific trusted sources
3. Include realistic confidence levels
4. Always recommend professional consultation
5. Flag emergencies clearly
6. Return ONLY valid JSON

Return EXACTLY this JSON:
{
  "predicted_conditions": [{"name": "...", "confidence": 75, "sources": ["WHO", "ICMR"], "reason": "...", "clinical_explanation": "..."}],
  "risk_level": "Low|Moderate|High",
  "diet_recommendations": ["..."],
  "lifestyle_changes": ["..."],
  "recommended_tests": ["..."],
  "doctor_specialist": "...",
  "emergency": false,
  "disclaimer": "This system provides informational insights only. Please consult a qualified healthcare professional."
}"""

class SymptomRequest(BaseModel):
    symptoms: str
    user_id: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None

def run_ollama(prompt: str, model: str = "llama3.2") -> str:
    try:
        result = subprocess.run(
            ["ollama", "run", model],
            input=MEDICAL_SYSTEM_PROMPT + "\n\nPatient symptoms: " + prompt,
            text=True, capture_output=True, timeout=30
        )
        return result.stdout.strip()
    except Exception as e:
        return ""

def parse_json_response(text: str) -> dict:
    try:
        cleaned = re.sub(r'```json\n?|\n?```', '', text).strip()
        start = cleaned.find('{')
        end = cleaned.rfind('}')
        if start != -1 and end != -1:
            return json.loads(cleaned[start:end+1])
    except: pass
    return None

def calculate_confidence(text: str) -> float:
    text = text.lower()
    if any(w in text for w in ['severe', 'critical', 'emergency']): return 0.90
    if any(w in text for w in ['moderate', 'likely', 'suggests']): return 0.70
    if any(w in text for w in ['possible', 'may', 'could']): return 0.55
    return 0.45

def fallback_response() -> dict:
    return {
        "predicted_conditions": [{"name": "General Health Observation", "confidence": 50, "sources": ["WHO"], "reason": "Unable to process symptoms with AI — please try again", "clinical_explanation": "Please describe your symptoms in more detail."}],
        "risk_level": "Low",
        "diet_recommendations": ["Stay hydrated — 8-10 glasses of water daily", "Eat balanced, nutritious meals"],
        "lifestyle_changes": ["Get adequate rest", "Monitor your symptoms"],
        "recommended_tests": ["Basic Blood Count (CBC)", "Blood Glucose"],
        "doctor_specialist": "General Physician",
        "emergency": False,
        "disclaimer": "This system provides informational insights only. Please consult a qualified healthcare professional."
    }

@app.get("/health")
def health_check():
    # Check if Ollama is running
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=2)
        ollama_status = "online" if r.ok else "offline"
    except:
        ollama_status = "offline"
    return {"status": "running", "ollama": ollama_status, "version": "5.0", "sources": TRUSTED_SOURCES}

@app.get("/config")
def get_config():
    return {
        "firebaseConfig": {
            "apiKey": os.getenv("FIREBASE_API_KEY", ""),
            "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", ""),
            "projectId": os.getenv("FIREBASE_PROJECT_ID", ""),
            "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", ""),
            "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID", ""),
            "appId": os.getenv("FIREBASE_APP_ID", ""),
            "measurementId": os.getenv("FIREBASE_MEASUREMENT_ID", "")
        },
        "groqDefaultKey": os.getenv("GROQ_DEFAULT_KEY", ""),
        "apiBaseUrl": "http://127.0.0.1:8000"
    }


@app.post("/predict")
def predict_disease(data: SymptomRequest):
    # Add patient context to prompt
    context = data.symptoms
    if data.age: context += f" (Patient age: {data.age})"
    if data.gender: context += f" (Gender: {data.gender})"

    raw_response = run_ollama(context)
    result = parse_json_response(raw_response) if raw_response else None

    if not result:
        result = fallback_response()

    # Add source links if not present
    source_links = {s["name"]: s["url"] for s in TRUSTED_SOURCES}
    for cond in result.get("predicted_conditions", []):
        cond["source_links"] = source_links

    # Save to database
    try:
        conn = sqlite3.connect('healthecho.db')
        c = conn.cursor()
        c.execute("INSERT INTO consultations (symptoms, result, timestamp) VALUES (?,?,?)",
                  (data.symptoms, json.dumps(result), datetime.now().isoformat()))
        conn.commit()
        conn.close()
    except: pass

    return result

@app.post("/upload")
async def upload_report(file: UploadFile = File(...)):
    contents = await file.read()
    temp_path = f"temp_{file.filename}"
    with open(temp_path, "wb") as f:
        f.write(contents)
    try:
        if file.filename.endswith('.pdf'):
            # For PDFs, use pdf2image if available
            try:
                from pdf2image import convert_from_path
                images = convert_from_path(temp_path)
                text = "\n".join([pytesseract.image_to_string(img) for img in images])
            except:
                text = "PDF processing requires pdf2image: pip install pdf2image"
        else:
            image = Image.open(temp_path)
            text = pytesseract.image_to_string(image)

        # Save to database
        conn = sqlite3.connect('healthecho.db')
        c = conn.cursor()
        c.execute("INSERT INTO reports (filename, extracted_text, timestamp) VALUES (?,?,?)",
                  (file.filename, text, datetime.now().isoformat()))
        conn.commit()
        conn.close()

        os.remove(temp_path)
        return {"extracted_text": text, "filename": file.filename, "status": "success"}
    except Exception as e:
        if os.path.exists(temp_path): os.remove(temp_path)
        return {"extracted_text": "", "error": str(e), "status": "error"}

@app.get("/history")
def get_history():
    try:
        conn = sqlite3.connect('healthecho.db')
        c = conn.cursor()
        c.execute("SELECT id, symptoms, result, timestamp FROM consultations ORDER BY id DESC LIMIT 50")
        rows = c.fetchall()
        conn.close()
        return [{"id": r[0], "symptoms": r[1], "result": json.loads(r[2]), "timestamp": r[3]} for r in rows]
    except: return []

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
