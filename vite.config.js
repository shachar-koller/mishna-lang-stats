import { defineConfig } from "vite";

// Relative base so the built site works from any path, including a
// GitHub Pages project URL like https://<user>.github.io/<repo>/.
export default defineConfig({
  base: "./",
});
