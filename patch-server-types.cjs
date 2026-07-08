const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "Object.entries(questionCounts).forEach(([type, count]) => {",
  "Object.entries(questionCounts).forEach(([type, count]) => {"
).replace(
  "if (count > 0) configPrompt +=",
  "if ((count as number) > 0) configPrompt +="
);

code = code.replace(
  "const parts = [{ text: fullPrompt }];",
  "const parts: any[] = [{ text: fullPrompt }];"
);

fs.writeFileSync('server.ts', code);
console.log("Patched server.ts types");
