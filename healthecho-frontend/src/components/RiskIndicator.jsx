const riskStyles = {
  Low: "bg-green-500",
  Moderate: "bg-orange-500",
  High: "bg-red-500",
};

const riskWidth = {
  Low: "33%",
  Moderate: "66%",
  High: "100%",
};

export default function RiskIndicator({ riskLevel = "Low", confidence = "Low" }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-800">
      <p className="text-sm font-bold">Health Risk Meter</p>
      <div className="mt-3 h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${riskStyles[riskLevel] || riskStyles.Low}`}
          style={{ width: riskWidth[riskLevel] || riskWidth.Low }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <span>Risk: {riskLevel}</span>
        <span>Confidence: {confidence}</span>
      </div>
    </div>
  );
}
