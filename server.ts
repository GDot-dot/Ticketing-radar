import express from "express";
import cors from "cors";
import NodeCache from "node-cache";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  const cache = new NodeCache({ stdTTL: 600 }); // cache 10 min

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/search", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "伺服器尚未設定 GEMINI_API_KEY，請在 Render 後台設定。" });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      // Check cache first
      const cachedData = cache.get(query);
      if (cachedData) {
        return res.json(cachedData);
      }

      const prompt = `
        搜尋「${query}」在台灣的演唱會或展演。

        優先搜尋：
        - KKTIX
        - 拓元 tixCraft
        - ibon售票
        - FamiTicket
        - 寬宏售票

        請提供以下資訊，並以 JSON 格式回傳，包含一個陣列：
        - eventName: 活動名稱
        - date: 活動日期或期間 (若無確切日期請填寫 "近期" 或 "未定")
        - platform: 售票平台名稱 (例如 KKTIX, 拓元)
        - url: 該活動的直接購票連結或相關資訊頁面連結
        - status: 售票狀態 (例如：熱賣中、已售完、即將開賣、準備中)

        如果找不到任何相關的展演活動，請回傳空陣列 []。
        請確保連結 (url) 是真實有效的。

        重要：請「只」回傳 JSON 陣列，不要包含任何 Markdown 標記 (如 \`\`\`json)、不要包含任何引文標記 (如 [1])、不要有任何其他說明文字。
      `;

      let response;
      let retries = 3;
      let delay = 2000;

      for (let i = 0; i < retries; i++) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }]
            }
          });
          break;
        } catch (err: any) {
          const isRateLimit = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('quota');
          if (isRateLimit && i < retries - 1) {
            console.warn(`Rate limited (429). Retrying in ${delay / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
          } else {
            throw err;
          }
        }
      }

      const text = response?.text;
      if (!text) {
        throw new Error('No response from Gemini');
      }

      let jsonStr = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      jsonStr = jsonStr.replace(/\[\d+\]/g, '');

      let data;
      try {
        const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
        data = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error("JSON Parse Error. Raw text:", text);
        throw new Error("無法解析 AI 回傳的資料格式");
      }

      // Save to cache
      cache.set(query, data);
      res.json(data);

    } catch (error: any) {
      console.error("Server API Error:", error);
      res.status(error?.status || 500).json({ 
        error: error?.message || "Internal Server Error",
        isRateLimit: error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota')
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Catch-all route for SPA, but ONLY for non-API requests
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
