// ════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════
const STATE = {
  user: null,
  firebaseUser: null,
  chatHistory: [],
  consultations: [],
  appointments: JSON.parse(localStorage.getItem('he_appts') || '[]'),
  reports: [],
  uploadQueue: [],
  selectedReportId: null,
  booking: { hosp: null, doc: null, date: null, time: null },
  phoneConfirmResult: null,
  otpTimer: null,
  activeFilter: 'all',
  activeHospFilter: 'all',
  trendChart: null,
  feedbackRating: 0,
  sessionStart: Date.now(),
  feedbackShown: false,
  isFirstVisit: !localStorage.getItem('he_visited'),
  ollamaOnline: false,
  groqOnline: false,
  cameraStream: null,
  userLocation: null,
  darkMode: localStorage.getItem('he_theme') !== 'light',
  reportAnalysisAbort: null,
  lastReportAnalysis: null,
  lastVoiceSummary: '',
  currentUtterance: null,
};
/** Optional FastAPI (Ollama). Leave unset for browser-only OCR + rules. Set: window.HEALTHECHO_API_BASE = 'http://127.0.0.1:8000' */
const HEALTHECHO_API_BASE = (function () {
  if (typeof window === 'undefined') return '';
  if (Object.prototype.hasOwnProperty.call(window, 'HEALTHECHO_API_BASE')) {
    const v = window.HEALTHECHO_API_BASE;
    if (v === '' || v === false || v == null) return '';
    return String(v).replace(/\/$/, '');
  }
  if (window.HEALTHECHO_CONFIG && window.HEALTHECHO_CONFIG.apiBaseUrl) {
    return String(window.HEALTHECHO_CONFIG.apiBaseUrl).replace(/\/$/, '');
  }
  return '';
})();
localStorage.setItem('he_visited', '1');

// ════════════════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════════════════
function applyTheme() {
  document.body.classList.toggle('light', !STATE.darkMode);
  const tt = document.getElementById('themeToggle');
  if (tt) tt.textContent = STATE.darkMode ? '🌙' : '☀️';
}
function toggleTheme() {
  STATE.darkMode = !STATE.darkMode;
  localStorage.setItem('he_theme', STATE.darkMode ? 'dark' : 'light');
  applyTheme();
}
applyTheme();

// ════════════════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════════════════
function goHistory() {
  if (!STATE.user) {
    showToast('Sign in to view consultation history');
    showModal('loginModal');
    return;
  }
  switchToTab('history');
}

function switchToTab(name) {
  if (name === 'history' && !STATE.user) {
    showToast('Sign in to view consultation history');
    showModal('loginModal');
    return;
  }
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.t === name));
  document.querySelectorAll('.sidebar-tab').forEach(x => x.classList.toggle('on', x.dataset.t === name));
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  const scr = document.getElementById('s-' + name);
  if (scr) scr.classList.add('on');
  if (name === 'dashboard') renderDashboard();
  if (name === 'history') renderHistory();
  if (name === 'hospitals') {
    // Only auto-load if we don't already have data, or if the user switched
    if (!HOSPITALS_LIVE.length || HOSP_CITY_SOURCE !== 'gps') {
      loadHospitalsForSignupCity();
    } else {
      renderHospitals(); // GPS data already loaded — just re-render
    }
  }
  if (name === 'upload') renderUploadedReports();
}

// ════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════
function showModal(id) { document.getElementById(id).classList.add('show'); }
function hideModal(id) {
  document.getElementById(id).classList.remove('show');
  if (id === 'loginModal' || id === 'signupModal') resetRecaptcha();
}

// ════════════════════════════════════════════════════════
// AI KEY MANAGEMENT
// ════════════════════════════════════════════════════════
const GROQ_DEFAULT_KEY = (window.HEALTHECHO_CONFIG && window.HEALTHECHO_CONFIG.groqDefaultKey) || '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';
function getGroqKey() {
  return localStorage.getItem('he_groq_key') || GROQ_DEFAULT_KEY;
}
function saveGroqKey(v) {
  const val = (v || '').trim();
  if (val) localStorage.setItem('he_groq_key', val);
  else localStorage.removeItem('he_groq_key');
  updateBackendBadge();
}
function clearGroqKey() {
  localStorage.removeItem('he_groq_key');
  const inp = document.getElementById('groqKeyInput');
  if (inp) inp.value = '';
  const st = document.getElementById('groqKeyStatus');
  if (st) { st.textContent = 'Key cleared.'; st.style.color = 'var(--hint)'; }
  updateBackendBadge();
}
async function testGroqKey() {
  const key = getGroqKey();
  const inp = document.getElementById('groqKeyInput');
  if (inp && inp.value.trim()) saveGroqKey(inp.value.trim());
  const k = getGroqKey();
  if (!k) { showToast('No AI key found'); return; }
  const btn = document.getElementById('groqTestBtn');
  const st = document.getElementById('groqKeyStatus');
  btn.disabled = true; btn.textContent = 'Testing…';
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: 'Bearer ' + k }
    });
    if (res.ok) {
      STATE.groqOnline = true;
      if (st) { st.textContent = '✓ AI key is valid! Analysis is active.'; st.style.color = 'var(--teal)'; }
      showToast('✓ AI connected!');
    } else {
      STATE.groqOnline = false;
      if (st) { st.textContent = '✗ Invalid key or network error.'; st.style.color = 'var(--red)'; }
    }
  } catch(e) {
    STATE.groqOnline = false;
    if (st) { st.textContent = '✗ Could not reach AI service (network error).'; st.style.color = 'var(--red)'; }
  }
  btn.disabled = false; btn.textContent = 'Test Key';
  updateBackendBadge();
}

function updateBackendBadge() {
  const hasKey = !!getGroqKey();
  const online = STATE.groqOnline;
  const txt = online ? 'AI ✓' : hasKey ? 'AI ⚡' : 'AI';
  ['navBackendBadge','sidebarBackendBadge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'backend-badge ' + (online ? 'online' : hasKey ? 'online' : 'offline');
    el.innerHTML = `<div class="backend-dot"></div><span>${txt}</span>`;
    el.style.display = '';
  });
}

// Init: restore key into input if saved
document.addEventListener('DOMContentLoaded', () => {
  const saved = getGroqKey();
  const inp = document.getElementById('groqKeyInput');
  if (inp && saved) { inp.value = saved; }
  const st = document.getElementById('groqKeyStatus');
  if (st && saved) { st.textContent = '✓ AI key loaded — ready to analyze reports.'; st.style.color = 'var(--teal)'; }
  STATE.groqOnline = true;
  updateBackendBadge();
});


// ════════════════════════════════════════════════════════
// CAMERA
// ════════════════════════════════════════════════════════
async function openCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    STATE.cameraStream = stream;
    const video = document.getElementById('cameraVideo');
    video.srcObject = stream;
    document.getElementById('cameraModal').classList.add('show');
  } catch(e) {
    showToast('Camera access denied or unavailable');
  }
}

function closeCamera() {
  if (STATE.cameraStream) {
    STATE.cameraStream.getTracks().forEach(t => t.stop());
    STATE.cameraStream = null;
  }
  document.getElementById('cameraModal').classList.remove('show');
}

function capturePhoto() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    const file = new File([blob], `report_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
    addFilesToQueue([file]);
    closeCamera();
    switchToTab('upload');
    showToast('📸 Photo captured — ready to upload!');
  }, 'image/jpeg', 0.92);
}

// ════════════════════════════════════════════════════════
// MEDICAL SYSTEM PROMPT
// ════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are HealthEcho, an expert AI medical assistant trained on guidelines from:
- WHO (World Health Organization)
- ICMR (Indian Council of Medical Research)
- CDC (Centers for Disease Control and Prevention)
- AIIMS (All India Institute of Medical Sciences)
- NIH (National Institutes of Health)
- Mayo Clinic
- NHS (National Health Service)

PRIVACY RULE: Always refer to the patient as "User" — NEVER use their personal name in any response.

Your primary focus is on diseases prevalent in India: Diabetes, Tuberculosis, Dengue, Malaria, Typhoid, Thyroid disorders, PCOS, Anemia, Hypertension, Asthma, COVID-19 complications.

STRICT RULES:
1. Never fabricate medical information
2. Always cite specific trusted sources for each condition
3. Include confidence levels based on symptom specificity (not random)
4. Always recommend professional consultation
5. Flag emergencies clearly
6. If symptoms are vague, OR duration/severity/body location is missing for a plausible complaint, OR the message is casual chat with no health content, set "needs_more_info": true and put 2-4 specific follow-up questions in "follow_up_questions" — do NOT invent conditions in that case (predicted_conditions may be empty)
7. Respond ONLY with valid JSON — no markdown, no preamble

CONFIDENCE GUIDE:
- High (80-95%): Multiple specific, matching symptoms
- Medium (50-79%): Some matching symptoms
- Low (30-49%): Vague or non-specific symptoms

Output EXACTLY this JSON structure (needs_more_info and follow_up_questions only when clarification is required):
{
  "needs_more_info": false,
  "follow_up_questions": [],
  "predicted_conditions": [
    {
      "name": "Condition Name",
      "confidence": 75,
      "sources": ["WHO", "ICMR"],
      "source_links": {
        "WHO": "https://www.who.int",
        "ICMR": "https://www.icmr.gov.in",
        "CDC": "https://www.cdc.gov",
        "AIIMS": "https://www.aiims.edu",
        "NIH": "https://www.nih.gov",
        "Mayo Clinic": "https://www.mayoclinic.org"
      },
      "reason": "Specific reason why these symptoms match this condition",
      "clinical_explanation": "Clear, plain-language explanation"
    }
  ],
  "risk_level": "Low",
  "diet_recommendations": ["specific tip"],
  "lifestyle_changes": ["specific change"],
  "recommended_tests": ["specific test"],
  "doctor_specialist": "Specialist type",
  "emergency": false,
  "disclaimer": "This system provides informational insights only. Please consult a qualified healthcare professional for diagnosis and treatment."
}`;

// ════════════════════════════════════════════════════════
// LLM CALL — OLLAMA FIRST, CLAUDE FALLBACK
// ════════════════════════════════════════════════════════
async function callLLM(userMessage) {
  const fullPrompt = SYSTEM_PROMPT + '\n\nUser symptoms: ' + userMessage;

  // Try Ollama first (free, local)
  if (STATE.ollamaOnline) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const resp = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama3.2', prompt: fullPrompt, stream: false }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (resp.ok) {
        const data = await resp.json();
        const text = data.response || '';
        return parseJSON(text) || fallbackResponse(userMessage);
      }
    } catch(e) {
      console.warn('Ollama failed:', e);
      STATE.ollamaOnline = false;
      updateBackendBadge();
    }
  }

  // Fallback: Claude API (Anthropic) — no paid API key needed as it uses the existing session
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: 'Patient symptoms: ' + userMessage }]
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (resp.ok) {
      const data = await resp.json();
      const text = data.content?.[0]?.text || '';
      return parseJSON(text) || fallbackResponse(userMessage);
    }
  } catch(e) {
    console.warn('Claude API fallback failed:', e);
  }

  return fallbackResponse(userMessage);
}

function parseJSON(text) {
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    if (typeof obj.needs_more_info !== 'boolean') obj.needs_more_info = !!(obj.follow_up_questions && obj.follow_up_questions.length);
    if (!Array.isArray(obj.follow_up_questions)) obj.follow_up_questions = [];
    return obj;
  } catch { return null; }
}

const SOURCE_LINKS = {
  'WHO': 'https://www.who.int',
  'ICMR': 'https://www.icmr.gov.in',
  'CDC': 'https://www.cdc.gov',
  'AIIMS': 'https://www.aiims.edu',
  'NIH': 'https://www.nih.gov',
  'Mayo Clinic': 'https://www.mayoclinic.org',
  'NHS': 'https://www.nhs.uk'
};

// ════════════════════════════════════════════════════════
// DIAGNOSTIC PIPELINE (ordered steps)
// 1) Safety / urgency   2) Body-system signals   3) Symptom weighting per disease
// 4) Filter by system     5) Normalize (softmax)   6) Confidence tier (High/Moderate/Low)
// 7) Map tests to diseases 8) Aggregate risk & specialist
// ════════════════════════════════════════════════════════

const SYSTEM_LABELS = {
  respiratory: 'Respiratory',
  cardiovascular: 'Cardiovascular',
  gastrointestinal: 'Gastrointestinal',
  neurological: 'Neurological',
  endocrine_metabolic: 'Endocrine & metabolic',
  reproductive: 'Reproductive health',
  musculoskeletal: 'Musculoskeletal',
  genitourinary: 'Genitourinary',
  hematologic_infectious: 'Infectious / hematologic',
  general: 'General'
};

/** Layer 1: keyword → body-system activation weights */
const BODY_SYSTEM_SIGNALS = [
  { sys: 'respiratory', keys: ['cough', 'cold', 'congest', 'sneeze', 'wheeze', 'phlegm', 'sputum', 'shortness', 'short of breath', 'sob', 'breathless', 'chest tight', 'asthma', 'pneumonia', 'throat sore', 'sore throat'] },
  { sys: 'cardiovascular', keys: ['chest pain', 'heart pain', 'palpitation', 'heart racing', 'bp high', 'blood pressure', 'hypertension', 'crushing chest', 'radiat', 'jaw pain arm'] },
  { sys: 'gastrointestinal', keys: ['nausea', 'vomit', 'diarrh', 'constipat', 'bloat', 'stomach pain', 'abdomen', 'abdominal', 'acid', 'heartburn', 'gerd', 'food poison', 'blood in stool', 'black stool'] },
  { sys: 'neurological', keys: ['headache', 'migraine', 'dizz', 'faint', 'seizure', 'numb', 'tingl', 'weakness one side', 'confusion', 'vision sudden', 'blurry'] },
  { sys: 'endocrine_metabolic', keys: ['thirst', 'urin', 'frequent urination', 'diabet', 'glucose', 'sugar', 'thyroid', 'tsh', 'weight gain', 'weight loss', 'fatigue', 'tired', 'weak', 'hb', 'anemia'] },
  { sys: 'reproductive', keys: ['period', 'menstr', 'pcos', 'irregular period', 'pregn', 'pelvic'] },
  { sys: 'musculoskeletal', keys: ['joint', 'muscle ache', 'back pain', 'neck pain', 'swell joint', 'arthritis'] },
  { sys: 'genitourinary', keys: ['burning urin', 'uti', 'kidney', 'flank pain', 'stone'] },
  { sys: 'hematologic_infectious', keys: ['fever', 'chill', 'night sweat', 'rash', 'dengue', 'malaria', 'typhoid', 'tb ', 'tuberculosis', 'infection', 'jaundice', 'yellow eye'] },
];

/** Pruning & relevance (differential control) */
const RELEVANCE_THRESHOLD = 0.15;
const MAX_DIFFERENTIAL = 5;
const PRIMARY_SYSTEM_MATCH_MULT = 1.5;
const NON_PRIMARY_SYSTEM_MULT = 0.5;
const SCREENING_PROB_MIN = 0.03;
const MAX_SCREENING = 4;

/** Low-specificity cues: weight 1 each; must not “lift” unrelated systems without specific matches */
const LOW_SPECIFICITY_PHRASES = ['fatigue', 'tiredness', 'tired', 'weakness', 'weak', 'loss of appetite', 'poor appetite', 'no appetite', 'malaise'];
const LOW_SPEC_DAMPEN_NON_PRIMARY = 0.22;
const LOW_SPEC_DAMPEN_PRIMARY = 0.72;

/** Diseases often driven only by vague symptoms — easier to demote to screening when another system dominates */
const SCREENING_PRONE_NAMES = /anemia|hypothyroid|diabetes|hyperglycemia|anxiety|panic/i;

const DISEASE_RULES = [
  { name: 'Acute coronary syndrome (possible)', systems: ['cardiovascular'], urgency: 'emergency', specialist: 'Cardiologist / Emergency',
    weights: { 'chest pain': 2.2, 'crushing': 2, 'radiat': 1.8, 'jaw pain': 1.5, 'arm pain': 1.4, 'sweat': 1.2, 'nausea': 0.8, 'shortness': 1.3, 'palpitation': 0.9 },
    tests: ['ECG', 'Troponin', 'Chest imaging if indicated'], sources: ['WHO', 'ICMR'],
    explain: 'Chest discomfort with radiation, sweating, or severe shortness of breath needs urgent evaluation to rule out cardiac causes.' },
  { name: 'Severe asthma / acute bronchospasm (possible)', systems: ['respiratory'], urgency: 'urgent', specialist: 'Pulmonologist / Emergency',
    weights: { 'wheeze': 2, 'asthma': 2, 'shortness': 1.5, 'breathless': 1.5, 'cough': 1, 'chest tight': 1.4, 'sob': 1.6 },
    tests: ['Peak flow / spirometry', 'Chest X-ray if fever', 'Blood gas if severe'], sources: ['WHO', 'ICMR'],
    explain: 'Marked wheeze or breathlessness can worsen quickly; seek urgent care if speaking in short phrases or lips blue.' },
  { name: 'Dengue fever (differential)', systems: ['hematologic_infectious', 'general'], urgency: 'urgent', specialist: 'Physician / Infectious disease',
    weights: { 'dengue': 2.5, 'fever': 1.2, 'rash': 1.1, 'body ache': 1.4, 'platelet': 1.5, 'bleed': 1.3, 'retro': 1 },
    tests: ['NS1 antigen / Dengue serology', 'CBC with platelets', 'Hematocrit trend'], sources: ['ICMR', 'WHO'],
    explain: 'Endemic in many Indian regions; monitor platelets and hydration; warning signs include bleeding, severe abdominal pain, or lethargy.' },
  { name: 'Malaria (differential)', systems: ['hematologic_infectious'], urgency: 'urgent', specialist: 'Physician',
    weights: { 'malaria': 2.5, 'fever': 1.2, 'chill': 1.4, 'rigor': 1.3, 'sweat': 1, 'travel': 1.2 },
    tests: ['Peripheral smear', 'Rapid antigen / PCR per protocol', 'CBC'], sources: ['WHO', 'ICMR'],
    explain: 'Cyclic fever with chills in endemic area warrants prompt testing and treatment protocols.' },
  { name: 'Typhoid / enteric fever (differential)', systems: ['gastrointestinal', 'hematologic_infectious'], urgency: 'urgent', specialist: 'Physician',
    weights: { 'typhoid': 2.5, 'fever': 1.1, 'abdominal': 1, 'headache': 0.9, 'weak': 0.9, 'rose spot': 1.5 },
    tests: ['Blood culture', 'Widal / better serology per lab', 'CBC'], sources: ['ICMR', 'WHO'],
    explain: 'Prolonged fever with GI symptoms is common; cultures are more reliable than Widal alone.' },
  { name: 'Pneumonia (differential)', systems: ['respiratory', 'hematologic_infectious'], urgency: 'urgent', specialist: 'Physician / Pulmonologist',
    weights: { 'pneumonia': 2.5, 'fever': 1.2, 'cough': 1.3, 'phlegm': 1.1, 'chest pain': 1, 'breathless': 1.4, 'shortness': 1.2 },
    tests: ['Chest X-ray', 'CBC', 'Oxygen saturation', 'Sputum culture if indicated'], sources: ['WHO', 'ICMR'],
    explain: 'Fever with productive cough and pleuritic pain suggests lung infection until examined and imaged.' },
  { name: 'Viral upper respiratory infection', systems: ['respiratory', 'general'], urgency: 'routine', specialist: 'General Physician',
    weights: { 'cold': 1.5, 'cough': 1.2, 'sore throat': 1.3, 'runny': 1.2, 'fever': 0.9, 'headache': 0.7, 'body ache': 0.8, 'congest': 1 },
    tests: ['Symptomatic care', 'CBC if prolonged fever', 'COVID test if indicated'], sources: ['WHO', 'ICMR'],
    explain: 'Usually self-limited; seek care if high fever >3 days, breathing difficulty, or dehydration.' },
  { name: 'Migraine (differential)', systems: ['neurological'], urgency: 'routine', specialist: 'Neurologist / GP',
    weights: { 'migraine': 2.5, 'headache': 1.2, 'throbb': 1.3, 'nausea': 1, 'light': 0.9, 'sound': 0.9, 'aura': 1.4 },
    tests: ['Clinical diagnosis first', 'Neuroimaging if red flags', 'BP check'], sources: ['WHO', 'NIH'],
    explain: 'Recurrent unilateral throbbing headache with nausea/photophobia fits migraine pattern; thunderclap onset is not migraine.' },
  { name: 'Iron deficiency anemia (differential)', systems: ['endocrine_metabolic', 'hematologic_infectious'], urgency: 'routine', specialist: 'Physician / Hematology',
    weights: { 'fatigue': 1.3, 'tired': 1.2, 'weak': 1.1, 'pale': 1.2, 'anemia': 2, 'hb': 1.5, 'heavy period': 1.3 },
    tests: ['CBC', 'Serum ferritin', 'Iron studies'], sources: ['WHO', 'ICMR'],
    explain: 'Very common; confirm with iron studies before long-term iron therapy.' },
  { name: 'Type 2 diabetes / hyperglycemia (differential)', systems: ['endocrine_metabolic'], urgency: 'routine', specialist: 'Diabetologist / Physician',
    weights: { 'diabet': 2.5, 'thirst': 1.3, 'urin': 1.2, 'frequent urination': 1.4, 'blur': 1, 'weight loss': 1.1, 'sugar': 1.3, 'glucose': 1.3 },
    tests: ['Fasting / random glucose', 'HbA1c', 'Urine ketones if unwell'], sources: ['ICMR', 'WHO'],
    explain: 'Polyuria with thirst suggests screening; acute vomiting with high sugars needs urgent care.' },
  { name: 'Hypothyroidism (differential)', systems: ['endocrine_metabolic'], urgency: 'routine', specialist: 'Endocrinologist / Physician',
    weights: { 'thyroid': 2, 'tsh': 2, 'fatigue': 1, 'weight gain': 1.1, 'cold': 0.8, 'hair': 0.9, 'constipat': 0.9 },
    tests: ['TSH', 'Free T4', 'Anti-TPO if indicated'], sources: ['AIIMS', 'ICMR'],
    explain: 'Non-specific symptoms; labs clarify; do not adjust levothyroxine without clinician.' },
  { name: 'Polycystic ovary syndrome (PCOS) (differential)', systems: ['reproductive', 'endocrine_metabolic'], urgency: 'routine', specialist: 'Gynaecologist / Endocrinologist',
    weights: { 'pcos': 2.5, 'irregular': 1.3, 'period': 1, 'acne': 1.1, 'hair growth': 1.2, 'weight gain': 1 },
    tests: ['Pelvic ultrasound', 'LH/FSH, testosterone panel per protocol', 'Glucose / HbA1c'], sources: ['AIIMS', 'WHO'],
    explain: 'Rotterdam criteria used clinically; metabolic screening often added.' },
  { name: 'Urinary tract infection (differential)', systems: ['genitourinary'], urgency: 'routine', specialist: 'Physician / Urologist',
    weights: { 'uti': 2.5, 'burning urin': 1.8, 'frequent urination': 1.2, 'fever': 0.9, 'flank': 1.1 },
    tests: ['Urine routine / culture', 'CBC if fever'], sources: ['NIH', 'ICMR'],
    explain: 'Dysuria with frequency suggests UTI; fever and flank pain raise concern for kidney involvement.' },
  { name: 'Gastro-oesophageal reflux / gastritis (differential)', systems: ['gastrointestinal'], urgency: 'routine', specialist: 'Gastroenterologist / Physician',
    weights: { 'heartburn': 1.8, 'acid': 1.5, 'gerd': 2.2, 'nausea': 0.9, 'epigastric': 1.2, 'stomach pain': 1.1 },
    tests: ['Trial PPI per doctor', 'H. pylori testing if indicated', 'Endoscopy if alarm symptoms'], sources: ['NIH', 'Mayo Clinic'],
    explain: 'Alarm features (weight loss, bleed, dysphagia) need prompt endoscopic evaluation.' },
  { name: 'Hypertension / stress-related symptoms (differential)', systems: ['cardiovascular', 'neurological'], urgency: 'routine', specialist: 'Physician / Cardiologist',
    weights: { 'blood pressure': 1.8, 'hypertension': 2.2, 'bp high': 1.8, 'headache': 0.8, 'stress': 1, 'anxiety': 0.9 },
    tests: ['BP monitoring', 'Basic metabolic panel', 'ECG'], sources: ['WHO', 'ICMR'],
    explain: 'Elevated BP readings should be confirmed and evaluated for secondary causes if young or severe.' },
  { name: 'Anxiety / panic attack (differential)', systems: ['neurological', 'cardiovascular'], urgency: 'routine', specialist: 'Psychiatrist / Physician',
    weights: { 'panic': 2.2, 'anxiety': 1.5, 'palpitation': 1.2, 'chest tight': 1, 'dizz': 0.9, 'tingl': 0.8 },
    tests: ['ECG to exclude cardiac', 'Thyroid panel if hyperthyroid suspected', 'Clinical assessment'], sources: ['NHS', 'NIH'],
    explain: 'Must exclude cardiac and thyroid causes before attributing chest symptoms to anxiety alone.' },
];

function scoreBodySystems(text) {
  const scores = {};
  for (const row of BODY_SYSTEM_SIGNALS) {
    let s = 0;
    for (const k of row.keys) {
      if (text.includes(k)) s += 1 + Math.min(0.5, k.length / 40);
    }
    scores[row.sys] = s;
  }
  if (!Object.values(scores).some(v => v > 0)) scores.general = 0.6;
  return scores;
}

function pickActiveSystems(scores) {
  const entries = Object.entries(scores).filter(([, v]) => v > 0);
  if (!entries.length) return ['general'];
  const max = Math.max(...entries.map(([, v]) => v));
  const thresh = Math.max(max * 0.35, 0.55);
  const picked = entries.filter(([, v]) => v >= thresh).map(([k]) => k);
  if (!picked.length) {
    entries.sort((a, b) => b[1] - a[1]);
    return [entries[0][0], entries[1]?.[0]].filter(Boolean);
  }
  return picked;
}

/** Primary body system = highest signal (ignore "general" if a real system scores) */
function pickPrimarySystem(systemScores) {
  const entries = Object.entries(systemScores).filter(([k, v]) => k !== 'general' && v > 0);
  if (!entries.length) return 'general';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function phraseIsLowSpecificity(phrase) {
  return LOW_SPECIFICITY_PHRASES.some(p => phrase === p || phrase.includes(p) || p.includes(phrase));
}

/** Neurological “weak” is specific — don’t treat as vague fatigue */
function textHasFocalNeuroWeakness(text) {
  return /\b(weakness one side|one side weak|face droop|slurred|numbness one side)\b/i.test(text);
}

function diseaseWeightedScoreBreakdown(rule, text) {
  let specific = 0;
  let nonspecific = 0;
  const matchedSpec = [];
  const matchedNon = [];
  for (const [phrase, w] of Object.entries(rule.weights)) {
    if (!text.includes(phrase)) continue;
    if (phrase === 'weak' && textHasFocalNeuroWeakness(text)) {
      specific += w;
      matchedSpec.push(phrase);
      continue;
    }
    if (phraseIsLowSpecificity(phrase)) {
      nonspecific += w;
      matchedNon.push(phrase);
    } else {
      specific += w;
      matchedSpec.push(phrase);
    }
  }
  return { specific, nonspecific, matchedSpec, matchedNon };
}

function diseaseWeightedScore(rule, text) {
  const b = diseaseWeightedScoreBreakdown(rule, text);
  return b.specific + b.nonspecific;
}

/** Step 5: vague symptoms cannot elevate non–primary-system diseases */
function applyLowSpecificityDampening(rule, text, primarySystem) {
  const b = diseaseWeightedScoreBreakdown(rule, text);
  let raw = b.specific + b.nonspecific;
  if (b.specific < 0.05 && b.nonspecific > 0) {
    const touchesPrimary = rule.systems.includes(primarySystem);
    raw *= touchesPrimary ? LOW_SPEC_DAMPEN_PRIMARY : LOW_SPEC_DAMPEN_NON_PRIMARY;
  }
  return raw;
}

/**
 * Step 6: three urgency levels — emergency ONLY if HIGH criteria match (no disease-score escalation).
 */
function evaluateUrgencyTriage(text) {
  const t = text;
  const HIGH_PATTERNS = [
    /\b(severe chest pain|crushing chest|heart attack|myocardial)\b/i,
    /\b(difficult(y)?\s+breathing|cannot breathe|can't breathe|gasping|choking|not getting air)\b/i,
    /\b(severe shortness|sob at rest|speak(ing)? in (one|single) word)\b/i,
    /\b(spo2|o2\s*sat|oxygen\s*sat|oxygen|saturat).{0,18}?(?:9[01]|[0-8]\d)\s*%?\b/i,
    /\b(sats?\s*(?:of|is|at|:)?\s*(?:9[01]|[0-8]\d))\b/i,
    /\b(unconscious|unresponsive|not waking|passed out)\b/i,
    /\b(confus(ed|ion)|altered mental|disoriented)\b/i,
    /\b(blue lips|cyanosis|cyanotic|lips turning blue)\b/i,
    /\b(seizure|convulsing|status epilepticus)\b/i,
    /\b(thunderclap headache|worst headache|sudden severe headache)\b/i,
    /\b(stiff neck)\b.*\b(fever|high temp)|\b(fever|high temp).{0,30}\b(stiff neck)\b/i,
    /\b(one side weak|facial droop|slurred speech|sudden weakness)\b/i,
    /\b(severe bleed|hematemesis|blood vomit|massive bleed)\b/i,
  ];
  const MODERATE_PATTERNS = [
    /\b(fever|temperature).{0,50}?(>\s*3|more than three|four|five|several).{0,15}day/i,
    /\b(persistent fever|prolonged fever)\b/i,
    /\bworsening cough\b/i,
    /\bmoderate breathlessness|moderate shortness|quite breathless\b/i,
    /\b(chest pain).{0,40}(when (i )?breathe|breathing in|pleuritic|sharp stabbing)\b/i,
    /\b(very high fever|dehydrat|persistent vomit|non.stop vomit)\b/i,
  ];

  if (HIGH_PATTERNS.some(re => re.test(t))) {
    return {
      tier: 'HIGH',
      emergency: true,
      message: 'Urgency: HIGH — features suggest you need emergency care now (or immediate EMS). Do not use this app to delay calling your local emergency number.',
    };
  }
  if (MODERATE_PATTERNS.some(re => re.test(t))) {
    return {
      tier: 'MODERATE',
      emergency: false,
      message: 'Urgency: MODERATE — arrange same-day or next-day in-person medical review; go to emergency if symptoms worsen rapidly.',
    };
  }
  return {
    tier: 'LOW',
    emergency: false,
    message: 'Urgency: LOW — routine self-care and outpatient follow-up are usually appropriate if symptoms stay mild and stable; seek care sooner if anything worsens.',
  };
}

function softmaxNormalize(rawArr, temperature) {
  const T = temperature || 1.35;
  if (!rawArr.length) return [];
  const m = Math.max(...rawArr);
  const exps = rawArr.map(x => Math.exp((x - m) / T));
  const s = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map(e => e / s);
}

/** Renormalize a subset of probabilities to sum to 1 (for display after pruning) */
function renormalizeSubset(items, key = 'p') {
  const s = items.reduce((a, x) => a + x[key], 0) || 1;
  return items.map(x => ({ ...x, [key]: x[key] / s }));
}

function confidenceTierFromProb(p, rank) {
  if (rank === 0 && p >= 0.35) return 'High';
  if (p >= 0.25 || (rank === 1 && p >= 0.2)) return 'High';
  if (p >= 0.15 || rank <= 2) return 'Moderate';
  return 'Low';
}

function tierToBarPercent(tier, p) {
  if (tier === 'High') return Math.round(72 + Math.min(23, p * 80));
  if (tier === 'Moderate') return Math.round(42 + p * 100);
  return Math.round(18 + p * 120);
}

function mapTestsToDiseases(topDiseases, minP) {
  const cutoff = minP || 0.08;
  const bag = [];
  for (const row of topDiseases) {
    if (row.p < cutoff) continue;
    for (const t of row.tests) {
      if (!bag.includes(t)) bag.push(t);
    }
  }
  if (!bag.length) bag.push('Clinical review and examination by a qualified physician');
  return bag.slice(0, 12);
}

function aggregateSpecialist(top) {
  const order = ['Emergency', 'Cardiologist', 'Pulmonologist', 'Physician', 'General Physician'];
  for (const key of order) {
    const hit = top.find(r => (r.specialist || '').includes(key));
    if (hit) return hit.specialist;
  }
  return top[0]?.specialist || 'General Physician';
}

function buildConditionRow(row, idx, text, activeSystems, pDisplay) {
  const tier = confidenceTierFromProb(pDisplay, idx);
  const bar = tierToBarPercent(tier, pDisplay);
  const b = diseaseWeightedScoreBreakdown(row, text);
  const matched = [...b.matchedSpec, ...b.matchedNon].slice(0, 6);
  return {
    name: row.name,
    confidence_tier: tier,
    confidence: bar,
    normalized_probability: Math.round(pDisplay * 1000) / 1000,
    body_systems: row.systems,
    category: tier === 'Low' ? 'screening' : 'likely',
    sources: row.sources,
    source_links: SOURCE_LINKS,
    reason: `Signals: ${matched.length ? matched.join(', ') : 'non-specific'} · systems ${row.systems.join(', ')} · normalized share after pruning`,
    clinical_explanation: row.explain,
  };
}

function runDiagnosticPipeline(rawSymptoms) {
  const text = (rawSymptoms || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const urgency = evaluateUrgencyTriage(text);
  const systemScores = scoreBodySystems(text);
  const primarySystem = pickPrimarySystem(systemScores);
  const activeSystems = pickActiveSystems(systemScores);
  const systemLabels = activeSystems.map(s => SYSTEM_LABELS[s] || s).join(' · ');
  const primaryLabel = SYSTEM_LABELS[primarySystem] || primarySystem;

  let pool = DISEASE_RULES.filter(rule =>
    rule.systems.some(s => activeSystems.includes(s)) || activeSystems.includes('general')
  );
  if (!pool.length) pool = [...DISEASE_RULES];

  const respiratoryDominant = primarySystem === 'respiratory' &&
    (/\b(cough|wheeze|wheezy|phlegm|sputum|shortness|breathless|sob|chest tight|cold|congest)\b/i.test(text));

  const working = pool.map(rule => {
    let raw = applyLowSpecificityDampening(rule, text, primarySystem);
    raw *= 1 + 0.06 * rule.systems.filter(s => activeSystems.includes(s)).length;
    if (primarySystem && rule.systems.includes(primarySystem)) raw *= PRIMARY_SYSTEM_MATCH_MULT;
    else if (primarySystem !== 'general') raw *= NON_PRIMARY_SYSTEM_MULT;
    return { rule, raw };
  });

  const withSignal = working.filter(x => x.raw > 0);
  const baseList = withSignal.length ? withSignal : working.map(x => ({ ...x, raw: Math.max(0.08, x.raw + 0.12) }));

  const rawVals = baseList.map(x => x.raw);
  const probs = softmaxNormalize(rawVals);
  let rankedFull = baseList.map((x, i) => ({ ...x.rule, p: probs[i], raw: x.raw })).sort((a, b) => b.p - a.p);

  /** Step 1–2: relevance threshold + max 5 differential (by global normalized p) */
  const aboveCut = rankedFull.filter(r => r.p >= RELEVANCE_THRESHOLD);
  let likelyRows = aboveCut.slice(0, MAX_DIFFERENTIAL);
  let likelyRenorm = renormalizeSubset(likelyRows.map(r => ({ ...r })), 'p');

  if (!likelyRenorm.length && rankedFull.length) {
    likelyRenorm = renormalizeSubset(rankedFull.slice(0, MAX_DIFFERENTIAL).map(r => ({ ...r })), 'p');
  }

  /** Step 3: screening pool — below threshold, weak-signal, or Low-tier outside top slice */
  const likelyNames = new Set(likelyRenorm.map(r => r.name));
  const screeningPool = [];

  for (const r of rankedFull) {
    if (likelyNames.has(r.name)) continue;
    if (r.p < SCREENING_PROB_MIN) continue;
    if (r.p >= RELEVANCE_THRESHOLD) continue;
    screeningPool.push(r);
  }

  for (const r of rankedFull) {
    if (likelyNames.has(r.name)) continue;
    if (SCREENING_PRONE_NAMES.test(r.name) && respiratoryDominant && r.p >= SCREENING_PROB_MIN) {
      if (!screeningPool.find(x => x.name === r.name)) screeningPool.push(r);
    }
  }

  for (let i = 0; i < rankedFull.length; i++) {
    const r = rankedFull[i];
    const tier = confidenceTierFromProb(r.p, i);
    if (tier === 'Low' && r.p >= SCREENING_PROB_MIN && !likelyNames.has(r.name) && !screeningPool.find(x => x.name === r.name)) {
      screeningPool.push(r);
    }
  }

  screeningPool.sort((a, b) => b.p - a.p);
  let screeningSlice = screeningPool.slice(0, MAX_SCREENING).map(r => ({
    name: r.name,
    normalized_probability: Math.round(r.p * 1000) / 1000,
    body_systems: r.systems,
    clinical_explanation: r.explain,
    reason: 'Weak or non-specific signal vs primary presentation — consider if symptoms persist or evolve.',
  }));

  const predicted_conditions = likelyRenorm.map((row, idx) => {
    const obj = buildConditionRow(row, idx, text, activeSystems, row.p);
    obj.category = obj.confidence_tier === 'Low' ? 'screening' : 'likely';
    return obj;
  });

  /** Low-confidence rows in the top slice → screening section (e.g. fatigue-driven anemia when cough dominates) */
  predicted_conditions.filter(c => c.confidence_tier === 'Low').forEach(c => {
    if (!screeningSlice.find(s => s.name === c.name)) {
      screeningSlice.unshift({
        name: c.name,
        normalized_probability: c.normalized_probability,
        body_systems: c.body_systems,
        clinical_explanation: c.clinical_explanation,
        reason: 'Low relevance in this context — kept for screening only.',
      });
    }
  });
  const seenSc = new Set();
  screeningSlice = screeningSlice.filter(s => {
    if (seenSc.has(s.name)) return false;
    seenSc.add(s.name);
    return true;
  }).slice(0, MAX_SCREENING);

  /** Likely differential = High + Moderate only (max 5 already enforced upstream) */
  let predicted_final = predicted_conditions.filter(c => c.confidence_tier === 'High' || c.confidence_tier === 'Moderate');
  if (!predicted_final.length && predicted_conditions.length && !screeningSlice.length) {
    predicted_final = [predicted_conditions[0]];
  }

  const testsLikely = mapTestsToDiseases(
    likelyRenorm.filter((r, i) => {
      const t = confidenceTierFromProb(r.p, i);
      return t === 'High' || t === 'Moderate';
    }),
    RELEVANCE_THRESHOLD * 0.5
  );
  const screeningForTests = screeningSlice.slice(0, 2).map(s => rankedFull.find(r => r.name === s.name)).filter(Boolean);
  const testsExtra = mapTestsToDiseases(screeningForTests, 0.04);
  const recommended_tests = [...testsLikely];
  testsExtra.forEach(t => { if (!recommended_tests.includes(t) && recommended_tests.length < 12) recommended_tests.push(t); });

  let risk_level = 'Low';
  if (urgency.tier === 'HIGH') risk_level = 'High';
  else if (urgency.tier === 'MODERATE') risk_level = 'Moderate';
  else if (likelyRenorm[0]?.p >= 0.3) risk_level = 'Moderate';

  const diet = ['Adequate fluids (unless fluid-restricted)', 'Balanced meals; limit ultra-processed foods', 'Avoid self-medicating with antibiotics'];
  const lifestyle = ['Rest until evaluated if fever or systemic symptoms', 'Track symptoms (timing, triggers)', 'Escalate care if red flags appear'];

  return {
    needs_more_info: false,
    follow_up_questions: [],
    pipeline_meta: {
      urgency_tier: urgency.tier,
      urgency_message: urgency.message,
      safety_level: urgency.emergency ? 'emergency' : urgency.tier === 'MODERATE' ? 'urgent' : 'routine',
      primary_system: primarySystem,
      primary_system_label: primaryLabel,
      active_systems: activeSystems,
      system_labels: systemLabels,
      system_scores: systemScores,
      relevance_threshold: RELEVANCE_THRESHOLD,
      steps: [
        'Urgency triage (HIGH / MODERATE / LOW)',
        'Body systems + primary system',
        'Symptom weighting + low-specificity dampen',
        'Primary-system multiplier',
        'Softmax normalize',
        'Prune < ' + RELEVANCE_THRESHOLD + ' · top ' + MAX_DIFFERENTIAL,
        'Differential vs screening split',
        'Test map',
      ],
    },
    predicted_conditions: predicted_final,
    screening_conditions: screeningSlice,
    risk_level,
    diet_recommendations: diet,
    lifestyle_changes: lifestyle,
    recommended_tests,
    doctor_specialist: aggregateSpecialist(likelyRenorm.length ? likelyRenorm : rankedFull),
    emergency: urgency.emergency === true,
    urgency_message: urgency.message,
    disclaimer: 'This system provides informational insights only. It uses a rule-based pipeline, not a clinical diagnosis. Consult a qualified healthcare professional for diagnosis and treatment.',
  };
}

// ════════════════════════════════════════════════════════
// MULTILINGUAL SYMPTOM NORMALIZATION (Hindi / Hinglish / Marathi → English)
// ════════════════════════════════════════════════════════
const MULTILANG_SYMPTOM_MAP = {
  // Hindi
  'bukhar':'fever','bukhaar':'fever','tez bukhar':'high fever',
  'khansi':'cough','khaansi':'cough','khaansee':'cough',
  'sardi':'cold','jukam':'cold','nazla':'cold',
  'sar dard':'headache','sardard':'headache','sir dard':'headache',
  'pet dard':'stomach pain','pet dukhna':'stomach ache','pet dukh':'stomach pain',
  'ulti':'vomiting','vomiting':'vomiting','ulti aana':'nausea vomiting',
  'dast':'diarrhoea','dast lagna':'diarrhoea',
  'thakan':'fatigue','thakaan':'weakness fatigue','kamzori':'weakness',
  'chakkar':'dizziness','chakkar aana':'dizziness',
  'sans lena mushkil':'difficulty breathing','sans phoolna':'breathlessness',
  'seene mein dard':'chest pain','chat mein dard':'chest pain',
  'khoon':'blood','khoon aana':'bleeding',
  'bar bar peshab':'frequent urination','peshab jalna':'burning urination',
  'bhookh nahi':'loss of appetite','bhookh kam':'poor appetite',
  'neend nahi':'insomnia','neend aana':'sleepiness',
  'ghabdahat':'anxiety palpitations','dil ka dhadkna':'palpitations',
  'aankhon mein dard':'eye pain','aankhein laal':'red eyes',
  'gale mein dard':'sore throat','gala kharaab':'sore throat',
  'pasina':'sweating','adhik pasina':'excessive sweating',
  'wajan badhna':'weight gain','wajan kam hona':'weight loss',
  'sugar':'diabetes sugar','madhumeh':'diabetes',
  'bp high':'high blood pressure','bp':'blood pressure',
  // Marathi
  'tap':'fever','taap':'fever','taaap':'fever',
  'khaokla':'cough','khaokla ahe':'cough',
  'sardi ahe':'cold','sardicha tras':'cold',
  'dokyat dukhna':'headache','dokedukhi':'headache','dokhedukhi':'headache',
  'pot dukhne':'stomach pain','pot dukha':'stomach pain',
  'ulti hone':'vomiting','ulti yethe':'vomiting',
  'julas':'diarrhoea','julaab':'diarrhoea',
  'thakwa':'fatigue weakness','shakti nahi':'weakness fatigue',
  'gheriza':'dizziness','doky ghumne':'dizziness',
  'shvaas ghenya tras':'breathing difficulty','daama':'asthma breathing',
  'chhatit vedana':'chest pain','chhat dukhna':'chest pain',
  'lathkanda':'urine burning','lavkar lavkar lagu':'frequent urination',
  'bhukhech nahi':'loss of appetite','bhook nahi':'poor appetite',
  'ghash yene':'palpitations','dhadhadne':'palpitations',
  'ghabasla':'nausea','matla':'nausea',
  'mala fever aahe':'fever','mala taap ahe':'fever',
  'aahe':'is','mala':'i have',
  // Hinglish
  'body ache':'body ache','body dard':'body ache',
  'sore throat':'sore throat','throat pain':'sore throat',
  'loose motions':'diarrhoea','loose motion':'diarrhoea',
  'pait mein dard':'stomach pain','back pain':'back pain',
  'joint pain':'joint pain','ghutno mein dard':'knee joint pain',
  'skin rash':'skin rash','daane':'skin rash pimples',
  'aankhon se paani':'watery eyes','aankhein dukh':'eye pain',
  'ear pain':'ear pain','kaan mein dard':'ear pain',
};

/**
 * Normalize multilingual/Hinglish symptom text to English.
 * Replaces known non-English phrases with their English equivalents,
 * then passes the result through the standard pipeline.
 */
function normalizeMultilingualSymptoms(raw) {
  if (!raw) return '';
  let text = raw.toLowerCase().trim();
  // Sort keys longest-first to match multi-word phrases first
  const keys = Object.keys(MULTILANG_SYMPTOM_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (text.includes(key)) {
      text = text.split(key).join(MULTILANG_SYMPTOM_MAP[key]);
    }
  }
  return text;
}

// ════════════════════════════════════════════════════════
// SMART DOCTOR RECOMMENDATION (based on predicted condition)
// ════════════════════════════════════════════════════════
const CONDITION_DOCTOR_MAP = [
  { pattern: /eye|conjunctivitis|vision|optic|retinal|glaucoma/i,    specialist: 'Eye Specialist / Ophthalmologist',    filter: 'eye',         icon: '👁' },
  { pattern: /dental|tooth|teeth|gum|oral|cavity|molar/i,           specialist: 'Dentist / Dental Surgeon',            filter: 'dental',      icon: '🦷' },
  { pattern: /pcos|gynaecol|gynecol|menstrual|period|uterus|ovarian|pregnancy/i, specialist: 'Gynaecologist / Obstetrician', filter: 'gynecology', icon: '🏥' },
  { pattern: /heart|cardiac|cardio|coronary|angina|arrhythmia|palpitation/i,     specialist: 'Cardiologist',                filter: 'cardiology', icon: '❤️' },
  { pattern: /child|pediatr|infant|newborn|vaccination|growth chart/i,            specialist: 'Paediatrician',               filter: 'pediatric',  icon: '👶' },
  { pattern: /skin|dermat|rash|eczema|psoriasis|acne|fungal skin/i,              specialist: 'Dermatologist',               filter: 'dermatology',icon: '🧴' },
  { pattern: /ear|nose|throat|ent|sinus|tonsil|adenoid|hearing/i,                specialist: 'ENT Specialist',              filter: 'ent',        icon: '👂' },
  { pattern: /bone|ortho|fracture|joint|arthritis|spine|ligament|muscle tear/i,  specialist: 'Orthopaedic Surgeon',         filter: 'orthopedic', icon: '🦴' },
  { pattern: /thyroid|diabetes|endocrin|hormone|adrenal|pituitary|metabolic/i,   specialist: 'Endocrinologist / Diabetologist', filter: 'general', icon: '🩺' },
  { pattern: /lung|pulmon|asthma|bronchitis|pneumonia|tb|tuberculosis|copd/i,    specialist: 'Pulmonologist',               filter: 'general',    icon: '🫁' },
  { pattern: /homeopathy|homeopathic/i,                                           specialist: 'Homeopathic Practitioner',    filter: 'homeopathy', icon: '🌿' },
  { pattern: /ayurved|ayurvedic|herbal treatment/i,                               specialist: 'Ayurvedic Physician',         filter: 'ayurvedic',  icon: '🍃' },
];

/**
 * Get smart doctor recommendation from conditions array.
 * Returns { specialist, filter, icon } or null.
 */
function getSmartDoctorRec(conditions) {
  const allNames = (conditions || []).map(c => c.name || '').join(' ');
  for (const rule of CONDITION_DOCTOR_MAP) {
    if (rule.pattern.test(allNames)) return rule;
  }
  return null;
}

/**
 * Render smart doctor recommendation banner in chat result card.
 */
function buildDoctorRecBanner(data) {
  const allConds = [...(data.predicted_conditions || []), ...(data.screening_conditions || [])];
  const rec = getSmartDoctorRec(allConds);
  if (!rec) return '';
  return `<div style="margin-top:12px;padding:12px 14px;background:linear-gradient(135deg,var(--teal-l),var(--blue-l));border-radius:var(--radius);border:1px solid var(--teal-l2);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <span style="font-size:22px">${rec.icon}</span>
    <div style="flex:1;min-width:160px">
      <div style="font-size:11px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Recommended Specialist</div>
      <div style="font-size:13px;font-weight:700;color:var(--text)">${rec.specialist}</div>
    </div>
    <button class="btn btn-p btn-sm" onclick="switchToTab('hospitals');setHospFilter(document.querySelector('#hospFilters .filter-btn'),${JSON.stringify(rec.filter)})" style="flex-shrink:0">Find →</button>
  </div>`;
}

// CHAT — INPUT QUALITY (block noise; ask before predicting)
// ════════════════════════════════════════════════════════
const SYMPTOM_LEX = /\b(fever|temperature|chill|pain|ache|hurt|sore|burn|cough|cold|flu|nausea|vomit|throw|diarrh|constipat|bloat|stomach|abdomen|chest|breath|wheeze|dizz|faint|weak|fatigue|tired|headache|migraine|rash|itch|swell|lump|bleed|bruise|urin|thirst|hunger|weight|period|menstr|pcos|pregn|libido|joint|muscle|back|neck|throat|swallow|ear|nose|eye|vision|blur|heart|palpitation|anxiety|panic|depress|sleep|insomnia|diabet|glucose|sugar|thyroid|tsh|anemia|hb|palate|jaundice|yellow|seizure|numb|tingl|infection|wound|injury|fall|accident|covid|dengue|malaria|typhoid|tb|tuberc|std|sti)\b/i;
const DURATION_LEX = /\b(day|week|month|hour|minute|today|yesterday|since|ago|\d+\s*(d|w|m|hr|h|min)|morning|night)\b/i;
const SEVERITY_LEX = /\b(severe|mild|moderate|sharp|dull|constant|comes?\s+and\s+goes|worse|better|\d+\s*\/\s*10)\b/i;

function looksLikeGibberish(s) {
  const t = s.trim();
  if (t.length < 3) return true;
  const letters = (t.match(/[a-zA-Z]/g) || []).length;
  if (letters < 8 && t.length < 35) return true;
  if (!/[a-zA-Z]/.test(t)) return true;
  const words = t.split(/\s+/).filter(w => /[a-zA-Z]/.test(w));
  if (words.length <= 1 && t.length < 25) return true;
  const vow = (t.match(/[aeiouAEIOU]/g) || []).length;
  if (letters > 15 && vow / letters < 0.12) return true;
  return false;
}

function assessSymptomMessage(raw) {
  const s = raw.trim();
  if (!s.length) return { ok: false, kind: 'empty', botHtml: '' };
  if (looksLikeGibberish(s)) {
    return { ok: false, kind: 'gibberish', botHtml: `I didn’t catch a clear health-related message. Please describe <strong>one problem</strong> you’re worried about in plain words (for example: “sore throat and fever for 2 days”).<br><br><span class="disclaimer" style="display:inline-block;margin-top:8px">⚕️ Random or test messages are not analysed — this keeps guidance safer.</span>` };
  }
  if (s.length < 18 && !SYMPTOM_LEX.test(s)) {
    return { ok: false, kind: 'short', botHtml: `That’s a bit too short for a safe guess. Please add: <strong>what</strong> feels wrong, <strong>how long</strong> it’s been going on, and <strong>how bad</strong> it is (e.g. mild vs severe).` };
  }
  if (!SYMPTOM_LEX.test(s)) {
    return { ok: false, kind: 'off_topic', botHtml: `I can only help with <strong>health symptoms or medical questions</strong>. If you’re testing the chat, try a real example like “cough and chest tightness since last week.” Otherwise describe what you feel physically or mentally that worries you.` };
  }
  const hasDuration = DURATION_LEX.test(s);
  const hasSeverity = SEVERITY_LEX.test(s);
  if (!hasDuration && !hasSeverity && s.length < 72) {
    return { ok: false, kind: 'need_detail', botHtml: `Thanks — I need a little more detail for a safe analysis:<br><br>• <strong>How long</strong> have these symptoms been present?<br>• <strong>How severe</strong> are they (mild / moderate / severe)?<br>• <strong>Age &amp; gender</strong> — helps narrow possibilities?<br>• Any <strong>allergies, existing conditions</strong> (e.g. diabetes, BP)?<br>• Currently on any <strong>medications</strong>?<br>• Any <strong>other symptoms</strong> (fever, rash, weight change)?<br><br>Reply with those details and I'll continue.` };
  }
  return { ok: true, kind: 'ok', botHtml: '' };
}

// ════════════════════════════════════════════════════════
// CHAT
// ════════════════════════════════════════════════════════
function addMsg(txt, who, extra) {
  const box = document.getElementById('msgs');
  const d = document.createElement('div');
  d.className = 'msg ' + who + ' fade-in';
  if (who === 'bot') {
    d.innerHTML = '<div class="msg-lbl">HealthEcho</div>' + txt;
    if (extra) d.appendChild(buildResultCard(extra));
  } else {
    d.textContent = txt;
  }
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function addTypingIndicator() {
  const box = document.getElementById('msgs');
  const d = document.createElement('div');
  d.className = 'typing-indicator fade-in';
  d.id = 'typingIndicator';
  d.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function removeTypingIndicator() {
  document.getElementById('typingIndicator')?.remove();
}

function chipSend(txt) {
  document.getElementById('inp').value = txt;
  doSend();
}

async function doSend() {
  const inp = document.getElementById('inp');
  const sbtn = document.getElementById('sbtn');
  const txt = inp.value.trim();
  if (!txt) return;

  // Normalize multilingual input (Hindi/Hinglish/Marathi) to English for pipeline
  const normalizedTxt = normalizeMultilingualSymptoms(txt);
  const txtForPipeline = normalizedTxt !== txt.toLowerCase().trim() ? normalizedTxt : txt;

  const gate = assessSymptomMessage(txtForPipeline);
  if (!gate.ok) {
    inp.value = '';
    document.getElementById('chips').style.display = 'none';
    addMsg(txt, 'user');
    addMsg(gate.botHtml, 'bot');
    STATE.chatHistory.push({ role: 'user', content: txt }, { role: 'assistant', content: '[clarification]' });
    return;
  }
  inp.value = '';
  // Blur input on mobile to dismiss keyboard after send
  inp.blur();
  document.getElementById('chips').style.display = 'none';
  addMsg(txt, 'user');
  STATE.chatHistory.push({ role: 'user', content: txt });

  sbtn.disabled = true;
  addTypingIndicator();

  const startTime = Date.now();
  const data = runDiagnosticPipeline(txtForPipeline);
  const elapsed = Date.now() - startTime;

  removeTypingIndicator();
  sbtn.disabled = false;

  if (data.needs_more_info) {
    let qs = (data.follow_up_questions || []).filter(Boolean);
    if (!qs.length) qs = ['How long have symptoms lasted?', 'Any fever, pain location, or triggers?', 'Current medicines or chronic conditions?'];
    const qBlock = qs.map(q => `• ${q}`).join('<br>');
    addMsg(`Before I suggest possible explanations, I need a bit more information:<br><br>${qBlock}<br><br><span style="font-size:11px;color:var(--hint)">Reply with answers in your next message.</span>`, 'bot');
    STATE.chatHistory.push({ role: 'assistant', content: JSON.stringify(data) });
    return;
  }

  const src = 'Pipeline: triage → primary system → specificity dampen → primary multiplier → normalize → prune (below 0.15) → top 5 → likely vs screening → tests';
  addMsg(`Analysis using the structured pipeline below (${(elapsed / 1000).toFixed(1)}s). <span style="font-size:11px;color:var(--hint)">${src}</span>`, 'bot', data);
  STATE.chatHistory.push({ role: 'assistant', content: JSON.stringify(data) });
  saveConsultation(txt, data);
}

function clearChat() {
  document.getElementById('msgs').innerHTML = `
    <div class="msg bot fade-in">
      <div class="msg-lbl">HealthEcho</div>
      Chat cleared. Describe your symptoms and I'll help analyse them. <em>I provide informational insights only — always consult a doctor.</em>
    </div>`;
  STATE.chatHistory = [];
  document.getElementById('chips').style.display = 'flex';
}

function buildResultCard(data) {
  const div = document.createElement('div');
  div.className = 'res-card';
  if (!(data.predicted_conditions || []).length && !(data.screening_conditions || []).length) {
    div.innerHTML = `<div class="res-title">Analysis</div><div class="disclaimer">No structured conditions were returned. Please try again with clearer duration, location, and severity — or check that your AI backend is running.</div>`;
    return div;
  }

  const pm = data.pipeline_meta || {};
  const prim = pm.primary_system_label ? `<strong>Primary system:</strong> ${pm.primary_system_label}<br>` : '';
  const urgMsg = data.urgency_message || (pm.urgency_tier === 'HIGH' ? 'HIGH urgency' : pm.urgency_tier === 'MODERATE' ? 'Moderate urgency' : 'Low urgency');
  const pipelineBlurb = (pm.system_labels || pm.primary_system_label)
    ? `<div class="pipeline-meta">${prim}<strong>Systems in play:</strong> ${pm.system_labels || '—'}<br><strong>Urgency triage:</strong> ${urgMsg}<br><strong>Pipeline:</strong> ${(pm.steps || []).join(' → ')}</div>`
    : (data.urgency_message ? `<div class="pipeline-meta"><strong>Urgency triage:</strong> ${data.urgency_message}</div>` : '');

  const renderCond = c => {
    const tier = c.confidence_tier || (c.confidence >= 70 ? 'High' : c.confidence >= 45 ? 'Moderate' : 'Low');
    const tierCls = tier === 'High' ? 'tier-h' : tier === 'Moderate' ? 'tier-m' : 'tier-l';
    const conf = Math.min(100, Math.max(8, c.confidence != null ? c.confidence : 40));
    const confColor = tier === 'High' ? 'var(--teal)' : tier === 'Moderate' ? 'var(--amber)' : 'var(--muted)';
    const pNorm = c.normalized_probability != null ? ` · p̂ ${(c.normalized_probability * 100).toFixed(1)}%` : '';
    const sysTags = (c.body_systems || []).map(s => `<span class="badge bb">${SYSTEM_LABELS[s] || s}</span>`).join('');
    const links = c.source_links || SOURCE_LINKS;
    const srcs = (c.sources || []).map(s => {
      const url = links[s] || SOURCE_LINKS[s] || '#';
      return `<a class="src-badge" href="${url}" target="_blank" rel="noopener">${s} ↗</a>`;
    }).join('');
    return `<div class="cond-block">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:700;color:var(--text);flex:1;min-width:140px">${c.name}</span>
        <span class="${tierCls}">${tier} confidence</span>
      </div>
      <div style="margin-top:6px;font-size:10px;color:var(--hint)">Normalized rank weight${pNorm}</div>
      <div class="conf-bar" style="margin-top:8px"><div class="conf-fill" style="width:${conf}%;background:linear-gradient(90deg,${confColor},var(--purple))"></div></div>
      ${sysTags ? `<div class="hmeta" style="margin-top:8px">${sysTags}</div>` : ''}
      ${c.reason ? `<div style="font-size:11px;color:var(--hint);margin-top:5px;font-style:italic">Why: ${c.reason}</div>` : ''}
      <div style="margin-top:5px">${srcs}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.65">${c.clinical_explanation || ''}</div>
    </div>`;
  };

  let condHTML = '<div class="sec-lbl" style="margin-bottom:10px">Likely conditions (High / Moderate)</div>';
  const lik = data.predicted_conditions || [];
  if (!lik.length) condHTML += '<div style="font-size:12px;color:var(--hint);margin-bottom:12px">No conditions met the relevance bar — see screening list or add more specific symptoms.</div>';
  lik.forEach(c => { condHTML += renderCond(c); });

  const scr = data.screening_conditions || [];
  if (scr.length) {
    condHTML += '<div class="sec-lbl" style="margin:18px 0 10px">Screening only (low relevance / weak signals)</div>';
    scr.forEach(s => {
      const sysTags = (s.body_systems || []).map(x => `<span class="badge bb">${SYSTEM_LABELS[x] || x}</span>`).join('');
      condHTML += `<div class="cond-block" style="opacity:.92;border-style:dashed">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
          <span style="font-size:13px;font-weight:700;color:var(--text)">${s.name}</span>
          <span class="tier-l">Screening</span>
        </div>
        <div style="margin-top:6px;font-size:10px;color:var(--hint)">p̂ ${((s.normalized_probability || 0) * 100).toFixed(1)}% · not in main differential</div>
        ${sysTags ? `<div class="hmeta" style="margin-top:8px">${sysTags}</div>` : ''}
        ${s.reason ? `<div style="font-size:11px;color:var(--hint);margin-top:5px;font-style:italic">${s.reason}</div>` : ''}
        <div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.65">${s.clinical_explanation || ''}</div>
      </div>`;
    });
  }

  const rl = data.risk_level || 'Unknown';
  const rlc = rl === 'High' ? 'risk-high' : rl === 'Moderate' ? 'risk-mod' : 'risk-low';
  const tests = (data.recommended_tests || []).map(t => `<span class="tag tag-b">${t}</span>`).join('');
  const diet = (data.diet_recommendations || []).map(t => `<span class="tag">${t}</span>`).join('');
  const life = (data.lifestyle_changes || []).map(t => `<span class="tag tag-p">${t}</span>`).join('');

  div.innerHTML = `
    <div class="res-title">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
      Analysis Result
      <span style="margin-left:auto;font-size:10px;color:var(--hint);font-weight:400;font-family:var(--mono)">Sources: WHO · ICMR · CDC · AIIMS · NIH</span>
    </div>
    ${pipelineBlurb}
    ${condHTML}
    <div class="res-row"><span class="res-lbl">Risk Level</span><span class="res-val ${rlc}">● ${rl}</span></div>
    <div class="res-row"><span class="res-lbl">See Specialist</span><span class="res-val">${data.doctor_specialist || '—'}</span></div>
    ${tests ? `<div style="padding:7px 0;border-top:1px solid var(--border2)"><div class="sec-lbl" style="margin-bottom:5px">Recommended Tests</div>${tests}</div>` : ''}
    ${diet ? `<div style="padding:7px 0;border-top:1px solid var(--border2)"><div class="sec-lbl" style="margin-bottom:5px">Diet Tips</div>${diet}</div>` : ''}
    ${life ? `<div style="padding:7px 0;border-top:1px solid var(--border2)"><div class="sec-lbl" style="margin-bottom:5px">Lifestyle Changes</div>${life}</div>` : ''}
    ${data.emergency ? `<div class="emergency">⚠️ HIGH urgency — emergency pattern in your text. Call emergency services or go to the nearest ER now. Do not use this app to delay care.</div>` : ''}
    ${!data.emergency && pm.urgency_tier === 'MODERATE' ? `<div class="emergency" style="animation:none;background:var(--amber-l);color:var(--amber-d);border-color:var(--amber)">⚡ MODERATE urgency — arrange same-day or next-day medical review.</div>` : ''}
    ${buildDoctorRecBanner(data)}
    <div class="disclaimer">⚕️ ${data.disclaimer}</div>`;
  return div;
}

// ════════════════════════════════════════════════════════
// CONSULTATIONS
// ════════════════════════════════════════════════════════
async function saveConsultation(symptoms, data) {
  if (!STATE.user) return;
  if (data.needs_more_info) return;
  if (!(data.predicted_conditions || []).length && !(data.screening_conditions || []).length) return;
  const entry = {
    id: Date.now(),
    symptoms,
    predicted_conditions: data.predicted_conditions || [],
    screening_conditions: data.screening_conditions || [],
    risk_level: data.risk_level || 'Unknown',
    diet: data.diet_recommendations || [],
    lifestyle: data.lifestyle_changes || [],
    tests: data.recommended_tests || [],
    specialist: data.doctor_specialist || '',
    pipeline_meta: data.pipeline_meta || null,
    urgency_message: data.urgency_message || '',
    emergency: !!data.emergency,
    timestamp: new Date().toISOString(),
    user_id: STATE.user.id
  };
  STATE.consultations.unshift(entry);
  if (STATE.user && window._FB) {
    try {
      const { db, collection, addDoc, serverTimestamp } = window._FB;
      await addDoc(collection(db, 'consultations'), { ...entry, created_at: serverTimestamp() });
    } catch(e) { console.warn('Save consultation error:', e); }
  }
}

async function loadUserConsultations() {
  if (!STATE.user || !window._FB) {
    STATE.consultations = [];
    return;
  }
  try {
    const { db, collection, query, where, getDocs } = window._FB;
    const q = query(collection(db, 'consultations'), where('user_id', '==', STATE.user.id));
    const snap = await getDocs(q);
    const remote = snap.docs.map(d => ({ id: d.id, ...d.data(), timestamp: d.data().created_at?.toDate?.()?.toISOString() || d.data().timestamp || new Date().toISOString() }));
    const localTs = (e) => new Date(e.timestamp || 0).getTime();
    STATE.consultations = remote.sort((a, b) => localTs(b) - localTs(a));
  } catch(e) {
    STATE.consultations = [];
  }
}

// ════════════════════════════════════════════════════════
// HISTORY
// ════════════════════════════════════════════════════════
function renderHistory() {
  const list = document.getElementById('histList');
  if (!STATE.user) {
    list.innerHTML = '<div style="text-align:center;padding:48px 20px;max-width:400px;margin:0 auto"><div style="font-size:40px;margin-bottom:12px">🔐</div><div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px">Sign in for consultation history</div><div style="font-size:13px;color:var(--muted);line-height:1.65;margin-bottom:18px">Your past AI consults are stored only for logged-in accounts. You can still use AI consult, dashboard (with your uploads), and Find Doctors as a guest.</div><button class="btn btn-p" onclick="showModal(\'loginModal\')">Login / Sign up</button></div>';
    return;
  }
  const search = document.getElementById('histSearch').value.toLowerCase();
  let items = STATE.consultations;
  if (search) items = items.filter(c =>
    c.symptoms?.toLowerCase().includes(search) ||
    c.predicted_conditions?.some(p => p.name?.toLowerCase().includes(search)) ||
    c.screening_conditions?.some(p => p.name?.toLowerCase().includes(search)));
  if (STATE.activeFilter !== 'all') items = items.filter(c => {
    const rl = (c.risk_level || '').toLowerCase();
    if (STATE.activeFilter === 'high') return rl === 'high';
    if (STATE.activeFilter === 'mod') return rl === 'moderate';
    if (STATE.activeFilter === 'low') return rl === 'low';
    return true;
  });
  if (!items.length) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--hint);font-size:13px">No consultations yet. Start by describing your symptoms in AI Consult.</div>';
    return;
  }
  list.innerHTML = items.map(c => {
    const rl = (c.risk_level || '').toLowerCase();
    const pillCls = rl === 'high' ? 'rp-high' : rl === 'moderate' ? 'rp-mod' : 'rp-low';
    const conds = (c.predicted_conditions || []).map(p => `<span class="risk-pill ${pillCls}">${p.name}</span>`).join('') +
      (c.screening_conditions || []).slice(0, 2).map(p => `<span class="risk-pill rp-low">${p.name}*</span>`).join('');
    const dt = c.timestamp ? new Date(c.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const hid = typeof c.id === 'string' ? c.id.replace(/'/g, "\\'") : c.id;
    return `<div class="hist-item fade-in" onclick="showHistDetail('${hid}')">
      <div class="hist-date">${dt}</div>
      <div class="hist-symp">${c.symptoms?.slice(0, 80) || 'Consultation'}${c.symptoms?.length > 80 ? '…' : ''}</div>
      <div class="hist-conds">${conds || '<span class="risk-pill rp-low">' + (c.risk_level || 'Low') + '</span>'}</div>
    </div>`;
  }).join('');
}

function filterHistory() { renderHistory(); }
function setFilter(btn, val) {
  STATE.activeFilter = val;
  document.querySelectorAll('#s-history .filter-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderHistory();
}

function showHistDetail(id) {
  const c = STATE.consultations.find(x => String(x.id) === String(id));
  if (!c) { showToast('Entry not found'); return; }
  const rl = (c.risk_level || '').toLowerCase();
  const rlc = rl === 'high' ? 'risk-high' : rl === 'moderate' ? 'risk-mod' : 'risk-low';
  const conds = (c.predicted_conditions || []).map(p => {
    const tier = p.confidence_tier || '—';
    const conf = Math.min(100, p.confidence || 40);
    const srcs = (p.sources || []).map(s => `<a class="src-badge" href="${SOURCE_LINKS[s]||'#'}" target="_blank">${s}</a>`).join('');
    return `<div class="cond-block">
      <div style="font-size:13px;font-weight:700;color:var(--text)">${p.name} — <span style="font-family:var(--mono)">${tier}</span> <span style="font-size:11px;color:var(--hint)">(${conf}% bar)</span></div>
      <div class="conf-bar"><div class="conf-fill" style="width:${conf}%"></div></div>
      <div style="margin-top:5px">${srcs}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:5px">${p.clinical_explanation || ''}</div>
    </div>`;
  }).join('');
  const pm = c.pipeline_meta;
  const sysLine = pm ? `<div class="pipeline-meta" style="margin-bottom:12px">${pm.primary_system_label ? `<strong>Primary system:</strong> ${pm.primary_system_label}<br>` : ''}<strong>Systems:</strong> ${pm.system_labels || '—'}<br><strong>Urgency triage:</strong> ${(c.urgency_message || pm.urgency_tier || pm.safety_level || '—').toString().replace(/</g, '&lt;')}</div>` : (c.urgency_message ? `<div class="pipeline-meta" style="margin-bottom:12px"><strong>Urgency:</strong> ${c.urgency_message.replace(/</g,'&lt;')}</div>` : '');
  const scr = (c.screening_conditions || []).map(s => `<div class="cond-block" style="opacity:.9;border-style:dashed;margin-bottom:8px"><div style="font-size:12px;font-weight:700">${s.name} <span class="tier-l" style="font-size:9px">Screening</span></div><div style="font-size:11px;color:var(--muted);margin-top:4px">${s.clinical_explanation || ''}</div></div>`).join('');
  document.getElementById('histDetail').innerHTML = `
    <div class="res-row"><span class="res-lbl">Symptoms</span><span class="res-val" style="text-align:left;font-weight:600">${(c.symptoms || '—').replace(/</g,'&lt;')}</span></div>
    ${sysLine}
    <div class="res-row"><span class="res-lbl">Risk Level</span><span class="res-val ${rlc}">● ${c.risk_level}</span></div>
    <div class="res-row"><span class="res-lbl">Specialist</span><span class="res-val">${c.specialist || '—'}</span></div>
    <div style="margin:14px 0">${conds || '<span style="color:var(--hint);font-size:12px">No likely differential saved — see screening.</span>'}</div>
    ${scr ? `<div class="sec-lbl">Screening (saved)</div>${scr}` : ''}
    ${(c.tests || []).length ? `<div class="sec-lbl">Tests</div>${c.tests.map(t => `<span class="tag tag-b">${t}</span>`).join('')}` : ''}
    ${(c.diet || []).length ? `<div class="sec-lbl" style="margin-top:10px">Diet Tips</div>${c.diet.map(t => `<span class="tag">${t}</span>`).join('')}` : ''}
    <div class="disclaimer" style="margin-top:14px">⚕️ Informational insights only. Always consult a qualified healthcare professional.</div>`;
  showModal('histModal');
}

// ════════════════════════════════════════════════════════
// FIREBASE AUTH
// ════════════════════════════════════════════════════════
async function doEmailLogin() {
  const email = document.getElementById('lEmail').value.trim();
  const pw = document.getElementById('lPassword').value;
  if (!email || !pw) { showAuthError('loginError', 'Please fill all fields'); return; }
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.style.display = 'none';
  // Disable button to prevent double-tap on mobile
  const btns = document.querySelectorAll('#loginForm1 .modal-btn');
  btns.forEach(b => { b.disabled = true; b.textContent = 'Logging in…'; });
  try {
    const { auth, signInWithEmailAndPassword } = window._FB;
    await signInWithEmailAndPassword(auth, email, pw);
    hideModal('loginModal');
    showToast('Welcome back!');
  } catch(e) {
    showAuthError('loginError', firebaseErrorMsg(e.code));
  } finally {
    btns.forEach(b => { b.disabled = false; b.textContent = 'Login'; });
  }
}

async function doSignup() {
  const name = document.getElementById('sName').value.trim();
  const age = document.getElementById('sAge').value;
  const gender = document.getElementById('sGender').value;
  const city = document.getElementById('sCity').value.trim();
  const state = document.getElementById('sState').value.trim();
  const phone = document.getElementById('sPhone').value.trim();
  const email = document.getElementById('sEmail').value.trim();
  const pw = document.getElementById('sPassword').value;
  if (!name || !age || !email || !pw) { showAuthError('signupError', 'Please fill all required fields'); return; }
  if (pw.length < 8) { showAuthError('signupError', 'Password must be at least 8 characters'); return; }
  // Clear any previous error
  const errEl = document.getElementById('signupError');
  if (errEl) errEl.style.display = 'none';
  const btn = document.getElementById('signupBtn');
  btn.disabled = true; btn.textContent = 'Creating account…';
  try {
    const { auth, db, createUserWithEmailAndPassword, doc, setDoc, serverTimestamp } = window._FB;
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    const uid = cred.user.uid;
    const userData = { name, age: parseInt(age), gender, city, state, phone, email, created_at: serverTimestamp() };
    await setDoc(doc(db, 'users', uid), userData);
    STATE.user = { id: uid, ...userData };
    hideModal('signupModal');
    showToast('Account created! Welcome, ' + name.split(' ')[0] + '!');
    if (STATE.isFirstVisit) setTimeout(showRoboGuide, 600);
  } catch(e) {
    showAuthError('signupError', firebaseErrorMsg(e.code));
    btn.disabled = false; btn.textContent = 'Create Account';
  }
}

let recaptchaVerifier = null;
function resetRecaptcha() {
  if (recaptchaVerifier) { try { recaptchaVerifier.clear(); } catch(e){} recaptchaVerifier = null; }
  ['recaptcha-container','recaptcha-container-signup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}

async function sendPhoneOTP(mode) {
  const phone = document.getElementById('lPhone').value.trim();
  if (!phone || phone.length < 10) { showAuthError('loginPhoneError', 'Enter a valid phone number with country code (+91...)'); return; }
  try {
    const { auth, RecaptchaVerifier, signInWithPhoneNumber } = window._FB;
    resetRecaptcha();
    recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible', callback: () => {} });
    const btn = document.getElementById('sendOtpBtn');
    btn.disabled = true; btn.textContent = 'Sending…';
    const result = await signInWithPhoneNumber(auth, phone, recaptchaVerifier);
    STATE.phoneConfirmResult = result;
    document.getElementById('otpSection').style.display = 'block';
    startOtpTimer('otpCountdown', () => { btn.disabled = false; btn.textContent = 'Resend OTP'; });
    showToast('OTP sent to ' + phone);
  } catch(e) {
    resetRecaptcha();
    const btn = document.getElementById('sendOtpBtn');
    btn.disabled = false; btn.textContent = 'Send OTP via Firebase';
    showAuthError('loginPhoneError', firebaseErrorMsg(e.code));
  }
}

async function verifyPhoneOTP(mode) {
  const inps = document.querySelectorAll('#loginOtps .otp-inp');
  const code = Array.from(inps).map(i => i.value).join('');
  if (code.length !== 6) { showAuthError('loginPhoneError', 'Enter the 6-digit OTP'); return; }
  if (!STATE.phoneConfirmResult) { showAuthError('loginPhoneError', 'Please request an OTP first'); return; }
  try {
    const cred = await STATE.phoneConfirmResult.confirm(code);
    const { db, doc, getDoc } = window._FB;
    const snap = await getDoc(doc(db, 'users', cred.user.uid));
    if (!snap.exists()) { showAuthError('loginPhoneError', 'No account found. Please sign up.'); return; }
    hideModal('loginModal');
    showToast('Logged in successfully!');
  } catch(e) { showAuthError('loginPhoneError', 'Incorrect OTP. Please try again.'); }
}

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function switchLoginTab(n) {
  document.getElementById('lTab1').classList.toggle('on', n===1);
  document.getElementById('lTab2').classList.toggle('on', n===2);
  document.getElementById('loginForm1').style.display = n===1?'block':'none';
  document.getElementById('loginForm2').style.display = n===2?'block':'none';
}

function firebaseErrorMsg(code) {
  const map = {
    'auth/user-not-found':'No account found. Please sign up.',
    'auth/wrong-password':'Incorrect password.',
    'auth/invalid-email':'Invalid email address.',
    'auth/email-already-in-use':'Email already registered. Please login.',
    'auth/weak-password':'Password too weak — use at least 8 characters.',
    'auth/invalid-phone-number':'Invalid phone number. Use +91XXXXXXXXXX format.',
    'auth/too-many-requests':'Too many attempts. Please wait a moment.',
    'auth/network-request-failed':'Network error. Check your connection.',
    'auth/invalid-verification-code':'Incorrect OTP code.',
    'auth/invalid-credential':'Invalid credentials. Please try again.',
  };
  return map[code] || 'Authentication error. Please try again.';
}

// ════════════════════════════════════════════════════════
// FORGOT PASSWORD — Firebase password reset flow
// ════════════════════════════════════════════════════════

/**
 * Session-level rate-limit tracker.
 * Prevents users from hammering the reset endpoint in quick succession.
 * Resets on page reload (no persistent storage of timestamps).
 */
let _fpLastSent = 0;
const FP_COOLDOWN_MS = 60000; // 60 seconds between requests

/**
 * openForgotPassword()
 * Called when user taps "Forgot Password?" link in the login modal.
 * Closes login modal first, then opens the forgot-password modal fresh.
 */
function openForgotPassword() {
  hideModal('loginModal');
  // Reset the modal to its initial state every time it is opened
  _resetFpModal();
  showModal('forgotPasswordModal');
  // Delay focus slightly so the modal animation completes first (better mobile UX)
  setTimeout(() => {
    const inp = document.getElementById('fpEmail');
    if (inp) inp.focus();
  }, 320);
}

/**
 * closeForgotPassword()
 * Hides the forgot-password modal and resets its state.
 */
function closeForgotPassword() {
  hideModal('forgotPasswordModal');
  _resetFpModal();
}

/**
 * _resetFpModal()  (private helper)
 * Restores the modal to its default state — clears email, hides messages,
 * re-enables the button, and shows the input again.
 */
function _resetFpModal() {
  const emailInp  = document.getElementById('fpEmail');
  const errorEl   = document.getElementById('fpError');
  const successEl = document.getElementById('fpSuccess');
  const inputWrap = document.getElementById('fpInputWrap');
  const btn       = document.getElementById('fpBtn');
  const btnText   = document.getElementById('fpBtnText');
  const spinner   = document.getElementById('fpSpinner');

  if (emailInp)  emailInp.value = '';
  if (errorEl)   { errorEl.textContent = ''; errorEl.style.display = 'none'; }
  if (successEl) successEl.style.display = 'none';
  if (inputWrap) inputWrap.style.display = 'block';
  if (btn)       { btn.disabled = false; btn.classList.remove('loading'); }
  if (btnText)   btnText.textContent = 'Send Reset Link';
  if (spinner)   spinner.style.display = 'none';
}

/**
 * _setFpLoading(isLoading)  (private helper)
 * Toggles the spinner and disables the button while the Firebase call is in-flight.
 */
function _setFpLoading(isLoading) {
  const btn     = document.getElementById('fpBtn');
  const btnText = document.getElementById('fpBtnText');
  const spinner = document.getElementById('fpSpinner');

  if (isLoading) {
    btn.disabled = true;
    btn.classList.add('loading');
    spinner.style.display = 'inline-block';
    btnText.textContent = 'Sending…';
  } else {
    btn.disabled = false;
    btn.classList.remove('loading');
    spinner.style.display = 'none';
    btnText.textContent = 'Send Reset Link';
  }
}

/**
 * doForgotPassword()
 * Main handler — validates email, applies rate-limit, calls Firebase,
 * shows success or error feedback.
 *
 * Security notes:
 *  • Uses Firebase's official sendPasswordResetEmail — password is never touched.
 *  • On auth/user-not-found we still show the generic success message (prevents
 *    email-enumeration attacks). Only network / format errors are surfaced.
 *  • Rate-limited to FP_COOLDOWN_MS per session so rapid re-taps are no-ops.
 */
async function doForgotPassword() {
  const emailInp  = document.getElementById('fpEmail');
  const errorEl   = document.getElementById('fpError');
  const successEl = document.getElementById('fpSuccess');
  const inputWrap = document.getElementById('fpInputWrap');

  // --- 1. Basic email format validation ---
  const email = (emailInp ? emailInp.value : '').trim();
  if (!email) {
    errorEl.textContent = 'Please enter your email address.';
    errorEl.style.display = 'block';
    if (emailInp) emailInp.focus();
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errorEl.textContent = 'Please enter a valid email address (e.g. you@email.com).';
    errorEl.style.display = 'block';
    if (emailInp) emailInp.focus();
    return;
  }

  // --- 2. Session rate-limit check ---
  const now = Date.now();
  if (_fpLastSent && (now - _fpLastSent) < FP_COOLDOWN_MS) {
    const waitSec = Math.ceil((FP_COOLDOWN_MS - (now - _fpLastSent)) / 1000);
    errorEl.textContent = `Please wait ${waitSec}s before requesting another reset link.`;
    errorEl.style.display = 'block';
    return;
  }

  // --- 3. Show loading state ---
  errorEl.style.display = 'none';
  _setFpLoading(true);

  try {
    // --- 4. Firebase call ---
    const { auth, sendPasswordResetEmail } = window._FB;
    await sendPasswordResetEmail(auth, email);
    _fpLastSent = Date.now();  // record timestamp for rate-limiting

    // --- 5. Success state — hide input and button, show confirmation ---
    _setFpLoading(false);
    if (inputWrap) inputWrap.style.display = 'none';
    const btn = document.getElementById('fpBtn');
    if (btn) btn.style.display = 'none';
    successEl.style.display = 'block';

  } catch(e) {
    _setFpLoading(false);
    // auth/user-not-found → show generic success to prevent email enumeration
    if (e.code === 'auth/user-not-found') {
      if (inputWrap) inputWrap.style.display = 'none';
      const btn = document.getElementById('fpBtn');
      if (btn) btn.style.display = 'none';
      successEl.style.display = 'block';
      return;
    }
    // All other errors are safe to surface
    const fpErrorMap = {
      'auth/invalid-email':          'Invalid email address. Please check and try again.',
      'auth/network-request-failed': 'Network error. Please check your connection and try again.',
      'auth/too-many-requests':      'Too many attempts. Please wait a moment before trying again.',
    };
    errorEl.textContent = fpErrorMap[e.code] || 'Something went wrong. Please try again.';
    errorEl.style.display = 'block';
  }
}

async function doLogout() {
  try {
    const { auth, signOut } = window._FB;
    await signOut(auth);
    STATE.reports = [];
    STATE.consultations = [];
    STATE.selectedReportId = null;
    updateAuthUI();
    if (document.getElementById('s-dashboard')?.classList.contains('on')) renderDashboard();
    showToast('Logged out successfully');
  } catch(e) { showToast('Logout error'); }
}

function startOtpTimer(elId, cb) {
  let t = 30;
  const el = document.getElementById(elId);
  if (STATE.otpTimer) clearInterval(STATE.otpTimer);
  STATE.otpTimer = setInterval(() => {
    t--;
    if (el) el.textContent = t + 's';
    if (t <= 0) { clearInterval(STATE.otpTimer); if (el) el.textContent = '0s'; cb && cb(); }
  }, 1000);
}

function otpNav(inp, i, wrapId) {
  if (inp.value) {
    const next = document.querySelectorAll('#' + wrapId + ' .otp-inp')[i+1];
    if (next) next.focus();
  }
}

function updateAuthUI() {
  const navR = document.getElementById('navR');
  const themeBtn = `<button class="theme-toggle" id="themeToggle" onclick="toggleTheme()" title="Toggle theme">${STATE.darkMode ? '🌙' : '☀️'}</button>`;
  if (STATE.user) {
    const initials = STATE.user.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    navR.innerHTML = `<div id="navBackendBadge" class="backend-badge ${getGroqKey()?'online':'offline'}"><div class="backend-dot"></div><span>${getGroqKey()?'Groq AI ⚡':'Groq AI'}</span></div>${themeBtn}<div class="user-pill" onclick="switchToTab('profile')"><div class="av-sm">${initials}</div><span>${STATE.user.name.split(' ')[0]}</span></div>`;
    document.getElementById('profAv').textContent = initials;
    document.getElementById('profName').textContent = STATE.user.name;
    const parts = [];
    if (STATE.user.age) parts.push(STATE.user.age + 'y');
    if (STATE.user.city) parts.push(STATE.user.city);
    document.getElementById('profSub').textContent = parts.join(' · ') || 'Member';
    document.getElementById('profLoginBtn').style.display = 'none';
    document.getElementById('logoutMi').style.display = 'flex';
    document.getElementById('dashGreet').textContent = 'Good ' + getTimeOfDay() + ', ' + STATE.user.name.split(' ')[0];

    // Auto-load hospitals using signup city when user logs in
    // Only do this if hospitals tab is currently active OR no city has been loaded yet
    if (!HOSP_ACTIVE_CITY || HOSP_CITY_SOURCE === 'signup') {
      const hospScr = document.getElementById('s-hospitals');
      if (hospScr && hospScr.classList.contains('on')) {
        loadHospitalsForSignupCity();
      } else {
        // Pre-set city name so it's ready when user navigates there
        const city = getSignupCity();
        if (city) {
          HOSP_ACTIVE_CITY = city;
          HOSP_CITY_SOURCE = 'signup';
          const sub = document.getElementById('hospScreenSub');
          if (sub) sub.textContent = `Hospitals & clinics in ${city}`;
        }
      }
    }
  } else {
    navR.innerHTML = `<div id="navBackendBadge" class="backend-badge offline" style="display:none"><div class="backend-dot"></div><span>AI Offline</span></div>${themeBtn}<button class="btn btn-sm" onclick="showModal('loginModal')">Login</button><button class="btn btn-p btn-sm" onclick="showModal('signupModal')">Sign up</button>`;
    document.getElementById('profAv').textContent = 'G';
    document.getElementById('profName').textContent = 'Guest User';
    document.getElementById('profSub').textContent = 'Login to save consultation history & upload reports';
    document.getElementById('profLoginBtn').style.display = '';
    document.getElementById('logoutMi').style.display = 'none';
  }
  document.querySelectorAll('.nav-history-item').forEach(el => {
    el.classList.toggle('nav-hidden-guest', !STATE.user);
  });
  applyTheme();
}

function getTimeOfDay() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

// ════════════════════════════════════════════════════════
// FILE UPLOAD
// ════════════════════════════════════════════════════════
function handleDragOver(e) { e.preventDefault(); document.getElementById('dropZone').classList.add('over'); }
function handleDragLeave() { document.getElementById('dropZone').classList.remove('over'); }
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('over');
  if (e.dataTransfer.files.length) addFilesToQueue(e.dataTransfer.files);
}
function handleFiles(e) { if (e.target.files.length) addFilesToQueue(e.target.files); e.target.value = ''; }

function addFilesToQueue(files) {
  const fileArr = Array.from(files);
  fileArr.forEach(f => {
    const allowed = ['application/pdf','image/jpeg','image/png','image/heic','image/webp','image/jpg'];
    if (!allowed.includes(f.type) && !f.name.endsWith('.pdf') && !f.name.match(/\.(jpg|jpeg|png|heic|webp)$/i)) {
      showToast('Unsupported file: ' + f.name); return;
    }
    if (f.size > 20 * 1024 * 1024) { showToast(f.name + ' exceeds 20MB limit'); return; }
    STATE.uploadQueue.push({ file: f, status: 'queued', progress: 0, id: Date.now() + Math.random() });
  });
  renderUploadQueue();

  // Immediately show image preview for the first image file selected
  const firstImg = fileArr.find(f => f.type && f.type.startsWith('image/'));
  if (firstImg) {
    showUploadedImagePreview(firstImg);
  } else {
    // For non-image files (PDFs), show a file info preview
    const firstFile2 = fileArr[0];
    if (firstFile2) {
      const wrap = document.getElementById('uploadedImagePreview');
      const inner = document.getElementById('imagePreviewInner');
      if (wrap && inner) {
        inner.innerHTML = `<div style="padding:32px;text-align:center"><div style="font-size:56px;margin-bottom:10px">📄</div><div style="font-size:13px;font-weight:600;color:var(--text)">${escapeHtml(firstFile2.name)}</div><div style="font-size:11px;color:var(--muted);margin-top:4px">${(firstFile2.size/1024).toFixed(1)} KB · PDF Document</div></div>`;
        wrap.style.display = 'block';
        wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  // Immediately run AI analysis — no login required for preview
  const firstFile = fileArr[0];
  if (firstFile) runImmediateAnalysis(firstFile);
}

async function runImmediateAnalysis(file) {
  const analysisWrap = document.getElementById('inlineAnalysisWrap');
  const loadingEl = document.getElementById('inlineAnalysisLoading');
  const bodyEl = document.getElementById('inlineAnalysisBody');
  const conclusionWrap = document.getElementById('conclusionWrap');
  const conclusionBody = document.getElementById('conclusionBody');
  if (!analysisWrap || !bodyEl) return;

  // Stop any previous TTS
  voiceStop();

  analysisWrap.style.display = 'block';
  loadingEl.style.cssText = 'display:flex;padding:12px 0;font-size:13px;font-weight:600;color:var(--teal);align-items:center;gap:8px';
  loadingEl.innerHTML = '<span class="spin">⏳</span> Analyzing your report with AI…';
  bodyEl.innerHTML = '';
  if (conclusionWrap) conclusionWrap.style.display = 'none';
  // Hide voice controls while loading
  const voiceCtrl = document.getElementById('voiceControls');
  if (voiceCtrl) voiceCtrl.style.display = 'none';
  analysisWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  try {
    let rawText = '';
    let params = {};

    if (file.type && file.type.startsWith('image/')) {
      rawText = '';
    } else {
      try { rawText = await extractReportTextClient(file); } catch(e) { rawText = ''; }
      if (rawText && rawText.length > 15) {
        const parsed = parseLabValuesFromText(rawText);
        params = normalizeReportParameters(parsed);
      }
      if (!Object.keys(params).length) params = simulateExtraction(file.name);
    }

    const result = await analyzeReportWithGroq(file, rawText, params);
    loadingEl.style.display = 'none';

    if (result) {
      // Merge any extracted lab values into params from the AI response
      if (result.abnormal_values && result.abnormal_values.length && !Object.keys(params).length) {
        result.abnormal_values.forEach(av => {
          if (av.test && av.value) {
            const numVal = parseFloat(String(av.value).replace(/[^\d.]/g, ''));
            if (!isNaN(numVal)) {
              params[av.test] = { val: numVal, unit: String(av.value).replace(/[\d.\s]/g,'').trim() || '', ref_low: 0, ref_high: 999999, status: av.status === 'Critical' ? 'danger' : av.status === 'High' || av.status === 'Low' ? 'warn' : 'normal' };
            }
          }
        });
      }

      // Store in STATE for dashboard
      const reportEntry = {
        id: 'instant_' + Date.now(),
        name: file.name,
        url: '',
        type: file.type,
        parameters: params,
        aiResult: result,
        uploaded_at: new Date().toISOString(),
        _localFile: file,
        extracted_text_preview: rawText.slice(0, 900),
        extraction_source: file.type?.startsWith('image/') ? 'ai_vision' : 'ai_text',
      };
      // Add to reports if not already there
      if (!STATE.reports.find(r => r.name === file.name && r.id.startsWith('instant_'))) {
        STATE.reports.unshift(reportEntry);
        STATE.selectedReportId = reportEntry.id;
        STATE.lastReportAnalysis = { singleReport: reportEntry, params };
      }

      renderStructuredReportAI(bodyEl, result, '', false);
      if (conclusionWrap && conclusionBody) {
        conclusionWrap.style.display = 'block';
        renderConclusion(conclusionBody, result, params);
        conclusionWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      renderUploadedReports();

      // Prepare TTS text from summary (in the currently selected language)
      const summaryText = buildVoiceSummary(result, params);
      STATE.lastVoiceSummary = summaryText;
      if (voiceCtrl) voiceCtrl.style.display = 'flex';
      // Update language badge
      const voiceBadge = document.getElementById('voiceLangBadge');
      if (voiceBadge) {
        const lb = { en:'EN', hi:'HI', mr:'MR', bn:'BN', ta:'TA' };
        voiceBadge.textContent = '🔊 ' + (lb[currentLang] || currentLang.toUpperCase());
      }
      // Auto-play voice after brief delay — voices may need time to load
      setTimeout(() => voicePlay(), 1000);

    } else {
      const narrative = Object.keys(params).length
        ? simplePredictionFromParams(params)
        : 'Analysis could not be completed. Please ensure the image is clear and well-lit.';
      bodyEl.innerHTML = `<div style="margin-bottom:12px;font-size:13px;color:var(--text)">${narrative}</div>
        <div class="disclaimer">⚕️ Informational insights only. Please consult a qualified healthcare professional.</div>`;
      if (conclusionWrap && conclusionBody) {
        conclusionWrap.style.display = 'block';
        renderConclusion(conclusionBody, null, params);
      }
    }
  } catch(e) {
    console.warn('Immediate analysis error:', e);
    loadingEl.style.display = 'none';
    bodyEl.innerHTML = '<span style="color:var(--hint)">Analysis could not be completed. Please try again with a clearer image.</span>';
  }
}

function renderUploadQueue() {
  const wrap = document.getElementById('uploadQueue');
  if (!wrap) return;
  // Queue UI is now minimal since analysis is instant — just hide
  wrap.style.display = 'none';
}

// ════════════════════════════════════════════════════════
// VOICE / TTS — Web Speech API
// ════════════════════════════════════════════════════════
// ── LANGUAGE → VOICE LOCALE MAP ────────────────────────────────────────────
// Each entry lists preferred BCP-47 tags in priority order.
// The first one found installed in the browser is used; last entry is the
// universal fallback (en-US is guaranteed on virtually every platform).
const LANG_VOICE_MAP = {
  en: ['en-IN', 'en-US', 'en-GB'],
  hi: ['hi-IN', 'hi'],
  mr: ['mr-IN', 'mr', 'hi-IN'],   // Marathi — fallback to Hindi if unavailable
  bn: ['bn-IN', 'bn-BD', 'bn'],
  ta: ['ta-IN', 'ta'],
};

/**
 * Pick the best available SpeechSynthesisVoice for the given language code.
 * Tries each BCP-47 locale in priority order; falls back to en-US.
 */
function getBestVoice(langCode) {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || !voices.length) return null;
  const candidates = LANG_VOICE_MAP[langCode] || LANG_VOICE_MAP['en'];
  for (const locale of candidates) {
    // Exact match first
    const exact = voices.find(v => v.lang === locale);
    if (exact) return exact;
    // Prefix match (e.g. 'hi' matches 'hi-IN')
    const prefix = voices.find(v => v.lang.startsWith(locale.split('-')[0] + '-'));
    if (prefix) return prefix;
  }
  // Universal fallback
  return voices.find(v => v.lang === 'en-US') || voices[0] || null;
}

/**
 * Build TTS text from AI result — language-aware.
 * The text is already in the correct language because the AI generated it
 * in that language; we just assemble the pieces.
 */
function buildVoiceSummary(result, params) {
  const parts = [];
  if (result?.summary) parts.push(result.summary);
  if (result?.conclusion) parts.push(result.conclusion);
  const abnormal = Object.entries(params || {}).filter(([, p]) => p && p.status !== 'normal');
  if (abnormal.length && !result?.summary) {
    // Fallback English if no AI summary
    const names = abnormal.map(([k]) => k).join(', ');
    parts.push(`Values outside normal range: ${names}.`);
  }
  if (result?.risk_level && !result?.conclusion) parts.push(`Risk level: ${result.risk_level}.`);
  if (result?.specialist && !result?.conclusion) parts.push(`Consult: ${result.specialist}.`);
  if (!parts.length) parts.push('Report analysis complete. Please consult a healthcare professional for guidance.');
  return parts.join(' ');
}

/**
 * Play TTS. Stops any current utterance first.
 * Android Chrome fix: chunk long text into sentences to prevent cut-off.
 * Voices are loaded asynchronously — we retry up to 5 times.
 */
function voicePlay(retryCount) {
  if (!window.speechSynthesis) { showToast('Text-to-speech not supported on this browser'); return; }
  const text = STATE.lastVoiceSummary;
  if (!text) { showToast('No summary available to read'); return; }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length && !(retryCount >= 5)) {
    setTimeout(() => voicePlay((retryCount || 0) + 1), 400);
    return;
  }

  // Android fix: chunk text into sentences (Android TTS cuts off after ~200 chars)
  const chunks = _chunkTextForTTS(text);
  let chunkIdx = 0;

  const setVoiceBtns = (playing) => {
    const pb = document.getElementById('voicePlayBtn');
    const pau = document.getElementById('voicePauseBtn');
    const res = document.getElementById('voiceResumeBtn');
    if (pb) pb.style.display = playing ? 'none' : '';
    if (pau) pau.style.display = playing ? '' : 'none';
    if (res) res.style.display = 'none';
  };

  const speakChunk = (idx) => {
    if (idx >= chunks.length) { setVoiceBtns(false); return; }
    // Android Chrome: cancel before each chunk prevents garbling
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(chunks[idx]);
    const voice = getBestVoice(currentLang);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = (LANG_VOICE_MAP[currentLang] || LANG_VOICE_MAP['en'])[0];
    }
    utterance.rate = 0.88;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => { if (idx === 0) setVoiceBtns(true); };
    utterance.onend = () => {
      chunkIdx++;
      // Small delay between chunks (Android needs breathing room)
      setTimeout(() => speakChunk(chunkIdx), 120);
    };
    utterance.onerror = (e) => {
      console.warn('TTS chunk error:', e.error, 'chunk:', idx);
      if (e.error === 'interrupted' || e.error === 'canceled') {
        // Retry chunk with delay
        setTimeout(() => speakChunk(idx), 300);
        return;
      }
      if (e.error === 'language-unavailable' || e.error === 'voice-unavailable') {
        // Fallback to English for this chunk
        const fallback = new SpeechSynthesisUtterance(chunks[idx]);
        fallback.lang = 'en-US';
        fallback.rate = 0.88;
        fallback.onend = () => { chunkIdx++; setTimeout(() => speakChunk(chunkIdx), 120); };
        fallback.onerror = () => setVoiceBtns(false);
        window.speechSynthesis.speak(fallback);
        return;
      }
      setVoiceBtns(false);
    };

    STATE.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);

    // Android Chrome bug: speechSynthesis can pause silently — kick it
    _androidSpeechKick();
  };

  // Update language badge
  const badge = document.getElementById('voiceLangBadge');
  if (badge) {
    const langLabels = { en:'EN', hi:'HI', mr:'MR', bn:'BN', ta:'TA' };
    badge.textContent = '🔊 ' + (langLabels[currentLang] || currentLang.toUpperCase());
  }

  speakChunk(0);
}

/**
 * Android Chrome bug: speechSynthesis.speaking stays true but audio stops.
 * Periodically call resume() to kick it back alive.
 */
let _androidKickTimer = null;
function _androidSpeechKick() {
  if (_androidKickTimer) clearInterval(_androidKickTimer);
  _androidKickTimer = setInterval(() => {
    if (!window.speechSynthesis) { clearInterval(_androidKickTimer); return; }
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    if (!window.speechSynthesis.speaking) {
      clearInterval(_androidKickTimer);
    }
  }, 5000);
}

/**
 * Split text into TTS-safe chunks (≤180 chars, split on sentence boundaries).
 */
function _chunkTextForTTS(text) {
  const MAX = 180;
  if (!text || text.length <= MAX) return [text];
  // Split on sentence boundaries
  const sentences = text.match(/[^.!?।]+[.!?।]?/g) || [text];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > MAX && current.length) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function voicePause() {
  if (window.speechSynthesis && window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
    document.getElementById('voicePauseBtn').style.display = 'none';
    document.getElementById('voiceResumeBtn').style.display = '';
  }
}

function voiceResume() {
  if (window.speechSynthesis && window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    document.getElementById('voicePauseBtn').style.display = '';
    document.getElementById('voiceResumeBtn').style.display = 'none';
  }
}

function voiceReplay() {
  window.speechSynthesis.cancel();
  document.getElementById('voicePlayBtn').style.display = '';
  document.getElementById('voicePauseBtn').style.display = 'none';
  document.getElementById('voiceResumeBtn').style.display = 'none';
  setTimeout(() => voicePlay(), 100);
}

function voiceStop() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    if (_androidKickTimer) { clearInterval(_androidKickTimer); _androidKickTimer = null; }
    const pb = document.getElementById('voicePlayBtn');
    const pau = document.getElementById('voicePauseBtn');
    const res = document.getElementById('voiceResumeBtn');
    if (pb) pb.style.display = '';
    if (pau) pau.style.display = 'none';
    if (res) res.style.display = 'none';
  }
}

function removeFromQueue(idx) { STATE.uploadQueue.splice(idx, 1); renderUploadQueue(); }

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if ([...document.getElementsByTagName('script')].some((s) => s.src === src)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load script'));
    document.head.appendChild(s);
  });
}

async function extractPdfTextInBrowser(arrayBuffer) {
  const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/+esm');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let full = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    full += tc.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  return full;
}

async function extractImageOcrInBrowser(file) {
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
  if (!window.Tesseract) return '';
  const { data } = await window.Tesseract.recognize(file, 'eng', { logger: () => {} });
  return (data && data.text) ? data.text : '';
}

async function extractReportTextClient(file) {
  const name = (file.name || '').toLowerCase();
  try {
    if (name.endsWith('.pdf')) {
      const buf = await file.arrayBuffer();
      const t = await extractPdfTextInBrowser(buf);
      return (t || '').trim();
    }
    if (/\.(png|jpe?g|webp|bmp|tif?f)$/.test(name)) {
      if (file.size > 6 * 1024 * 1024) {
        showToast('Image large — OCR may be slow; try a smaller photo or run the Python API.');
      }
      return (await extractImageOcrInBrowser(file)).trim();
    }
  } catch (e) {
    console.warn('Client extract failed:', e);
  }
  return '';
}

function parseLabValuesFromText(text) {
  if (!text || text.length < 8) return {};
  const compact = text.replace(/\s+/g, ' ');
  const out = {};
  const num = (s) => {
    const v = parseFloat(String(s).replace(/,/g, ''));
    return Number.isFinite(v) ? v : null;
  };
  const set = (key, val, unit, rl, rh) => {
    if (val == null) return;
    let status = 'normal';
    if (rl > 0 && val < rl) status = val < rl * 0.92 ? 'danger' : 'warn';
    else if (rh < 999999 && val > rh) status = val > rh * 1.15 ? 'danger' : 'warn';
    out[key] = {
      val: Math.round(val * 100) / 100,
      unit,
      ref_low: rl,
      ref_high: rh,
      status,
    };
  };
  let m = compact.match(/(?:HB|HGB|HAEMOGLOBIN|HEMOGLOBIN)[^0-9]{0,30}(\d{1,2}\.?\d{0,2})\s*(?:G\/DL|GM\/DL)/i);
  if (!m) m = compact.match(/(\d{1,2}\.?\d{0,2})\s*G\/DL/i);
  if (m) set('Haemoglobin', num(m[1]), 'g/dL', 12, 17);
  m = compact.match(/(?:WBC|TLC|TOTAL\s*LEUCOCYTE\s*COUNT)[^0-9]{0,35}(\d+\.?\d*)/i);
  if (m) {
    let v = num(m[1]);
    if (v != null && v < 100) v *= 1000;
    set('WBC Count', v, '/μL', 4000, 11000);
  }
  m = compact.match(/(?:PLATELET|PLT|PLATELETS)[^0-9]{0,35}(\d{2,6})/i);
  if (m) set('Platelets', num(m[1]), '/μL', 150000, 400000);
  m = compact.match(/(?:GLUCOSE|FBS|FASTING\s*(?:BLOOD\s*)?(?:SUGAR|GLUCOSE)|F\.?\s*B\.?\s*S\.?)[^0-9]{0,40}(\d{2,3}\.?\d?)\s*(?:MG\/DL)?/i);
  if (!m) m = compact.match(/(?:RANDOM\s*BLOOD\s*SUGAR|RBS)[^0-9]{0,35}(\d{2,3})/i);
  if (m) set('Glucose (F)', num(m[1]), 'mg/dL', 70, 100);
  m = compact.match(/TSH[^0-9]{0,30}(\d+\.?\d*)/i);
  if (m) set('TSH', num(m[1]), 'mIU/L', 0.4, 4.0);
  m = compact.match(/CREATININE[^0-9]{0,30}(\d+\.?\d*)/i);
  if (m) set('Creatinine', num(m[1]), 'mg/dL', 0.6, 1.2);
  m = compact.match(/(?:TOTAL\s*)?CHOLESTEROL[^0-9]{0,30}(\d{2,3})/i);
  if (m) set('Cholesterol', num(m[1]), 'mg/dL', 0, 200);
  m = compact.match(/(?:HBA1C|HB\s*A1C|GLYCOSYLATED\s*HB|A1C)[^0-9]{0,30}(\d+\.?\d*)\s*%/i);
  if (m) set('HbA1c', num(m[1]), '%', 0, 5.7);
  return out;
}

async function tryExtractViaBackend(file) {
  if (!HEALTHECHO_API_BASE) return null;
  const fd = new FormData();
  fd.append('file', file, file.name);
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 35000);
  try {
    const res = await fetch(`${HEALTHECHO_API_BASE}/reports/extract-simple`, { method: 'POST', body: fd, signal: ac.signal });
    clearTimeout(tid);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    clearTimeout(tid);
    return null;
  }
}

function simplePredictionFromParams(params) {
  const ab = Object.entries(params || {}).filter(([, p]) => p && p.status && p.status !== 'normal');
  if (!ab.length) return 'Quick screen: no flags vs the app’s reference bands — still discuss any symptoms with your clinician.';
  const hi = ab.filter(([, p]) => p.status === 'danger').map(([k]) => k);
  const lo = ab.filter(([, p]) => p.status === 'warn').map(([k]) => k);
  let s = 'Quick screen (rule-based, not a diagnosis): ';
  if (hi.length) s += `prioritise discussing <strong>${hi.join(', ')}</strong>. `;
  if (lo.length) s += `Also review <strong>${lo.join(', ')}</strong> on your next visit. `;
  s += 'Bring the original lab PDF/printout to your doctor.';
  return s;
}

async function uploadAllFiles() {
  const pending = STATE.uploadQueue.filter(f => f.status === 'queued');
  if (!pending.length) return;

  // If not logged in, still show image preview and analysis (already triggered on file selection)
  // but skip Firebase upload
  if (!STATE.user) {
    showToast('Login to save reports to cloud. Analysis shown below.');
    return;
  }

  document.getElementById('upPreview').style.display = 'block';
  document.getElementById('processList').innerHTML = '';

  for (let i = 0; i < STATE.uploadQueue.length; i++) {
    const item = STATE.uploadQueue[i];
    if (item.status !== 'queued') continue;
    item.status = 'uploading';
    renderUploadQueue();
    try {
      await uploadSingleFile(item, i);
      item.status = 'done'; item.progress = 100;
    } catch(e) { item.status = 'error'; console.error('Upload error:', e); }
    renderUploadQueue();
  }

  showToast('✓ All reports saved to cloud!');
  renderUploadedReports();

  // Re-run analysis with the freshly saved report data (has _localFile reference)
  const lastImgItem = [...STATE.uploadQueue].reverse().find(f => f.file && f.file.type && f.file.type.startsWith('image/'));
  if (lastImgItem && lastImgItem.status === 'done') showUploadedImagePreview(lastImgItem.file);

  if (STATE.reports.length) {
    const latest = STATE.reports[0];
    const params = getReportParameters(latest);
    runInlineUploadAnalysis(latest, params);
  }

  if (document.getElementById('s-dashboard').classList.contains('on')) renderDashboard();
}

function showUploadedImagePreview(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const wrap = document.getElementById('uploadedImagePreview');
  const inner = document.getElementById('imagePreviewInner');
  if (!wrap || !inner) return;
  const url = URL.createObjectURL(file);
  inner.innerHTML = `<img src="${url}" alt="Uploaded report" style="max-width:100%;max-height:420px;border-radius:var(--radius);object-fit:contain;display:block;margin:0 auto" onload="URL.revokeObjectURL(this.src)"/>
    <div style="font-size:11px;color:var(--muted);margin-top:8px;padding:4px 0">${escapeHtml(file.name)} — ${(file.size/1024).toFixed(1)} KB</div>`;
  wrap.style.display = 'block';
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function runInlineUploadAnalysis(report, params) {
  const analysisWrap = document.getElementById('inlineAnalysisWrap');
  const loadingEl = document.getElementById('inlineAnalysisLoading');
  const bodyEl = document.getElementById('inlineAnalysisBody');
  const conclusionWrap = document.getElementById('conclusionWrap');
  const conclusionBody = document.getElementById('conclusionBody');
  if (!analysisWrap || !bodyEl) return;

  analysisWrap.style.display = 'block';
  if (loadingEl) { loadingEl.style.display = 'flex'; }
  // Update loading message to reflect the active language
  const loadingTxt = document.getElementById('analysisLoadingText');
  const loadingMsgs = { en:'Analyzing your report…', hi:'आपकी रिपोर्ट का विश्लेषण हो रहा है…', mr:'तुमची अहवाल तपासली जात आहे…', bn:'আপনার রিপোর্ট বিশ্লেষণ করা হচ্ছে…', ta:'உங்கள் அறிக்கை பகுப்பாய்வு செய்யப்படுகிறது…' };
  if (loadingTxt) loadingTxt.textContent = loadingMsgs[currentLang] || loadingMsgs.en;
  bodyEl.innerHTML = '';
  if (conclusionWrap) conclusionWrap.style.display = 'none';

  const rawText = report?.extracted_text_preview || buildReportTextFromParams(params, report);
  const fileRef = report?._localFile || null;
  const result = await analyzeReportWithGroq(fileRef, rawText, params);

  if (loadingEl) loadingEl.style.display = 'none';

  if (result) {
    STATE.groqOnline = true;
    updateBackendBadge();
    renderStructuredReportAI(bodyEl, result, '', false);
    // Show conclusive remarks
    if (conclusionWrap && conclusionBody) {
      conclusionWrap.style.display = 'block';
      renderConclusion(conclusionBody, result, params);
      conclusionWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } else {
    // Fallback: render rule-based summary
    const narrative = simplePredictionFromParams(params);
    bodyEl.innerHTML = `<div style="margin-bottom:12px">${narrative}</div>
      <div class="disclaimer">⚕️ Informational insights only. Please consult a qualified healthcare professional for diagnosis and treatment.</div>`;
    if (conclusionWrap && conclusionBody) {
      conclusionWrap.style.display = 'block';
      renderConclusion(conclusionBody, null, params);
    }
  }
}

function renderConclusion(el, aiResult, params) {
  const entries = Object.entries(params || {});
  const abnormal = entries.filter(([, p]) => p && p.status && p.status !== 'normal');
  const danger = abnormal.filter(([, p]) => p.status === 'danger');
  const warn = abnormal.filter(([, p]) => p.status === 'warn');

  const riskLevel = aiResult?.risk_level || (danger.length ? 'High' : warn.length ? 'Moderate' : 'Low');
  const specialist = aiResult?.specialist || 'General Physician';
  const disclaimer = aiResult?.disclaimer || 'This system provides informational insights only. Please consult a qualified healthcare professional for diagnosis and treatment.';
  const riskClass = riskLevel === 'High' ? 'tag-a' : riskLevel === 'Moderate' ? 'tag-p' : 'tag-b';
  const riskIcon = riskLevel === 'High' ? '🔴' : riskLevel === 'Moderate' ? '🟡' : '🟢';
  const urgencyMsg = riskLevel === 'High'
    ? 'Seek medical attention promptly — within 24-48 hours.'
    : riskLevel === 'Moderate'
    ? 'Schedule a physician visit within the next 1-2 weeks.'
    : 'Continue routine health monitoring and follow-up as scheduled.';

  // Use the specific AI conclusion if available, else build from findings
  let conclusionText = '';
  if (aiResult?.conclusion && aiResult.conclusion.length > 20) {
    conclusionText = escapeHtml(aiResult.conclusion);
  } else if (aiResult?.summary && aiResult.summary.length > 20) {
    conclusionText = escapeHtml(aiResult.summary);
  } else if (abnormal.length) {
    const flagNames = abnormal.slice(0, 4).map(([k]) => k).join(', ');
    conclusionText = `The report shows ${abnormal.length} value${abnormal.length > 1 ? 's' : ''} outside the normal reference range: <strong>${flagNames}</strong>. ${danger.length ? 'Some values require prompt medical attention.' : 'These findings warrant discussion with your physician.'}`;
  } else if (entries.length > 0) {
    conclusionText = 'All extracted parameters fall within normal reference ranges based on WHO/ICMR standard bands. No immediate clinical concern detected from this screening. Continue routine health monitoring.';
  } else {
    conclusionText = 'Report received. Please ensure the image is clear and contains readable lab values for detailed analysis.';
  }

  const conditionsHtml = (aiResult?.possible_conditions || []).length
    ? `<div style="margin:12px 0;padding:12px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border2)">
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Possible clinical observations</div>
        <div style="font-size:13px;color:var(--text)">${aiResult.possible_conditions.map(c => `• ${escapeHtml(c)}`).join('<br>')}</div>
      </div>` : '';

  const testsHtml = (aiResult?.recommended_tests || []).length
    ? `<div style="margin:12px 0;padding:12px;background:var(--blue-l);border-radius:var(--radius);border:1px solid rgba(96,165,250,.2)">
        <div style="font-size:10px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Recommended follow-up tests</div>
        <div style="font-size:13px;color:var(--text)">${aiResult.recommended_tests.slice(0,4).map(t => `• ${escapeHtml(t)}`).join('<br>')}</div>
      </div>` : '';

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <span class="tag ${riskClass}" style="font-size:12px;padding:5px 14px">${riskIcon} Risk Level: ${escapeHtml(riskLevel)}</span>
      <span class="tag tag-b" style="font-size:12px;padding:5px 14px">👨‍⚕️ ${escapeHtml(specialist)}</span>
      ${aiResult?.emergency ? `<span class="tag" style="background:var(--red-l);color:var(--red);font-size:12px;padding:5px 14px">🚨 Seek Emergency Care</span>` : ''}
    </div>
    <div style="font-size:13px;color:var(--text);line-height:1.8;margin-bottom:10px">${conclusionText}</div>
    <div style="font-size:12px;color:var(--muted);padding:8px 12px;background:var(--teal-l);border-radius:var(--radius);border:1px solid var(--teal-l2);margin-bottom:10px">
      ⏰ <strong>Next step:</strong> ${urgencyMsg}
    </div>
    ${conditionsHtml}${testsHtml}
    <div style="font-size:11px;color:var(--teal);padding:10px 12px;background:var(--teal-l);border-radius:var(--radius);border:1px solid var(--teal-l2);margin-top:4px;line-height:1.6">⚕️ ${escapeHtml(disclaimer)}</div>`;
}

async function uploadSingleFile(item, queueIdx) {
  const file = item.file;
  addProcessLog(`📋 Reading ${file.name}…`);

  let extracted = {};
  let extractionSource = 'demo_fallback';
  let rawText = '';

  const server = await tryExtractViaBackend(file);
  if (server && server.parameters && typeof server.parameters === 'object' && Object.keys(server.parameters).length) {
    extracted = normalizeReportParameters(server.parameters);
    rawText = server.extracted_text || '';
    extractionSource = server.extraction_engine ? `server_${server.extraction_engine}` : 'server';
    addProcessLog(`✓ Server parsed ${Object.keys(extracted).length} fields (${server.extraction_engine || 'api'})`);
  } else if (server && server.extracted_text && String(server.extracted_text).length > 20) {
    rawText = String(server.extracted_text);
    const reparsed = parseLabValuesFromText(rawText);
    extracted = normalizeReportParameters(reparsed);
    if (Object.keys(extracted).length) {
      extractionSource = server.extraction_engine ? `server_${server.extraction_engine}_reparse` : 'server_reparse';
      addProcessLog(`✓ Server OCR + browser rules: ${Object.keys(extracted).length} fields`);
    }
  }
  if (!Object.keys(extracted).length) {
    rawText = rawText || await extractReportTextClient(file);
    if (rawText && rawText.length > 15) {
      const parsed = parseLabValuesFromText(rawText);
      extracted = normalizeReportParameters(parsed);
      if (Object.keys(extracted).length) {
        extractionSource = file.name.toLowerCase().endsWith('.pdf') ? 'browser_pdf' : 'browser_ocr';
        addProcessLog(`✓ Parsed ${Object.keys(extracted).length} fields from report text (${extractionSource})`);
      }
    }
    if (!Object.keys(extracted).length) {
      if (rawText.length > 15) {
        addProcessLog('⚠ Text found but no standard markers — using demo values. Try clearer scan or Python API.');
      } else {
        addProcessLog('⚠ Could not read file in browser — using demo values. For PDFs use https or run FastAPI + Tesseract.');
      }
      extracted = simulateExtraction(file.name);
      extractionSource = 'demo_fallback';
    }
  }

  addProcessLog(`⬆ Uploading file…`);

  const { storage, db, ref, uploadBytes, getDownloadURL, collection, addDoc, serverTimestamp } = window._FB;
  const path = `reports/${STATE.user.id}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, '_')}`;
  const storageRef = ref(storage, path);
  const progressInterval = setInterval(() => {
    if (item.progress < 85) { item.progress += 12; renderUploadQueue(); }
  }, 200);
  let url = '';
  let snap;
  try {
    snap = await uploadBytes(storageRef, file);
    url = await getDownloadURL(snap.ref);
  } finally {
    clearInterval(progressInterval);
  }

  const reportData = {
    user_id: STATE.user.id,
    name: file.name,
    url,
    path,
    type: file.type || 'application/octet-stream',
    size: file.size || 0,
    parameters: extracted,
    processed: true,
    uploaded_at: serverTimestamp(),
    extraction_source: extractionSource,
    extracted_text_preview: (rawText || '').slice(0, 900),
  };

  const localPreview = {
    id: 'local_' + Date.now(),
    ...reportData,
    parameters: extracted,
    uploaded_at: new Date().toISOString(),
    _syncPending: true,
    _localFile: file,
    extracted_text_preview: (rawText || '').slice(0, 900),
  };

  try {
    const docRef = await addDoc(collection(db, 'reports'), reportData);
    const saved = {
      id: docRef.id,
      ...reportData,
      parameters: extracted,
      uploaded_at: new Date().toISOString(),
      _syncPending: false,
      _localFile: file,
    };
    STATE.reports.unshift(saved);
    addProcessLog(`✓ Saved to cloud — open Dashboard`);
  } catch (err) {
    console.warn('Firestore save failed — keeping local copy for dashboard:', err);
    STATE.reports.unshift(localPreview);
    addProcessLog(`⚠ Saved locally only (cloud sync failed). Dashboard still works this session.`);
    showToast('Report processed locally; cloud save failed — check network / Firebase rules');
  }
}

function addProcessLog(msg) {
  const list = document.getElementById('processList');
  const d = document.createElement('div');
  d.style.cssText = 'font-size:12px;color:var(--muted);padding:4px 0;display:flex;gap:6px;align-items:center;animation:fadeSlideUp .3s ease forwards';
  d.textContent = msg;
  list.appendChild(d);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Firestore / legacy shapes → safe dashboard objects (prevents crashes when Ollama/backend omits fields). */
function normalizeParameterEntry(label, raw) {
  if (raw == null || typeof raw !== 'object') return null;
  let val = Number(raw.val);
  if (Number.isNaN(val)) val = 0;
  const ref_low = Number(raw.ref_low);
  const ref_high = Number(raw.ref_high);
  const rl = Number.isFinite(ref_low) ? ref_low : 0;
  const rh = Number.isFinite(ref_high) ? ref_high : 999999;
  const unit = String(raw.unit != null ? raw.unit : '');
  let status = raw.status;
  if (status !== 'danger' && status !== 'warn' && status !== 'normal') {
    if (rl > 0 && val < rl) status = val < rl * 0.92 ? 'danger' : 'warn';
    else if (val > rh && rh < 999999) status = val > rh * 1.15 ? 'danger' : 'warn';
    else status = 'normal';
  }
  return { val, unit, ref_low: rl, ref_high: rh, status };
}

function normalizeReportParameters(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = normalizeParameterEntry(k, v);
    if (n) out[k] = n;
  }
  return out;
}

function getReportParameters(report) {
  if (!report) return {};
  return normalizeReportParameters(report.parameters);
}

function simulateExtraction(filename) {
  const base = {
    'Haemoglobin': { val: +(9 + Math.random()*6).toFixed(1), unit:'g/dL', ref_low:12, ref_high:17, status:'auto' },
    'WBC Count': { val: Math.round(4000 + Math.random()*8000), unit:'/μL', ref_low:4000, ref_high:11000, status:'auto' },
    'Platelets': { val: Math.round(120000 + Math.random()*280000), unit:'/μL', ref_low:150000, ref_high:400000, status:'auto' },
    'Glucose (F)': { val: Math.round(70 + Math.random()*90), unit:'mg/dL', ref_low:70, ref_high:100, status:'auto' },
    'TSH': { val: +(0.3 + Math.random()*9).toFixed(1), unit:'mIU/L', ref_low:0.4, ref_high:4.0, status:'auto' },
    'Creatinine': { val: +(0.5 + Math.random()*1.2).toFixed(1), unit:'mg/dL', ref_low:0.6, ref_high:1.2, status:'auto' },
    'Cholesterol': { val: Math.round(140 + Math.random()*120), unit:'mg/dL', ref_low:0, ref_high:200, status:'auto' },
    'HbA1c': { val: +(4.5 + Math.random()*4).toFixed(1), unit:'%', ref_low:0, ref_high:5.7, status:'auto' },
  };
  Object.values(base).forEach(p => {
    if (p.ref_low > 0 && p.val < p.ref_low) p.status = 'danger';
    else if (p.val > p.ref_high) p.status = p.val > p.ref_high * 1.15 ? 'danger' : 'warn';
    else p.status = 'normal';
  });
  return normalizeReportParameters(base);
}

async function loadUserReports() {
  if (!STATE.user || !window._FB) return;
  try {
    const { db, collection, query, where, getDocs } = window._FB;
    const q = query(collection(db, 'reports'), where('user_id', '==', STATE.user.id));
    const snap = await getDocs(q);
    const rows = snap.docs.map(d => {
      const data = d.data();
      const params = normalizeReportParameters(data.parameters);
      return {
        id: d.id,
        ...data,
        parameters: params,
        uploaded_at: data.uploaded_at?.toDate?.()?.toISOString() || new Date().toISOString(),
      };
    });
    STATE.reports = rows.sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
    renderUploadedReports();
  } catch(e) { console.warn('Load reports error:', e); }
}

function renderUploadedReports() {
  const wrap = document.getElementById('reportsList');
  const inner = document.getElementById('reportsListInner');
  const cnt = document.getElementById('reportsCount');
  if (!STATE.reports.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  cnt.textContent = STATE.reports.length;
  inner.innerHTML = STATE.reports.map(r => `
    <div class="report-card fade-in">
      <div class="report-icon">${r.type?.includes('pdf') ? '📄' : '🖼️'}</div>
      <div class="report-info">
        <div class="report-name">${r.name}</div>
        <div class="report-meta">${new Date(r.uploaded_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}${r._syncPending ? ' · Local only' : ''}</div>
      </div>
      <button class="report-view" onclick="viewReportDashboard('${r.id}')">View →</button>
    </div>`).join('');
}

function viewReportDashboard(reportId) {
  STATE.selectedReportId = reportId;
  switchToTab('dashboard');
}

// ════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════
function renderDashboard() {
  try {
    renderDashboardInner();
  } catch (e) {
    console.error('Dashboard render error:', e);
    showToast('Dashboard had a display glitch — try re-opening this tab');
    const grid = document.getElementById('metricsGrid');
    if (grid) grid.innerHTML = '<div style="color:var(--red);font-size:13px;text-align:center;padding:24px">Could not render dashboard. Your reports are still loaded — refresh or pick another report.</div>';
  }
}

function renderDashboardInner() {
  document.getElementById('dashDate').textContent = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  if (!STATE.reports.length) {
    document.getElementById('metricsGrid').innerHTML = `
      <div class="metric-card mc-normal" style="grid-column:1/-1;text-align:center;padding:40px">
        <div style="font-size:44px;margin-bottom:12px">📊</div>
        <div style="font-size:14px;font-weight:600;color:var(--muted)">Upload a medical report to see your health dashboard</div>
        <button class="btn btn-p" style="margin-top:16px" onclick="switchToTab('upload')">Upload Report →</button>
      </div>`;
    ['trendWrap','abnormalWrap','recsWrap','reportSelectorWrap','reportAnalysisWrap'].forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
    return;
  }
  const selectorWrap = document.getElementById('reportSelectorWrap');
  const selector = document.getElementById('reportSelector');
  if (selectorWrap) selectorWrap.style.display = '';
  if (selector) selector.innerHTML = STATE.reports.map(r => `
    <button class="rs-btn ${STATE.selectedReportId === r.id ? 'on' : ''}" onclick="selectReport('${r.id}')">${r.name.slice(0,18)}${r.name.length>18?'…':''}</button>`).join('') +
    (STATE.reports.length > 1 ? '<button class="rs-btn" onclick="selectReport(\'all\')">All Reports</button>' : '');

  const report = STATE.selectedReportId === 'all' ? null : (STATE.reports.find(r => r.id === STATE.selectedReportId) || STATE.reports[0]);
  if (!STATE.selectedReportId) STATE.selectedReportId = STATE.reports[0]?.id;
  const params = report ? getReportParameters(report) : mergeParameters();

  renderReportAnalysis(report, params);
  renderMetricsGrid(params);
  renderAbnormalList(params);
  renderAIRecommendations(params);
  renderTrendChart();
  ['trendWrap','abnormalWrap','recsWrap','reportAnalysisWrap'].forEach(id => { const el = document.getElementById(id); if(el) el.style.display = ''; });

  // Show AI analysis in dashboard if we have a cached result
  const aiEl = document.getElementById('reportAnalysisAI');
  const loadEl = document.getElementById('reportAnalysisAILoading');
  if (aiEl && report?.aiResult) {
    if (loadEl) loadEl.style.display = 'none';
    if (!aiEl.innerHTML.includes('Summary')) {
      renderStructuredReportAI(aiEl, report.aiResult, '', false);
    }
  } else if (aiEl && getGroqKey()) {
    if (!aiEl.innerHTML.includes('Summary')) {
      const rawText = report?.extracted_text_preview || buildReportTextFromParams(params, report);
      streamReportAnalysis(report?._localFile || null, rawText, params, loadEl, aiEl);
    }
  }
}

function selectReport(id) { STATE.selectedReportId = id; renderDashboard(); }

function reportsChronological() {
  return [...STATE.reports].sort((a, b) =>
    new Date(a.uploaded_at || 0) - new Date(b.uploaded_at || 0));
}

function mergeParameters() {
  const merged = {};
  reportsChronological().forEach(r => {
    const p = getReportParameters(r);
    Object.assign(merged, p);
  });
  return merged;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildReportTextFromParams(params, singleReport) {
  const head = singleReport
    ? `Report file: ${singleReport.name}. Extracted lab-style values (demo / OCR may vary).\n`
    : `Combined dashboard: ${STATE.reports.length} reports (latest value per test).\n`;
  const lines = Object.entries(params || {}).map(([k, p]) => {
    const n = normalizeParameterEntry(k, p) || p;
    return `${k}: ${n.val} ${n.unit || ''} (reference ${n.ref_low}-${n.ref_high}) — flag: ${n.status}`;
  });
  return head + lines.join('\n');
}

function renderStructuredReportAI(el, data, model, usedFb) {
  if (data && data.status === 'error') {
    el.innerHTML = `<span style="color:var(--amber)">${escapeHtml(data.message)} — ${escapeHtml(data.fallback || '')}</span>`;
    return;
  }
  if (!data || typeof data !== 'object') {
    el.innerHTML = '<span style="color:var(--hint)">No structured analysis returned.</span>';
    return;
  }
  const kf = (data.key_findings || []).map(x => `<li style="margin-bottom:6px">${escapeHtml(x)}</li>`).join('');
  const cond = (data.possible_conditions || []).map(x => `<li style="margin-bottom:4px">${escapeHtml(x)}</li>`).join('');
  const rt = (data.recommended_tests || []).map(x => `<li style="margin-bottom:4px">${escapeHtml(x)}</li>`).join('');
  const diet = (data.diet_tips || []).map(x => `<li style="margin-bottom:4px">${escapeHtml(x)}</li>`).join('');
  const ab = (data.abnormal_values || []).map(x => {
    const statusColor = x.status === 'Critical' ? 'var(--red)' : x.status === 'High' || x.status === 'Low' ? 'var(--amber)' : 'var(--muted)';
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);font-weight:600">${escapeHtml(x.test||'')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);font-family:var(--mono);color:${statusColor}">${escapeHtml(x.value||'')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);color:var(--muted);font-size:11px">${escapeHtml(x.normal_range||x.status||'')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border)"><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:${x.status==='Critical'?'var(--red-l)':x.status==='High'||x.status==='Low'?'var(--amber-l)':'var(--teal-l)'};color:${statusColor}">${escapeHtml(x.status||'')}</span></td>
    </tr>`;
  }).join('');
  const riskClass = data.risk_level === 'High' ? 'tag-a' : data.risk_level === 'Moderate' ? 'tag-p' : 'tag-b';
  const riskIcon = data.risk_level === 'High' ? '🔴' : data.risk_level === 'Moderate' ? '🟡' : '🟢';
  el.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--hint);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Summary</div>
      <div style="font-size:13px;color:var(--text);line-height:1.75">${escapeHtml(data.summary || '—')}</div>
    </div>
    ${kf ? `<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--hint);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Key Findings</div>
      <ul style="margin:0 0 0 18px;padding:0;font-size:13px;color:var(--text)">${kf}</ul>
    </div>` : ''}
    ${ab ? `<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--hint);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Abnormal Values</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse;border-radius:var(--radius);overflow:hidden;border:1px solid var(--border)">${ab}</table>
    </div>` : ''}
    ${cond ? `<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--hint);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Possible Conditions</div>
      <ul style="margin:0 0 0 18px;padding:0;font-size:13px;color:var(--text)">${cond}</ul>
    </div>` : ''}
    ${rt ? `<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--hint);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Recommended Tests</div>
      <ul style="margin:0 0 0 18px;padding:0;font-size:13px;color:var(--muted)">${rt}</ul>
    </div>` : ''}
    ${diet ? `<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--hint);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Diet & Lifestyle</div>
      <ul style="margin:0 0 0 18px;padding:0;font-size:13px;color:var(--muted)">${diet}</ul>
    </div>` : ''}
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="tag ${riskClass}">${riskIcon} Risk: ${escapeHtml(data.risk_level || 'Low')}</span>
      ${data.specialist ? `<span class="tag tag-b">👨‍⚕️ ${escapeHtml(data.specialist)}</span>` : ''}
      ${data.emergency ? `<span class="tag tag-a" style="background:var(--red-l);color:var(--red)">🚨 Seek Emergency Care</span>` : ''}
    </div>`;
}

// ── Language-name map for AI prompt instruction ────────────────────────────
const LANG_NAME_MAP = {
  en: 'English',
  hi: 'Hindi (हिंदी)',
  mr: 'Marathi (मराठी)',
  bn: 'Bengali (বাংলা)',
  ta: 'Tamil (தமிழ்)',
};

/**
 * Build the Groq system prompt with a language instruction injected.
 * This ensures the AI generates summary, conclusion, key_findings,
 * possible_conditions, diet_tips, lifestyle, and disclaimer in the
 * user's selected language. JSON keys remain in English always.
 */
function buildGroqSystemPrompt(langCode) {
  const langName = LANG_NAME_MAP[langCode] || 'English';
  const isEnglish = langCode === 'en';
  const langInstruction = isEnglish
    ? ''
    : `

IMPORTANT — LANGUAGE REQUIREMENT:
You MUST write ALL narrative text fields (summary, conclusion, key_findings, possible_conditions, recommended_tests, diet_tips, lifestyle, disclaimer, specialist) in ${langName}.
Do NOT mix languages. Do NOT write these fields in English if the language is ${langName}.
JSON keys must remain in English. Only the VALUES of text fields should be in ${langName}.
Medical values, numbers, units (e.g. "Hb 8.2 g/dL"), and test names can remain in English as they are universal.`;

  return `You are HealthEcho, a precise AI medical report analyst trained on WHO, ICMR, CDC, AIIMS, NIH, Mayo Clinic, and NHS guidelines, with a focus on diseases prevalent in India. PRIVACY: Always refer to the patient as "User" — never use their personal name.

CRITICAL RULES:
1. ALWAYS read the actual values in the report/image — do NOT guess or use placeholder text.
2. For EVERY abnormal value, state: what the value is, what normal range is, and what it likely indicates clinically.
3. The "summary" must be a specific 2-3 sentence paragraph describing the actual findings (not generic text like "the report shows results").
4. The "conclusion" must clearly state the most likely clinical interpretation — e.g. "This CBC report suggests iron deficiency anemia based on Hb of 8.2 g/dL and MCV of 68 fL. Immediate physician review and iron supplementation evaluation is recommended."
5. "possible_conditions" should name actual conditions based on the values — not vague terms.
6. Never return empty arrays if there is data. Never fabricate values not present in the report.
7. Return ONLY valid JSON — no markdown, no extra text.${langInstruction}

Return EXACTLY this JSON structure:
{
  "summary": "Specific 2-3 sentence description of what the report shows with actual values mentioned",
  "conclusion": "Clear clinical conclusion: what the findings indicate, urgency, and what the patient should do next",
  "key_findings": ["Finding 1 with value and significance", "Finding 2..."],
  "abnormal_values": [{"test": "Test name", "value": "Actual value with unit", "normal_range": "expected range", "status": "High/Low/Critical"}],
  "possible_conditions": ["Specific condition 1", "Specific condition 2"],
  "recommended_tests": ["Follow-up test 1", "Follow-up test 2"],
  "risk_level": "Low|Moderate|High",
  "specialist": "Specific specialist type",
  "diet_tips": ["Specific dietary advice based on findings"],
  "lifestyle": ["Specific lifestyle change based on findings"],
  "emergency": false,
  "disclaimer": "Informational only. Consult a qualified healthcare professional for diagnosis and treatment."
}`;
}

async function analyzeReportWithGroq(file, rawText, params) {
  const key = getGroqKey();
  if (!key) return null;

  const GROQ_SYSTEM = buildGroqSystemPrompt(currentLang);

  const isImage = file && (
    (file.type && file.type.startsWith('image/')) ||
    /\.(png|jpe?g|webp|heic|bmp)$/i.test(file.name || '')
  );
  const isPdf = file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));

  try {
    // ── IMAGE: use vision model (llama-4-scout)
    if (isImage && file) {
      const b64 = await fileToBase64(file);
      const mimeType = file.type || 'image/jpeg';
      const body = {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 1500,
        messages: [
          { role: 'system', content: GROQ_SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${b64}` } },
              { type: 'text', text: `Analyze this medical report image. Extract all lab values, identify abnormal values, and return the JSON as instructed. Write all narrative text fields in ${LANG_NAME_MAP[currentLang] || 'English'}.` }
            ]
          }
        ],
        response_format: { type: 'json_object' }
      };
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify(body)
      });
      if (!res.ok) { console.warn('Vision API error', res.status); return null; }
      const data = await res.json();
      const txt = data.choices?.[0]?.message?.content || '';
      return safeParseGroqJson(txt);
    }

    // ── PDF or text: use llama-3.3-70b with extracted text
    const textContent = rawText || buildReportTextFromParams(params, null);
    if (!textContent || textContent.length < 20) return null;
    const body = {
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1500,
      messages: [
        { role: 'system', content: GROQ_SYSTEM },
        { role: 'user', content: `Analyze this medical report text and return the JSON as instructed. Write all narrative text fields in ${LANG_NAME_MAP[currentLang] || 'English'}.\n\n${textContent.slice(0, 8000)}` }
      ],
      response_format: { type: 'json_object' }
    };
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(body)
    });
    if (!res.ok) { console.warn('AI text analysis error', res.status); return null; }
    const data = await res.json();
    return safeParseGroqJson(data.choices?.[0]?.message?.content || '');
  } catch(e) {
    console.warn('AI analysis error:', e);
    return null;
  }
}

function safeParseGroqJson(text) {
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) return JSON.parse(cleaned.slice(start, end + 1));
  } catch(e) { console.warn('JSON parse fail:', e); }
  return null;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function streamReportAnalysis(file, rawText, params, loadEl, aiEl) {
  if (!getGroqKey()) {
    aiEl.innerHTML = '<span style="color:var(--hint)">AI analysis is being configured. Please try again shortly.</span>';
    loadEl.style.display = 'none';
    return;
  }
  loadEl.style.display = 'flex';
  aiEl.innerHTML = '';
  const result = await analyzeReportWithGroq(file, rawText, params);
  loadEl.style.display = 'none';
  if (result) {
    STATE.groqOnline = true;
    updateBackendBadge();
    renderStructuredReportAI(aiEl, result, '', false);
  } else {
    aiEl.innerHTML = '<span style="color:var(--hint)">AI analysis could not be completed. Please try again.</span>';
  }
}

function queueReportAnalysisFromParams(params, singleReport) {
  const loadEl = document.getElementById('reportAnalysisAILoading');
  const aiEl = document.getElementById('reportAnalysisAI');
  if (!loadEl || !aiEl) return;
  if (!getGroqKey()) {
    aiEl.innerHTML = '<span style="color:var(--hint)">AI analysis will appear here once configured.</span>';
    return;
  }
  // Find raw text from the report
  const rawText = singleReport?.extracted_text_preview || buildReportTextFromParams(params, singleReport);
  // Try to recover the original file for vision, else fall back to text
  const fileRef = singleReport?._localFile || null;
  streamReportAnalysis(fileRef, rawText, params, loadEl, aiEl);
}

function runOptionalReportAI() {
  const snap = STATE.lastReportAnalysis;
  if (!snap || !snap.params || !Object.keys(snap.params).length) {
    showToast('Open the dashboard with a report first');
    return;
  }
  if (!getGroqKey()) {
    showToast('AI analysis is being configured');
    return;
  }
  queueReportAnalysisFromParams(snap.params, snap.singleReport);
}

function extractionSourceLabel(src) {
  if (!src || src === 'demo_fallback') return 'Source: demo values (file was not read as text — try HTTPS hosting, clearer scan, or FastAPI).';
  if (String(src).startsWith('server')) return 'Source: your FastAPI backend (PyMuPDF / Tesseract).';
  if (src === 'browser_pdf') return 'Source: PDF text extracted in the browser.';
  if (src === 'browser_ocr') return 'Source: browser OCR (Tesseract.js).';
  return 'Source: automatic extraction.';
}

function renderReportAnalysis(singleReport, params) {
  const wrap = document.getElementById('reportAnalysisWrap');
  const body = document.getElementById('reportAnalysisBody');
  const stats = document.getElementById('reportAnalysisStats');
  if (!params || !Object.keys(params).length) {
    wrap.style.display = 'none';
    return;
  }
  const entries = Object.entries(params);
  const abnormal = entries.filter(([, p]) => p.status !== 'normal');
  const warn = abnormal.filter(([, p]) => p.status === 'warn').length;
  const danger = abnormal.filter(([, p]) => p.status === 'danger').length;
  const label = singleReport
    ? `Current file: <strong>${singleReport.name}</strong> (${new Date(singleReport.uploaded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}).`
    : `Combined view: <strong>${STATE.reports.length} reports</strong> — each value reflects the <em>latest upload</em> that included that test.`;
  let narrative = '';
  if (!abnormal.length) {
    narrative = 'All extracted values fall in the ranges this app uses for quick visual screening. That does not rule out illness; interpretation depends on your symptoms, medicines, and your clinician’s reference intervals.';
  } else if (danger && !warn) {
    narrative = `Several markers are <strong>outside the usual range</strong> by a wider margin. Priority topics to review with your doctor: ${abnormal.slice(0, 4).map(([k]) => k).join(', ')}${abnormal.length > 4 ? '…' : ''}.`;
  } else if (danger || warn) {
    narrative = `Some results are <strong>slightly or moderately</strong> outside the reference band. Worth discussing on your next visit, especially: ${abnormal.map(([k]) => k).join(', ')}.`;
  }
  const predictBlock = simplePredictionFromParams(params);
  const srcLine = extractionSourceLabel(singleReport?.extraction_source);
  body.innerHTML = `${label}<br><br>${narrative}<br><br>${predictBlock}<br><br><span style="font-size:11px;color:var(--hint)">${srcLine}</span>`;
  stats.innerHTML = `
    <span class="tag tag-b">${entries.length} parameters</span>
    <span class="tag ${danger ? 'tag-a' : ''}">${danger} critical flags</span>
    <span class="tag ${warn ? 'tag-p' : ''}">${warn} borderline</span>
    <span class="tag">${entries.length - abnormal.length} in range</span>`;
  STATE.lastReportAnalysis = { singleReport, params };
  const aiEl = document.getElementById('reportAnalysisAI');
  const loadEl = document.getElementById('reportAnalysisAILoading');
  if (aiEl) aiEl.innerHTML = '';
  if (loadEl) loadEl.style.display = 'none';
}

function renderMetricsGrid(params) {
  const grid = document.getElementById('metricsGrid');
  if (!params || !Object.keys(params).length) {
    grid.innerHTML = '<div style="color:var(--hint);font-size:13px;text-align:center;padding:24px">No parameters extracted yet</div>';
    return;
  }
  grid.innerHTML = Object.entries(params).map(([label, p]) => {
    const safe = normalizeParameterEntry(label, p) || { val: 0, unit: '', ref_low: 0, ref_high: 0, status: 'normal' };
    const cls = safe.status === 'danger' ? 'mc-danger' : safe.status === 'warn' ? 'mc-warn' : 'mc-normal';
    const scls = safe.status === 'danger' ? 's-danger' : safe.status === 'warn' ? 's-warn' : 's-normal';
    const displayVal = safe.val > 9999 ? safe.val.toLocaleString() : safe.val;
    const ref = safe.ref_low > 0 ? `${safe.ref_low}–${safe.ref_high}` : `<${safe.ref_high}`;
    const escLabel = label.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<div class="metric-card ${cls} fade-in" onclick="showParamExplanation('${escLabel}',${JSON.stringify(safe).replace(/'/g,"&#39;")})">
      <div class="mc-label">${label}</div>
      <div class="mc-val">${displayVal}</div>
      <div class="mc-unit">${safe.unit} · Ref: ${ref}</div>
      <span class="mc-status ${scls}">${safe.status.charAt(0).toUpperCase()+safe.status.slice(1)}</span>
    </div>`;
  }).join('');
}

function renderAbnormalList(params) {
  const list = document.getElementById('abnormalList');
  const abnormal = params ? Object.entries(params)
    .map(([label, p]) => [label, normalizeParameterEntry(label, p) || p])
    .filter(([, p]) => p.status !== 'normal') : [];
  if (!abnormal.length) { list.innerHTML = '<div style="color:var(--teal);font-size:13px;font-weight:600">✓ All values within normal range</div>'; return; }
  list.innerHTML = abnormal.map(([label, p]) => {
    const escLabel = label.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;cursor:pointer;transition:all var(--transition)" onclick="showParamExplanation('${escLabel}',${JSON.stringify(p).replace(/'/g,"&#39;")})">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text)">${label}</div>
        <div style="font-size:11px;color:var(--muted)">Ref: ${p.ref_low>0?p.ref_low+'–':' <'}${p.ref_high} ${p.unit}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:17px;font-weight:700;color:var(--text);font-family:var(--mono)">${p.val} <span style="font-size:10px;color:var(--muted)">${p.unit}</span></div>
        <span class="mc-status ${p.status==='danger'?'s-danger':'s-warn'}">${p.status}</span>
      </div>
    </div>`;
  }).join('');
}

function renderAIRecommendations(params) {
  if (!params) return;
  const recs = [];
  const PARAM_RECS = {
    'Haemoglobin': '• <strong>Low haemoglobin detected</strong> — likely iron deficiency anemia. Include iron-rich foods: spinach, lentils, jaggery, chicken liver. Avoid tea/coffee with meals. Request CBC + iron studies follow-up.',
    'Glucose (F)': '• <strong>Elevated fasting glucose</strong> — pre-diabetes/diabetes risk. Reduce refined carbohydrates. Increase physical activity to 30 min/day. Request HbA1c test for 3-month average.',
    'TSH': '• <strong>TSH out of normal range</strong> — affects metabolism, energy and mood. Consult an Endocrinologist. Request T3, T4, and Anti-TPO antibody tests.',
    'Cholesterol': '• <strong>Elevated cholesterol</strong> — cardiovascular risk factor. Reduce saturated fats (ghee, fried foods). Increase omega-3 (fish, flaxseeds). Exercise 150+ min/week.',
    'HbA1c': '• <strong>HbA1c elevated</strong> — indicates 2-3 month average blood sugar. Indicates pre-diabetes or diabetes. Lifestyle changes + physician consultation urgently advised.',
    'Creatinine': '• <strong>Abnormal creatinine</strong> — kidney function concern. Stay well hydrated (2.5-3L water/day). Reduce high-protein diet temporarily. Request eGFR and urine microalbumin test.',
    'WBC Count': '• <strong>Abnormal WBC count</strong> — immune system concern. May indicate infection or inflammation. Physician review recommended within 3-5 days.',
    'Platelets': '• <strong>Abnormal platelet count</strong> — affects blood clotting. If dengue season, seek urgent testing. Repeat CBC in 48 hours advised.',
  };
  Object.keys(PARAM_RECS).forEach(key => {
    if (params[key]?.status !== 'normal') recs.push(PARAM_RECS[key]);
  });
  if (!recs.length) recs.push('• <strong>All parameters within acceptable range.</strong> Maintain a balanced diet, 7–8 hours sleep, and 30 min daily exercise. Schedule routine follow-up in 3 months.');
  recs.push('<br><em style="color:var(--hint);font-size:11px">Sources: WHO, ICMR, AIIMS guidelines · ⚕️ Informational only — consult your physician for clinical decisions.</em>');
  document.getElementById('dashRecs').innerHTML = recs.join('<br>');
}

function safeNumVal(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function renderTrendChart() {
  const canvas = document.getElementById('trendChart');
  const wrap = document.getElementById('trendWrap');
  if (!canvas || typeof Chart === 'undefined') {
    if (wrap) wrap.style.display = 'none';
    return;
  }

  // Destroy previous chart instance safely
  try {
    if (STATE.trendChart) { STATE.trendChart.destroy(); STATE.trendChart = null; }
  } catch (e) { STATE.trendChart = null; }

  const isDark = STATE.darkMode;
  const gridColor = isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)';
  const tickColor = isDark ? '#8B949E' : '#64748B';
  const ctx = canvas.getContext('2d');

  try {
    // ── SINGLE REPORT: show all parameters as a bar chart ──
    if (STATE.reports.length < 2) {
      const report = STATE.reports[0];
      const rp = getReportParameters(report);
      const paramKeys = Object.keys(rp);
      if (!report || !paramKeys.length) { if (wrap) wrap.style.display = 'none'; return; }

      const labels = paramKeys.slice(0, 10);
      const data = labels.map(l => {
        const n = safeNumVal(rp[l]?.val);
        return n !== null ? n : 0;
      });
      const refLows = labels.map(l => rp[l]?.ref_low || 0);
      const refHighs = labels.map(l => rp[l]?.ref_high || 0);

      const barColors = labels.map(l => {
        const s = rp[l]?.status;
        return s === 'danger' ? '#F87171AA' : s === 'warn' ? '#FBBF24AA' : '#00C896AA';
      });
      const borderColors = labels.map(l => {
        const s = rp[l]?.status;
        return s === 'danger' ? '#F87171' : s === 'warn' ? '#FBBF24' : '#00C896';
      });

      if (wrap) wrap.querySelector('.card-title') && (wrap.querySelector('.card-title').textContent = '📊 Report Parameters — Visual Overview');

      STATE.trendChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Your Value',
              data,
              backgroundColor: barColors,
              borderColor: borderColors,
              borderWidth: 2,
              borderRadius: 6,
              order: 1,
            },
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                afterLabel: (ctx) => {
                  const idx = ctx.dataIndex;
                  const rl = refLows[idx], rh = refHighs[idx];
                  if (rh < 999999) return `Normal: ${rl > 0 ? rl + '–' : '<'}${rh} ${labels[idx] && rp[labels[idx]]?.unit || ''}`;
                  return '';
                }
              }
            }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { font: { size: 10 }, color: tickColor, maxRotation: 40 } },
            y: { grid: { color: gridColor }, ticks: { font: { size: 10 }, color: tickColor } }
          }
        }
      });
      if (wrap) { wrap.style.display = ''; canvas.style.maxHeight = '220px'; }
      return;
    }

    // ── MULTIPLE REPORTS: line chart — discover ALL shared parameters ──
    const chronological = reportsChronological();

    // Collect all parameter names across all reports
    const allParamNames = new Set();
    chronological.forEach(r => Object.keys(getReportParameters(r)).forEach(k => allParamNames.add(k)));

    // Only keep params that appear in at least 2 reports (meaningful trends)
    const trendableParams = [...allParamNames].filter(name =>
      chronological.filter(r => safeNumVal(getReportParameters(r)[name]?.val) !== null).length >= 2
    );

    // Fall back to all params if none appear in ≥2 reports (e.g. only 2 uploads with same params)
    const paramNames = trendableParams.length
      ? trendableParams.slice(0, 6)
      : [...allParamNames].slice(0, 6);

    const labels = chronological.map(r => {
      const d = new Date(r.uploaded_at);
      return Number.isNaN(d.getTime()) ? '?' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    });

    const palette = ['#00C896', '#F87171', '#A78BFA', '#FBBF24', '#60A5FA', '#34D399'];

    const datasets = paramNames.map((name, ci) => {
      const color = palette[ci % palette.length];
      return {
        label: name,
        data: chronological.map(r => safeNumVal(getReportParameters(r)[name]?.val)),
        borderColor: color,
        backgroundColor: color + '20',
        tension: 0.38,
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 2.5,
        pointBackgroundColor: color,
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        spanGaps: true,
        fill: false,
      };
    });

    if (!datasets.length) { if (wrap) wrap.style.display = 'none'; return; }

    if (wrap) {
      const title = wrap.querySelector('.card-title');
      if (title) title.textContent = `📈 Parameter Trends (${chronological.length} Reports)`;
      canvas.style.maxHeight = '260px';
      wrap.style.display = '';
    }

    STATE.trendChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 }, boxWidth: 12, padding: 14, color: tickColor }
          },
          tooltip: {
            backgroundColor: isDark ? '#21262D' : '#fff',
            titleColor: isDark ? '#E6EDF3' : '#0F172A',
            bodyColor: isDark ? '#8B949E' : '#475569',
            borderColor: isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)',
            borderWidth: 1,
            padding: 10,
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { font: { size: 10 }, color: tickColor }
          },
          y: {
            grid: { color: gridColor },
            ticks: { font: { size: 10 }, color: tickColor }
          }
        }
      }
    });
  } catch (e) {
    console.warn('Chart render error:', e);
    if (wrap) wrap.style.display = 'none';
  }
}

// ════════════════════════════════════════════════════════
// PARAM EXPLANATION
// ════════════════════════════════════════════════════════
const PARAM_EXPLANATIONS = {
  'Haemoglobin': 'Haemoglobin carries oxygen in red blood cells. <strong>Low levels</strong> (anaemia) cause fatigue, pallor, breathlessness. Common causes in India: iron deficiency, vitamin B12/folate deficiency, chronic blood loss. <strong>High levels</strong>: dehydration, lung conditions, bone marrow disorders.',
  'WBC Count': 'White blood cells fight infection and illness. <strong>High WBC</strong> (leukocytosis): infection, inflammation, stress, or less commonly leukaemia. <strong>Low WBC</strong> (leukopenia): viral infections, certain medications, or bone marrow suppression.',
  'Platelets': 'Platelets help blood clot and stop bleeding. <strong>Low platelets</strong> (thrombocytopenia): dengue fever (critical in India), ITP, liver disease. <strong>High platelets</strong>: inflammation, iron deficiency, or myeloproliferative disorders.',
  'Glucose (F)': 'Fasting blood glucose after 8+ hours. <strong>70-100 mg/dL: Normal</strong>. 100-125: Pre-diabetes. >125: Diabetes (confirmed by repeat test). India has one of the world\'s highest diabetes burdens.',
  'TSH': 'Thyroid Stimulating Hormone regulates your thyroid. <strong>High TSH</strong>: hypothyroidism — fatigue, weight gain, cold intolerance. <strong>Low TSH</strong>: hyperthyroidism — weight loss, palpitations, anxiety. Very common in India, especially in women.',
  'Creatinine': 'A waste product filtered by kidneys. <strong>High creatinine</strong> indicates reduced kidney function. Causes: dehydration, kidney disease, certain medications. Request eGFR for complete kidney function assessment.',
  'Cholesterol': 'Total cholesterol includes protective HDL and harmful LDL. <strong>>200 mg/dL</strong> increases cardiovascular risk. Diet (reduce saturated fats), exercise, and statins if prescribed can help manage levels.',
  'HbA1c': 'Glycated haemoglobin reflects average blood sugar over 2-3 months. <strong><5.7%: Normal</strong>. 5.7-6.4%: Pre-diabetes. >6.5%: Diabetes (confirmed). Most reliable indicator for diabetes management.',
};

function showParamExplanation(label, paramStr) {
  let param;
  try { param = typeof paramStr === 'string' ? JSON.parse(paramStr) : paramStr; } catch(e) { param = {}; }
  document.getElementById('ppTitle').textContent = label;
  const status = param.status || 'normal';
  const statusColor = status === 'danger' ? 'var(--red)' : status === 'warn' ? 'var(--amber)' : 'var(--teal)';
  const ref = param.ref_low > 0 ? `${param.ref_low} – ${param.ref_high}` : `< ${param.ref_high}`;
  const explanation = PARAM_EXPLANATIONS[label] || 'This parameter is an important health indicator. Please consult your doctor for detailed interpretation in the context of your full clinical picture.';
  document.getElementById('ppContent').innerHTML = `
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:16px">
      <div style="text-align:center;flex:1;padding:14px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border)">
        <div style="font-size:10px;color:var(--hint);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Your Value</div>
        <div style="font-size:28px;font-weight:700;color:${statusColor};font-family:var(--mono);margin:4px 0">${param.val}</div>
        <div style="font-size:11px;color:var(--muted)">${param.unit}</div>
      </div>
      <div style="text-align:center;flex:1;padding:14px;background:var(--bg3);border-radius:var(--radius);border:1px solid var(--border)">
        <div style="font-size:10px;color:var(--hint);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Normal Range</div>
        <div style="font-size:16px;font-weight:700;color:var(--teal);font-family:var(--mono);margin:4px 0">${ref}</div>
        <div style="font-size:11px;color:var(--muted)">${param.unit}</div>
      </div>
    </div>
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--hint);margin-bottom:8px">Status</div>
    <div style="font-size:14px;font-weight:700;color:${statusColor};margin-bottom:14px">● ${status.charAt(0).toUpperCase()+status.slice(1)}</div>
    <div style="font-size:13px;color:var(--muted);line-height:1.75;margin-bottom:14px">${explanation}</div>
    <div class="disclaimer">⚕️ This interpretation is informational. Always discuss your results with your doctor who can consider your full clinical picture.</div>`;
  document.getElementById('paramPopup').classList.add('show');
}

function hideParamPopup() { document.getElementById('paramPopup').classList.remove('show'); }

// ════════════════════════════════════════════════════════
// HOSPITALS — OVERPASS API (real-time city-level fetch)
// ════════════════════════════════════════════════════════

// Dynamic hospitals list populated from Overpass API
let HOSPITALS_LIVE = [];

/**
 * Calculate distance between two lat/lng points in km (Haversine formula).
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchHospitalsFromOverpass(cityName, lat, lng, source) {
  const el = document.getElementById('hospList');
  const wrap = document.getElementById('hospAfterLocation');
  const placeholder = document.getElementById('hospPlaceholder');

  if (el) el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--teal);font-size:13px;font-weight:600">⏳ Fetching hospitals in ${escapeHtml(cityName)}…</div>`;
  if (wrap) wrap.style.display = 'block';
  if (placeholder) placeholder.style.display = 'none';

  // 20 km for city-center geocoded (signup city) — covers full municipal area for smaller cities
  // 15 km for GPS — tighter, based on actual position
  // Both use hardcoded city-center coordinates so Amravati never bleeds into Nagpur
  const RADIUS_M = source === 'gps' ? 15000 : 20000;
  const MAX_KM   = source === 'gps' ? 15 : 20;

  // Use 'out center;' on separate line — most compatible Overpass syntax
  const overpassQuery = [
    '[out:json][timeout:30];',
    '(',
    `  node["amenity"="hospital"](around:${RADIUS_M},${lat},${lng});`,
    `  way["amenity"="hospital"](around:${RADIUS_M},${lat},${lng});`,
    `  relation["amenity"="hospital"](around:${RADIUS_M},${lat},${lng});`,
    `  node["amenity"="clinic"](around:${RADIUS_M},${lat},${lng});`,
    `  way["amenity"="clinic"](around:${RADIUS_M},${lat},${lng});`,
    `  node["healthcare"="hospital"](around:${RADIUS_M},${lat},${lng});`,
    `  way["healthcare"="hospital"](around:${RADIUS_M},${lat},${lng});`,
    `  node["healthcare"="clinic"](around:${RADIUS_M},${lat},${lng});`,
    `  way["healthcare"="clinic"](around:${RADIUS_M},${lat},${lng});`,
    ');',
    'out body center;',
  ].join('\n');

  // Multiple Overpass mirrors — try each in order until one responds
  const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  let data = null;
  let fetchErr = null;

  for (let i = 0; i < OVERPASS_MIRRORS.length; i++) {
    const mirror = OVERPASS_MIRRORS[i];
    if (el) el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--teal);font-size:13px;font-weight:600">⏳ Loading hospitals… (${i + 1}/${OVERPASS_MIRRORS.length})</div>`;
    try {
      // Use manual timeout with AbortController (works in all browsers)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const r = await fetch(mirror, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(overpassQuery),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!r.ok) { fetchErr = new Error(`HTTP ${r.status} from ${mirror}`); continue; }
      const text = await r.text();
      if (!text || text.trim() === '') { fetchErr = new Error('Empty response'); continue; }
      data = JSON.parse(text);
      console.log(`[Overpass] Success via ${mirror} — ${data.elements?.length || 0} elements`);
      break;
    } catch (e) {
      fetchErr = e;
      console.warn(`[Overpass] ${mirror} failed:`, e.message);
    }
  }

  try {
    if (!data) throw fetchErr || new Error('All Overpass mirrors failed — check internet connection');
    const elements = data.elements || [];

    // Map elements → hospital objects
    const mapped = elements
      .filter(e => e.tags && e.tags.name)          // must have a name
      .map((e, idx) => {
        const tags = e.tags || {};
        const elat = e.lat ?? e.center?.lat ?? lat;
        const elng = e.lon ?? e.center?.lon ?? lng;
        const distKm = haversineKm(lat, lng, elat, elng);

        // Classify govt vs private by name / operator keywords
        const govtPattern = /government|govt|civil|district|public|municipal|nmc|amc|pmc|gmch|aiims|safdarjung|esic|railway|army|military|cantonment/i;
        const nameAndOp = (tags.name || '') + ' ' + (tags.operator || '') + ' ' + (tags['operator:type'] || '');
        const isGovt = govtPattern.test(nameAndOp) || tags['operator:type'] === 'public' || tags.operator === 'government';

        // Build address from OSM tags, fall back to detected city name
        const addrParts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'] || tags['addr:city'] || cityName].filter(Boolean);
        const address = addrParts.join(', ') || cityName;

        return {
          id: idx + 1,
          osm_id: e.id,
          name: tags.name,
          address,
          type: isGovt ? 'Government' : 'Private',
          phone: tags.phone || tags['contact:phone'] || tags['contact:mobile'] || '',
          website: tags.website || tags['contact:website'] || tags['contact:url'] || '',
          emergency: tags.emergency === 'yes' || tags['emergency'] === 'yes' || /24.?hour|trauma|emergency/i.test(tags.name),
          amenity: tags.amenity || tags.healthcare || 'hospital',
          lat: elat,
          lng: elng,
          distKm,
        };
      })
      // Secondary filter: hard cap at MAX_KM to eliminate bleed into adjacent cities
      .filter(h => h.distKm <= MAX_KM)
      // Sort nearest first
      .sort((a, b) => a.distKm - b.distKm);

    HOSPITALS_LIVE = mapped;

    const banner = document.getElementById('locBanner');

    if (!HOSPITALS_LIVE.length) {
      if (el) el.innerHTML = `
        <div style="text-align:center;padding:48px 20px;color:var(--hint)">
          <div style="font-size:40px;margin-bottom:12px">🔍</div>
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px">No hospitals found in ${escapeHtml(cityName)}</div>
          <div style="font-size:12px;line-height:1.7">OpenStreetMap may have limited data for this area. Try clicking <strong style="color:var(--teal)">"Use My Location"</strong> for GPS-based results.</div>
        </div>`;
      if (banner) { banner.style.display = 'block'; banner.innerHTML = `⚠️ No hospitals found within ${MAX_KM} km in <strong>${escapeHtml(cityName)}</strong>`; }
      return;
    }

    if (banner) { banner.style.display = 'block'; banner.innerHTML = `✅ Found <strong>${HOSPITALS_LIVE.length}</strong> hospitals & clinics in <strong>${escapeHtml(cityName)}</strong>`; }
    const srcLabel = source === 'gps' ? 'GPS Location' : 'Profile City';
    setCityBar(cityName, srcLabel);
    renderHospitals();

  } catch (err) {
    console.error('[Overpass] Error:', err);
    const retryFn = source === 'gps' ? 'requestLocation()' : 'loadHospitalsForSignupCity()';
    if (el) el.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--red);font-size:13px">
        <div style="font-size:32px;margin-bottom:10px">⚠️</div>
        Could not load hospitals — check your internet connection and try again.<br>
        <small style="color:var(--muted);margin-top:6px;display:block">${err.message}</small>
        <button class="btn btn-p btn-sm" style="margin-top:14px" onclick="${retryFn}">🔄 Retry</button>
      </div>`;
  }
}

function renderHospitals() {
  const search = (document.getElementById('hospSearch')?.value || '').toLowerCase();
  let list = [...HOSPITALS_LIVE];

  if (STATE.activeHospFilter && STATE.activeHospFilter !== 'all') {
    const f = STATE.activeHospFilter;
    list = list.filter(h => {
      const nameAddr = (h.name + ' ' + h.address + ' ' + (h.amenity||'')).toLowerCase();
      if (f === 'government') return h.type === 'Government';
      if (f === 'private') return h.type === 'Private';
      const re = SPECIALTY_KEYWORDS[f];
      if (re) return re.test(nameAddr);
      return true;
    });
  }

  if (search) {
    list = list.filter(h =>
      h.name.toLowerCase().includes(search) ||
      h.address.toLowerCase().includes(search) ||
      h.type.toLowerCase().includes(search) ||
      h.amenity.toLowerCase().includes(search));
  }

  const el = document.getElementById('hospList');
  if (!el) return;

  if (!list.length) {
    const filterName = STATE.activeHospFilter !== 'all' ? STATE.activeHospFilter : '';
    el.innerHTML = `<div style="text-align:center;padding:28px;color:var(--hint);font-size:13px">
      ${filterName ? `No <strong>${filterName}</strong> hospitals found in this city.` : 'No results for this filter.'}
      <button class="btn btn-sm" style="margin-left:6px;margin-top:8px" onclick="setHospFilter(document.querySelector('#hospFilters .filter-btn'),'all')">Show all</button>
    </div>`;
    return;
  }

  el.innerHTML = list.map(h => {
    const typeBadge = h.type === 'Government'
      ? `<span class="badge ba">Govt</span>`
      : `<span class="badge bp">Private</span>`;
    const erBadge = h.emergency
      ? `<span class="badge" style="background:var(--red-l);color:var(--red);flex-shrink:0;align-self:flex-start">24/7 ER</span>`
      : '';
    const kindBadge = h.amenity === 'clinic'
      ? `<span class="badge" style="background:var(--purple-l);color:var(--purple)">Clinic</span>`
      : `<span class="badge bt">Hospital</span>`;
    const distBadge = h.distKm != null
      ? `<span class="badge" style="background:var(--teal-l);color:var(--teal)">📍 ${h.distKm.toFixed(1)} km</span>`
      : `<span class="badge" style="background:var(--teal-l);color:var(--teal)">📍 Nearby</span>`;
    const phoneHtml = h.phone
      ? `<a href="tel:${h.phone}" style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);margin-top:6px;text-decoration:none">📞 ${h.phone}</a>`
      : '';
    const mapsUrl = h.lat && h.lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.name)}`;

    return `<div class="hcard fade-in">
      <div class="hcard-top">
        <div class="hico">🏥</div>
        <div style="flex:1;min-width:0">
          <h4 style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.name}</h4>
          <p>📍 ${h.address}</p>
        </div>
        ${erBadge}
      </div>
      <div class="hmeta" style="margin-top:8px">${typeBadge}${kindBadge}${distBadge}</div>
      ${phoneHtml}
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <a class="book-btn" href="${mapsUrl}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:5px">🗺 Get Directions</a>
        ${h.website ? `<a class="btn btn-sm btn-outline" href="${h.website}" target="_blank" rel="noopener" style="text-decoration:none">🌐 Website</a>` : ''}
      </div>
    </div>`;
  }).join('');
}

function filterHospitals() { renderHospitals(); }
function setHospFilter(btn, val) {
  STATE.activeHospFilter = val;
  document.querySelectorAll('#hospFilters .filter-btn').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  renderHospitals();
}

// Specialty keyword map for filtering by category
const SPECIALTY_KEYWORDS = {
  eye:         /eye|ophthal|vision|optom|netre|eye care/i,
  dental:      /dental|dentist|teeth|oral|dant|tooth/i,
  homeopathy:  /homeo|homoeo/i,
  ayurvedic:   /ayurved|ayurvedic|panchkarma|naturo/i,
  pediatric:   /pediatr|paediatr|child|balrog|children/i,
  dermatology: /dermat|skin care|skin clinic|kushtha/i,
  ent:         /ent|ear.*nose|otolaryng|sinus|tonsil/i,
  cardiology:  /cardio|cardiac|heart/i,
  gynecology:  /gynae|gynecol|obstet|maternity|stri rog|women/i,
  orthopedic:  /ortho|bone|joint|fracture|spine|haddi/i,
  general:     /general|multispeciality|multispecialty|community|PHC|primary/i,
  government:  /government|govt|civil|district|public|municipal/i,
  private:     /.*/,  // catch-all for private
};

// ════════════════════════════════════════════════════════
// BOOKING
// ════════════════════════════════════════════════════════
function openBooking(hospId) {
  // No-op: hospital cards now use Google Maps links directly.
  // This function is kept for backward compatibility only.
}

function selectDoc(idx, el) {
  document.querySelectorAll('.doc-card').forEach(d => d.classList.remove('sel'));
  el.classList.add('sel');
  if (STATE.booking?.hosp?.doctors) {
    STATE.booking.doc = STATE.booking.hosp.doctors[idx];
  }
}

function selectDate(date, el) {
  document.querySelectorAll('.date-btn').forEach(d => d.classList.remove('sel'));
  el.classList.add('sel');
  STATE.booking.date = date;
}

function selectTime(time, el) {
  if (el.classList.contains('taken')) return;
  document.querySelectorAll('.time-btn').forEach(t => t.classList.remove('sel'));
  el.classList.add('sel');
  STATE.booking.time = time;
}

async function confirmBooking() {
  const { hosp, doc, date, time } = STATE.booking;
  if (!doc) { showToast('Please select a doctor'); return; }
  if (!date) { showToast('Please select a date'); return; }
  if (!time) { showToast('Please select a time slot'); return; }
  const appt = { id: Date.now(), user_id: STATE.user?.id, hospital: hosp.name, doctor: doc.name, specialty: doc.spec, date, time, status:'upcoming', created_at: new Date().toISOString() };
  STATE.appointments.unshift(appt);
  localStorage.setItem('he_appts', JSON.stringify(STATE.appointments));
  if (STATE.user && window._FB) {
    try { const { db, collection, addDoc, serverTimestamp } = window._FB; await addDoc(collection(db, 'appointments'), { ...appt, created_at: serverTimestamp() }); } catch(e) {}
  }
  hideModal('bookModal');
  showToast(`✓ Appointment booked with ${doc.name} on ${new Date(date).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}`);
}

// ════════════════════════════════════════════════════════
// FEEDBACK
// ════════════════════════════════════════════════════════
function showFeedback() { document.getElementById('feedbackPopup').classList.add('show'); }
function hideFeedback() { document.getElementById('feedbackPopup').classList.remove('show'); }
function setRating(r) {
  STATE.feedbackRating = r;
  document.querySelectorAll('.star-btn').forEach((b, i) => b.classList.toggle('on', i < r));
}

async function submitFeedback() {
  if (!STATE.feedbackRating) { showToast('Please select a rating'); return; }
  const comment = document.getElementById('fbComment').value.trim();
  const feedback = { rating: STATE.feedbackRating, comment, user_id: STATE.user?.id || 'guest', created_at: new Date().toISOString() };
  if (window._FB) {
    try { const { db, collection, addDoc, serverTimestamp } = window._FB; await addDoc(collection(db, 'feedback'), { ...feedback, created_at: serverTimestamp() }); } catch(e) {}
  }
  hideFeedback();
  showToast('Thank you for your feedback! 🙏');
  STATE.feedbackShown = true;
  document.getElementById('fbComment').value = '';
  STATE.feedbackRating = 0;
  document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('on'));
}

setInterval(() => {
  if (!STATE.feedbackShown && (Date.now() - STATE.sessionStart) > 30 * 60 * 1000) showFeedback();
}, 60 * 1000);

// ════════════════════════════════════════════════════════
// ROBO GUIDE
// ════════════════════════════════════════════════════════
const ROBO_SLIDES = [
  { title:'Welcome to HealthEcho! 🤖', msg:"I'm your AI health companion. Let me show you how to get the most out of HealthEcho v5.", steps:[] },
  { title:'Step 1: AI Consult 💬', msg:'Chat with AI using trusted medical sources — WHO, ICMR, CDC, AIIMS, NIH, Mayo Clinic.', steps:['Describe your symptoms in detail','The AI analyses and provides structured insights','Confidence level, sources, and links included','Works offline with local Ollama AI'] },
  { title:'Step 2: Upload Reports 📋', msg:'Upload medical reports for automatic parameter extraction and analysis.', steps:['Tap Upload → select PDF or image files','OR use camera capture for instant upload','Parameters auto-extracted using OCR','View results in Dashboard'] },
  { title:'Step 3: Dashboard 📊', msg:'See all your health parameters visualised in one place.', steps:['View colour-coded metric cards','Tap any metric for detailed explanation','Track trends across multiple reports','Get AI-generated recommendations'] },
  { title:'Step 4: Find Doctors 🏥', msg:'Browse hospitals in Amravati and plan appointments.', steps:['Open Find Doctors for Amravati listings','Filter by specialty (Cardiology, Endocrinology, etc.)','Pick doctor, date and time slot','Saved to your device; sign in to sync'] },
  { title:"You're all set! 🎉", msg:'HealthEcho provides informational insights backed by trusted medical sources. Always consult a qualified doctor for diagnosis and treatment.', steps:[] }
];

let roboStep = 0;
function showRoboGuide() { roboStep = 0; renderRoboSlide(); document.getElementById('roboOverlay').classList.add('show'); }
function closeRobo() { document.getElementById('roboOverlay').classList.remove('show'); }
function roboNext() { roboStep++; if (roboStep >= ROBO_SLIDES.length) { closeRobo(); return; } renderRoboSlide(); }
function renderRoboSlide() {
  const slide = ROBO_SLIDES[roboStep];
  document.getElementById('roboTitle').textContent = slide.title;
  document.getElementById('roboMsg').textContent = slide.msg;
  document.getElementById('roboSteps').innerHTML = slide.steps.map((s,i) => `<div class="robo-step"><div class="robo-step-num">${i+1}</div><div>${s}</div></div>`).join('');
  document.getElementById('roboDots').innerHTML = ROBO_SLIDES.map((_,i) => `<div class="rdot ${i===roboStep?'on':''}"></div>`).join('');
  document.getElementById('roboNextBtn').textContent = roboStep === ROBO_SLIDES.length - 1 ? "Let's go! 🚀" : 'Next →';
}

if (STATE.isFirstVisit) setTimeout(showRoboGuide, 1200);

// ════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════
// TRANSLATIONS
// ════════════════════════════════════════════════════════
const TRANSLATIONS = {
  en: {
    nav_home:'Home', nav_chat:'AI Consult', nav_upload:'Upload Reports', nav_dashboard:'Dashboard',
    nav_history:'History', nav_doctors:'Find Doctors', nav_profile:'Profile',
    upload_title:'Upload Reports', upload_sub:'Upload medical reports for automatic AI analysis — PDF or images',
    upload_drop:'Tap to select or drag & drop', upload_drop_sub:'Select a file — up to 20MB',
    upload_camera:'📸 Capture Report with Camera',
    chat_placeholder:'Describe your symptoms in detail…',
    hosp_title:'Find Doctors', hosp_sub:'Hospitals & specialists in Amravati, Maharashtra',
    hosp_search:'Search hospital, specialty…', hosp_location:'📍 Use My Location for Better Results',
    hist_title:'Consultation History', hist_sub:'Your past AI consultations',
    prof_login:'Login / Sign Up', prof_reports:'My Reports', prof_history:'Consultation History',
    prof_feedback:'Send Feedback', prof_guide:'App Guide', prof_logout:'Logout',
    lang_title:'Language', greeting_morning:'Good morning', greeting_afternoon:'Good afternoon', greeting_evening:'Good evening',
    analysis_title:'🤖 AI Report Analysis', analysis_loading:'Analyzing your report with AI…',
    conclusion_title:'📋 Conclusive Remarks', preview_title:'📸 Uploaded Report Preview',
  },
  hi: {
    nav_home:'होम', nav_chat:'AI परामर्श', nav_upload:'रिपोर्ट अपलोड', nav_dashboard:'डैशबोर्ड',
    nav_history:'इतिहास', nav_doctors:'डॉक्टर खोजें', nav_profile:'प्रोफ़ाइल',
    upload_title:'रिपोर्ट अपलोड करें', upload_sub:'PDF या छवियाँ — स्वचालित AI विश्लेषण के लिए',
    upload_drop:'फ़ाइल चुनें या यहाँ खींचें', upload_drop_sub:'अधिकतम 20MB',
    upload_camera:'📸 कैमरे से रिपोर्ट कैप्चर करें',
    chat_placeholder:'अपने लक्षण विस्तार से बताएं…',
    hosp_title:'डॉक्टर खोजें', hosp_sub:'अमरावती, महाराष्ट्र के अस्पताल और विशेषज्ञ',
    hosp_search:'अस्पताल, विशेषता खोजें…', hosp_location:'📍 बेहतर परिणामों के लिए मेरी लोकेशन उपयोग करें',
    hist_title:'परामर्श इतिहास', hist_sub:'आपके पिछले AI परामर्श',
    prof_login:'लॉगिन / साइन अप', prof_reports:'मेरी रिपोर्ट', prof_history:'परामर्श इतिहास',
    prof_feedback:'फ़ीडबैक भेजें', prof_guide:'ऐप गाइड', prof_logout:'लॉगआउट',
    lang_title:'भाषा', greeting_morning:'सुप्रभात', greeting_afternoon:'नमस्ते', greeting_evening:'शुभ संध्या',
    analysis_title:'🤖 AI रिपोर्ट विश्लेषण', analysis_loading:'AI आपकी रिपोर्ट का विश्लेषण कर रहा है…',
    conclusion_title:'📋 निष्कर्ष', preview_title:'📸 अपलोड की गई रिपोर्ट',
  },
  mr: {
    nav_home:'मुखपृष्ठ', nav_chat:'AI सल्ला', nav_upload:'अहवाल अपलोड', nav_dashboard:'डॅशबोर्ड',
    nav_history:'इतिहास', nav_doctors:'डॉक्टर शोधा', nav_profile:'प्रोफाइल',
    upload_title:'अहवाल अपलोड करा', upload_sub:'PDF किंवा छायाचित्रे — स्वयंचलित AI विश्लेषण',
    upload_drop:'फाइल निवडा किंवा इथे खेचा', upload_drop_sub:'जास्तीत जास्त 20MB',
    upload_camera:'📸 कॅमेऱ्याने अहवाल कॅप्चर करा',
    chat_placeholder:'आपली लक्षणे तपशीलवार सांगा…',
    hosp_title:'डॉक्टर शोधा', hosp_sub:'अमरावती, महाराष्ट्रातील रुग्णालये आणि तज्ञ',
    hosp_search:'रुग्णालय, विशेषता शोधा…', hosp_location:'📍 चांगल्या परिणामांसाठी माझे स्थान वापरा',
    hist_title:'सल्ला इतिहास', hist_sub:'आपले मागील AI सल्ले',
    prof_login:'लॉगिन / साइन अप', prof_reports:'माझे अहवाल', prof_history:'सल्ला इतिहास',
    prof_feedback:'अभिप्राय पाठवा', prof_guide:'ऍप मार्गदर्शक', prof_logout:'लॉगआउट',
    lang_title:'भाषा', greeting_morning:'सुप्रभात', greeting_afternoon:'नमस्कार', greeting_evening:'शुभ संध्याकाळ',
    analysis_title:'🤖 AI अहवाल विश्लेषण', analysis_loading:'AI आपल्या अहवालाचे विश्लेषण करत आहे…',
    conclusion_title:'📋 निष्कर्ष', preview_title:'📸 अपलोड केलेला अहवाल',
  },
  bn: {
    nav_home:'হোম', nav_chat:'AI পরামর্শ', nav_upload:'রিপোর্ট আপলোড', nav_dashboard:'ড্যাশবোর্ড',
    nav_history:'ইতিহাস', nav_doctors:'ডাক্তার খুঁজুন', nav_profile:'প্রোফাইল',
    upload_title:'রিপোর্ট আপলোড করুন', upload_sub:'PDF বা ছবি — স্বয়ংক্রিয় AI বিশ্লেষণের জন্য',
    upload_drop:'ফাইল বেছে নিন বা টেনে আনুন', upload_drop_sub:'সর্বোচ্চ 20MB',
    upload_camera:'📸 ক্যামেরা দিয়ে রিপোর্ট তুলুন',
    chat_placeholder:'আপনার লক্ষণ বিস্তারিত বলুন…',
    hosp_title:'ডাক্তার খুঁজুন', hosp_sub:'অমরাবতী, মহারাষ্ট্রের হাসপাতাল ও বিশেষজ্ঞ',
    hosp_search:'হাসপাতাল, বিশেষত্ব খুঁজুন…', hosp_location:'📍 ভালো ফলাফলের জন্য আমার অবস্থান ব্যবহার করুন',
    hist_title:'পরামর্শের ইতিহাস', hist_sub:'আপনার আগের AI পরামর্শ',
    prof_login:'লগইন / সাইন আপ', prof_reports:'আমার রিপোর্ট', prof_history:'পরামর্শের ইতিহাস',
    prof_feedback:'মতামত পাঠান', prof_guide:'অ্যাপ গাইড', prof_logout:'লগআউট',
    lang_title:'ভাষা', greeting_morning:'শুভ সকাল', greeting_afternoon:'নমস্কার', greeting_evening:'শুভ সন্ধ্যা',
    analysis_title:'🤖 AI রিপোর্ট বিশ্লেষণ', analysis_loading:'AI আপনার রিপোর্ট বিশ্লেষণ করছে…',
    conclusion_title:'📋 উপসংহার', preview_title:'📸 আপলোড করা রিপোর্ট',
  },
  ta: {
    nav_home:'முகப்பு', nav_chat:'AI ஆலோசனை', nav_upload:'அறிக்கை பதிவேற்று', nav_dashboard:'டாஷ்போர்டு',
    nav_history:'வரலாறு', nav_doctors:'மருத்துவர் தேடு', nav_profile:'சுயவிவரம்',
    upload_title:'அறிக்கை பதிவேற்றவும்', upload_sub:'PDF அல்லது படங்கள் — தானியங்கு AI பகுப்பாய்வுக்கு',
    upload_drop:'கோப்பு தேர்ந்தெடுக்கவும் அல்லது இழுக்கவும்', upload_drop_sub:'அதிகபட்சம் 20MB',
    upload_camera:'📸 கேமராவில் அறிக்கை எடுக்கவும்',
    chat_placeholder:'உங்கள் அறிகுறிகளை விரிவாக விவரிக்கவும்…',
    hosp_title:'மருத்துவர் தேடு', hosp_sub:'அமராவதி, மகாராஷ்டிர மருத்துவமனைகள்',
    hosp_search:'மருத்துவமனை, சிறப்பு தேடவும்…', hosp_location:'📍 சிறந்த முடிவுகளுக்கு என் இடத்தை பயன்படுத்து',
    hist_title:'ஆலோசனை வரலாறு', hist_sub:'உங்கள் முந்தைய AI ஆலோசனைகள்',
    prof_login:'உள்நுழை / பதிவு செய்', prof_reports:'என் அறிக்கைகள்', prof_history:'ஆலோசனை வரலாறு',
    prof_feedback:'கருத்து அனுப்பு', prof_guide:'பயன்பாட்டு வழிகாட்டி', prof_logout:'வெளியேறு',
    lang_title:'மொழி', greeting_morning:'காலை வணக்கம்', greeting_afternoon:'மதிய வணக்கம்', greeting_evening:'மாலை வணக்கம்',
    analysis_title:'🤖 AI அறிக்கை பகுப்பாய்வு', analysis_loading:'AI உங்கள் அறிக்கையை பகுப்பாய்வு செய்கிறது…',
    conclusion_title:'📋 முடிவுரை', preview_title:'📸 பதிவேற்றிய அறிக்கை',
  }
};

let currentLang = localStorage.getItem('he_lang') || 'en';

function t(key) { return (TRANSLATIONS[currentLang] || TRANSLATIONS.en)[key] || TRANSLATIONS.en[key] || key; }

function setLanguage(lang, btn) {
  const prev = currentLang;
  currentLang = lang;
  localStorage.setItem('he_lang', lang);
  document.querySelectorAll('.lbtn').forEach(x => x.classList.remove('on'));
  if (btn) btn.classList.add('on');
  applyTranslations();

  // Stop any active voice playback — language changed, voice locale must update
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    // Reset voice buttons
    const pb = document.getElementById('voicePlayBtn');
    const pau = document.getElementById('voicePauseBtn');
    const res = document.getElementById('voiceResumeBtn');
    if (pb) pb.style.display = '';
    if (pau) pau.style.display = 'none';
    if (res) res.style.display = 'none';
  }

  const langLabel = btn?.textContent || lang;
  showToast('Language: ' + langLabel);

  // If a report was already analyzed, offer to re-analyze in the new language
  if (prev !== lang && STATE.lastReportAnalysis) {
    setTimeout(() => {
      const uploadScr = document.getElementById('s-upload');
      const isUploadActive = uploadScr && uploadScr.classList.contains('on');
      // Show re-analyze banner only if report analysis is visible
      const analysisWrap = document.getElementById('inlineAnalysisWrap');
      if (analysisWrap && analysisWrap.style.display !== 'none') {
        showLangReanalyzePrompt(langLabel);
      }
    }, 500);
  }
}

/**
 * Show a non-blocking prompt offering to re-analyze the current report
 * in the newly selected language.
 */
function showLangReanalyzePrompt(langLabel) {
  // Avoid duplicates
  const existing = document.getElementById('langReanalyzeBar');
  if (existing) existing.remove();

  const bar = document.createElement('div');
  bar.id = 'langReanalyzeBar';
  bar.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;background:var(--bg2);border:1px solid var(--teal-l2);border-radius:var(--radius-lg);padding:12px 18px;display:flex;align-items:center;gap:12px;box-shadow:var(--shadow-md);font-size:13px;color:var(--text);max-width:360px;width:90%';
  bar.innerHTML = `
    <span>🌐 Re-analyze report in <strong>${escapeHtml(langLabel)}</strong>?</span>
    <button class="btn btn-p btn-sm" style="flex-shrink:0" onclick="reanalyzeCurrentReport(); document.getElementById('langReanalyzeBar')?.remove()">Re-analyze</button>
    <button class="btn-ghost btn btn-sm" style="flex-shrink:0" onclick="document.getElementById('langReanalyzeBar')?.remove()">✕</button>`;
  document.body.appendChild(bar);
  setTimeout(() => bar.remove(), 8000);
}

/**
 * Re-run AI analysis on the last uploaded report in the current language.
 */
async function reanalyzeCurrentReport() {
  const snap = STATE.lastReportAnalysis;
  if (!snap) { showToast('No report loaded — upload one first'); return; }

  const analysisWrap = document.getElementById('inlineAnalysisWrap');
  const loadingEl   = document.getElementById('inlineAnalysisLoading');
  const bodyEl      = document.getElementById('inlineAnalysisBody');
  const conclusionWrap = document.getElementById('conclusionWrap');
  const conclusionBody = document.getElementById('conclusionBody');
  if (!analysisWrap || !bodyEl) return;

  // Stop voice
  if (window.speechSynthesis) window.speechSynthesis.cancel();

  analysisWrap.style.display = 'block';
  if (loadingEl) loadingEl.style.display = 'flex';
  bodyEl.innerHTML = '';
  if (conclusionWrap) conclusionWrap.style.display = 'none';
  if (analysisWrap) analysisWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const { singleReport, params } = snap;
  const rawText = singleReport?.extracted_text_preview || buildReportTextFromParams(params, singleReport);
  const fileRef = singleReport?._localFile || null;

  const result = await analyzeReportWithGroq(fileRef, rawText, params);
  if (loadingEl) loadingEl.style.display = 'none';

  if (result) {
    // Update cached aiResult in state
    if (singleReport) singleReport.aiResult = result;
    renderStructuredReportAI(bodyEl, result, '', false);
    if (conclusionWrap && conclusionBody) {
      conclusionWrap.style.display = 'block';
      renderConclusion(conclusionBody, result, params);
    }
    // Rebuild voice summary in new language
    STATE.lastVoiceSummary = buildVoiceSummary(result, params);
    const voiceCtrl = document.getElementById('voiceControls');
    if (voiceCtrl) voiceCtrl.style.display = 'flex';
    showToast('✓ Report re-analyzed in ' + (LANG_NAME_MAP[currentLang] || currentLang));
  } else {
    bodyEl.innerHTML = '<span style="color:var(--hint)">Re-analysis could not be completed. Please try again.</span>';
    showToast('Re-analysis failed — please try again');
  }
}

function applyTranslations() {
  // Nav tabs (mobile)
  const tabMap = { home:'nav_home', chat:'nav_chat', upload:'nav_upload', dashboard:'nav_dashboard', history:'nav_history', hospitals:'nav_doctors', profile:'nav_profile' };
  document.querySelectorAll('.tab').forEach(el => { const k = tabMap[el.dataset.t]; if(k) { const svg = el.querySelector('svg'); el.innerHTML = (svg ? svg.outerHTML : '') + '<br>' + t(k); } });
  // Sidebar tabs
  document.querySelectorAll('.sidebar-tab').forEach(el => { const k = tabMap[el.dataset.t]; if(k) { const svg = el.querySelector('svg'); el.innerHTML = (svg ? svg.outerHTML : '') + ' ' + t(k); } });
  // Upload screen
  const upTitle = document.querySelector('#s-upload .scr-hd h2'); if(upTitle) upTitle.textContent = t('upload_title');
  const upSub = document.querySelector('#s-upload .scr-hd p'); if(upSub) upSub.textContent = t('upload_sub');
  const dropH3 = document.querySelector('.drop-zone h3'); if(dropH3) dropH3.textContent = t('upload_drop');
  const dropP = document.querySelector('.drop-zone p'); if(dropP) dropP.textContent = t('upload_drop_sub');
  const camBtn = document.querySelector('.cam-btn'); if(camBtn) camBtn.childNodes[camBtn.childNodes.length-1].textContent = ' ' + t('upload_camera');
  // Section titles
  const previewTitle = document.querySelector('#uploadedImagePreview .card-title'); if(previewTitle) previewTitle.textContent = t('preview_title');
  const analysisTitle = document.querySelector('#inlineAnalysisWrap .card-title'); if(analysisTitle) analysisTitle.textContent = t('analysis_title');
  const conclusionTitle = document.querySelector('#conclusionWrap .card-title'); if(conclusionTitle) conclusionTitle.textContent = t('conclusion_title');
  // Hospitals
  const hospTitle = document.querySelector('#s-hospitals .scr-hd h2'); if(hospTitle) hospTitle.textContent = t('hosp_title');
  const hospSub = document.getElementById('hospScreenSub'); if(hospSub && !STATE.userLocation) hospSub.textContent = t('hosp_sub');
  const hospSearchEl = document.getElementById('hospSearch'); if(hospSearchEl) hospSearchEl.placeholder = t('hosp_search');
  const locBtn2 = document.getElementById('locBtn'); if(locBtn2 && !STATE.userLocation) locBtn2.textContent = t('hosp_location');
  // History
  const histTitle = document.querySelector('#s-history .scr-hd h2'); if(histTitle) histTitle.textContent = t('hist_title');
  const histSub = document.querySelector('#s-history .scr-hd p'); if(histSub) histSub.textContent = t('hist_sub');
  // Profile menu items
  const mi = document.querySelectorAll('.mi span');
  const miKeys = ['prof_login','prof_reports','prof_history','prof_feedback','prof_guide','prof_logout'];
  mi.forEach((el, i) => { if(miKeys[i]) el.textContent = t(miKeys[i]); });
  // Chat input
  const chatInp = document.getElementById('inp'); if(chatInp) chatInp.placeholder = t('chat_placeholder');
  // Dashboard greeting
  const greet = document.getElementById('dashGreet');
  if(greet) { const tod = getTimeOfDay(); const gKey = 'greeting_' + (tod === 'morning' ? 'morning' : tod === 'afternoon' ? 'afternoon' : 'evening'); greet.textContent = t(gKey); }

  // Update AI analysis language badge (shown on upload screen analysis card)
  const langLabels = { en:'EN', hi:'HI', mr:'MR', bn:'BN', ta:'TA' };
  const badge = document.getElementById('analysisLangBadge');
  if (badge) badge.textContent = langLabels[currentLang] || currentLang.toUpperCase();
  const vbadge = document.getElementById('voiceLangBadge');
  if (vbadge) vbadge.textContent = '🔊 ' + (langLabels[currentLang] || currentLang.toUpperCase());
}

// ════════════════════════════════════════════════════════
// HOSPITALS — SIGNUP CITY (PRIMARY) + GPS FALLBACK
// ════════════════════════════════════════════════════════

// Track which city source is active ('signup' | 'gps')
let HOSP_CITY_SOURCE = null;
let HOSP_ACTIVE_CITY = null;

/**
 * Get the user's signup city from STATE.user profile.
 * Returns null if not available.
 */
function getSignupCity() {
  const city = STATE.user?.city || STATE.user?.City || STATE.user?.profile?.city || '';
  return city ? city.trim() : null;
}

/**
 * Known city coordinates — hardcoded as reliable fallback.
 * These are the geographic centers of the cities, verified against OSM.
 * Used when Nominatim geocoding fails or returns wrong results.
 */
const KNOWN_CITY_COORDS = {
  // ── MAHARASHTRA — ALL DISTRICTS & MAJOR CITIES ──
  'amravati':               { lat: 20.9320, lng: 77.7523 },
  'nagpur':                 { lat: 21.1458, lng: 79.0882 },
  'pune':                   { lat: 18.5204, lng: 73.8567 },
  'mumbai':                 { lat: 19.0760, lng: 72.8777 },
  'thane':                  { lat: 19.2183, lng: 72.9781 },
  'nashik':                 { lat: 19.9975, lng: 73.7898 },
  'aurangabad':             { lat: 19.8762, lng: 75.3433 },
  'chhatrapati sambhajinagar': { lat: 19.8762, lng: 75.3433 },
  'solapur':                { lat: 17.6599, lng: 75.9064 },
  'kolhapur':               { lat: 16.7050, lng: 74.2433 },
  'akola':                  { lat: 20.7002, lng: 77.0082 },
  'nanded':                 { lat: 19.1383, lng: 77.3210 },
  'latur':                  { lat: 18.4088, lng: 76.5604 },
  'jalgaon':                { lat: 21.0077, lng: 75.5626 },
  'dhule':                  { lat: 20.9042, lng: 74.7749 },
  'yavatmal':               { lat: 20.3888, lng: 78.1204 },
  'chandrapur':             { lat: 19.9615, lng: 79.2961 },
  'buldhana':               { lat: 20.5292, lng: 76.1842 },
  'wardha':                 { lat: 20.7453, lng: 78.6022 },
  'washim':                 { lat: 20.1119, lng: 77.1333 },
  'gondia':                 { lat: 21.4600, lng: 80.1960 },
  'bhandara':               { lat: 21.1667, lng: 79.6500 },
  'gadchiroli':             { lat: 20.1809, lng: 80.0051 },
  'ratnagiri':              { lat: 16.9902, lng: 73.3120 },
  'sindhudurg':             { lat: 16.3470, lng: 73.8638 },
  'raigad':                 { lat: 18.5158, lng: 73.1180 },
  'satara':                 { lat: 17.6805, lng: 74.0183 },
  'sangli':                 { lat: 16.8524, lng: 74.5815 },
  'osmanabad':              { lat: 18.1861, lng: 76.0428 },
  'dharashiv':              { lat: 18.1861, lng: 76.0428 },
  'beed':                   { lat: 18.9890, lng: 75.7601 },
  'hingoli':                { lat: 19.7165, lng: 77.1497 },
  'parbhani':               { lat: 19.2704, lng: 76.7738 },
  'jalna':                  { lat: 19.8347, lng: 75.8816 },
  'ahmednagar':             { lat: 19.0948, lng: 74.7480 },
  'nandurbar':              { lat: 21.3656, lng: 74.2437 },
  'palghar':                { lat: 19.6967, lng: 72.7697 },
  'navi mumbai':            { lat: 19.0330, lng: 73.0297 },
  'vasai':                  { lat: 19.3919, lng: 72.8397 },
  'mira road':              { lat: 19.2897, lng: 72.8656 },
  'bhiwandi':               { lat: 19.3002, lng: 73.0636 },
  'kalyan':                 { lat: 19.2403, lng: 73.1305 },
  'dombivli':               { lat: 19.2183, lng: 73.0868 },
  'ulhasnagar':             { lat: 19.2215, lng: 73.1538 },
  'badlapur':               { lat: 19.1550, lng: 73.2638 },
  'ambarnath':              { lat: 19.2036, lng: 73.1851 },
  'panvel':                 { lat: 18.9894, lng: 73.1175 },
  'alibaug':                { lat: 18.6414, lng: 72.8722 },
  'malegaon':               { lat: 20.5579, lng: 74.5089 },
  'ichalkaranji':           { lat: 16.6954, lng: 74.4597 },
  'baramati':               { lat: 18.1513, lng: 74.5816 },
  'shirdi':                 { lat: 19.7670, lng: 74.4773 },
  'achalpur':               { lat: 21.2582, lng: 77.5126 },
  'paratwada':              { lat: 21.2900, lng: 77.6400 },
  'daryapur':               { lat: 20.9219, lng: 77.3225 },
  'anjangaon':              { lat: 21.1648, lng: 77.3069 },
  'warud':                  { lat: 21.4639, lng: 78.2685 },
  'morshi':                 { lat: 21.3100, lng: 78.0083 },
  'chandur bazar':          { lat: 20.8535, lng: 77.7565 },
  'dhamangaon':             { lat: 20.7167, lng: 77.3093 },
  'wani':                   { lat: 20.0559, lng: 78.9592 },
  'pusad':                  { lat: 19.9075, lng: 77.5795 },
  'hinganghat':             { lat: 20.5504, lng: 78.8366 },
  'arvi':                   { lat: 20.9907, lng: 78.2348 },
  'kamptee':                { lat: 21.2148, lng: 79.1970 },
  'khamgaon':               { lat: 20.7083, lng: 76.5692 },
  'shegaon':                { lat: 20.7942, lng: 76.6951 },
  'barshi':                 { lat: 18.2351, lng: 75.6944 },
  'pandharpur':             { lat: 17.6804, lng: 75.3310 },
  'miraj':                  { lat: 16.8209, lng: 74.6388 },
  'karad':                  { lat: 17.2881, lng: 74.1835 },
  'sawantwadi':             { lat: 15.9030, lng: 73.8183 },
  'chalisgaon':             { lat: 20.4598, lng: 74.9878 },
  'amalner':                { lat: 21.0444, lng: 75.0567 },
  'bhusawal':               { lat: 21.0440, lng: 75.7877 },
  'shahada':                { lat: 21.5445, lng: 74.4710 },
  'kopargaon':              { lat: 19.8958, lng: 74.4802 },
  'shrirampur':             { lat: 19.6199, lng: 74.6588 },
  // ── OTHER MAJOR INDIAN CITIES ──
  'delhi':                  { lat: 28.6139, lng: 77.2090 },
  'new delhi':              { lat: 28.6139, lng: 77.2090 },
  'bangalore':              { lat: 12.9716, lng: 77.5946 },
  'bengaluru':              { lat: 12.9716, lng: 77.5946 },
  'hyderabad':              { lat: 17.3850, lng: 78.4867 },
  'chennai':                { lat: 13.0827, lng: 80.2707 },
  'kolkata':                { lat: 22.5726, lng: 88.3639 },
  'ahmedabad':              { lat: 23.0225, lng: 72.5714 },
  'surat':                  { lat: 21.1702, lng: 72.8311 },
  'indore':                 { lat: 22.7196, lng: 75.8577 },
  'bhopal':                 { lat: 23.2599, lng: 77.4126 },
  'lucknow':                { lat: 26.8467, lng: 80.9462 },
  'kanpur':                 { lat: 26.4499, lng: 80.3319 },
  'jaipur':                 { lat: 26.9124, lng: 75.7873 },
  'patna':                  { lat: 25.5941, lng: 85.1376 },
  'guwahati':               { lat: 26.1445, lng: 91.7362 },
  'chandigarh':             { lat: 30.7333, lng: 76.7794 },
  'coimbatore':             { lat: 11.0168, lng: 76.9558 },
  'visakhapatnam':          { lat: 17.6868, lng: 83.2185 },
  'bhubaneswar':            { lat: 20.2961, lng: 85.8245 },
  'vadodara':               { lat: 22.3072, lng: 73.1812 },
  'rajkot':                 { lat: 22.3039, lng: 70.8022 },
};

/**
 * Geocode a city name → {lat, lng}.
 * Uses hardcoded lookup first (most reliable for Indian cities),
 * then falls back to Nominatim API.
 */
async function geocodeCity(cityName) {
  // Check hardcoded map first (case-insensitive)
  const key = cityName.trim().toLowerCase();
  if (KNOWN_CITY_COORDS[key]) {
    console.log(`[Geocode] "${cityName}" → hardcoded coords`, KNOWN_CITY_COORDS[key]);
    return KNOWN_CITY_COORDS[key];
  }

  // Nominatim fallback
  try {
    const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName + ', India')}&format=json&limit=1&addressdetails=1`;
    const geoRes = await fetch(geoUrl, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'HealthEchoApp/1.0 (healthecho@example.com)' }
    });
    if (!geoRes.ok) throw new Error('Nominatim geocoding failed');
    const geoData = await geoRes.json();
    if (!geoData || !geoData.length) throw new Error(`"${cityName}" not found`);
    const lat = parseFloat(geoData[0].lat);
    const lng = parseFloat(geoData[0].lon);
    console.log(`[Geocode] "${cityName}" → Nominatim`, { lat, lng });
    return { lat, lng };
  } catch (err) {
    console.error('[Geocode Error]', err);
    return null;
  }
}

/**
 * Fetch hospitals for a city name — always geocodes the city name to
 * get correct coordinates. NEVER relies on GPS coordinates for this path.
 */
async function fetchHospitalsByCity(cityName) {
  const el = document.getElementById('hospList');
  const wrap = document.getElementById('hospAfterLocation');
  const placeholder = document.getElementById('hospPlaceholder');

  if (el) el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--teal);font-size:13px;font-weight:600">⏳ Finding hospitals in ${escapeHtml(cityName)}…</div>`;
  if (wrap) wrap.style.display = 'block';
  if (placeholder) placeholder.style.display = 'none';
  setCityBar(cityName, 'Profile City');

  // Geocode city name → coordinates (hardcoded lookup → Nominatim fallback)
  const coords = await geocodeCity(cityName);
  if (!coords) {
    if (el) el.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--red);font-size:13px">
        <div style="font-size:32px;margin-bottom:10px">⚠️</div>
        Could not locate <strong>${escapeHtml(cityName)}</strong>.<br>
        <small style="color:var(--muted);margin-top:6px;display:block">Check your internet connection and try again.</small>
        <button class="btn btn-p btn-sm" style="margin-top:14px" onclick="loadHospitalsForSignupCity()">🔄 Retry</button>
      </div>`;
    return;
  }

  await fetchHospitalsFromOverpass(cityName, coords.lat, coords.lng, 'signup');
}

/**
 * Primary entry point: load hospitals using signup city.
 * Called when the hospitals tab is opened.
 */
async function loadHospitalsForSignupCity() {
  const cityName = getSignupCity();

  if (!cityName) {
    // No signup city — show placeholder with option to use location
    const placeholder = document.getElementById('hospPlaceholder');
    if (placeholder) {
      placeholder.style.display = 'block';
      placeholder.innerHTML = `
        <div style="font-size:52px;margin-bottom:14px">🏥</div>
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px">No city in your profile</div>
        <div style="font-size:13px;line-height:1.7;margin-bottom:16px">
          Sign in with a profile that includes your city, or use <strong style="color:var(--teal)">"Use My Location"</strong> to detect your city automatically.
        </div>`;
    }
    const wrap = document.getElementById('hospAfterLocation');
    if (wrap) wrap.style.display = 'none';
    const sub = document.getElementById('hospScreenSub');
    if (sub) sub.textContent = 'Sign in or use location to find hospitals';
    return;
  }

  HOSP_ACTIVE_CITY = cityName;
  HOSP_CITY_SOURCE = 'signup';

  const sub = document.getElementById('hospScreenSub');
  if (sub) sub.textContent = `Hospitals & clinics in ${cityName}`;

  await fetchHospitalsByCity(cityName);
}

/**
 * Update the city info bar at the top of the hospitals screen.
 */
function setCityBar(cityName, source) {
  const bar = document.getElementById('hospCityBar');
  const barText = document.getElementById('hospCityBarText');
  const barSource = document.getElementById('hospCitySource');
  if (!bar) return;
  bar.style.display = 'flex';
  if (barText) barText.innerHTML = `📍 City: <strong>${escapeHtml(cityName)}</strong>`;
  if (barSource) barSource.textContent = source;
}

/**
 * Precise city detection from coordinates using Nominatim.
 * Uses lat/lng directly (not county which can be a division like "Nagpur Division").
 */
async function detectCityFromCoords(lat, lng) {
  const zooms = [18, 14, 10];
  for (const zoom of zooms) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=${zoom}&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'HealthEchoApp/1.0 (healthecho@example.com)' }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const a = data.address || {};
      console.log(`[Nominatim zoom=${zoom}]`, JSON.stringify(a));
      // Priority: city > town > municipality > city_district (skip county — it's the revenue district in India)
      const city = a.city || a.town || a.municipality || a.city_district || a.village;
      if (city) return city;
    } catch (e) {
      console.warn(`Nominatim zoom=${zoom} failed:`, e);
    }
  }
  // Last resort fallback
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'HealthEchoApp/1.0' } });
    const data = await res.json();
    const a = data.address || {};
    // county in India = revenue district (e.g. "Amravati" not "Nagpur Division") — accept it as last resort
    return a.county || a.state_district || a.state || 'your area';
  } catch (e) {
    return 'your area';
  }
}

/**
 * "Use My Location" — optional GPS override.
 *
 * IMPORTANT: We fetch hospitals using CITY-CENTER coordinates derived from
 * the signup city name (hardcoded lookup → Nominatim). GPS is only used to
 * show the user's distance to each hospital — it is NEVER used to determine
 * which city's hospitals to show.
 *
 * Why: GPS / cell-tower location in India is often inaccurate by 20-50 km,
 * causing Amravati users to get Nagpur hospitals. Using the profile city
 * name → hardcoded geocode eliminates this problem entirely.
 */
async function requestLocation() {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported on this device');
    return;
  }

  const locBtn = document.getElementById('locBtn');
  const banner = document.getElementById('locBanner');

  if (locBtn) { locBtn.textContent = '⏳ Getting location…'; locBtn.disabled = true; }
  if (banner) { banner.style.display = 'block'; banner.innerHTML = '⏳ Getting GPS coordinates…'; }

  const getPosition = () => new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    });
  });

  let position;
  try {
    position = await getPosition();
  } catch (err) {
    if (locBtn) { locBtn.textContent = '📍 Use My Location (Optional)'; locBtn.disabled = false; }
    if (banner) { banner.style.display = 'none'; }
    const msg = err.code === 1
      ? 'Location access denied — please allow location in browser settings'
      : err.code === 2
        ? 'Location unavailable — check your GPS / network'
        : 'Location timed out — try again in open air for better GPS signal';
    showToast(msg);
    // Always fall back to signup city
    loadHospitalsForSignupCity();
    return;
  }

  const { latitude, longitude, accuracy } = position.coords;
  STATE.userLocation = { lat: latitude, lng: longitude };
  console.log(`[GPS] lat=${latitude}, lng=${longitude}, accuracy=±${Math.round(accuracy)}m`);

  if (banner) banner.innerHTML = `📡 GPS locked (±${Math.round(accuracy)}m)`;

  // Determine which city to show hospitals for:
  // ALWAYS prefer signup city — GPS is unreliable in India for city-level detection.
  const signupCity = getSignupCity();
  if (signupCity) {
    // Use signup city coords for hospital fetch; GPS position is stored for distance calculation
    if (locBtn) { locBtn.textContent = `📍 Location ✓ — Using ${signupCity}`; locBtn.disabled = false; }
    if (banner) banner.innerHTML = `📍 GPS captured — showing hospitals for <strong>${escapeHtml(signupCity)}</strong> (your profile city)`;
    showToast(`Showing hospitals in ${signupCity} (your city)`);
    // Reload with signup city — GPS coords now stored in STATE.userLocation for distance display
    await loadHospitalsForSignupCity();
  } else {
    // No signup city — use GPS coordinates to fetch and detect city
    if (banner) banner.innerHTML = `📡 GPS locked — identifying city…`;
    const cityName = await detectCityFromCoords(latitude, longitude);
    console.log(`[City from GPS] "${cityName}"`);
    HOSP_ACTIVE_CITY = cityName;
    HOSP_CITY_SOURCE = 'gps';
    if (locBtn) { locBtn.textContent = `📍 ${cityName} (GPS) ✓`; locBtn.disabled = false; }
    if (banner) banner.innerHTML = `📍 <strong>${escapeHtml(cityName)}</strong> — fetching hospitals…`;
    const sub = document.getElementById('hospScreenSub');
    if (sub) sub.textContent = `Hospitals near ${cityName}`;
    setCityBar(cityName, 'GPS Location');
    await fetchHospitalsFromOverpass(cityName, latitude, longitude, 'gps');
    showToast(`Showing hospitals near ${cityName}`);
  }
}

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
document.getElementById('dashDate').textContent = new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
document.getElementById('dashGreet').textContent = 'Good ' + getTimeOfDay();
STATE.consultations = [];
updateAuthUI();
// Do NOT call renderHospitals() on init — hospitals only shown after location detection
// Restore language
if (currentLang !== 'en') {
  const savedBtn = document.querySelector(`.lbtn[data-lang="${currentLang}"]`);
  if (savedBtn) setLanguage(currentLang, savedBtn);
}

// ── MOBILE FIXES: pre-load voices as early as possible ──
if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    window.speechSynthesis.getVoices(); // cache them
  });
}

// ── MOBILE FIX: prevent modal scroll-lock on background (iOS Safari) ──
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('touchmove', e => {
    if (e.target === bg) e.preventDefault();
  }, { passive: false });
});

// ── MOBILE FIX: handle visibility change — resume TTS if user returns to tab ──
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && window.speechSynthesis?.paused) {
    window.speechSynthesis.resume();
  }
});

// ── MOBILE FIX: network status banner ──
function updateNetworkBanner() {
  const existing = document.getElementById('netBanner');
  if (!navigator.onLine) {
    if (!existing) {
      const banner = document.createElement('div');
      banner.id = 'netBanner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;background:var(--amber-l);color:var(--amber-d);text-align:center;font-size:12px;font-weight:700;padding:8px;border-bottom:1px solid var(--amber)';
      banner.textContent = '⚠️ No internet connection — some features may not work';
      document.body.prepend(banner);
    }
  } else {
    if (existing) existing.remove();
  }
}
window.addEventListener('online', updateNetworkBanner);
window.addEventListener('offline', updateNetworkBanner);
updateNetworkBanner();

// ── MOBILE FIX: prevent double-tap zoom on buttons ──
document.addEventListener('dblclick', e => {
  if (e.target.closest('button,.btn,.tab,.chip')) e.preventDefault();
}, { passive: false });
