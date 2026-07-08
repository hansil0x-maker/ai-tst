const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldConfigPromptBlock = `      let configPrompt = \`Target Total Questions: \${totalQuestions}\\n\`;
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

const newConfigPromptBlock = `      let configPrompt = \`Target Total Questions: \${totalQuestions}\\n\`;
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
Please automatically distribute the \${totalQuestions} questions among the 6 supported types based on what fits the content best: mcq, true_false, fill_blanks, short_answer, matching, image_labeling.\\n\`;
      }`;

code = code.replace(oldConfigPromptBlock, newConfigPromptBlock);

const typeEnumNew = `type: "mcq | tf | fill | short | match | diagram"`;
const typeEnum = `type: "mcq | true_false | fill_blanks | short_answer | matching | image_labeling"`;
code = code.replace(typeEnumNew, typeEnum);

fs.writeFileSync('server.ts', code);
console.log("Patched server.ts api/generate-exam again");
