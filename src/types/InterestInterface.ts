export interface InterestInterface {
  _id?: string;
  id?: string;
  title: string;
  slug: string;
  addedBy: string;
  isAvailable: boolean;
  isDeleted: boolean;
  deletedAt: Date;
}
