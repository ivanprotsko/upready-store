import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { homepageConfigPlugin } from "./plugins/homepage-config";
import { legalPagesPlugin } from "./plugins/legal-pages";

export default defineConfig({
  plugins: [react(), homepageConfigPlugin(), legalPagesPlugin()],
});
