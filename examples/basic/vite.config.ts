import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const providerBaseURL = env.OPENAI_BASE_URL || env.VITE_OPENAI_BASE_URL || "https://api.openai.com/v1";
  const providerURL = new URL(providerBaseURL);
  const providerOrigin = providerURL.origin;
  const apiKey = env.OPENAI_API_KEY || env.NVIDIA_API_KEY || env.VITE_OPENAI_API_KEY;

  return {
    plugins: [react()],
    define: {
      __AGENTUI_PROXY_BASE_URL__: JSON.stringify(providerBaseURL)
    },
    server: {
      port: 5173,
      proxy: {
        "/api/openai": {
          target: providerOrigin,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/openai/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              if (apiKey) {
                proxyReq.setHeader("Authorization", `Bearer ${apiKey}`);
              }
            });
          }
        }
      }
    }
  };
});
