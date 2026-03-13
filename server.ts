import express from "express";
import cors from "cors";
import NodeCache from "node-cache";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  const cache = new NodeCache({ stdTTL: 600 }); // cache 10 min

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || ''
  });

  app.post("/api/search", async (req, res) => {
    try {
      const { query } = req.body;

      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      const cacheKey = `search-${query}`;
      const cached = cache.get(cacheKey);

      if (cached) {
        console.log(`Cache hit for: ${query}`);
        return res.json(cached);
      }

      console.log(`Cache miss for: ${query}, calling Gemini...`);
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
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                eventName: { type: Type.STRING },
                date: { type: Type.STRING },
                platform: { type: Type.STRING },
                url: { type: Type.STRING },
                status: { type: Type.STRING }
              },
              required: ["eventName", "date", "platform", "url", "status"]
            }
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('No response from Gemini');
      }

      const data = JSON.parse(text);
      cache.set(cacheKey, data);
      res.json(data);

    } catch (err: any) {
      console.error("Search failed:", err);
      if (err?.message?.includes('429') || err?.message?.includes('quota') || err?.status === 429) {
        res.status(429).json({ error: "API 呼叫次數已達上限 (429 Too Many Requests)。\nGoogle Gemini API 的免費額度可能已用盡，請稍後再試，或檢查您的 Google Cloud 專案配額設定。" });
      } else {
        res.status(500).json({ error: "搜尋過程中發生錯誤，請稍後再試。" });
      }
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
