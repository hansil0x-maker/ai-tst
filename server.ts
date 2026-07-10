import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import http from 'http';
import { Server } from 'socket.io';
// OMR scanning removed — digital exams only

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
      activeSessions.set(token, { teacherId: socket.id, otps: {}, students: [] });
      socket.join(token);
      console.log(`Teacher created session ${token}`);
      if (callback) callback({ success: true, token });
    });

    // Teacher registers OTPs for the session
    socket.on('register_session_otps', (data) => {
      const { token, otpsMap } = data; // otpsMap: { [otp]: { studentId, studentName, ... } }
      const session = activeSessions.get(token);
      if (session && session.teacherId === socket.id) {
        session.otps = otpsMap;
        console.log(`Teacher registered ${Object.keys(otpsMap).length} OTPs for session ${token}`);
      }
    });

    // Student validates OTP (No session token needed, just the OTP)
    socket.on('validate_otp', (data, callback) => {
      const { otp } = data;
      let foundSessionToken = null;
      let foundStudent = null;

      for (const [token, session] of activeSessions.entries()) {
        if (session.otps && session.otps[otp] && !session.otps[otp].used) {
          foundSessionToken = token;
          foundStudent = session.otps[otp];
          // Burn the OTP
          session.otps[otp].used = true;
          break;
        }
      }

      if (foundSessionToken && foundStudent) {
        if (callback) callback({ success: true, token: foundSessionToken, student: foundStudent });
      } else {
        if (callback) callback({ success: false, error: 'كود الدخول غير صحيح أو تم استخدامه' });
      }
    });

    // Student joins a session (called after validate_otp)
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

    socket.on('teacher_message', (data) => {
      const { token, message, targetSocketId } = data;
      if (targetSocketId) {
        io.to(targetSocketId).emit('teacher_message', { message });
      } else {
        socket.to(token).emit('teacher_message', { message });
      }
    });

    socket.on('deliver_results', (data) => {
      const { token, resultsList } = data;
      // resultsList should be an array of { accessToken, resultData }
      socket.to(token).emit('results_published', { resultsList });
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

  // OMR paper scanning disabled — digital exams only
  app.post('/api/grade-exam', (_req, res) => {
    res.status(410).json({ error: 'تم إيقاف المسح الضوئي. النظام يعمل بالامتحانات الرقمية فقط.' });
  });

    app.post('/api/generate-exam', async (req, res) => {
    try {
      const { prompt, content, files, totalQuestions, autoDistribute, qTypes, enabledTypes, previousQuestions } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
      }

      const typeLabels: Record<string, string> = {
        mcq: 'Multiple Choice (type: mcq)',
        tf: 'True/False (type: true_false)',
        fill: 'Fill in the Blanks (type: fill_blanks)',
        short: 'Short Answer / Essay (type: short_answer)',
        match: 'Matching / Table - correct word (type: matching)',
        diagram: 'Label Diagram or Image Parts (type: image_labeling)',
      };

      let configPrompt = `Target Total Questions: ${totalQuestions || 10}\n`;
      if (!autoDistribute && qTypes) {
        const lines = Object.entries(qTypes)
          .filter(([, count]) => (count as number) > 0)
          .map(([k, count]) => `- ${count} ${typeLabels[k] || k}`)
          .join('\n');
        configPrompt += `\nPlease STRICTLY adhere to generating the following amounts of question types. Do not generate any other types:\n${lines}\n`;
      } else {
        // autoDistribute: only among enabled types
        const enabledKeys = enabledTypes
          ? Object.entries(enabledTypes).filter(([, v]) => v).map(([k]) => typeLabels[k] || k)
          : Object.values(typeLabels);
        configPrompt += `\nPlease automatically distribute the ${totalQuestions || 10} questions ONLY among these enabled types (do NOT use any other types):\n${enabledKeys.map(t => `- ${t}`).join('\n')}\n`;
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

      const parts: any[] = [{ text: fullPrompt }];
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
        model: 'gemini-2.0-flash',
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
      
      const rawText = (typeof response.text === 'function' ? response.text() : response.text)?.trim() || '';
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


app.post('/api/grade-digital-submissions', async (req, res) => {
  try {
    const { exam, submissions } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
    }
    
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
You are an expert teacher grading a digital exam. 
Exam details: ${JSON.stringify(exam)}

Here are the students' submissions:
${JSON.stringify(submissions)}

Grade each submission according to the correct answers in the exam.
If the question is multiple choice (mcq) or true_false, use exact matching.
If the question is short_answer, fill_blanks, or others, use your AI capability to determine if the student's answer is correct, partially correct, or wrong.
Assign a score out of the total marks for the exam (Total: ${exam.totalMarks}).

Respond ONLY in valid JSON format:
{
  "gradedSubmissions": [
    {
      "studentName": "string",
      "score": number,
      "percentage": number,
      "category": "ناجح" | "راسب" | "مكمل",
      "aiFeedback": "Brief Arabic comment on the student's performance"
    }
  ]
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
      }
    });

    const rawText = (typeof response.text === 'function' ? response.text() : response.text)?.trim();
    const aiRes = JSON.parse(rawText || '{}');
    res.json(aiRes);
  } catch (error: any) {
    console.error("AI Digital Grading Error:", error);
    res.status(500).json({ error: "فشل في التصحيح الذكي" });
  }
});

app.post('/api/generate-exam-report', async (req, res) => {
  try {
    const { exam, results } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
    }
    
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
You are an expert educational analyst.
Analyze the following exam and the students' results.
Exam Title: ${exam.title}
Results: ${JSON.stringify(results)}

Identify:
1. The top 5 performing students.
2. The 5 students who need the most support (weakest).
3. The specific topic or question type that the majority struggled with.
4. A brief overall report and recommendations for the teacher in Arabic.

Respond ONLY in valid JSON format:
{
  "top5": ["student name 1", "student name 2", ...],
  "bottom5": ["student name 1", "student name 2", ...],
  "weakestTopic": "description of the weak topic",
  "reportText": "Overall Arabic report and recommendations"
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
      }
    });

    const rawText = (typeof response.text === 'function' ? response.text() : response.text)?.trim();
    const aiRes = JSON.parse(rawText || '{}');
    res.json(aiRes);
  } catch (error: any) {
    console.error("AI Exam Report Error:", error);
    res.status(500).json({ error: "فشل في إنشاء التقرير الذكي" });
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
        model: 'gemini-2.0-flash',
        contents: [{ text: prompt }],
        config: {
          systemInstruction: 'You are a helpful AI assistant analyzing student performance.',
        }
      });
      
      const rawText = (typeof response.text === 'function' ? response.text() : response.text)?.trim();
      res.json({ text: rawText });
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
