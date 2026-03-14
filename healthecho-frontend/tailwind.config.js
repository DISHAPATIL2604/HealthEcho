export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        medicalBlue: "#1E88E5",
        medicalAccent: "#1565C0",
        medicalBg: "#F4F8FB",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(30, 136, 229, 0.12)",
      },
      fontFamily: {
        sans: ["Nunito", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
