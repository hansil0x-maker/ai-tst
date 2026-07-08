import { io, Socket } from 'socket.io-client';
import { db } from './db/db';
import toast from 'react-hot-toast';

class SyncManager {
  socket: Socket | null = null;
  role: string | null = null;
  roomId: string = 'global_school_room'; // Could be dynamic later

  connect(role: string) {
    this.role = role;
    if (this.socket) return;
    
    // Connect to same host, port is usually passed automatically but we can default
    this.socket = io({
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('Connected to sync server');
      this.socket?.emit('join_room', this.roomId, this.role);
    });

    this.socket.on('new_exam_received', async (exam) => {
      if (this.role === 'grader' || this.role === 'school') {
        const exists = await db.exams.get(exam.id);
        if (!exists) {
          await db.exams.add(exam);
          toast.success(`تم استلام امتحان جديد: ${exam.title}`);
        }
      }
    });

    this.socket.on('results_received', async (results) => {
      if (this.role === 'dashboard' || this.role === 'school') {
        for (const r of results) {
          const exists = await db.results.where({ studentId: r.studentId, examId: r.examId }).first();
          if (!exists) {
            await db.results.add(r);
          }
        }
        toast.success(`تم استلام ${results.length} نتائج جديدة`);
      }
    });
  }

  broadcastExam(exam: any) {
    if (this.socket && (this.role === 'dashboard' || this.role === 'school')) {
      this.socket.emit('broadcast_exam', { roomId: this.roomId, exam });
      toast.success('تم إرسال الامتحان للمصححين بنجاح');
    }
  }

  sendResults(results: any[]) {
    if (this.socket && (this.role === 'grader' || this.role === 'school')) {
      this.socket.emit('send_results', { roomId: this.roomId, results });
      toast.success('تم إرسال النتائج بنجاح');
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const syncManager = new SyncManager();
