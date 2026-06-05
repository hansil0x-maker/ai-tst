import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.post('/api/generate-exam', async (req, res) => {
    try {
      const { prompt, content, files } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const fullPrompt = `You are an expert teacher. Generate a Multiple Choice Questions (MCQ) exam based on the provided content or files.\n\nText Content:\n${content || 'None'}\n\nNotes from teacher: ${prompt || 'None'}\n\nPlease return ONLY a valid JSON object matching this structure:\n{ "questions": [ { "id": 1, "text": "Question text?", "options": {"A": "Opt1", "B": "Opt2", "C": "Opt3", "D": "Opt4"}, "correctAnswer": "A" } ] }\nMake sure it is perfect JSON.`;

      const parts: any[] = [{ text: fullPrompt }];

      if (files && files.length > 0) {
        files.forEach((f: any) => {
           parts.push({
             inlineData: {
               data: f.data,
               mimeType: f.mimeType
             }
           });
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: parts,
        config: {
          responseMimeType: "application/json",
        }
      });

      if (!response.text) throw new Error("No text returned from Gemini");
      
      let rawText = response.text.trim();
      if (rawText.startsWith('```')) {
         rawText = rawText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      let json;
      try {
        json = JSON.parse(rawText);
      } catch (parseErr) {
        console.error("Failed to parse Gemini output:", parseErr, "\\nRAW OUTPUT:", rawText);
        throw new Error("تنسيق JSON غير صالح من الذكاء الاصطناعي. الرجاء المحاولة مرة أخرى.");
      }
      
      res.json(json);
    } catch (error: any) {
      console.error("AI Generation Error:", error);
      res.status(500).json({ error: error.message || 'Error generating exam' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
