import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const shared = fileURLToPath(new URL("../../shared", import.meta.url));
const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@shared": shared } },
  server: { fs: { allow: [".", shared] } },
  // The app and Orbi Lab ship together; rig.html is a redirect to the Lab.
  build: { rollupOptions: { input: { app: page("index.html"), lab: page("lab.html"), rig: page("rig.html") } } },
});
