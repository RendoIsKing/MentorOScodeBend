export interface CategoryInterface {
  _id?: string;
  id?: string;
  moduleId: string;
  title: string;
  video: string;
  isActive: boolean;
  activatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date;
}
