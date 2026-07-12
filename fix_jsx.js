const fs = require('fs');
let code = fs.readFileSync('src/components/LiveExamDashboard.tsx', 'utf-8');

// I will just use prettier or find the exact missing div
// But it's easier to just count { and <
