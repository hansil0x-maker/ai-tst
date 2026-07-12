import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import OpenAI from 'openai';
import http from 'http';
import { Server } from 'socket.io';
// OMR scanning removed — digital exams only

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.get('/api/sessions', (req, res) => {
    const sessions = Array.from(activeSessions.entries()).map(([token, session]: any) => ({
      token,
      examTitle: session.examTitle || 'امتحان مباشر',
      className: session.className || 'جلسة غير معروفة'
    }));
    res.json(sessions);
  });

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
  const submissionQueues = new Map();
  const publishedResults = new Map();

  app.get('/api/results/:token', (req, res) => {
    const resultData = publishedResults.get(req.params.token);
    if (resultData) {
      res.json({ success: true, resultData });
    } else {
      res.status(404).json({ success: false, error: 'النتيجة غير موجودة' });
    }
  }); // token -> []

  io.on('connection', (socket) => {
    console.log('A client connected. ID: ', socket.id);

    // Teacher creates a new exam session
    socket.on('create_session', (data, callback) => {
      const { examTitle, className } = data || {};
      const token = Math.floor(100000 + Math.random() * 900000).toString();
      activeSessions.set(token, { teacherId: socket.id, otps: {}, students: [], examTitle, className });
      socket.join(token);
      console.log(`Teacher created session ${token} for ${className} - ${examTitle}`);
      if (callback) callback({ success: true, token });
    });

    // Student asks to register for a session
    socket.on('student_register_request', (data) => {
      const { name, sessionToken } = data;
      const session = activeSessions.get(sessionToken);
      if (session) {
        socket.to(session.teacherId).emit('student_register_request', { name, socketId: socket.id, sessionToken });
      }
    });
    
    // Teacher approves student register
    socket.on('approve_student_register', (data) => {
      const { studentSocketId, otp, name } = data;
      io.to(studentSocketId).emit('student_register_approved', { otp, name });
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
        if (session.otps && session.otps[otp]) {
          foundSessionToken = token;
          foundStudent = session.otps[otp];
          break;
        }
      }

      if (foundSessionToken && foundStudent) {
        if (callback) callback({ success: true, token: foundSessionToken, student: foundStudent });
      } else {
        if (callback) callback({ success: false, error: 'كود الدخول غير صحيح' });
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
      // Store globally for LockScreen access
      if (Array.isArray(resultsList)) {
        resultsList.forEach(r => {
          publishedResults.set(r.accessToken, r.resultData);
        });
      }
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
      const { prompt, content, files, totalQuestions, autoDistribute, qTypes, enabledTypes, previousQuestions, subject, grade, topic, difficulty, learningObjective, sourceType, sourceLink } = req.body;
      const apiKey = process.env.GROQ_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: 'GROQ_API_KEY is missing' });
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
      configPrompt += `Subject: ${subject || 'Not specified'}\n`;
      configPrompt += `Grade Level: ${grade || 'Not specified'}\n`;
      configPrompt += `Topic/Unit: ${topic || 'Not specified'}\n`;
      configPrompt += `Difficulty: ${difficulty || 'Medium'}\n`;
      configPrompt += `Target Learning Objective (Cognitive Level): ${learningObjective || 'Not specified'}\n`;
      if (sourceLink) {
        configPrompt += `Source Link: ${sourceLink}\n`;
      }
      
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

      const ai = new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey });
      
            const fullPrompt = `You are an expert teacher. Generate a comprehensive exam based on the provided content or files. This exam will be delivered digitally via a local Wi-Fi PWA. Make sure to adhere to the requested subject, grade, topic, and difficulty.
${configPrompt}
${avoidPrompt}
Text Content / Chat History:
${content || 'None'}
Notes from teacher: ${prompt || 'None'}
CRITICAL INSTRUCTIONS FOR LLAMA 3.3 (FORMATTING & TEMPLATES):
1. You MUST generate the exact types of questions requested above. Do NOT just generate "mcq".
2. You MUST include an "explanation" (التبرير العلمي) for why the correct answer is correct, and a "skill" indicating the cognitive learning objective (e.g. فهم واستيعاب).
3. Please return ONLY a valid JSON object matching this structure:
{
   "questions": [
    {
      "id": 1,
      "type": "mcq",
      "text": "The multiple choice question text?",
      "options": { "A": "First option", "B": "Second option", "C": "Third option", "D": "Fourth option" },
      "correctAnswer": "A",
      "explanation": "Because A is the only option that satisfies the condition.",
      "skill": "فهم واستيعاب"
    },
    {
      "id": 2,
      "type": "true_false",
      "text": "The true or false statement.",
      "correctAnswer": "true",
      "explanation": "Because the statement correctly identifies the fact.",
      "skill": "تذكر وحفظ"
    },
    {
      "id": 3,
      "type": "fill_blanks",
      "text": "The capital of France is ______.",
      "correctAnswer": "Paris",
      "explanation": "Paris is the capital of France.",
      "skill": "تذكر وحفظ"
    },
    {
      "id": 4,
      "type": "short_answer",
      "text": "Explain the water cycle briefly.",
      "correctAnswer": "Evaporation, condensation, and precipitation.",
      "explanation": "These are the main three stages of the water cycle.",
      "skill": "تطبيق وتحليل"
    },
    {
      "id": 5,
      "type": "matching",
      "text": "Match the following terms with their definitions:",
      "matchingPairs": [
        { "left": "Apple", "right": "A fruit" },
        { "left": "Carrot", "right": "A vegetable" }
      ],
      "explanation": "Apples are fruits, carrots are vegetables.",
      "skill": "فهم واستيعاب"
    },
    {
      "id": 6,
      "type": "image_labeling",
      "text": "Label the parts of the plant diagram.",
      "imageDescription": "A diagram of a plant with roots, stem, leaves, and a flower.",
      "correctAnswer": "1: Roots, 2: Stem, 3: Leaves, 4: Flower",
      "explanation": "These are the correct names for the labeled parts.",
      "skill": "فهم واستيعاب"
    }
  ],
   "aiComment": "A brief Arabic comment to the teacher regarding the generated exam's quality or coverage."
}
Make sure it is perfect JSON.`;

      const messages: any[] = [{ role: 'user', content: fullPrompt }];
      if (files && files.length > 0) {
        // Groq text models do not support image arrays in content.
        // We will notify the user or just ignore the image part of the prompt.
        console.warn("Images were uploaded but Groq Llama-3.3-70b-versatile does not support vision. Ignoring images.");
      }

      const response = await ai.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        response_format: { type: 'json_object' }
      });

      const rawText = response.choices[0]?.message?.content?.trim() || '';
      if (!rawText) throw new Error("No text returned from AI");
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
    const { answersToGrade } = req.body;
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY is missing' });
    }
    
    const ai = new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey });
    
    const prompt = `
You are an expert educational AI performing Semantic Scoring.
You will be given a list of student answers to evaluate.
For each answer, you have the expected correct answer and the scientific explanation (التبرير العلمي).

Evaluate the student's answer against the expected answer and explanation.
Calculate a "confidenceScore" from 0 to 100 based on how well the student's answer captures the core concept.
- If it's a perfect match or captures the full concept, score 85-100.
- If it captures part of the concept or is ambiguous, score 40-84.
- If it's completely wrong or irrelevant, score 0-39.

Also provide a brief "explanation" (in Arabic) of why you gave this score.

Input Data:
${JSON.stringify(answersToGrade, null, 2)}

Respond ONLY in valid JSON format matching exactly this structure:
{
  "evaluations": [
    {
      "evaluationId": "string (the exact evalId from input)",
      "confidenceScore": 90,
      "explanation": "string (your Arabic explanation of the evaluation)",
      "grade": "correct"
    }
  ]
}
Note: "grade" must be "correct" if >85, "review" if 40-85, "incorrect" if <40.
`;

    const response = await ai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });

    const rawText = response.choices[0]?.message?.content?.trim();
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
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY is missing' });
    }
    
    const ai = new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey });
    
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

    const response = await ai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });

    const rawText = response.choices[0]?.message?.content?.trim();
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
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'GROQ_API_KEY is missing' });
      }

      const ai = new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey });
      const response = await ai.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a helpful AI assistant analyzing student performance.' },
          { role: 'user', content: prompt }
        ]
      });
      
      const rawText = response.choices[0]?.message?.content?.trim();
      res.json({ text: rawText });
    } catch (error: any) {
       console.error("AI Recommendation Error:", error);
       res.status(500).json({ error: error.message || 'Error generating recommendation' });
    }
  });

  app.post('/api/suggestions', async (req, res) => {
    try {
      const { subject, grade, topic, difficulty } = req.body;
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'GROQ_API_KEY is missing' });
      }

      const ai = new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey });
      const prompt = `You are an expert educational AI. 
Provide 4 specific, short, creative, and highly relevant suggestions (in Arabic) for a teacher to use as "Additional Notes" when generating an exam.
Context:
Subject: ${subject || 'General'}
Grade: ${grade || 'Not specified'}
Topic: ${topic || 'Not specified'}
Difficulty: ${difficulty || 'Medium'}

The suggestions should tell the AI how to structure the questions or what to focus on (e.g. "Focus on real-world applications of [topic]", "Include tricky questions for gifted students", "Make the language very simple for [grade]").

Return ONLY a JSON object with this format:
{
  "suggestions": ["sug1", "sug2", "sug3", "sug4"]
}`;

      const response = await ai.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      });
      
      const rawText = response.choices[0]?.message?.content?.trim();
      res.json(JSON.parse(rawText || '{"suggestions": []}'));
    } catch (error: any) {
       console.error("AI Suggestions Error:", error);
       res.status(500).json({ error: error.message || 'Error generating suggestions' });
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
