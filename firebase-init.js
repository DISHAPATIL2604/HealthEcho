import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendEmailVerification, sendPasswordResetEmail, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, addDoc, getDocs, query, where, orderBy, Timestamp, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// Fetch config from backend dynamically if possible
let firebaseConfig = null;
let groqKey = null;

try {
  const response = await fetch("http://127.0.0.1:8000/config");
  if (response.ok) {
    const config = await response.json();
    firebaseConfig = config.firebaseConfig;
    groqKey = config.groqDefaultKey;
  }
} catch (e) {
  console.warn("Could not fetch config from backend, using window.HEALTHECHO_CONFIG / default template");
}

// Fallback to local config.js if backend is offline or config fetch failed
if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_FIREBASE_API_KEY") {
  firebaseConfig = (window.HEALTHECHO_CONFIG && window.HEALTHECHO_CONFIG.firebaseConfig) || {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "healthecho-7175e.firebaseapp.com",
    projectId: "healthecho-7175e",
    storageBucket: "healthecho-7175e.firebasestorage.app",
    messagingSenderId: "712734876851",
    appId: "1:712734876851:web:0f23d98bfe3fc7cb40fcc6",
    measurementId: "G-SM9JYC10XS"
  };
}

// Inject Groq key dynamically if we retrieved it
if (groqKey) {
  if (!window.HEALTHECHO_CONFIG) window.HEALTHECHO_CONFIG = {};
  window.HEALTHECHO_CONFIG.groqDefaultKey = groqKey;
  localStorage.setItem('he_groq_key', groqKey);
}


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ── MOBILE FIX: Set session persistence to LOCAL so auth survives mobile browser restarts ──
setPersistence(auth, browserLocalPersistence).catch(e => console.warn('Persistence set failed:', e));

window._FB = { auth, db, storage, collection, doc, setDoc, getDoc, addDoc, getDocs, query, where, orderBy, Timestamp, serverTimestamp, RecaptchaVerifier, signInWithPhoneNumber, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendEmailVerification, sendPasswordResetEmail, ref, uploadBytes, getDownloadURL };

onAuthStateChanged(auth, async (fbUser) => {
  // Use a recursive check to ensure STATE and updateAuthUI functions are loaded globally
  const checkStateAndRun = async () => {
    if (typeof STATE === 'undefined' || typeof updateAuthUI === 'undefined') {
      setTimeout(checkStateAndRun, 50);
      return;
    }
    if (fbUser) {
      try {
        const snap = await getDoc(doc(db, 'users', fbUser.uid));
        if (snap.exists()) {
          STATE.user = { id: fbUser.uid, ...snap.data() };
          STATE.firebaseUser = fbUser;
          updateAuthUI();
          loadUserReports();
          loadUserConsultations();
        }
      } catch(e) { console.warn('Firestore fetch error:', e); }
    } else {
      STATE.user = null;
      STATE.firebaseUser = null;
      updateAuthUI();
    }
  };
  checkStateAndRun();
});
