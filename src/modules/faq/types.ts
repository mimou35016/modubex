/** Plain, serializable question shape passed from module routes to forms. */
export type FaqQuestionView = {
  id: string;
  question: string;
  answer: string;
  published: boolean;
  position: number;
};
