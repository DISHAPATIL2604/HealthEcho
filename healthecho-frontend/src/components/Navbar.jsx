import { Link, NavLink } from "react-router-dom";

export default function Navbar({ darkMode, onToggleDarkMode }) {
  const linkStyle = ({ isActive }) =>
    `whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold sm:text-sm ${
      isActive ? "bg-medicalBlue text-white" : "text-slate-700 hover:bg-blue-100 dark:text-slate-200 dark:hover:bg-slate-700"
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-blue-100 bg-white/85 backdrop-blur dark:border-slate-700 dark:bg-slate-900/85">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-2 px-3 py-3 sm:flex sm:justify-between sm:px-4">
        <Link to="/" className="text-base font-extrabold text-medicalAccent sm:text-xl">HealthEcho</Link>
        <button
          onClick={onToggleDarkMode}
          className="justify-self-end rounded-xl bg-medicalAccent px-3 py-2 text-xs font-bold text-white"
        >
          {darkMode ? "Light" : "Dark"}
        </button>
        <nav className="col-span-2 -mx-1 flex items-center gap-1 overflow-x-auto pb-1 sm:mx-0 sm:col-span-1 sm:overflow-visible sm:pb-0">
          <NavLink to="/" className={linkStyle}>Home</NavLink>
          <NavLink to="/dashboard" className={linkStyle}>Dashboard</NavLink>
          <NavLink to="/chat" className={linkStyle}>Chat</NavLink>
          <NavLink to="/about" className={linkStyle}>About</NavLink>
        </nav>
      </div>
    </header>
  );
}
