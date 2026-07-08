const fs = require('fs');
let code = fs.readFileSync('src/components/LockScreen.tsx', 'utf8');

const oldInit = `    const init = async () => {
      // Time validation
      let currentTime = Date.now();
      try {
        const res = await fetch(
          "https://worldtimeapi.org/api/timezone/Etc/UTC",
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = await res.json();
          currentTime = new Date(data.datetime).getTime();
        }
      } catch (e) {
        // Fallback to local time
      }`;

const newInit = `    const init = async () => {
      // Time validation
      let currentTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(
          "https://worldtimeapi.org/api/timezone/Etc/UTC",
          { cache: "no-store", signal: controller.signal }
        );
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          currentTime = new Date(data.datetime).getTime();
        }
      } catch (e) {
        // Fallback to local time
      }`;

code = code.replace(oldInit, newInit);
fs.writeFileSync('src/components/LockScreen.tsx', code);
console.log("Patched LockScreen timeout");
