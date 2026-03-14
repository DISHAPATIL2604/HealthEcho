const REPORTS_KEY = "healthecho_reports";
const CHAT_KEY = "healthecho_chat";
const DARK_KEY = "healthecho_dark";

export function getReports() {
  try {
    return JSON.parse(localStorage.getItem(REPORTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveReport(report) {
  const reports = getReports();
  reports.unshift({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...report });
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports.slice(0, 20)));
}

export function getChatHistory() {
  try {
    return JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveChatHistory(history) {
  localStorage.setItem(CHAT_KEY, JSON.stringify(history.slice(-60)));
}

export function getDarkMode() {
  return localStorage.getItem(DARK_KEY) === "1";
}

export function setDarkMode(enabled) {
  localStorage.setItem(DARK_KEY, enabled ? "1" : "0");
}
