const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

code = code.replace(
  "const st = students.find(s => s.id === r.studentId);",
  "const st = r.studentId ? students.find(s => s.id === r.studentId) : null;\n      const studentDisplayName = st?.name || r.studentName || 'غير معروف';"
).replace(
  "const cl = classes.find(c => c.id === st?.classId);",
  "const cl = classes.find(c => c.id === st?.classId);"
).replace(
  "'الطالب': st?.name || 'غير معروف',",
  "'الطالب': studentDisplayName,"
);

code = code.replace(
  "const st = students.find(s => s.id === r.studentId);",
  "const st = r.studentId ? students.find(s => s.id === r.studentId) : null;\n                 const studentDisplayName = st?.name || r.studentName || 'غير معروف';"
).replace(
  "<p className=\"font-semibold text-white\">{st?.name || 'طالب غير معروف'}</p>",
  "<p className=\"font-semibold text-white\">{studentDisplayName}</p>"
);

fs.writeFileSync('src/components/Dashboard.tsx', code);
console.log("Patched Dashboard.tsx");
