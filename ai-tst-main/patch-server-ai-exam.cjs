const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldAPI = `    app.post('/api/generate-exam', async (req, res) => {
    try {
      const { prompt, content, files, totalPages, questionCounts, previousQuestions } = req.body;`;

const newAPI = `    app.post('/api/generate-exam', async (req, res) => {
    try {
      const { prompt, content, files, totalQuestions, autoDistribute, qTypes, previousQuestions } = req.body;`;

code = code.replace(oldAPI, newAPI);

const oldConfigPromptBlock = `      let configPrompt = '';
      if (totalPages) {
         configPrompt += \`
Target Length: Approximately \${totalPages} digital pages worth of content.
\`;
      }
      if (questionCounts) {
         configPrompt += \`
Please strictly adhere to generating the following amounts of question types:
\`;
         Object.entries(questionCounts).forEach(([type, count]) => {
            if ((count as number) > 0) configPrompt += \`- \${count} \${type} questions.\\n\`;
         });
      }`;

const newConfigPromptBlock = `      let configPrompt = \`Target Total Questions: \${totalQuestions}\\n\`;
      if (!autoDistribute && qTypes) {
         configPrompt += \`
Please STRICTLY adhere to generating the following amounts of question types. The total must sum to \${totalQuestions}. Do not generate any other types:
- \${qTypes.mcq} Multiple Choice questions (mcq)
- \${qTypes.tf} True/False questions (tf)
- \${qTypes.fill} Fill in the Blanks questions (fill)
- \${qTypes.short} Short Answer questions (short)
- \${qTypes.match} Matching questions (match)
- \${qTypes.diagram} Label Diagram questions (diagram)\\n\`;
      } else {
         configPrompt += \`
Please automatically distribute the \${totalQuestions} questions among the 6 supported types based on what fits the content best: Multiple choice, True/False, Fill in blanks, Short answer, Matching, Label diagram.\\n\`;
      }`;

code = code.replace(oldConfigPromptBlock, newConfigPromptBlock);

const typeEnum = `type: "mcq | true_false | fill_blanks | short_answer | matching | image_labeling"`;
const typeEnumNew = `type: "mcq | tf | fill | short | match | diagram"`;
code = code.replace(typeEnum, typeEnumNew);

fs.writeFileSync('server.ts', code);
console.log("Patched server.ts api/generate-exam");
