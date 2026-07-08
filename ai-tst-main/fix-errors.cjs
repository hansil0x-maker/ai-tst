const fs = require('fs');

// 1. Fix server.ts
let serverCode = fs.readFileSync('server.ts', 'utf8');
serverCode = serverCode.replace("import { processOMRImage, expectedAnswers } from './omr.ts';\n", "");

// Let's remove the whole /api/grade-omr endpoint from server.ts
const gradeOMRStart = "app.post('/api/grade-omr'";
const gradeOMREndStr = "res.status(500).json({ error: 'Failed to process OMR' });\n  }\n});";
const startIndex = serverCode.indexOf(gradeOMRStart);
if (startIndex !== -1) {
  const endIndex = serverCode.indexOf(gradeOMREndStr, startIndex) + gradeOMREndStr.length;
  serverCode = serverCode.substring(0, startIndex) + serverCode.substring(endIndex);
}

// 2. Fix the server.ts variables. It seems my previous replace didn't work. Let's just do a regex replace for the whole generate-exam body up to the configPrompt.
const apiGenerateRegex = /app\.post\('\/api\/generate-exam'[\s\S]*?(?=const ai = new GoogleGenAI)/;

const newAPIGenerate = `app.post('/api/generate-exam', async (req, res) => {
    try {
      const { prompt, content, files, totalQuestions, autoDistribute, qTypes, previousQuestions } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
      }

      let configPrompt = \`Target Total Questions: \${totalQuestions || 10}\\n\`;
      if (!autoDistribute && qTypes) {
         configPrompt += \`
Please STRICTLY adhere to generating the following amounts of question types. The total must sum to \${totalQuestions}. Do not generate any other types:
- \${qTypes.mcq} Multiple Choice questions (type: mcq)
- \${qTypes.tf} True/False questions (type: true_false)
- \${qTypes.fill} Fill in the Blanks questions (type: fill_blanks)
- \${qTypes.short} Short Answer questions (type: short_answer)
- \${qTypes.match} Matching questions (type: matching)
- \${qTypes.diagram} Label Diagram questions (type: image_labeling)\\n\`;
      } else {
         configPrompt += \`
Please automatically distribute the \${totalQuestions || 10} questions among the 6 supported types based on what fits the content best: mcq, true_false, fill_blanks, short_answer, matching, image_labeling.\\n\`;
      }

      let avoidPrompt = '';
      if (previousQuestions && previousQuestions.length > 0) {
         avoidPrompt = \`
=== STRICT UNIQUENESS CONSTRAINT ===
DO NOT generate any questions that are similar to the following questions previously generated:
\` + JSON.stringify(previousQuestions, null, 2);
      }

      `;

serverCode = serverCode.replace(apiGenerateRegex, newAPIGenerate);

// Wait, the new type string was already updated in server.ts but let's make sure.
// Because the regex replaced the old prompt building, let's verify.
fs.writeFileSync('server.ts', serverCode);
console.log("Fixed server.ts");

// 3. Fix CreateExamFlow.tsx
let createCode = fs.readFileSync('src/components/CreateExamFlow.tsx', 'utf8');
createCode = createCode.replace("printMode,\n        printQuestionsPerStudent,\n        duplexQuestionPages,", "");
createCode = createCode.replace(/printMode,[\s]*printQuestionsPerStudent,[\s]*duplexQuestionPages,/g, "");

fs.writeFileSync('src/components/CreateExamFlow.tsx', createCode);
console.log("Fixed CreateExamFlow.tsx");
