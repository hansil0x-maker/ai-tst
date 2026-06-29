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
    if (role === 'school' && password === '0000') {
      return res.json({ success: true, token: 'school-token' });
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

  app.post('/api/grade-exam', async (req, res) => {
    try {
      const { image, numQuestions } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
      }

      const ai = new GoogleGenAI({ apiKey });
            const fullPrompt = `You are an expert Optical Mark Recognition (OMR) system and exam grader. 
I am providing you with an image of a student's multiple-choice exam answer sheet.

There are exactly ${numQuestions} questions.

Your task is to analyze the image and:
1. Extract the student's Serial Number (الرقم التسلسلي) printed on the paper.
2. Determine the student's selected answer for EACH question.

CRITICAL OMR RULES:
1. The student marks their answer by shading, coloring, marking an X, or ticking inside one of the 4 circles next to each question.
2. If a circle is heavily shaded or covered with dark ink, it IS the selected answer. Even if you cannot read the letter inside the circle because of the ink, determine its letter based on its position: 
   - 1st circle from left = A
   - 2nd circle from left = B
   - 3rd circle from left = C
   - 4th circle from left = D
3. If exactly ONE circle is marked or shaded, return that option (A, B, C, or D).
4. If MORE THAN ONE circle is marked or shaded for the same question, return "INVALID".
5. If NO circle is marked, return "EMPTY".
6. If the mark is ambiguous, return "INVALID".

Return ONLY a valid JSON object matching this structure exactly:
{
  "serialNumber": "student_serial_number_here",
  "answers": {
    "1": "A",
    "2": "INVALID",
    "3": "EMPTY"
  }
}
Where "serialNumber" is the string extracted from the paper, keys inside "answers" are sequential question numbers starting from 1 up to ${numQuestions}, and values are the detected answer ('A', 'B', 'C', 'D', 'INVALID', or 'EMPTY').`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { text: fullPrompt },
          { inlineData: { data: image, mimeType: 'image/jpeg' } }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              serialNumber: { type: Type.STRING },
              answers: {
                type: Type.OBJECT,
                additionalProperties: { type: Type.STRING }
              }
            },
            required: ["serialNumber", "answers"]
          }
        }
      });

      let rawText = response.text.trim();
      let json;
      try {
        json = JSON.parse(rawText);
      } catch (e1) {
        try {
          const match = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
          if (match) {
            json = JSON.parse(match[0]);
          } else {
            throw new Error("No JSON structure found");
          }
        } catch (e2) {
          throw new Error("استجابة غير متوقعة من الخادم: " + rawText.substring(0, 50));
        }
      }
      
      res.json(json);
    } catch (error: any) {
      console.error("AI Grading Error:", error);
      res.status(500).json({ error: "فشل في تصحيح الورقة عبر الذكاء الاصطناعي: " + (error.message || JSON.stringify(error)) });
    }
  });

  app.post('/api/generate-exam', async (req, res) => {
    try {
      const { prompt, content, files, pagesConfig, referenceExams } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
      }

      let configPrompt = '';
      if (pagesConfig === '1_page_1_face') configPrompt = 'Limit the exam to max 20 questions.';
      if (pagesConfig === '1_page_2_faces') configPrompt = 'Generate around 40 questions if possible.';
      if (pagesConfig === '2_pages_1_face') configPrompt = 'Generate around 40 well-distributed questions.';
      if (pagesConfig === '2_pages_2_faces') configPrompt = 'Generate around 80 comprehensive questions.';

      let referencePrompt = '';
      if (referenceExams && referenceExams.length > 0) {
         referencePrompt = `\n\n=== EXAMPLES OF HIGH QUALITY PAST EXAMS (Rated 5 Stars by the user) ===\nUse these as a style and quality reference:\n${JSON.stringify(referenceExams, null, 2)}`;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const fullPrompt = `You are an expert teacher. Generate a Multiple Choice Questions (MCQ) exam based on the provided content or files. This exam will be automatically printed on paper for students.
${configPrompt}${referencePrompt}

Text Content:
${content || 'None'}

Notes from teacher: ${prompt || 'None'}

Please return ONLY a valid JSON object matching this structure:
{ "questions": [...], "aiComment": "A brief Arabic comment to the teacher regarding the generated exam's quality or coverage." }
Make sure it is perfect JSON.`;

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
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              aiComment: { type: Type.STRING },
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
            required: ["questions", "aiComment"]
          }
        }
      });

      if (!response.text) throw new Error("No text returned from Gemini");
      
      let rawText = response.text.trim();
      let json;
      try {
        json = JSON.parse(rawText);
      } catch (e1) {
        try {
          const match = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
          if (match) {
            json = JSON.parse(match[0]);
          } else {
            throw new Error("No JSON structure found");
          }
        } catch (e2) {
          console.error("Failed to parse Gemini output:", e2, "\nRAW OUTPUT:", rawText);
          throw new Error("تنسيق JSON غير صالح من الذكاء الاصطناعي. الرجاء المحاولة مرة أخرى.");
        }
      }
      
      res.json(json);
    } catch (error: any) {
      console.error("AI Generation Error:", error);
      res.status(500).json({ error: error.message || 'Error generating exam' });
    }
  });

  app.post('/api/generate-recommendation', async (req, res) => {
    try {
      const { prompt } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: 'You are a helpful AI assistant analyzing student performance.',
        }
      });
      
      res.json({ text: response.text });
    } catch (error: any) {
       console.error("AI Recommendation Error:", error);
       res.status(500).json({ error: error.message || 'Error generating recommendation' });
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
