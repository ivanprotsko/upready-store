import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { homepageConfigPlugin } from "./plugins/homepage-config";

export default defineConfig({
  plugins: [react(), homepageConfigPlugin()],
});
