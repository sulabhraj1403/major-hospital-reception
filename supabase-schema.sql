-- Major Hospital Management System — Supabase database setup
-- Run this entire file in Supabase Dashboard → SQL Editor.
-- IMPORTANT: never put a Supabase secret/service_role key in the website.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('doctor','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.doctors (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  age integer not null check (age >= 0),
  gender text not null,
  mobile text,
  address text,
  blood_pressure text,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  patient_name text not null,
  doctor_id uuid not null references public.doctors(id) on delete restrict,
  doctor_name text not null,
  date_key date not null,
  time time not null,
  fee numeric(12,2) not null default 0 check (fee >= 0),
  payment_method text not null check (payment_method in ('Cash','UPI')),
  upi_payment_time time,
  status text not null default 'waiting' check (status in ('waiting','seen')),
  notes text,
  seen_at timestamptz,
  seen_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete restrict,
  doctor_id uuid not null references public.doctors(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete restrict,
  patient_name text not null,
  original_fee numeric(12,2) not null,
  refund_amount numeric(12,2) not null check (refund_amount > 0),
  method text not null default 'Cash' check (method = 'Cash'),
  status text not null default 'pending' check (status in ('pending','completed')),
  requested_by uuid not null references auth.users(id),
  doctor_name text,
  requested_at timestamptz not null default now(),
  completed_by uuid references auth.users(id),
  completed_at timestamptz
);

create index if not exists appointments_date_idx on public.appointments(date_key);
create index if not exists appointments_doctor_date_idx on public.appointments(doctor_id,date_key);
create index if not exists patients_name_idx on public.patients(name);
create index if not exists patients_address_idx on public.patients(address);
create index if not exists refunds_status_idx on public.refunds(status);

create schema if not exists private;

create or replace function private.user_has_role(required_role text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = required_role
  );
$$;
revoke all on function private.user_has_role(text) from public;
grant execute on function private.user_has_role(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.doctors enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.visits enable row level security;
alter table public.refunds enable row level security;

-- Profiles: permanent users can read their own profile; admins can read/manage all profiles.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated using (id = (select auth.uid()) or (select private.user_has_role('admin')));
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all to authenticated using ((select private.user_has_role('admin'))) with check ((select private.user_has_role('admin')));

-- Doctors: reception/anonymous-auth users can read the limited doctor directory; admins manage it.
drop policy if exists doctors_reception_read on public.doctors;
create policy doctors_reception_read on public.doctors for select to authenticated using (active = true and (select (auth.jwt()->>'is_anonymous')::boolean));
drop policy if exists doctors_self_read on public.doctors;
create policy doctors_self_read on public.doctors for select to authenticated using (id = (select auth.uid()) or (select private.user_has_role('admin')));
drop policy if exists doctors_admin_write on public.doctors;
create policy doctors_admin_write on public.doctors for all to authenticated using ((select private.user_has_role('admin'))) with check ((select private.user_has_role('admin')));

-- Patients: reception anonymous sessions and permanent staff can use patient records.
drop policy if exists patients_staff_select on public.patients;
create policy patients_staff_select on public.patients for select to authenticated using (true);
drop policy if exists patients_reception_insert on public.patients;
create policy patients_reception_insert on public.patients for insert to authenticated with check ((select (auth.jwt()->>'is_anonymous')::boolean) or (select private.user_has_role('doctor')) or (select private.user_has_role('admin')));
drop policy if exists patients_staff_update on public.patients;
create policy patients_staff_update on public.patients for update to authenticated using ((select (auth.jwt()->>'is_anonymous')::boolean) or (select private.user_has_role('doctor')) or (select private.user_has_role('admin'))) with check (true);
drop policy if exists patients_admin_delete on public.patients;
create policy patients_admin_delete on public.patients for delete to authenticated using ((select private.user_has_role('admin')));

-- Appointments: reception creates/reads; doctor reads/updates their own; admin full access.
drop policy if exists appointments_read on public.appointments;
create policy appointments_read on public.appointments for select to authenticated using ((select (auth.jwt()->>'is_anonymous')::boolean) or doctor_id = (select auth.uid()) or (select private.user_has_role('admin')));
drop policy if exists appointments_insert on public.appointments;
create policy appointments_insert on public.appointments for insert to authenticated with check ((select (auth.jwt()->>'is_anonymous')::boolean) or (select private.user_has_role('doctor')) or (select private.user_has_role('admin')));
drop policy if exists appointments_update on public.appointments;
create policy appointments_update on public.appointments for update to authenticated using (doctor_id = (select auth.uid()) or (select (auth.jwt()->>'is_anonymous')::boolean) or (select private.user_has_role('admin'))) with check (true);
drop policy if exists appointments_admin_delete on public.appointments;
create policy appointments_admin_delete on public.appointments for delete to authenticated using ((select private.user_has_role('admin')));

-- Visits: doctors can create/update their own visits; admin can manage. Reception can read history for the UI.
drop policy if exists visits_read on public.visits;
create policy visits_read on public.visits for select to authenticated using ((select (auth.jwt()->>'is_anonymous')::boolean) or doctor_id = (select auth.uid()) or (select private.user_has_role('admin')));
drop policy if exists visits_write on public.visits;
create policy visits_write on public.visits for insert to authenticated with check (doctor_id = (select auth.uid()) or (select private.user_has_role('admin')));
drop policy if exists visits_update on public.visits;
create policy visits_update on public.visits for update to authenticated using (doctor_id = (select auth.uid()) or (select private.user_has_role('admin'))) with check (true);
drop policy if exists visits_admin_delete on public.visits;
create policy visits_admin_delete on public.visits for delete to authenticated using ((select private.user_has_role('admin')));

-- Refunds: doctors request; reception/anonymous sessions complete; admin manages.
drop policy if exists refunds_read on public.refunds;
create policy refunds_read on public.refunds for select to authenticated using ((select (auth.jwt()->>'is_anonymous')::boolean) or requested_by = (select auth.uid()) or (select private.user_has_role('admin')));
drop policy if exists refunds_insert on public.refunds;
create policy refunds_insert on public.refunds for insert to authenticated with check (requested_by = (select auth.uid()) and ((select private.user_has_role('doctor')) or (select private.user_has_role('admin'))));
drop policy if exists refunds_update on public.refunds;
create policy refunds_update on public.refunds for update to authenticated using ((select (auth.jwt()->>'is_anonymous')::boolean) or (select private.user_has_role('admin'))) with check (true);
drop policy if exists refunds_admin_delete on public.refunds;
create policy refunds_admin_delete on public.refunds for delete to authenticated using ((select private.user_has_role('admin')));

grant select on public.doctors to authenticated;
grant select,insert,update on public.patients to authenticated;
grant select,insert,update on public.appointments to authenticated;
grant select,insert,update on public.visits to authenticated;
grant select,insert,update on public.refunds to authenticated;
grant select on public.profiles to authenticated;

-- After creating a permanent Auth user, insert its profile and doctor row (if applicable), e.g.:
-- insert into public.profiles(id,name,role) values ('AUTH-USER-UUID','Dr. Name','doctor');
-- insert into public.doctors(id,name,active) values ('AUTH-USER-UUID','Dr. Name',true);
