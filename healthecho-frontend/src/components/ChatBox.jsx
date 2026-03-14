import { useEffect, useRef, useState } from "react";

export default function ChatBox({ history, onSend, loading }) {
  const [message, setMessage] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [history]);

  const submit = (e) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setMessage("");
  };

  return (
    <section className="rounded-3xl bg-white p-4 shadow-soft dark:bg-slate-800 sm:p-6">
      <h2 className="text-base font-extrabold text-medicalAccent sm:text-lg">Follow-up Chat</h2>
      <div ref={listRef} className="mt-4 h-72 space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-3 dark:bg-slate-900 sm:h-80 sm:p-4">
        {history.map((item, idx) => (
          <div
            key={`${item.role}-${idx}`}
            className={`max-w-[95%] rounded-2xl p-3 text-xs break-words sm:max-w-[90%] sm:text-sm ${
              item.role === "user"
                ? "ml-auto bg-medicalBlue text-white"
                : "bg-white text-slate-700 dark:bg-slate-700 dark:text-slate-100"
            }`}
          >
            {item.content}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask follow-up question..."
          className="flex-1 rounded-xl border border-blue-200 px-3 py-2 text-sm focus:border-medicalBlue focus:outline-none dark:border-slate-600 dark:bg-slate-900"
        />
        <button
          disabled={loading}
          className="w-full rounded-xl bg-medicalAccent px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:w-auto"
        >
          Send
        </button>
      </form>
    </section>
  );
}
