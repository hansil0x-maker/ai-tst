const fs = require('fs');
let code = fs.readFileSync('src/components/LiveExamDashboard.tsx', 'utf-8');

code = code.replace('<div className="flex flex-col gap-4">\n                       <div className="flex flex-col gap-4"><div className="flex gap-4">', '<div className="flex flex-col gap-4">\n                       <div className="flex gap-4">');

fs.writeFileSync('src/components/LiveExamDashboard.tsx', code);
