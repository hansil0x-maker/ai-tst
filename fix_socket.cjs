const fs = require('fs');
let code = fs.readFileSync('src/components/StudentRoom.tsx', 'utf-8');

// The block to replace is from `useEffect(() => {\n    const newSocket = io('/', { path: '/socket.io' });` to `return () => {\n      document.removeEventListener('visibilitychange', handleVisibilityChange);\n      newSocket.disconnect();\n      stopCamera();\n    };\n  }, [studentData, onExit]);`
// I'll just regex it or find index.

const startStr = "  useEffect(() => {\n    const newSocket = io('/', { path: '/socket.io' });";
const endStr = "    return () => {\n      document.removeEventListener('visibilitychange', handleVisibilityChange);\n      newSocket.disconnect();\n      stopCamera();\n    };\n  }, [studentData, onExit]);";

const startIdx = code.indexOf(startStr);
const endIdx = code.indexOf(endStr) + endStr.length;

const newBlock = `  useEffect(() => {
    const newSocket = io('/', { path: '/socket.io' });
    
    newSocket.on('connect', () => {
      newSocket.emit('validate_otp', { otp: studentData.otp }, (res: any) => {
        if (!res.success) {
          toast.error(res.error || 'الكود غير صحيح');
          onExitRef.current();
        } else {
          setFullStudentData(res.student);
          setSessionToken(res.token);
          newSocket.emit('join_session', { token: res.token, student: res.student }, (joinRes: any) => {
             if (!joinRes.success) {
                toast.error('فشل الانضمام للغرفة');
                onExitRef.current();
             } else {
                toast.success('تم قبول الكود بنجاح');
                setStatus('waiting');
             }
          });
        }
      });
    });

    newSocket.on('receive_exam', (examPayload) => {
      setExam(examPayload);
      setStatus('active');
      setShowInstructions(true);
      setTimeLeft(examPayload.duration ? examPayload.duration * 60 : 60 * 60);
      toast('تم بدء الامتحان، نتمنى لك التوفيق!', { icon: '🚀', duration: 4000 });
      startCameraProctoring(newSocket, fullStudentDataRef.current);
    });

    newSocket.on('teacher_message', (data) => {
      toast(data.message, { icon: '💬', duration: 6000, style: { background: '#3b82f6', color: '#fff' } });
    });

    newSocket.on('results_published', (data) => {
      const { resultsList } = data;
      const existing = JSON.parse(localStorage.getItem('nexus_published_results') || '{}');
      resultsList.forEach((r: any) => {
         existing[r.accessToken] = r.resultData;
         if (r.resultData.studentName === fullStudentDataRef.current?.name) {
            setResultView(r.resultData);
         }
      });
      localStorage.setItem('nexus_published_results', JSON.stringify(existing));
    });

    newSocket.on('session_closed', () => {
      if (statusRef.current === 'active') {
        toast.error('أغلق المعلم الجلسة. سيتم تسليم إجاباتك.');
        forceSubmit(newSocket);
      }
      setWipeoutCountdown(10);
    });

    newSocket.on('disconnect', () => {
      setStatus('disconnected');
    });

    newSocket.on('early_submit_approved', () => {
      setEarlySubmitApproved(true);
      toast.success('وافق المعلم على التسليم المبكر. يرجى تأكيد التسليم.');
    });

    setSocket(newSocket);

    const handleVisibilityChange = () => {
      if (document.hidden && statusRef.current === 'active') {
         toast.error('تحذير: لا تخرج من شاشة الامتحان!');
         newSocket.emit('cheat_alert', { token: sessionTokenRef.current, student: fullStudentDataRef.current, reason: 'الطالب خرج من شاشة الامتحان (تبديل تطبيقات أو متصفح)' });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      newSocket.disconnect();
      stopCamera();
    };
  }, [studentData, onExit]);`;

code = code.substring(0, startIdx) + newBlock + code.substring(endIdx);
fs.writeFileSync('src/components/StudentRoom.tsx', code);

