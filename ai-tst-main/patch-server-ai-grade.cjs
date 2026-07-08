const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const newEndpoint = `
app.post('/api/grade-digital-submissions', async (req, res) => {
  try {
    const { exam, submissions } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
    }
    
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = \`
You are an expert teacher grading a digital exam. 
Exam details: \${JSON.stringify(exam)}

Here are the students' submissions:
\${JSON.stringify(submissions)}

Grade each submission according to the correct answers in the exam.
If the question is multiple choice (mcq) or true_false, use exact matching.
If the question is short_answer, fill_blanks, or others, use your AI capability to determine if the student's answer is correct, partially correct, or wrong.
Assign a score out of the total marks for the exam (Total: \${exam.totalMarks}).

Respond ONLY in valid JSON format:
{
  "gradedSubmissions": [
    {
      "studentName": "string",
      "score": number,
      "percentage": number,
      "category": "Pass" | "Fail" | "Perfect",
      "aiFeedback": "Brief comment on the student's performance"
    }
  ]
}
\`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
      }
    });

    const aiRes = JSON.parse(response.text || '{}');
    res.json(aiRes);
  } catch (error: any) {
    console.error("AI Digital Grading Error:", error);
    res.status(500).json({ error: "فشل في التصحيح الذكي" });
  }
});
`;

code = code.replace("app.post('/api/generate-recommendation", newEndpoint + "\napp.post('/api/generate-recommendation");
fs.writeFileSync('server.ts', code);
console.log("Patched server.ts with /api/grade-digital-submissions");
