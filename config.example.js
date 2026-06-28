// Duplicate this file, rename it to config.js, and enter your credentials.
window.HEALTHECHO_CONFIG = {
  firebaseConfig: {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
    projectId: "YOUR_FIREBASE_PROJECT_ID",
    storageBucket: "YOUR_FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
    appId: "YOUR_FIREBASE_APP_ID",
    measurementId: "YOUR_FIREBASE_MEASUREMENT_ID"
  },
  groqDefaultKey: "YOUR_GROQ_API_KEY",
  apiBaseUrl: "http://127.0.0.1:8000" // Set to empty string if not using local FastAPI
};
