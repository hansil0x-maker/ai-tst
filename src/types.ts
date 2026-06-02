export interface Question {
  id: number;
  text: string;
  options: Record<string, string>;
  correctAnswer: string;
}

export interface GeneratedExamData {
  questions: Question[];
}
