import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el contenedor principal de la aplicación.");

createRoot(root).render(<App />);
