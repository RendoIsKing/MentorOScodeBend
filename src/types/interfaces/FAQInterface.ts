interface Content {
  title: string;
  subContent: string[];
}

interface Topic {
  title: string;
  content: Content[];
}

export interface FAQInterface {
  _id?: string;
  id?: string;
  topics: Topic[];
  isDeleted: boolean;
  deletedAt: Date | null;
}
