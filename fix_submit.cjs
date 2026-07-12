const fs = require('fs');
let code = fs.readFileSync('src/components/StudentRoom.tsx', 'utf-8');
code = code.replace(
  '        submittedAt: Date.now()\n      }\n    });\n      }',
  '        submittedAt: Date.now()\n      }\n    });'
);
fs.writeFileSync('src/components/StudentRoom.tsx', code);
