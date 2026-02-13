export interface FeatureInterface {
  _id?: string;
  id?: string;
  feature: string;
  slug: string;
  description: string;
  isAvailable: boolean;
  stripeFeatureId: string;
  stripeFeatureObject: object;
  isDeleted: boolean;
  deletedAt: Date;
}
