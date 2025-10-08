export interface QuestionEntry {
  folder: string;
  question: string;
}

export interface DirentLike {
  name: string;
  isDirectory(): boolean;
}
