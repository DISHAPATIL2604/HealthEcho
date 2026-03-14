import { useState } from "react";
import DragDropUploader from "./DragDropUploader";

export default function UploadCard({ onAnalyze, loading }) {
  const [file, setFile] = useState(null);
  const [manualText, setManualText] = useState("");

  const submit = () => {
    onAnalyze({ file, manualText });
  };

  return (
    <section className="rounded-3xl bg-white p-4 shadow-soft dark:bg-slate-800 sm:p-6">
      <h2 className="text-base font-extrabold text-medicalAccent sm:text-lg">Upload Blood Report</h2>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-300">
        Upload PDF/image blood report or paste symptoms/lab text.
      </p>

      <DragDropUploader onFileSelected={setFile} />
      {file ? <p className="mt-2 text-xs">Selected: {file.name}</p> : null}

      <textarea
        value={manualText}
        onChange={(e) => setManualText(e.target.value)}
        rows={6}
        placeholder="Optional manual report text..."
        className="mt-4 w-full rounded-2xl border border-blue-200 p-3 text-sm focus:border-medicalBlue focus:outline-none dark:border-slate-600 dark:bg-slate-900"
      />

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={submit}
          disabled={loading}
          className="w-full rounded-xl bg-medicalBlue px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:w-auto"
        >
          Analyze Report
        </button>
      </div>
    </section>
  );
}
