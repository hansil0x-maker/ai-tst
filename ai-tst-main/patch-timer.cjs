const fs = require('fs');
let code = fs.readFileSync('src/components/StudentRoom.tsx', 'utf8');

const oldTimer = `        setTimeLeft(prev => {
          if (prev === Math.floor((exam?.duration || 60) * 60 / 2)) {
            toast('انقضى نصف الوقت. حافظ على تركيزك.', { icon: '⏳' });
          }
          if (prev === 10 * 60) {
            toast('متبقي 10 دقائق فقط. راجع إجاباتك.', { icon: '⏰' });
          }
          if (prev <= 1) {
            clearInterval(timer);
            forceSubmit(socket);
            return 0;
          }
          return prev - 1;
        });`;

const newTimer = `        setTimeLeft(prev => {
          const halfTime = Math.floor((exam?.duration || 60) * 60 / 2);
          if (prev === halfTime) {
            toast('انقضى نصف الوقت', { icon: '⏳' });
          }
          if (prev === Math.floor(halfTime * 0.75)) {
            toast('خذ نفساً عميقاً وحافظ على تركيزك (Take a deep breath and focus)', { icon: '🌿' });
          }
          if (prev === 10 * 60 && (exam?.duration || 60) > 10) {
            toast('10 دقائق متبقية (10 minutes remaining)', { icon: '⏰' });
          }
          if (prev <= 1) {
            clearInterval(timer);
            forceSubmit(socket);
            return 0;
          }
          return prev - 1;
        });`;

code = code.replace(oldTimer, newTimer);
fs.writeFileSync('src/components/StudentRoom.tsx', code);
console.log("Patched timer logic");
