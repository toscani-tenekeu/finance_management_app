import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { hashPassword, normalizeUsername } from './security.mjs'

const schemaVersion = 1

const schema = `
  create table if not exists finance_users (
    id text primary key,
    username text not null unique collate nocase,
    display_name text,
    role text not null default 'user' check (role in ('admin', 'user')),
    password_salt text not null,
    password_hash text not null,
    created_at text not null,
    updated_at text not null,
    last_login_at text
  ) strict;

  create table if not exists finance_sessions (
    token_hash text primary key,
    user_id text not null references finance_users(id) on delete cascade,
    expires_at integer not null,
    created_at integer not null,
    last_seen_at integer not null,
    ip_address text,
    user_agent text
  ) strict;

  create table if not exists finance_profiles (
    user_id text primary key references finance_users(id) on delete cascade,
    currency text not null default 'XAF' check (currency = 'XAF'),
    monthly_savings_min integer not null default 15000 check (monthly_savings_min >= 15000),
    emergency_reserve_months real not null default 3 check (emergency_reserve_months between 0 and 60),
    created_at text not null,
    updated_at text not null
  ) strict;

  create table if not exists finance_accounts (
    id text primary key,
    user_id text not null references finance_users(id) on delete cascade,
    name text not null check (length(name) between 1 and 100),
    account_type text not null check (account_type in ('cash', 'bank', 'mobile_money', 'savings', 'investment', 'other')),
    is_savings integer not null default 0 check (is_savings in (0, 1)),
    opening_balance integer not null default 0 check (opening_balance >= 0),
    is_active integer not null default 1 check (is_active in (0, 1)),
    notes text check (notes is null or length(notes) <= 1000),
    created_at text not null,
    updated_at text not null,
    unique (id, user_id)
  ) strict;

  create table if not exists finance_transactions (
    id text primary key,
    user_id text not null references finance_users(id) on delete cascade,
    account_id text not null,
    destination_account_id text,
    transaction_type text not null check (transaction_type in ('income', 'expense', 'transfer', 'savings_deposit', 'savings_withdrawal')),
    amount integer not null check (amount > 0),
    category text not null default 'Autre' check (length(category) between 1 and 80),
    counterparty text check (counterparty is null or length(counterparty) <= 120),
    description text check (description is null or length(description) <= 1000),
    occurred_at text not null,
    is_unplanned integer not null default 0 check (is_unplanned in (0, 1)),
    created_at text not null,
    updated_at text not null,
    foreign key (account_id, user_id) references finance_accounts(id, user_id) on delete restrict,
    foreign key (destination_account_id, user_id) references finance_accounts(id, user_id) on delete restrict,
    check (
      (transaction_type in ('income', 'expense') and destination_account_id is null)
      or
      (transaction_type in ('transfer', 'savings_deposit', 'savings_withdrawal') and destination_account_id is not null and destination_account_id <> account_id)
    ),
    check (transaction_type <> 'savings_withdrawal' or length(trim(coalesce(description, ''))) >= 10)
  ) strict;

  create table if not exists finance_fixed_expenses (
    id text primary key,
    user_id text not null references finance_users(id) on delete cascade,
    account_id text references finance_accounts(id) on delete set null,
    name text not null check (length(name) between 1 and 120),
    category text not null default 'Abonnement' check (length(category) between 1 and 80),
    amount integer not null check (amount > 0),
    frequency text not null default 'monthly' check (frequency in ('monthly', 'quarterly', 'yearly')),
    next_due_date text not null,
    is_active integer not null default 1 check (is_active in (0, 1)),
    notes text check (notes is null or length(notes) <= 1000),
    created_at text not null,
    updated_at text not null
  ) strict;

  create table if not exists finance_income_sources (
    id text primary key,
    user_id text not null references finance_users(id) on delete cascade,
    account_id text references finance_accounts(id) on delete set null,
    name text not null check (length(name) between 1 and 120),
    amount integer not null check (amount > 0),
    frequency text not null default 'monthly' check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'one_time')),
    next_expected_date text,
    probability integer not null default 100 check (probability between 0 and 100),
    is_active integer not null default 1 check (is_active in (0, 1)),
    notes text check (notes is null or length(notes) <= 1000),
    created_at text not null,
    updated_at text not null
  ) strict;

  create table if not exists finance_savings_exceptions (
    id text primary key,
    user_id text not null references finance_users(id) on delete cascade,
    exception_year integer not null check (exception_year between 2000 and 2100),
    exception_month integer not null check (exception_month between 1 and 12),
    reason text not null check (length(trim(reason)) between 10 and 1000),
    declared_at text not null,
    unique (user_id, exception_year, exception_month)
  ) strict;

  create table if not exists finance_unplanned_events (
    id text primary key,
    user_id text not null references finance_users(id) on delete cascade,
    transaction_id text references finance_transactions(id) on delete set null,
    name text not null check (length(name) between 1 and 120),
    estimated_amount integer not null check (estimated_amount > 0),
    probability integer not null default 50 check (probability between 0 and 100),
    expected_on text,
    status text not null default 'anticipated' check (status in ('anticipated', 'occurred', 'dismissed')),
    notes text check (notes is null or length(notes) <= 1000),
    created_at text not null,
    updated_at text not null
  ) strict;

  create table if not exists finance_savings_goals (
    id text primary key,
    user_id text not null references finance_users(id) on delete cascade,
    name text not null check (length(name) between 1 and 120),
    target_amount integer not null check (target_amount > 0),
    target_date text not null,
    priority integer not null default 2 check (priority between 1 and 3),
    status text not null default 'active' check (status in ('active', 'completed', 'paused')),
    notes text check (notes is null or length(notes) <= 1000),
    created_at text not null,
    updated_at text not null
  ) strict;

  create index if not exists finance_sessions_expiry_idx on finance_sessions(expires_at);
  create index if not exists finance_accounts_owner_idx on finance_accounts(user_id, is_active);
  create index if not exists finance_transactions_owner_date_idx on finance_transactions(user_id, occurred_at desc);
  create index if not exists finance_transactions_source_idx on finance_transactions(account_id, occurred_at desc);
  create index if not exists finance_transactions_destination_idx on finance_transactions(destination_account_id, occurred_at desc);
  create index if not exists finance_fixed_expenses_due_idx on finance_fixed_expenses(user_id, is_active, next_due_date);
  create index if not exists finance_income_sources_due_idx on finance_income_sources(user_id, is_active, next_expected_date);
  create index if not exists finance_unplanned_events_due_idx on finance_unplanned_events(user_id, status, expected_on);
  create index if not exists finance_savings_goals_due_idx on finance_savings_goals(user_id, status, target_date);
`

export function nowIso() {
  return new Date().toISOString()
}

export function openDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 })
  const db = new Database(databasePath)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('trusted_schema = OFF')

  const currentVersion = db.pragma('user_version', { simple: true })
  if (currentVersion > schemaVersion) {
    db.close()
    throw new Error(`Database schema ${currentVersion} is newer than supported schema ${schemaVersion}`)
  }
  if (currentVersion < 1) {
    db.transaction(() => {
      db.exec(schema)
      db.pragma(`user_version = ${schemaVersion}`)
    })()
  }
  return db
}

export function createUser(db, { username, password, displayName = null, role = 'user', id = randomUUID() }) {
  const normalizedUsername = normalizeUsername(username)
  const passwordData = hashPassword(password)
  const timestamp = nowIso()
  db.transaction(() => {
    db.prepare(`
      insert into finance_users (
        id, username, display_name, role, password_salt, password_hash, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, normalizedUsername, displayName || null, role, passwordData.salt, passwordData.hash, timestamp, timestamp)
    db.prepare(`
      insert into finance_profiles (user_id, currency, monthly_savings_min, emergency_reserve_months, created_at, updated_at)
      values (?, 'XAF', 15000, 3, ?, ?)
    `).run(id, timestamp, timestamp)
  })()
  return { id, username: normalizedUsername, displayName: displayName || null, role, password }
}

export function countUsers(db) {
  return db.prepare('select count(*) as count from finance_users').get().count
}

export function getSafeUser(db, userId) {
  return db.prepare(`
    select id, username, display_name as displayName, role, created_at as createdAt, last_login_at as lastLoginAt
    from finance_users where id = ?
  `).get(userId) ?? null
}

export function closeDatabase(db) {
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()
}
