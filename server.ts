import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';

dotenv.config();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // ---- Login API (Cloud Verification) ----
  app.post('/api/login', (req, res) => {
    const { role, password } = req.body;
    // In a real app, you would check a database or env variables. 
    // Here we use simple environment logic or hardcoded mock passwords for demonstration.
    if (role === 'dashboard' && password === 'admin') {
      return res.json({ success: true, token: 'dashboard-token' });
    }
    if (role === 'grader' && password === 'grader') {
      return res.json({ success: true, token: 'grader-token' });
    }
    if (role === 'developer' && password === '0909opin') {
      return res.json({ success: true, token: 'dev-token' });
    }
    res.status(401).json({ success: false, error: 'كلمة المرور أو الدور غير صحيح' });
  });

  // ---- Socket WebSockets (Hub logic) ----
  io.on('connection', (socket) => {
    console.log('A client connected. ID: ', socket.id);

    socket.on('join_room', (roomId, role) => {
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room ${roomId} as ${role}`);
    });

    // Dashboard broadcasts an exam to graders
    socket.on('broadcast_exam', (data) => {
      socket.to(data.roomId).emit('new_exam_received', data.exam);
      console.log(`Broadcasted exam to room ${data.roomId}`);
    });

    // Grader sends results back to dashboard
    socket.on('send_results', (data) => {
      socket.to(data.roomId).emit('results_received', data.results);
      console.log(`Send results to room ${data.roomId}`);
    });

    // Generic state sync across devices
    socket.on('sync_data', (data) => {
      socket.to(data.roomId).emit('data_synced', data.payload);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected', socket.id);
    });
  });

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
        model: 'gemini-2.5-pro',
        contents: parts,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    text: { type: Type.STRING },
                    options: {
                      type: Type.OBJECT,
                      properties: {
                        A: { type: Type.STRING },
                        B: { type: Type.STRING },
                        C: { type: Type.STRING },
                        D: { type: Type.STRING }
                      },
                      required: ["A", "B", "C", "D"]
                    },
                    correctAnswer: { type: Type.STRING }
                  },
                  required: ["id", "text", "options", "correctAnswer"]
                }
              }
            },
            required: ["questions"]
          }
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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
