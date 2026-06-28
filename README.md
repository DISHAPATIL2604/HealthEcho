# HealthEcho — AI Medical Intelligence

HealthEcho is an educational clinical intake assistant and dashboard designed to help users understand symptoms, visualize lab reports, and find medical resources.

## Project Structure

```
HealthEcho/
├── .gitignore
├── README.md
├── backend/                     <-- Python FastAPI Backend
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/                    <-- Frontend Web App
    ├── index.html
    ├── style.css
    ├── config.js                <-- Configuration (ignored from git)
    ├── config.example.js
    ├── firebase-init.js
    └── app.js
```

## Getting Started

### 1. Frontend Setup
1. Open the `frontend` directory.
2. Duplicate `config.example.js` and rename it to `config.js`.
3. Add your Firebase config credentials and Groq API key inside `config.js`.
4. Open `index.html` in any browser to run the frontend!

### 2. Backend Setup
1. Open the `backend` directory.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the FastAPI server:
   ```bash
   python main.py
   ```
   Or:
   ```bash
   uvicorn main:app --reload
   ```
4. Make sure Ollama is running locally with your desired model (e.g., `llama3.2`) if you want local AI predictions.
