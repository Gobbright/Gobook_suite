# Authentication and payment security

App users, sub-users and employee logins have an absolute maximum session lifetime of seven days. Platform admin sessions keep the existing shorter eight-hour default. `JWT_EXPIRES_IN` and `ADMIN_JWT_EXPIRES_IN` can shorten sessions; values above seven days are capped. Updating a profile, verifying email, exchanging an HR token or completing a payment preserves the original login time. Session activity never extends the deadline.

Every protected app request checks the session, the current account status, the password fingerprint and current database permissions. Password changes invalidate existing sessions. Admin and employee tokens have separate scopes and revocable server sessions. Employee-management administration requires a current company-owner session or a current HR/admin employee role; an ordinary sub-user cannot exchange their token for HR administrator access. Deploying this change requires existing users to sign in again.

## Enable “I’m not a robot” verification

1. Open [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/), add a widget and choose **Managed** mode.
2. Add the actual frontend hostnames, including both apex and `www` if used. Add `localhost` to a development widget when testing locally.
3. Set these backend environment variables:

   ```dotenv
   TURNSTILE_ENABLED=true
   TURNSTILE_SITE_KEY=your_real_site_key
   TURNSTILE_SECRET_KEY=your_real_secret_key
   TURNSTILE_HOSTNAMES=your-domain.com,www.your-domain.com,localhost
   ```

4. Restart the backend. The frontend fetches the public widget configuration automatically; the secret must never be placed in frontend environment variables.
5. Verify normal user, admin and employee login, registration, email-login OTP requests and password recovery. A dialog requests human verification before submission. Expired, reused, wrong-hostname and wrong-action tokens are rejected by the server.

Production requires real keys and cannot disable verification with `TURNSTILE_ENABLED=false`. Development without keys leaves verification disabled so existing local login remains usable; this is not active bot protection. Captcha reduces automated abuse; it cannot guarantee that all AI agents or bots are blocked.

## Deployment

The frontend tolerates older APIs that return 401 or 404 for the public `/api/auth/security-config` route, allowing the actual authentication endpoint to apply its policy. It still stops on configuration outages, rate limits, malformed configuration and failed challenges. This compatibility behavior does not enable Turnstile on an older backend; deploy the current backend with real keys for that protection. `frontend/scripts/checkLiveDeployment.mjs` now requires the public configuration route and verifies that CORS accepts the human-verification header, so a healthy database alone cannot pass the release check.

1. Configure Turnstile and existing Razorpay/SMTP/HTTPS settings. Restrict direct access to the API behind the trusted reverse proxy and set `TRUST_PROXY_HOPS` to match the deployment, or zero with no proxy. This is necessary for trustworthy IP-based limits.
2. Preview legacy password removal: `npm run security:migrate`. This prints counts only.
3. Apply: `npm run security:migrate -- --apply`. It removes stored plaintext employee passwords, preserves password hashes, creates session/rate-limit indexes and revokes legacy sessions without a credential fingerprint. Run this against each intended environment using its own backend configuration. Include existing database backups/exports in the organization's credential-retention cleanup; the migration only changes the connected live database.
4. Run `npm run check:production`, backend tests, frontend tests and the frontend production build with the intended public API URL. Deploy backend and frontend together. Existing in-progress registration checkouts must be restarted because they lack the new signup proof.

Razorpay checkout validation uses the server-stored order, HMAC signature, captured payment, amount and currency. Public registration additionally requires an expiring one-time signup proof, stored only as a hash. A replayed checkout response cannot create another login session. Browser failure reports are advisory and cannot change payment status. Webhooks are authenticated against the exact raw body; late failure events cannot downgrade a processing/successful payment.

Rate limits are stored in MongoDB and shared between API instances. Authentication attempts have IP and IP/account limits; OTP sends and payment endpoints have additional limits. Password-reset OTP attempts and consumption use atomic database operations.

Browser bearer tokens still use the existing local storage architecture. Protect the frontend against XSS and avoid untrusted scripts; these changes are not a full penetration test or an HttpOnly-cookie migration. Edge WAF/DDOS controls, admin MFA and a security review of deployment infrastructure remain separate work.

## Regression checks

`node scripts/runTests.js tests/securityHardening.test.js tests/productionConfig.test.js tests/emailOtpLogin.test.js tests/googleLogin.test.js tests/tenantSecurity.test.js`

For real database concurrency/session tests, set `SECURITY_TEST_MONGODB_URI` to a local MongoDB instance and run `node scripts/runTests.js tests/securityHardening.integration.test.js`. The tests create and remove their own uniquely named `gobook_security_test_*` database, leaving application data untouched.

## Verification in this workspace

- Frontend: 350 tests passed; production build passed. Lint reports no errors and one existing React hook dependency warning in `LoginPage.jsx`.
- Full backend suite: 333 passed, 13 skipped, two unrelated deployment checks failed: the workspace lacks root `AWS_DEPLOYMENT.md`, and a deployed-domain CORS assertion conflicts with the local development `.env`. Details: `backend/runtime/security-hardening-backend-tests.log`.
- Real MongoDB security integration: all five tests passed, including concurrent OTP consumption and shared rate limiting.
- Production-mode HTTP accounting integration passed with isolated database fixtures, exercising authenticated access, current permissions, tenant isolation and accounting writes. No live payment or real Turnstile challenge was run.
- Applied credential cleanup only to `gobook_local_demo`: removed 20 legacy employee password fields and revoked one legacy app session. Follow-up migration preview found zero remaining plaintext password fields.
- Live deployment and real Turnstile activation remain pending. Add the real keys before deploying; production deliberately refuses missing verification configuration.
