export interface Question {
  id: number;
  type?: string;
  text: string;
  options?: Record<string, string>;
  correctAnswer: string;
  matchingPairs?: { left: string; right: string }[];
  imageDescription?: string;
}

export interface GeneratedExamData {
  questions: Question[];
  aiComment?: string;
}
