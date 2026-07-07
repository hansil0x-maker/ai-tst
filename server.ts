import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import { gradeExamWithOMR } from './omr.ts';

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
    // --- Local Wi-Fi Exam Network State ---
  const activeSessions = new Map(); // token -> { teacherId, students: [] }
  const submissionQueues = new Map(); // token -> []

  io.on('connection', (socket) => {
    console.log('A client connected. ID: ', socket.id);

    // Teacher creates a new exam session
    socket.on('create_session', (data, callback) => {
      const token = Math.floor(100000 + Math.random() * 900000).toString();
      activeSessions.set(token, { teacherId: socket.id, students: [] });
      socket.join(token);
      console.log(`Teacher created session ${token}`);
      if (callback) callback({ success: true, token });
    });

    // Student joins a session using the one-time token
    socket.on('join_session', (data, callback) => {
      const { token, student } = data;
      const session = activeSessions.get(token);
      
      if (!session) {
        if (callback) callback({ success: false, error: 'رمز الجلسة غير صحيح أو الجلسة منتهية' });
        return;
      }
      
      const studentData = { id: socket.id, ...student, connectedAt: Date.now() };
      session.students.push(studentData);
      socket.join(token);
      
      // Notify teacher
      socket.to(session.teacherId).emit('student_joined', studentData);
      console.log(`Student joined session ${token}`);
      if (callback) callback({ success: true });
    });

    // Teacher sends exam to connected students
    socket.on('send_exam', (data) => {
      const { token, examPayload } = data;
      // Emit only to students (everyone in the room except the sender)
      socket.to(token).emit('receive_exam', examPayload);
      console.log(`Exam sent to session ${token}`);
    });

    // Student submits exam
    
    socket.on('request_early_submit', (data) => {
      const { token, student } = data;
      const session = activeSessions.get(token);
      if (session) {
        socket.to(session.teacherId).emit('student_early_submit_request', { student, socketId: socket.id });
      }
    });

    socket.on('approve_early_submit', (data) => {
      const { studentSocketId } = data;
      io.to(studentSocketId).emit('early_submit_approved');
    });

    socket.on('cheat_alert', (data) => {
      const { token, student, reason } = data;
      const session = activeSessions.get(token);
      if (session) {
        socket.to(session.teacherId).emit('student_cheat_alert', { student, reason });
      }
    });
socket.on('submit_exam', (data) => {
      const { token, payload } = data;
      const session = activeSessions.get(token);
      if (session) {
        // Implement backend submission queue to prevent frame drops
        if (!submissionQueues.has(token)) {
          submissionQueues.set(token, []);
          
          // Start the staggered queue processor for this session
          const processQueue = () => {
            const queue = submissionQueues.get(token);
            if (queue && queue.length > 0) {
              const nextSubmission = queue.shift();
              io.to(session.teacherId).emit('student_submission', nextSubmission);
              
              if (queue.length > 0) {
                setTimeout(processQueue, 300); // 300ms staggered delay
              } else {
                submissionQueues.delete(token); // Queue empty
              }
            } else {
              submissionQueues.delete(token);
            }
          };
          
          submissionQueues.get(token).push(payload);
          setTimeout(processQueue, 300);
        } else {
          submissionQueues.get(token).push(payload);
        }
        console.log(`Exam submitted in session ${token}`);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected', socket.id);
      // Clean up sessions if teacher disconnects
      for (const [token, session] of activeSessions.entries()) {
        if (session.teacherId === socket.id) {
          socket.to(token).emit('session_closed');
          activeSessions.delete(token);
          submissionQueues.delete(token);
          console.log(`Session ${token} closed due to teacher disconnect`);
        } else {
          // Notify teacher if student disconnects
          const studentIdx = session.students.findIndex(s => s.id === socket.id);
          if (studentIdx !== -1) {
             const student = session.students[studentIdx];
             session.students.splice(studentIdx, 1);
             io.to(session.teacherId).emit('student_left', { id: socket.id });
          }
        }
      }
    });
  });

  app.post('/api/grade-exam', async (req, res) => {
    try {
      const { image, numQuestions } = req.body;
      const json = await gradeExamWithOMR(image, numQuestions);
      res.json(json);
    } catch (error: any) {
      console.error("AI Grading Error:", error);
      res.status(500).json({ error: "فشل في تصحيح الورقة عبر OpenCV: " + (error.message || JSON.stringify(error)) });
    }
  });

    app.post('/api/generate-exam', async (req, res) => {
    try {
      const { prompt, content, files, totalPages, questionCounts, previousQuestions } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
      }

      let configPrompt = '';
      if (totalPages) {
         configPrompt += `
Target Length: Approximately ${totalPages} digital pages worth of content.
`;
      }
      if (questionCounts) {
         configPrompt += `
Please strictly adhere to generating the following amounts of question types:
`;
         Object.entries(questionCounts).forEach(([type, count]) => {
            if (count > 0) configPrompt += `- ${count} ${type} questions.
`;
         });
      }

      let avoidPrompt = '';
      if (previousQuestions && previousQuestions.length > 0) {
         avoidPrompt = `
=== STRICT UNIQUENESS CONSTRAINT ===
DO NOT generate any questions that are similar to the following questions previously generated:
` + JSON.stringify(previousQuestions, null, 2);
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const fullPrompt = `You are an expert teacher. Generate a comprehensive exam based on the provided content or files. 
This exam will be delivered digitally via a local Wi-Fi PWA.
${configPrompt}
${avoidPrompt}

Text Content:
${content || 'None'}

Notes from teacher: ${prompt || 'None'}

Please return ONLY a valid JSON object matching this structure:
{ 
  "questions": [
    {
      "id": 1,
      "type": "mcq | true_false | fill_blanks | short_answer | matching | image_labeling",
      "text": "The question text",
      "options": { "A": "...", "B": "..." }, // only for mcq
      "correctAnswer": "The exact correct answer or key",
      "matchingPairs": [ { "left": "...", "right": "..." } ], // only for matching
      "imageDescription": "Description of image to label if applicable" // only for image_labeling
    }
  ], 
  "aiComment": "A brief Arabic comment to the teacher regarding the generated exam's quality or coverage." 
}
Make sure it is perfect JSON.`;

      const parts = [{ text: fullPrompt }];
      if (files && files.length > 0) {
        files.forEach((f) => {
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
                    type: { type: Type.STRING },
                    text: { type: Type.STRING },
                    options: {
                      type: Type.OBJECT,
                      properties: {
                        A: { type: Type.STRING },
                        B: { type: Type.STRING },
                        C: { type: Type.STRING },
                        D: { type: Type.STRING }
                      }
                    },
                    correctAnswer: { type: Type.STRING },
                    matchingPairs: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          left: { type: Type.STRING },
                          right: { type: Type.STRING }
                        }
                      }
                    },
                    imageDescription: { type: Type.STRING }
                  },
                  required: ["id", "type", "text", "correctAnswer"]
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
          throw new Error("تنسيق JSON غير صالح من الذكاء الاصطناعي. الرجاء المحاولة مرة أخرى.");
        }
      }
      
      res.json(json);
    } catch (error) {
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
