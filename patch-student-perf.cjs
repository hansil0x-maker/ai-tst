const fs = require('fs');
let code = fs.readFileSync('src/components/StudentRoom.tsx', 'utf8');

// Fix first timer
code = code.replace(
  "if (status === 'active' && timeLeft > 0) {",
  "if (status === 'active') {"
).replace(
  "}, [status, timeLeft, exam, socket]);",
  "}, [status, exam, socket]);"
);

// Fix second timer
code = code.replace(
  "if (status === 'submitted' && handoverCountdown > 0) {",
  "if (status === 'submitted') {"
).replace(
  "}, [status, handoverCountdown, onExit]);",
  "}, [status, onExit]);"
);

fs.writeFileSync('src/components/StudentRoom.tsx', code);
console.log("Patched StudentRoom performance");
