const fs = require('fs');
let code = fs.readFileSync('src/components/StudentRoom.tsx', 'utf-8');
code = code.replace(
  'return prev - 1;\n          }, 1000);',
  'return prev - 1;\n        });\n      }, 1000);'
);
fs.writeFileSync('src/components/StudentRoom.tsx', code);
