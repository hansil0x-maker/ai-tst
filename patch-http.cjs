const fs = require('fs');
let code = fs.readFileSync('src/components/LockScreen.tsx', 'utf8');

code = code.replace(
  '"http://worldtimeapi.org/api/timezone/Etc/UTC"',
  '"https://worldtimeapi.org/api/timezone/Etc/UTC"'
);

fs.writeFileSync('src/components/LockScreen.tsx', code);
console.log("Patched LockScreen.tsx HTTP to HTTPS");
