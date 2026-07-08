const fs = require('fs');
let code = fs.readFileSync('src/db/db.ts', 'utf8');

code = code.replace(
  "studentId: number;",
  "studentId: number | null;\n  studentName?: string;"
);

// We also might want to add a table for raw digital submissions, but we can just use Result.
// Let's add a "status" to result if it needs manual grading.
code = code.replace(
  "isCheatSuspected: boolean;",
  "isCheatSuspected: boolean;\n  needsGrading?: boolean;"
);

fs.writeFileSync('src/db/db.ts', code);
console.log("Patched db.ts");
