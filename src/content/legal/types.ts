export type LegalSection = {
  id: string;
  heading: string;
  paragraphs?: string[];
  items?: string[];
};

export type LegalDoc = {
  title: string;
  description: string;
  sections: LegalSection[];
};
