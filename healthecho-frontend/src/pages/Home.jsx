import { Link } from "react-router-dom";

export default function Home() {
  return (
    <section className="grid gap-6 md:grid-cols-2">
      <div className="rounded-3xl bg-white p-5 shadow-soft dark:bg-slate-800 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-medicalBlue">AI Risk Assessment</p>
        <h1 className="mt-3 text-2xl font-extrabold text-medicalAccent sm:text-3xl">HealthEcho Personalized Medical Recommendation System</h1>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          Upload blood reports, retrieve evidence from your medical document library, and get structured risk insights with follow-up chat support.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-block rounded-xl bg-medicalBlue px-4 py-3 text-sm font-bold text-white"
        >
          Start Analysis
        </Link>
      </div>
      <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-cyan-500 p-5 text-white shadow-soft sm:p-8">
        <h2 className="text-xl font-extrabold sm:text-2xl">What You Get</h2>
        <ul className="mt-4 space-y-2 text-sm">
          <li>- PDF/image/manual input support</li>
          <li>- RAG-powered contextual recommendations</li>
          <li>- Risk meter, confidence, and summary export</li>
          <li>- Report history and trend visualization</li>
          <li>- Follow-up assistant chat</li>
        </ul>
      </div>
    </section>
  );
}
