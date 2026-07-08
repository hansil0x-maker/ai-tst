const fs = require('fs');
let code = fs.readFileSync('src/components/StudentRoom.tsx', 'utf8');

const oldFaceLogic = `      if ('FaceDetector' in window) {
        // @ts-ignore
        const faceDetector = new FaceDetector();
        setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState !== 4) return;
          try {
            const faces = await faceDetector.detect(videoRef.current);
            if (faces.length === 0) {
              activeSocket?.emit('cheat_alert', { token: studentData.token, student, reason: 'لم يتم اكتشاف وجه (الطالب لا ينظر للشاشة)' });
            } else if (faces.length > 1) {
              activeSocket?.emit('cheat_alert', { token: studentData.token, student, reason: 'تم اكتشاف أكثر من وجه في الكاميرا' });
            }
          } catch (e) {
            // Ignore error
          }
        }, 3000);
      }`;

const newFaceLogic = `      if ('FaceDetector' in window) {
        // @ts-ignore
        const faceDetector = new FaceDetector();
        let lastFaceSeen = Date.now();
        setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState !== 4) return;
          try {
            const faces = await faceDetector.detect(videoRef.current);
            if (faces.length === 0) {
              if (Date.now() - lastFaceSeen > 3000) {
                 activeSocket?.emit('cheat_alert', { token: studentData.token, student: studentData, reason: 'لم يتم اكتشاف وجه (الطالب لا ينظر للشاشة لأكثر من 3 ثوانٍ)' });
                 lastFaceSeen = Date.now(); // reset to avoid spamming
              }
            } else {
              lastFaceSeen = Date.now();
              if (faces.length > 1) {
                activeSocket?.emit('cheat_alert', { token: studentData.token, student: studentData, reason: 'تم اكتشاف أكثر من وجه في الكاميرا' });
              }
            }
          } catch (e) {
            // Ignore error
          }
        }, 1000); // check more frequently, alert if absent for > 3s
      }`;

code = code.replace(oldFaceLogic, newFaceLogic);
fs.writeFileSync('src/components/StudentRoom.tsx', code);
console.log("Patched face tracking logic");
