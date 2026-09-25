# Major Hospital Management System — Supabase version

## Files
- `index.html` — interface
- `style.css` — responsive styling
- `app.js` — application logic using Supabase
- `supabase-config.js` — Project URL + Publishable key placeholders
- `supabase-schema.sql` — database tables, indexes, grants and RLS policies

## Setup
1. Create a Supabase project.
2. In Authentication → Providers, enable **Anonymous Sign-Ins** and **Email** authentication.
3. Open SQL Editor and run `supabase-schema.sql` completely.
4. Open Project Settings → API and copy the **Project URL** and **Publishable key** (legacy `anon` key also works where shown).
5. Put those values in `supabase-config.js`.
6. Upload all files to GitHub and deploy the repository on Vercel.

## Create a doctor
1. Supabase Dashboard → Authentication → Users → Add user.
2. Copy that user's UUID.
3. In SQL Editor run:
```sql
insert into public.profiles(id,name,role) values ('UUID','Doctor Name','doctor');
insert into public.doctors(id,name,active) values ('UUID','Doctor Name',true);
```
Use `role='admin'` for an administrator profile. An admin does not need a doctors row unless they also practice as a doctor.

## Reception
Reception has no visible login. The site silently creates a Supabase anonymous Auth user. Supabase anonymous users use the `authenticated` database role and can be distinguished in RLS with the `is_anonymous` JWT claim. This is why the SQL file contains explicit RLS policies for anonymous reception sessions.

## Security
The website uses only the public browser key. Never put a Supabase secret/service-role key in `supabase-config.js` or GitHub. Patient/clinical data should not be used in production until the RLS policies, user roles and operational security have been tested. Supabase recommends enabling RLS on exposed tables and using policies/grants to control access.
