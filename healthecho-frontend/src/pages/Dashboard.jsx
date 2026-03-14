import UploadCard from "../components/UploadCard";
import LoaderSpinner from "../components/LoaderSpinner";
import ResultCard from "../components/ResultCard";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function buildTrendData(reports) {
  return reports
    .slice(0, 10)
    .reverse()
    .map((r, idx) => ({
      idx: idx + 1,
      glucose: Number(r?.extracted_values?.Glucose || 0),
      hemoglobin: Number(r?.extracted_values?.Hemoglobin || 0),
      wbc: Number(r?.extracted_values?.WBC || 0),
    }));
}

export default function Dashboard({ loading, result, reports, onAnalyze }) {
  const trendData = buildTrendData(reports || []);

  return (
    <div className="space-y-6">
      <UploadCard onAnalyze={onAnalyze} loading={loading} />
      {loading ? <LoaderSpinner label="Running analysis..." /> : null}
      <ResultCard result={result} />

      <section className="rounded-3xl bg-white p-6 shadow-soft dark:bg-slate-800">
        <h3 className="text-lg font-extrabold text-medicalAccent">Lab Trends (Recent Reports)</h3>
        {trendData.length ? (
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="idx" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="glucose" stroke="#ef4444" strokeWidth={2} />
                <Line type="monotone" dataKey="hemoglobin" stroke="#22c55e" strokeWidth={2} />
                <Line type="monotone" dataKey="wbc" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-3 text-sm">No report history available yet.</p>
        )}
      </section>
    </div>
  );
}
