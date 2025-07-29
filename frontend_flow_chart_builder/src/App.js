import React, { useEffect, useState } from "react";
import "./App.css";
import FlowchartBuilder from "./FlowchartBuilder";

// PUBLIC_INTERFACE
function App() {
  // Theming (only light for now, but user can toggle if needed)
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const toggleTheme = () =>
    setTheme(prevTheme => (prevTheme === "light" ? "dark" : "light"));

  return (
    <div className="App">
      <button
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        style={{ position: "absolute", right: 25, top: 25, zIndex: 99 }}
      >
        {theme === "light" ? "🌙 Dark" : "☀️ Light"}
      </button>
      <FlowchartBuilder />
    </div>
  );
}

export default App;
