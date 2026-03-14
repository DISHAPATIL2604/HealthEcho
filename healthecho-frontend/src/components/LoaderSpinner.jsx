export default function LoaderSpinner({ label = "Processing..." }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/80 p-4 shadow-soft dark:bg-slate-800/80">
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-medicalBlue border-t-transparent" />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}
