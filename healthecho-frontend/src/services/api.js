import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
});

export async function ingestDocs() {
  const { data } = await api.post("/ingest");
  return data;
}

export async function analyzeReport(payload) {
  const { data } = await api.post("/analyze", payload, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function chatWithAssistant(body) {
  const { data } = await api.post("/chat", body);
  return data;
}

export default api;
