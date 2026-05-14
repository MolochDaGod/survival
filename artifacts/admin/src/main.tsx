import { createRoot } from "react-dom/client";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { getAdminToken } from "./lib/auth";
import App from "./App";
import "./index.css";

// OpenAPI spec already declares `/api` as the server base, so the generated
// client URLs start with `/api/...` already. Leave the base empty here so we
// don't end up with `/api/api/...` and 404s.
setBaseUrl("");
setAuthTokenGetter(() => getAdminToken());

createRoot(document.getElementById("root")!).render(<App />);
