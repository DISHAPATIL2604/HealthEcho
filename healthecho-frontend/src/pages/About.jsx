export default function About() {
  return (
    <section className="rounded-3xl bg-white p-8 shadow-soft dark:bg-slate-800">
      <h1 className="text-2xl font-extrabold text-medicalAccent">About HealthEcho</h1>
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
        HealthEcho is a Retrieval-Augmented Generation system that combines extracted lab values and local medical PDFs to provide structured health risk recommendations.
      </p>
      <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm dark:bg-slate-700">
        This system provides AI-based health risk insights and is not a substitute for professional medical advice.
      </div>
    </section>
  );
}
