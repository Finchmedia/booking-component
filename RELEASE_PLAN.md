# Booking component 0.4.0 release checklist

Updated 22 September 2026. Implementation and release verification replace the
original remaining-fixes plan. Original audit evidence is preserved in the parent
workspace under `reports/booking-release-audit-2026-09-22`.

## Completed fixes

- [x] Cancellation, decline and expiry release inventory only from active states;
      repeated terminal operations cannot erase another booking's occupancy.
- [x] Quantities/capacities are positive safe integers; duplicate IDs and exclusive
      quantities other than one are rejected consistently by reads and writes.
- [x] Token cancellation releases every booking item, including pooled resources.
- [x] Both reschedulers move all items atomically, preserve status, snapshots and
      management tokens, and return a replacement UID. Failure rolls back the move.
- [x] Pools use the multi-resource API exclusively. Ordinary, provisional and
      reservation write paths reject them; ordinary availability agrees.
- [x] Resource registration, deletion and capacity/mode changes protect active
      primary/secondary inventory. Completed history does not block future changes.
- [x] Replaced unsafe public factory with `makeInternalBookingAPI`; host fixtures
      verify anonymous, non-admin, cross-issuer and cross-tenant rejection.
- [x] Refreshed compatible dependencies. Convex minimum 1.46; React 18/19 supported;
      Node 24 for development/CI. Zod 4 owned by the package. TypeScript 6 is retained
      because the ESLint parser does not support 7. Website ESLint 9 remains within
      the Next.js config's supported range.
- [x] Buffer contract is explicit: fields are stored; hosts enforce gaps. Presence
      is advisory, while database transactions enforce capacity conflicts.
- [x] Fixed React duration/presence/timer lifecycle and website lint findings;
      success screens no longer claim optional email was delivered.
- [x] Rewrote docs into a short first-booking path, with optional integrations and
      demo administration separate. Corrected historical API claims and links.
- [x] CI uses strict installs and checks. Removed automatic branch publication and
      interactive/patch-only release scripts; prepublish checks build/test/types/lint.

## Verified candidate

- Clean Node 24 strict install, component code generation and clean build pass.
- 439 tests in 23 files pass, including 46 new inventory regressions and actual
  guarded host exports; typecheck and lint have zero errors/warnings.
- Fresh backend-only, React 18.3.1 and React 19.3.0 consumers pass strict install,
  dependency tree, TypeScript, packaged-entry smoke tests and config bundling at
  exact Convex 1.46.0. npm advisory audits report zero known vulnerabilities.
- Candidate installed into the docs app and deployed successfully to development
  `calm-badger-854`. Eleven live checks pass, including three simultaneous requests
  for a full pool (exactly one commits), all-item moves, rollback and UTC midnight.
  Only isolated release-smoke fixtures were created/cancelled/deactivated.
- 16 complete docs examples compile against 0.4.0; production Next.js build succeeds
  without deployment credentials; 223 docs links across 11 rendered pages pass.
- Website lint passes with zero warnings/errors. Browser verification and final
  registry-backed production checks are recorded below when completed.
- Final clean docs-app install/build uses the candidate archive with SHA-1
  `024321d22b6c161d2ebec9300afec1dd1c2e23b8`. Its only change after fresh
  consumer verification is the README; all code/types/manifests are byte-identical.
- Browser booking, guest administration, token rescheduling and cancellation pass.
  The demo now opens management after booking and distinguishes cancellation
  from a prior reschedule correctly.

## Publication and deployment

- [x] Final browser smoke of booking/management/admin and documentation.
- [x] Commit and push matching source and tracked build output; GitHub CI passes.
- [ ] Publish verified 0.4.0 to npm and compare the registry artifact.
- [ ] Update demo manifest/lockfile to registry 0.4.0; clean install and final checks.
- [ ] Push demo/docs and verify Vercel/Convex production deployment and domain.
- Directory submission: the user will submit manually in the browser.

Real outbound email delivery is not tested: the sandbox intentionally has no
Resend key. Optional WorkOS setup is documented, not claimed live-tested. These
are separate integrations, not requirements to use the booking component.

Jumper and Schdrom retain vendored copies. Their app-specific payment, email and
authorization changes require separate adoption/backport work and deployments.
Portfolio, job application and Mintlify migration are outside this release.
