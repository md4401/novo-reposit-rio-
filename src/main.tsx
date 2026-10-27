import "@fontsource-variable/inter";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initNative, watchSiteUpdates } from "./lib/native";
import { initNotificationTaps } from "./lib/notifications";
import { initPwa } from "./lib/pwa";
import { AppProvider } from "./state";

initPwa();
initNative();
initNotificationTaps();
watchSiteUpdates();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
