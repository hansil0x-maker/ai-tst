const fs = require('fs');

for (const file of ['src/components/LiveExamDashboard.tsx', 'src/components/StudentRoom.tsx']) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(
    "io(window.location.protocol + '//' + window.location.hostname + ':3000')",
    "io('/', { path: '/socket.io' })"
  );
  fs.writeFileSync(file, code);
  console.log('Patched', file);
}
