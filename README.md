# Major Hospital Reception — Web MVP

A responsive Firebase + vanilla JavaScript hospital management website designed to work in Android and desktop browsers.

## Included
- Firebase Email/Password login
- Admin / Doctor / Receptionist roles
- Patient registration and search
- Today's bookings
- Doctor's today's patient list
- Patient details
- Doctor notes with edit/update
- Mark patient as seen
- Partial or full cash refund request
- Reception pending-refund screen showing patient and amount
- Mark cash refund completed
- Firestore security rules

## Firebase setup
1. Create a Firebase project.
2. Enable Authentication -> Email/Password.
3. Create Firestore.
4. Register a Web app.
5. Put the web config into `firebase-config.js`.
6. Create users under Authentication -> Users.
7. For each user, create `users/{UID}` in Firestore, e.g.:

{
  "name": "Dr. Example",
  "role": "doctor"
}

Allowed roles:
- admin
- doctor
- receptionist

## Important
Do not put Firebase Admin SDK/service-account private keys in this website.

Before using real patient data:
- review and test Firestore Security Rules
- configure appropriate backup/export procedures
- test role access with separate accounts
- verify applicable privacy/security requirements

## Vercel
This is a static site. Import the repository into Vercel and deploy with no build command.
