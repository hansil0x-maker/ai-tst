const fs = require('fs');
let code = fs.readFileSync('src/components/MainLayout.tsx', 'utf8');

code = code.replace("import ScannerTab from './ScannerTab';\n", "");

code = code.replace(
  "case 'scan': return <ScannerTab />;",
  ""
);

code = code.replace(
  "default: return role === 'grader' ? <ScannerTab /> : <Dashboard />;",
  "default: return <Dashboard />;"
);

code = code.replace(
  "{ id: 'scan', icon: <ScanLine size={24} />, label: 'المسح والتصحيح' },",
  ""
);

code = code.replace(
  "{ id: 'scan', icon: <ScanLine size={24} />, label: 'المسح' },",
  ""
);

fs.writeFileSync('src/components/MainLayout.tsx', code);
console.log("Patched MainLayout.tsx");
