export interface CardDetailsInterface {
  _id?: string;
  id?: string;
  userId: string;
  stripeCardId: string;
  object: string;
  address_city: string | null;
  address_country: string;
  brand: string;
  country: string;
  cvc_check: string | null;
  dynamic_last4: string | null;
  exp_month: number;
  exp_year: number;
  fingerprint: string;
  funding: string;
  last4: string;
  isDefault: boolean;
  paymentMethodId: string;
  tokenization_method: string | null;
  wallet: string | null;
  isActive: boolean;
  activatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date;
}
