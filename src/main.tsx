import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import "@/styles.css";
import { launchRoute } from "@/lib/launch";
import { getLastProject } from "@/lib/storage";

// Ao abrir o app, volta para o último projeto consultado neste aparelho.
const start = launchRoute(window.location.hash, getLastProject());
if (start) window.location.replace(`#${start}`);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* sem SW o app continua funcionando, só não abre offline */
    });
  });
}
