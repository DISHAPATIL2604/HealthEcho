import jsPDF from "jspdf";
import RiskIndicator from "./RiskIndicator";

function downloadSummary(result) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("HealthEcho Summary", 14, 20);
  doc.setFontSize(11);
  let y = 30;

  const lines = [
    `Mode: ${result.mode || "N/A"}`,
    `Risk Level: ${result.risk_level}`,
    `Confidence: ${result.confidence_level}`,
    `Predicted Conditions: ${(result.predicted_conditions || []).map((c) => c.condition).join(", ") || "None"}`,
    `Doctor Specialist: ${result.doctor_specialist || "General Physician"}`,
    `Clinical Explanation: ${result.clinical_explanation || "N/A"}`,
    "Disclaimer: This system provides AI-based health risk insights and is not a substitute for professional medical advice.",
  ];

  lines.forEach((line) => {
    const split = doc.splitTextToSize(line, 180);
    doc.text(split, 14, y);
    y += split.length * 6;
  });

  doc.save("healthecho-summary.pdf");
}

export default function ResultCard({ result }) {
  if (!result) return null;

  return (
    <section className="space-y-4 rounded-3xl bg-white p-4 shadow-soft dark:bg-slate-800 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-extrabold text-medicalAccent sm:text-lg">Analysis Result</h3>
        <button
          onClick={() => downloadSummary(result)}
          className="w-full rounded-xl bg-medicalBlue px-3 py-2 text-xs font-bold text-white sm:w-auto"
        >
          Download Summary PDF
        </button>
      </div>

      <RiskIndicator riskLevel={result.risk_level} confidence={result.confidence_level} />

      <div>
        <p className="font-bold">Mode</p>
        <p className="text-sm">{result.mode === "report_analysis" ? "Report Analysis" : "Symptom Text"}</p>
      </div>

      <div>
        <p className="font-bold">Extracted Lab Values</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {Object.entries(result.extracted_values || {}).map(([key, value]) => (
            <div key={key} className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-700">
              <span className="font-semibold">{key}:</span> {value ?? "Not found"}
            </div>
          ))}
        </div>
      </div>

      {(result.interpreted_lab_values && Object.keys(result.interpreted_lab_values).length > 0) ? (
        <div>
          <p className="font-bold">Interpreted Lab Values</p>
          <div className="mt-2 space-y-2">
            {Object.entries(result.interpreted_lab_values).map(([marker, item]) => (
              <div key={marker} className="rounded-lg bg-slate-50 p-3 text-xs break-words dark:bg-slate-700 sm:text-sm">
                <p><span className="font-semibold">{marker}</span> - {item.status}</p>
                <p>Value: {item.value} | Range: {item.normal_range}</p>
                <p>{item.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="font-bold">Predicted Conditions</p>
        {(result.predicted_conditions || []).length ? (
          <div className="space-y-2">
            {result.predicted_conditions.map((item, idx) => (
              <div key={`${item.condition || "condition"}-${idx}`} className="rounded-lg bg-slate-50 p-2 text-xs break-words dark:bg-slate-700 sm:text-sm">
                <p><span className="font-semibold">Condition:</span> {item.condition || "N/A"}</p>
                <p><span className="font-semibold">Risk:</span> {item.risk_level || "Low"}</p>
                <p><span className="font-semibold">Reason:</span> {item.reason || "N/A"}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm">No clear pattern found.</p>
        )}
      </div>

      <div>
        <p className="font-bold">Clinical Explanation</p>
        <p className="text-sm">{result.clinical_explanation}</p>
      </div>


      <div>
        <p className="font-bold">Report Findings (From Uploaded Report)</p>
        <p className="text-xs break-words sm:text-sm">
          {(result.report_findings || []).length
            ? result.report_findings.join(" | ")
            : "No structured lab lines were clearly detected from uploaded text/image."}
        </p>
      </div>

      <div>
        <p className="font-bold">Why This May Be Happening</p>
        <p className="text-xs break-words sm:text-sm">
          {(result.symptom_insights || []).length
            ? result.symptom_insights.join(" | ")
            : "Assessment is primarily based on extracted blood values and retrieved medical context."}
        </p>
      </div>

      {result.symptoms_summary ? (
        <div>
          <p className="font-bold">Symptoms Summary</p>
          <p className="text-xs break-words sm:text-sm">{result.symptoms_summary}</p>
        </div>
      ) : null}

      <div>
        <p className="font-bold">Diet Suggestions</p>
        <p className="text-xs break-words sm:text-sm">{(result.diet_recommendations || []).join(" | ") || "No specific suggestion."}</p>
      </div>

      <div>
        <p className="font-bold">Lifestyle Changes</p>
        <p className="text-xs break-words sm:text-sm">{(result.lifestyle_changes || []).join(" | ") || "No specific suggestion."}</p>
      </div>

      <div>
        <p className="font-bold">Recommended Tests</p>
        <p className="text-xs break-words sm:text-sm">{(result.recommended_tests || []).join(" | ") || "No additional tests suggested."}</p>
      </div>

      <div>
        <p className="font-bold">Precautions</p>
        <p className="text-xs break-words sm:text-sm">{(result.precautions || []).join(" | ") || "No specific precaution flags."}</p>
      </div>

      <div>
        <p className="font-bold">Doctor Type</p>
        <p className="text-xs break-words sm:text-sm">{result.doctor_specialist}</p>
      </div>

      <p className="rounded-xl bg-blue-50 p-3 text-xs dark:bg-slate-700">{result.disclaimer}</p>
    </section>
  );
}
