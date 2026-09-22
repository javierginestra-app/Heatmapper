import { type Unsubscribe } from './common';

export type EntitlementStatus = 'active' | 'grace_period' | 'expired' | 'none' | 'unknown';

export interface Entitlement {
  readonly status: EntitlementStatus;
  readonly productId: string | null;
  readonly expiresAtMs: number | null;
  /** When the store last verified this; drives the offline grace policy. */
  readonly verifiedAtMs: number | null;
}

export type PurchaseOutcome =
  | { readonly status: 'purchased' | 'pending'; readonly entitlement: Entitlement }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly message: string };

/** Native store subscriptions only. Expired access keeps saved surveys and reports readable. */
export interface BillingService {
  getEntitlement(): Promise<Entitlement>;
  purchase(productId: string): Promise<PurchaseOutcome>;
  restore(): Promise<Entitlement>;
  subscribe(listener: (entitlement: Entitlement) => void): Unsubscribe;
}
