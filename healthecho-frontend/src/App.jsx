import { Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import ChatPage from "./pages/ChatPage";
import About from "./pages/About";
import { analyzeReport, chatWithAssistant } from "./services/api";
import { getChatHistory, getDarkMode, getReports, saveChatHistory, saveReport, setDarkMode } from "./services/storage";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [reports, setReports] = useState(getReports());
  const [chatHistory, setChatHistory] = useState(getChatHistory());
  const [darkMode, setDark] = useState(getDarkMode());

  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const handleAnalyze = async ({ file, manualText }) => {
    const form = new FormData();
    if (file) form.append("file", file);
    if (manualText?.trim()) form.append("manual_text", manualText.trim());

    try {
      setLoading(true);
      setError("");
      const data = await analyzeReport(form);
      setResult(data);
      saveReport(data);
      setReports(getReports());
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Failed to analyze report.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendChat = async (question) => {
    const nextHistory = [...chatHistory, { role: "user", content: question }];
    setChatHistory(nextHistory);
    saveChatHistory(nextHistory);

    try {
      setLoading(true);
      const res = await chatWithAssistant({ question, analysis_summary: result || {}, history: nextHistory });
      const finalHistory = [...nextHistory, { role: "assistant", content: res.answer }];
      setChatHistory(finalHistory);
      saveChatHistory(finalHistory);
    } catch (e) {
      const errMessage = e?.response?.data?.error || e?.message || "Chat request failed.";
      const finalHistory = [...nextHistory, { role: "assistant", content: errMessage }];
      setChatHistory(finalHistory);
      saveChatHistory(finalHistory);
    } finally {
      setLoading(false);
    }
  };

  const toggleDark = () => {
    const next = !darkMode;
    setDark(next);
    setDarkMode(next);
  };

  return (
    <div className="min-h-screen">
      <Navbar darkMode={darkMode} onToggleDarkMode={toggleDark} />
      {error ? (
        <div className="mx-auto mt-4 max-w-6xl rounded-xl bg-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-900/50 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/dashboard"
            element={
              <Dashboard
                loading={loading}
                result={result}
                reports={reports}
                onAnalyze={handleAnalyze}
              />
            }
          />
          <Route
            path="/chat"
            element={<ChatPage loading={loading} chatHistory={chatHistory} onSendChat={handleSendChat} />}
          />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
