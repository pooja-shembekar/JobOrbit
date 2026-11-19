# API Reference

Base path: `/api`. Browser sessions use an HttpOnly `joborbit_session` cookie; protected endpoints also accept legacy `Authorization: Bearer <token>` clients. Cookie-authenticated writes require an allowed `Origin` and `X-Requested-With: JobOrbit`. The server loads the user's current role and identity from MongoDB; client-provided user IDs or roles are not authorization authority.

## Health and Authentication

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/health` | Public | Database-aware health response; 200 when connected, 503 otherwise. |
| POST | `/auth/register` | Public | Create a candidate or recruiter account and set the HttpOnly session cookie. |
| POST | `/auth/login` | Public | Authenticate credentials and set the HttpOnly session cookie; token is not returned in JSON. |
| POST | `/auth/logout` | Public | Clear the browser session cookie. |
| GET | `/auth/me` | Authenticated | Return the authenticated profile and saved skills. |
| PATCH | `/auth/skills` | Candidate | Replace saved skills with `{ "skills": ["React", "Node.js"] }`. |

Registration defaults to candidate and accepts only the `candidate` and `recruiter` roles. The server validates the requested role against this allowlist; unsupported roles are rejected. Successful registration sets the same HttpOnly session cookie as login. If `JWT_SECRET` is not configured, registration returns 503 without creating an account.

## Jobs

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/jobs/public` | Public | Search/filter/sort/page open jobs in MongoDB. |
| GET | `/jobs/public/:id` | Public | Read a job. |
| GET | `/jobs/saved` | Candidate | List the authenticated candidate's saved jobs. |
| POST | `/jobs/:id/save` | Candidate | Save an open job; repeated saves are idempotent. |
| DELETE | `/jobs/:id/save` | Candidate | Remove a saved job. |
| POST | `/jobs/:id/match` | Candidate | Compare job skills against the authenticated candidate's saved skills. |
| GET | `/jobs/my-jobs` | Recruiter | List jobs owned by the authenticated recruiter. |
| POST | `/jobs` | Recruiter | Create a job; ownership is assigned from the session. |
| PUT | `/jobs/:id` | Owning recruiter | Update a job. |
| PATCH | `/jobs/:id/close` | Owning recruiter | Close a job. |
| DELETE | `/jobs/:id` | Owning recruiter | Delete a job. |

Salary fields (`salaryMin`, `salaryMax`) and salary filters (`minSalary`, `maxSalary`) are non-negative numeric amounts in INR. The backend stores and compares numeric amounts as supplied; it does not convert values. Existing records are not rewritten because their original currency may be unknown. Public query parameters: `search` (max 100 characters), `jobType`, `experienceLevel`, `category`, and `workMode` (comma-separated allowed enum values), `location` (max 100 characters), `minSalary` and `maxSalary` (INR amounts with the lower bound not exceeding the upper bound), `sort` (`newest`, `oldest`, `title`, `salary-asc`, `salary-desc`), `page` (1 through 1,000,000), and `limit` (1 through 50). Filters combine with AND semantics; the text search is grouped as an OR across title, company, location, skills, and description. Invalid parameters return 400.

List responses retain `total`, `page`, `pages`, `count`, and `jobs`, and include `pagination: { page, limit, totalPages, hasNextPage, hasPreviousPage }`.

## Applications

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/applications/:jobId` | Candidate | Submit once per job. JSON supports `resumeUrl`; multipart supports optional `resume` PDF/DOCX up to 5 MB. |
| GET | `/applications/my-applications` | Candidate | List only the authenticated candidate's applications. |
| GET | `/applications/recruiter` | Recruiter | List applications for jobs owned by this recruiter, excluding records whose candidate account is missing or is no longer a candidate. Excluded application records are retained. |
| PATCH | `/applications/:id/status` | Owning recruiter | Set `Applied`, `Under Review`, `Shortlisted`, `Interview`, `Rejected`, or `Hired`. `Submitted` remains accepted for compatibility and is normalized to `Applied`. |
| PATCH | `/applications/:id/interview` | Owning recruiter | Schedule/update `{ "scheduledAt": "<future ISO-8601 date-time>", "meetingDetails": "<optional instructions, meeting link, or location; max 1000 characters>" }`. Scheduling also moves the application to `Interview`; the recruiter dashboard accepts a local date and time and combines them into the ISO-8601 value. |

Multipart and URL resumes are mutually exclusive. Uploads use private S3 storage when configured, or MongoDB storage otherwise. Uploaded filenames are included in application responses; files are retrieved through `GET /applications/:id/resume`, which allows only the owning candidate or the recruiter who owns the job and reads from the configured private storage. The default is an attachment download; `?disposition=inline` returns the authorized file with inline disposition for browser preview. The client renders DOCX files locally; no conversion service or altered stored copy is used. Storage keys and direct object URLs are not exposed. Duplicate applications return 409. A non-owner recruiter receives 403 for status updates.

Application responses include a chronological `statusHistory` with status, timestamp, actor ID, and actor role. Older records without history receive a synthesized timeline on read and are migrated to stored history on the next authorized status change. The interview schedule includes its time, meeting details, last update time, and recruiter actor. When Resend is configured, new or changed interview schedules send a candidate notification; unchanged schedules do not send duplicates.

## Skill Matching and Career Assistant

Skill matching uses the OpenAI-compatible chat-completions endpoint configured by `AI_API_URL`, `AI_API_KEY`, and `AI_MODEL`; it validates response pairs and returns deterministic overlap if credentials or provider responses are unavailable. The Career Assistant uses Google's Gemini Interactions API with the server-only `GEMINI_API_KEY` and optional `GEMINI_MODEL` (default `gemini-3.8-flash`). Requests disable interaction storage and use independent 15-second request timeouts. Transient network errors and HTTP 408/502/503/504 responses are retried at most once; a primary timeout or exhausted transient HTTP failure gets one `gemini-3.5-flash-lite` fallback request. Requests also have a twelve-message-per-minute per-candidate limit. Remaining provider failures return a clear service error rather than an unrelated career response. Personal application data is queried by the authenticated candidate ID and is never accepted from the request body. Both are informational and do not make hiring decisions.

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/assistant/chat` | Candidate | Ask the Career Assistant; personal context is loaded only for the authenticated candidate. |