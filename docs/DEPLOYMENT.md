# Deployment Checklist

This checklist targets **Render** for the Node API, **Vercel** for the Vite frontend, **MongoDB Atlas** for persistence, **Amazon S3** (or a compatible private object store) for resumes, and **Resend** for email. No service has been deployed from this workspace; add the real URL after deployment.

## MongoDB Atlas

- Create a production database/user separate from development and test data.
- Restrict network access to the hosting provider's outbound addresses where supported; avoid broad access lists where possible.
- Set the production `MONGO_URI` in Render's secret environment settings.
- Back up the database and verify Atlas TLS/network access before release.

## Render API

- Create a Node web service with root directory `server`.
- Build command: `npm install`.
- Start command: `npm start`.
- Add `PORT` (Render normally provides it), `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_URL`, `RESEND_API_KEY`, and `EMAIL_FROM`.
- Generate a high-entropy JWT secret and store it only in Render's secret settings.
- Set `CLIENT_URL` to `https://job-orbit-fawn.vercel.app` (the exact Vercel origin, without a trailing slash). The API also allows `http://localhost:5173` for local development. Multiple configured frontend origins may be comma-separated.
- Configure the selected S3 variables if resume uploads are enabled; keep the bucket private and grant only the API's required object permissions.
- Configure `RESEND_API_KEY` and `EMAIL_FROM` after verifying the sender domain. These credentials are used only for application notifications; registration does not send email.
- Application submission, status changes, and new or changed interview schedules can send candidate/recruiter notifications. Repeating an unchanged status or interview schedule does not send another notification. Verify delivery with a controlled candidate/recruiter account after configuring Resend; tests use a mocked provider response.
- Optional skill-matching variables: `AI_API_URL`, `AI_API_KEY`, and `AI_MODEL`. Keep credentials on the server only; matching fallback behavior works without them.
- Optional Career Assistant variables: `GEMINI_API_KEY` and `GEMINI_MODEL` (defaults to `gemini-3.8-flash`). Create or select a Gemini API key in Google AI Studio, add it only to the server environment (for local development, `server/.env`), and restart/redeploy the backend. Verify that the selected model is available to the key's project. Never place the key in a `VITE_` variable or frontend configuration.
- Optional private resume-storage variables: `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. Prefer the hosting platform's role-based credentials where supported. With S3 configured, keep the bucket private; uploaded files are retrieved through an authenticated API route that checks candidate ownership or recruiter job ownership. Without S3 settings, uploaded files are stored in MongoDB and served through the same ownership-checked route. Storage keys and direct object URLs are not exposed. Smoke-test the configured storage path after setup.
- `PORT` is supplied by Render; the server listens on that assigned port. `CLIENT_URL` must contain only trusted frontend origins.
- Full backend and frontend variable names are listed in `server/.env.example` and `client/.env.example`. Use secret-manager values for database credentials, JWT signing keys, email keys, and storage keys; do not copy placeholder values into production.
- Use `/api/health` as the health-check path and verify it reports HTTP 200 with MongoDB connected.

## Vercel Frontend

- Import the existing repository and set the project root to `client`.
- Build command: `npm run build`; output directory: `dist`.
- Set `VITE_API_URL` to the Render API base including `/api` (for example, `https://<render-service>.onrender.com/api`, not a made-up live URL).
- Configure SPA rewrites to serve `index.html` for client-side routes.
- Redeploy after changing environment variables. Vite variables are public; never store secrets in any `VITE_` variable.

## Release Verification

- Run `npm test` and `npm run build` before deployment.
- Verify candidate and recruiter signup/login, and confirm submitted roles are limited to candidate or recruiter.
- Verify non-owner job edits and application status updates return 403.
- Verify production CORS allows the Vercel origin and rejects unrelated browser origins.
- Verify job filters/pagination, application duplicate prevention, resume permissions, and candidate matching.
- Verify saved-job add/list/remove as a candidate; verify recruiter metrics and job/status applicant filters.
- Verify an application status timeline survives a fresh candidate API read, and verify an authorized recruiter can schedule/update an interview while a non-owner receives 403.
- Verify interview email contents and delivery for the candidate, including date/time and meeting details. Tests mock successful email delivery; they are not a substitute for this production-provider check.
- Check API logs for provider errors without logging tokens, email credentials, or resume contents.
- Add verified production URLs here after deployment:

Frontend: `[Add deployed frontend URL]`  
API: `[Add deployed API URL]`  
Health: `[Add deployed API URL]/api/health`