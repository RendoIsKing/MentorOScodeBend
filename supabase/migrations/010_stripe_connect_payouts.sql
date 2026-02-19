-- 010: Stripe Connect payouts

-- Configurable platform fee per mentor (default 20%)
alter table users add column if not exists platform_fee_percent integer not null default 20;

-- Payouts table: tracks every transfer to a mentor
create table if not exists payouts (
  id                  uuid primary key default uuid_generate_v4(),
  mentor_id           uuid not null references users(id) on delete cascade,
  amount              numeric not null,
  currency            text not null default 'nok',
  platform_fee        numeric not null,
  stripe_transfer_id  text,
  subscription_id     uuid references subscriptions(id),
  invoice_id          text,
  status              text not null default 'completed',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_payouts_mentor on payouts(mentor_id, created_at desc);
create index idx_payouts_stripe_transfer on payouts(stripe_transfer_id);

create trigger trg_payouts_updated_at before update on payouts for each row execute function update_updated_at_column();
