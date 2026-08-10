import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Browser tests mock every API call, so they intentionally exercise only the
// client build. Production and local Worker development use vite.config.ts.
export default defineConfig({
  plugins: [react()],
});
