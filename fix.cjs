const fs = require('fs');
let code = fs.readFileSync('src/components/LiveExamDashboard.tsx', 'utf-8');

const target = `{gradedResults.length === 0 ? (`;
const idx = code.indexOf(target);
if (idx > -1) {
  // Let's just output the whole file from that point
  console.log(code.substring(idx));
}
