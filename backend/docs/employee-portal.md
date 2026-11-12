# Employee portal

The main business user manages employee records, passwords, login access, documents, QR resets and approvals. Employees sign in to their own portal and can mark attendance, request leave or time permission, and view their own profile, monthly records, payslips and documents. Employee sessions cannot enter the business-management API.

## Set up employee access

1. Open **Employee Management → Employees**.
2. Use **Login Settings / QR** on an employee row, or **View Profile → Login & QR**.
3. Enter an administrator-chosen password of 8–72 bytes, enable employee login and save. Existing passwords are never returned by the API or displayed; entering a new password resets it.
4. Copy the employee login URL or download the PNG QR. The URL contains the business-name slug, business owner ID and employee ID; the employee ID is filled automatically and read-only on login. A password is still required after scanning a QR.
5. **Reset QR** creates a new signed link and revokes the old link and that employee's existing sessions. The password is retained. Password changes, account deactivation and login disablement also invalidate existing access.

URL format: `/employee-login/<business-name>-<short-code>/<employee-id>`. The employee ID is the last segment. Long internal owner IDs and query tokens are omitted. The short code selects the current login link; it does not authenticate without the password. Resetting a QR rotates this short code. Use the deployed HTTPS frontend when sharing externally. A localhost QR refers to the scanning device itself and is suitable only for same-computer previews.

After login, the dashboard uses `/employee/<business-name>-<short-code>/<employee-id>`, also ending in the employee ID. Individual screens append their screen name. Legacy `/employee/...` screen links redirect to the employee's own scoped URL; a route naming another employee redirects to the signed-in employee's own portal. Existing long login links remain compatible until their QR is reset.

## Documents and requests

Upload files through **Employee → Documents** or the employee creation form. Files are stored in GridFS; PDFs, supported images and videos are checked by content signature and limited to 20 MB. Employee document and photo downloads require authentication and exact employee ownership. Employees have no document upload/edit/delete endpoint. The owner can view and download documents through authenticated requests.

Employees use **Apply Leave** for whole-day ranges and **Permission Requests** for time away within a day. Requests are always created as Pending; only the main business user can approve or reject them. Approval screens are available under **Leave → Permissions** and **Leave Requests**. Monthly filters use the Indian business month, with overlapping leave dates included.

Attendance check-in/out uses server dates/times and the employee's authenticated identity; browser geolocation is required. Duplicate check-in/out submissions are rejected. GPS coordinates supplied by a browser are not a hardware-based presence attestation.

## Local demo data

`npm run seed:employee-month -- --as-of=2026-11-11` previews the operation. Add `--apply` to insert missing demo rows. The script refuses production and any database other than `gobook_local_demo` on local MongoDB port 27018. It targets only existing employees with demo email addresses, does not create predictable passwords and does not replace existing business records.

Applied locally for 20 demo employees: 600 attendance rows for **12 October–10 November 2026**, 20 sample leaves, 20 permission requests, 20 pending payroll records, 20 attendance corrections and one clearly labelled demo company holiday. Today is left available for real check-in testing. Passwords remain under the administrator's control.

## Validation

`SECURITY_TEST_MONGODB_URI` enables the isolated `employeePortalAccess.integration.test.js` HTTP tests. They exercise owner password configuration, employee login, read-only profile access, private documents/photos, permission approval, attendance, QR reset and old-session revocation. Test databases use a unique `gobook_employee_access_test_*` name and are removed after the tests.

Frontend QR tests encode a PNG and decode it back to the exact employee URL. Cloudflare human verification remains dependent on real Turnstile keys; see `authentication-security.md` for activation.

Latest checks: 37 focused backend/month/security tests passed, including real MongoDB HTTP integration; 357 frontend tests passed, including scoped portal rendering and QR decoding; production build passed. The full backend suite has two existing deployment-only failures (missing root deployment guidance and a production-domain CORS assertion against the local development environment); see `runtime/employee-portal-full-backend-tests.log`. The local security-config and generated employee-link endpoints both returned HTTP 200.
