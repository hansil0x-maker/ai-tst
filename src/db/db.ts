import Dexie, { type EntityTable } from 'dexie';

export interface Setting {
  id: number;
  schoolName: string;
  teacherName: string;
  academicYear: string;
  devPasswordEntered: boolean;
  userPasswordHash: string | null;
}

export interface ClassEntity {
  id?: number;
  name: string;
  subject: string;
}

export interface Student {
  id?: number;
  serialNumber: string;
  name: string;
  classId: number;
}

export interface Exam {
  id?: number;
  title: string;
  date: string;
  classId: number;
  subject: string;
  totalMarks: number;
  passMark: number;
  questions: any; // JSON string or object
  correctAnswers: Record<number, string>; // e.g. {1: 'A', 2: 'B'}
  status: 'Pending' | 'Completed';
}

export interface Result {
  id?: number;
  examId: number;
  studentId: number;
  scannedAnswers: Record<number, string>;
  score: number;
  percentage: number;
  category: 'Pass' | 'Fail' | 'Perfect';
  isCheatSuspected: boolean;
}

const db = new Dexie('ExamAppDB') as Dexie & {
  settings: EntityTable<Setting, 'id'>;
  classes: EntityTable<ClassEntity, 'id'>;
  students: EntityTable<Student, 'id'>;
  exams: EntityTable<Exam, 'id'>;
  results: EntityTable<Result, 'id'>;
};

db.version(1).stores({
  settings: 'id', // Only one row, id=1
  classes: '++id, name, subject',
  students: '++id, serialNumber, name, classId',
  exams: '++id, title, date, classId, subject, status',
  results: '++id, examId, studentId, isCheatSuspected'
});

export { db };
