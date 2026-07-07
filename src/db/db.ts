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
  academicYear?: string;
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
  rating?: number;
  ratingComment?: string;
  academicYear?: string;
  excludedStudents?: number[];
  printMode?: 'economic' | 'duplex' | 'booklet';
  printQuestionsPerStudent?: boolean;
  duplexQuestionPages?: number;
}

export interface Result {
  id?: number;
  examId: number;
  studentId: number | null;
  studentName?: string;
  scannedAnswers: Record<number, string>;
  score: number;
  percentage: number;
  category: 'Pass' | 'Fail' | 'Perfect';
  isCheatSuspected: boolean;
  needsGrading?: boolean;
}

export interface Analysis {
  id?: number;
  targetType: 'student' | 'class' | 'school';
  targetId: number; // 0 for school
  date: string;
  text: string;
}

const db = new Dexie('ExamAppDB') as Dexie & {
  settings: EntityTable<Setting, 'id'>;
  classes: EntityTable<ClassEntity, 'id'>;
  students: EntityTable<Student, 'id'>;
  exams: EntityTable<Exam, 'id'>;
  results: EntityTable<Result, 'id'>;
  analyses: EntityTable<Analysis, 'id'>;
};

db.version(1).stores({
  settings: 'id', // Only one row, id=1
  classes: '++id, name, subject',
  students: '++id, serialNumber, name, classId',
  exams: '++id, title, date, classId, subject, status',
  results: '++id, examId, studentId, isCheatSuspected'
});

db.version(2).stores({
  classes: '++id, name, subject, academicYear',
  exams: '++id, title, date, classId, subject, status, academicYear'
}).upgrade(tx => {
  return tx.table('settings').get(1).then(settings => {
    const year = settings ? settings.academicYear : '2026-2027';
    return tx.table('classes').toCollection().modify(c => { c.academicYear = c.academicYear || year; })
      .then(() => tx.table('exams').toCollection().modify(e => { e.academicYear = e.academicYear || year; }));
  });
});

db.version(3).stores({
  analyses: '++id, targetType, targetId, date'
});

db.version(4).stores({
  exams: '++id, title, date, classId, subject, status, academicYear' // no new indexed fields needed, but Dexie handles schema additions
});

export { db };
