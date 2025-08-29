import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",            // ★ 关键修改：让构建后的 index.html 使用相对路径
  plugins: [react()],
});
