const fs = require('fs');
let code = fs.readFileSync('src/components/LiveExamDashboard.tsx', 'utf8');

code = code.replace(
  "const canStart = students.length === availableDevices;",
  "const canStart = students.length > 0;"
);

fs.writeFileSync('src/components/LiveExamDashboard.tsx', code);
console.log("Patched LiveExamDashboard canStart");
