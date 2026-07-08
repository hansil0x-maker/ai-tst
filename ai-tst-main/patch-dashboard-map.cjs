const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

code = code.replace(
  "if (!sMap.has(r.studentId)) {",
  "const sid = r.studentId || r.studentName;\n      if (!sMap.has(sid)) {"
).replace(
  "const sData = sMap.get(r.studentId);",
  "const sData = sMap.get(sid);"
);

code = code.replace(
  "const studentObj = students.find(s => s.id === sId);",
  "const studentObj = typeof sId === 'number' ? students.find(s => s.id === sId) : { name: sId };"
);

fs.writeFileSync('src/components/Dashboard.tsx', code);
console.log("Patched Dashboard.tsx map");
