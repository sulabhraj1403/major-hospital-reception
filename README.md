# Major Hospital — inspected/fixed package

This package fixes the bugs found in the supplied website files:
- removes the dependency on the global `window.supabase` CDN object by importing supabase-js directly as an ES module
- keeps a visible startup error instead of a blank white page if JavaScript fails
- adds the missing `appointments.deleted_at` column through migration
- makes appointment doctor assignment nullable, matching the current booking form
- replaces the missing `soft_delete_booking` RPC with a direct soft-delete update
- replaces the missing/fragile `complete_cash_refund` RPC with a direct refund update
- keeps deleted bookings in the database so patient booking history remains available
- keeps current-day active bookings in Reception/Doctor views

Run `supabase-booking-delete-history-fix.sql` once in Supabase SQL Editor.
Keep the supplied `supabase-config.js`.
