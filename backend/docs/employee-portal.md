# Employee portal

The main business user manages employee records, passwords, login access, documents, QR resets and approvals. Employees sign in to their own portal and can mark attendance, request leave or time permission, and view their own profile, monthly records, payslips and documents. Employee sessions cannot enter the business-management API.

## Personal employee URLs, QR cards and email setup

Each employee gets a personal URL such as `/employee-login/<business-name>-<short-code>/<employee-id>`. Opening that URL or scanning its QR pre-fills the business username and employee ID as read-only fields; the employee types their password. The shared `/employee-login` page remains available for manual entry. Personal links, the shared URL, copied links, CSV exports and QR images use the frontend browser origin, including its port: local pages create local links and live pages create live links. Backend responses store relative paths, so moving the same employee records to another deployment does not require rewriting employee URLs in the database. Download fresh QR cards from the live site after deployment; previously copied URLs and printed QR cards retain the origin used when they were generated. Username is the business owner's GoBook login email; employee IDs are resolved only within that owner. Valid credentials send a code to the employee email saved by the owner; they do not create a session. Only successful OTP verification issues an employee token and opens that employee's dashboard.

1. The main business user opens **Employee Management > Login & Email OTP** (`/employee-management/settings`).
2. Enter the business Gmail address and its Google app password, then choose **Verify app password**. The server checks the app password by authenticating the SMTP connection before saving it; this setup does not send an email verification code. Existing app password settings from Email Marketing can also be used. OTPs never fall back to the platform mailbox.
3. Open **Employees > Login Settings / QR**. Add each employee's email, choose an 8-character minimum password (at most 72 UTF-8 bytes), enable login and save. Saved employee passwords and the owner's app password are not returned in API responses.
4. Open **Employee Management > Dashboard** or **Employee Login URLs** to see employee links and verification status. Choose **Show > All employees** for one complete view. **Copy all URLs** and **Download all URLs** include the entire business employee list, across every page; the CSV includes employee name, ID, business username and personal URL. Each employee also has individual copy and QR/detail controls. Creating an employee generates and stores their alias immediately, then opens their login details.
5. In the QR settings, choose whether photo, name, role/designation, employee ID, address, phone and email appear. These choices persist on the employee record and govern both the downloadable PNG card and the pre-login scan page. Download the full QR card or the QR image alone. Old shared QR images still open manual login; download a new personal card for prefilled details.
6. The employee completes password verification and enters the 6-digit OTP delivered to their own email. Codes expire after 10 minutes, allow at most five guesses and can be resent after 60 seconds. Resend rotates the challenge and invalidates the previous code.

The login challenge stores only hashed OTPs and hashed random references. Its owner, employee, password/QR version, recipient email and verified sender are bound on the server. Password or email changes, disabling access, QR revocation, sender changes and expiry invalidate pending verification. Consumption is atomic, so concurrent verification of one code can create only one session. Request and send limits are shared through MongoDB.

**Reset QR & sessions** rotates the personal URL, invalidates older cards and outstanding OTPs and signs out that employee. A QR selects the identity; password and email OTP verification remain required.

After login the dashboard remains scoped to `/employee/<business-name>-<short-code>/<employee-id>`. Legacy employee screen links redirect into the signed-in employee's own portal; links naming another employee do not switch identity.

Deploy frontend and backend together. Older backends that issue an immediate password-only token are rejected by the updated login UI. Production startup retains the existing Turnstile requirements. Schema initialization creates the OTP uniqueness, lookup and expiry indexes; the authentication migration also explicitly creates them when run with `--apply`.

Employee email verification is recorded only after a successful OTP as `emailVerifiedAddress` and `emailVerifiedAt`. Changing the address resets verification. General employee create/update requests cannot forge these fields. Business mailbox readiness requires the existing SMTP verification marker and configured credentials.

For local development, set `NODE_ENV=development` and `EMPLOYEE_LOGIN_SKIP_OTP=true` in `backend/.env`, then restart the backend. Valid employee credentials open the dashboard without sending email or requiring SMTP setup. This does not mark the employee email verified. The skip flag defaults to false and is ignored in production and test environments; production always sends OTP to the saved employee email and requires verification before issuing a session.

Public scan context returns only owner-selected profile fields. Photo requests resolve the current signed employee link, check the saved photo visibility option and enforce GridFS employee-photo kind and owner metadata. They cannot fetch an arbitrary file ID. QR generation happens on demand; employee alias initialization uses one tenant-scoped bulk write for the directory.

## Business branding and dashboard

The employee header shows the business logo uploaded in the owner's settings and a navigation toggle on mobile. OTP-verified login and `/employee/me` return `user.businessLogoUrl`, read only from the authenticated owner's `BusinessSettings`. Missing or failed logos show that business's initials. Refreshing the portal picks up logo replacements and removals. Deploy backend and frontend together for this response field.

The header and desktop sidebar remain fixed while page content scrolls. Mobile navigation opens in a side drawer with a backdrop, focus containment, Escape-to-close and automatic close after navigation. Six accordion groups include My Work; all employee links retain the signed-in employee's business and employee URL. The dashboard includes work overview, scoped quick actions, a month selector, attendance and request totals, recent attendance and the month's payslip. Loading and unavailable data are distinguished from empty records, with retry on failure.

## Work management

When the frontend reports `Route not found: GET /api/admin/employee-work?page=1` despite the route existing in source, verify the API process serving the configured URL. A previously started backend can keep serving old routes and prevent a newer watcher from binding its port. Restart the existing local GoBook backend with `npm run dev`. With the backend and frontend running, `npm run check:employee-local` from backend checks 33 authenticated API requests, assigns and completes temporary work, and opens 39 admin/employee pages at desktop and mobile widths against the actual running servers. It uses new temporary account IDs, removes its own test records, and refuses hosted APIs or non-local databases. Results are saved under `runtime/local-employee-routes-check/report.json`.

The main business user opens **Employee Management → Work Management** (`/employee-management/work`) to assign work to selected active employees or all active employees. Each recipient receives an independent `EmployeeWork` record with instructions, priority and optional due date. Retried requests with the same request ID do not create duplicates or reset progress. Search, employee/status filters, pagination, overdue counts and completion notes use saved records. The owner can edit task details or reopen completed work.

Employees open **My Work** at their scoped `/employee/<business>/<employee-id>/work` URL. They see only their assignments, can update Assigned / In Progress / Completed and add a progress or completion note. Completion timestamps are saved by the server. Only the owner can reopen completed work. The dashboard and work list refresh while visible so new assignments and updates appear without signing in again.

`GET/POST /admin/employee-work` and `PUT /admin/employee-work/:id` require main-business-user authentication. Employee `GET /employee/work` and `PUT /employee/work/:id` derive owner and employee identity from the session. Updates require the record version; simultaneous or stale changes return 409 instead of overwriting newer work. Assignment never sends email automatically.

Run `SECURITY_TEST_MONGODB_URI=<isolated-test-host> npm test -- tests/employeeWork.integration.test.js` from backend for persistence, ownership, retry, completion, concurrency and filter checks. Browser fixtures run from frontend with `EMPLOYEE_UI_DIST=<build-directory> node scripts/checkEmployeeWorkUi.mjs`; screenshots and the report go to `backend/runtime/employee-work-preview` without live account access.

After building the frontend, run `node scripts/checkEmployeePortalUi.mjs` from `frontend` on Windows with Chrome installed (or set `CHROME_PATH`). This browser check intercepts external requests with fixture data; it never accesses a live account. It validates 320, 390, 768, 1024 and 1440 pixel layouts, vertical scrolling, business logos, scoped navigation, month changes, error recovery, logo fallback, shared login, missing-session checks before OTP, wrong-code rejection, resend cooldown, verified sign-in and owner mailbox setup, dashboard URL directory, QR field selections, full-card PNG decoding and prefilled personal login. Screenshots and its report are written under `backend/runtime/employee-dashboard-preview`.

## Documents and requests

Upload files through **Employee → Documents** or the employee creation form. Files are stored in GridFS; PDFs, supported images and videos are checked by content signature and limited to 20 MB. Employee document and photo downloads require authentication and exact employee ownership. Employees have no document upload/edit/delete endpoint. The owner can view and download documents through authenticated requests.

Employees use **Apply Leave** for whole-day ranges and **Permission Requests** for time away within a day. Requests are always created as Pending; only the main business user can approve or reject them. Approval screens are available under **Leave → Permissions** and **Leave Requests**. Monthly filters use the Indian business month, with overlapping leave dates included.

Attendance check-in/out uses server dates/times and the employee's authenticated identity; browser geolocation is required. Duplicate check-in/out submissions are rejected. GPS coordinates supplied by a browser are not a hardware-based presence attestation.

## Employee details and presence

The full Add/Edit Employee form includes marital status, nationality, qualification, permanent address, up to 20 family members (relationship, mobile, birth date, occupation and emergency-contact choice), PF number, UAN, ESI number, PAN and salary bank account details. Payroll allowances and deductions can be entered explicitly. The quick employee modal links to this full form. These details are visible to the owning business and the signed-in employee through authenticated profile screens; they are excluded from public QR context. JSON and photo uploads use the same detail validation, and edits can replace the profile photo.

Employees can start/end multiple breaks between check-in and check-out. Administrators can enter break ranges in the attendance editor. Breaks must be ordered and within the attendance range; checkout closes an ongoing break. `hours` excludes the saved break duration, and the employee's monthly view shows in/out times, break ranges and total break minutes. Concurrent break changes are checked against the saved attendance version.

The employee directory uses a responsive card grid. View details opens a right-side drawer, which fills the screen on mobile. Each card's three-dot menu includes password setup/reset and login/QR settings. Password setup requires confirmation and revokes previous sessions when saved. The employment form suggests General, Day, Night, Rotational and 6-Day shifts while preserving custom shift names. Employee login shows portal information on the left and the credentials form on the right, stacked on mobile.

The employee header sends an authenticated heartbeat every 20 seconds while its tab is visible. Each tab has its own presence identifier; hiding or leaving one tab removes only that tab's heartbeat. The owner's employee list refreshes uncached presence every 15 seconds. Online requires a valid, enabled session with a visible-tab heartbeat from the last 60 seconds. Login alone does not mark an employee online. Logout revokes the session immediately; a lost connection expires within 60 seconds plus the owner's next refresh. Other visible tabs or sessions can keep an employee online. Presence is independent of attendance status, and employees cannot request the owner's presence list. Deploy frontend and backend together for the tab presence protocol.

`node scripts/runTests.js tests/employeeDetails.test.js` validates detail parsing and break calculations. `node scripts/runEmployeeOtpIntegration.mjs` also checks profile persistence, tenant isolation, multipart photo edits, break concurrency/checkout, admin-entered attendance visibility and heartbeat expiry/revocation in an isolated database.

## Employee email, notification history and report downloads

The Google app password input is checked by SMTP authentication before it is saved. Employee OTPs and employee notification emails always use that owner's connected mailbox as both SMTP account and From address. They embed the owner's uploaded logo as an inline CID attachment, with a business-name fallback if no supported logo exists. Logo reads enforce GridFS business-logo kind and owner metadata; no arbitrary URL or other owner's logo is fetched.

**Employee Management > Employee Notifications** lets the main user notify all employees or one employee, view one saved record per recipient, inspect Pending/Sending/Accepted/Failed/Unknown email status, retry a failed email, and see each employee's first in-app read timestamp. Each employee has a Notifications inbox and unread bell. Notification records are persisted without an expiry or delete flow, so reloads and server restarts retain history. Only the intended employee can acknowledge reading a message. Email acceptance is an SMTP result, not proof of inbox delivery or an email open; in-app read status and successful login OTP verification are separate fields. OTP plaintext and SMTP passwords are never included in notification history or reports.

Profile creation, document upload, leave/permission reviews, payroll generation/payment updates and explicitly emailed payslips create notifications. The payslip email action attaches a real PDF for that employee. The durable email worker runs every minute when scheduled jobs are enabled; atomic claims prevent concurrent workers sending the same queued item. Failed emails can be retried up to five attempts. Interrupted sends become Unknown, preserving the history without automatically duplicating mail. `SCHEDULED_JOBS_ENABLED=false` keeps local snapshots from sending email and displays a paused-delivery message when queuing or retrying.

**Employee Management > Employee Reports** downloads PDF or genuine `.xlsx` workbooks for employees, attendance and breaks, leaves, payroll/payslips, PF/ESI/TDS, permissions, corrections, documents, holidays and notification/read history. Combined Excel has one sheet per report; combined PDF contains all selected reports. Month, employee and department filters are applied on the server. Current employee/document directories are labelled as current records. Payroll generation saves a deduction snapshot for historical PF/ESI/TDS reporting; older or manually adjusted rows without a snapshot show `Not recorded`, rather than estimates from today's salary settings. Employees can export only their own attendance, leave, permission and payslip records.

`tests/employeeReports.test.js` opens the generated Excel/PDF files and verifies branding. `tests/employeeMessaging.integration.test.js` exercises real MongoDB persistence, tenant/recipient isolation, read receipts, retry recovery, owner-logo SMTP mail, OTP history, payroll snapshots and PDF payslip attachments with mocked mail delivery.

## Local demo data

`npm run seed:employee-month -- --as-of=2026-11-11` previews the operation. Add `--apply` to insert missing demo rows. The script refuses production and any database other than `gobook_local_demo` on local MongoDB port 27018. It targets only existing employees with demo email addresses, does not create predictable passwords and does not replace existing business records.

Applied locally for 20 demo employees: 600 attendance rows for **12 October–10 November 2026**, 20 sample leaves, 20 permission requests, 20 pending payroll records, 20 attendance corrections and one clearly labelled demo company holiday. Today is left available for real check-in testing. Passwords remain under the administrator's control.

## Validation

`node scripts/runTests.js tests/employeeLoginOtp.test.js tests/employeePortalBranding.test.js` covers password/OTP separation, tenant-bound senders, delivery failures, resend, attempts, expiry, password/email/sender changes and protected SMTP verification markers.

On Windows with MongoDB installed, `node scripts/runEmployeeOtpIntegration.mjs` starts a fresh temporary MongoDB instance on an available loopback port, runs the OTP concurrency and portal HTTP integration tests and removes that instance and its files. Set `MONGOD_PATH` if needed. It never uses the application database. Provider responses are mocked, so these tests do not send real email.

`SECURITY_TEST_MONGODB_URI` enables the isolated `employeePortalAccess.integration.test.js` HTTP tests. They exercise owner password configuration, employee login, read-only profile access, private documents/photos, permission approval, attendance, QR reset and old-session revocation. Test databases use a unique `gobook_employee_access_test_*` name and are removed after the tests.

Frontend QR tests encode a PNG and decode it back to the exact employee URL. Cloudflare human verification remains dependent on real Turnstile keys; see `authentication-security.md` for activation.

Latest checks: 37 focused backend/month/security tests passed, including real MongoDB HTTP integration; 357 frontend tests passed, including scoped portal rendering and QR decoding; production build passed. The full backend suite has two existing deployment-only failures (missing root deployment guidance and a production-domain CORS assertion against the local development environment); see `runtime/employee-portal-full-backend-tests.log`. The local security-config and generated employee-link endpoints both returned HTTP 200.
Employee changes and owner updates

Employee leave applications, permission requests, attendance punches and breaks, attendance corrections, work progress and notification read receipts are stored in their existing MongoDB collections. GET /api/admin/employee-updates reads the latest stored state of these records for the authenticated business owner only, with type filters and cursor pagination (50 records per page). The endpoint does not duplicate employee records or expose another business's data.

The owner's Employee Management dashboard and Employee Updates page show these saved records. While the owner's app is visible, a 15-second check displays new updates as popups and refreshes employee screens. Record links select the relevant month, including future leave and permission requests. Retail and automobile layouts share this behavior. Approvals remain in the existing leave, correction and permission flows; employees receive the saved status through their own scoped APIs and notification refresh.

Run the persistence and isolation check with: node scripts/runEmployeeOtpIntegration.mjs tests/employeeUpdates.integration.test.js
This uses a temporary local MongoDB instance and tests actual employee submissions, owner approvals, API restart persistence, cross-business isolation and pagination with identical timestamps. Frontend fixture verification: node scripts/checkEmployeePortalUi.mjs --employee-updates-only
