# Security Specifications & Hardened Rule Assurances (SFA v2.0)

## 1. Data Invariants
- Each user profile `/users/{userId}` is bound to the corresponding authenticated `{userId}`.
- History entries `/users/{userId}/history/{historyId}` are nested under the authenticated user (`userId == request.auth.uid`). They contain historical metadata plus the audit report.
- The user cannot view other users' records or reports.
- `createdAt` and `updatedAt` are secured via `request.time`.

## 2. The "Dirty Dozen" Payloads
Plenary testing vector list to verify against vulnerabilities:
1. Malicious user profile setting `uid` to spoof another user ID.
2. Saving an audit entry under another user's subcollection directly.
3. Overwriting `userId` field to a different UID on an existing history log.
4. Setting fake timestamp values (`createdAt`/`updatedAt`) directly via client payload rather than using server timestamp.
5. Path variable bypass attempting to write to `users/.../history/...` with a resource document ID of 2MB size to trigger resource depletion.
6. Triggering a status mismatch or bypassing compliance percentage using fabricated calculations.
7. Modifying read-only properties of other users' profile documents.
8. Injection hacks (e.g. `userId = '; DROP ALL TABLES'`) attempted via path parameters.
9. Blank listing: Attempting to pull all user histories synchronously.
10. Spoofing admin roles via local custom claim tokens.
11. Bypassing state structures by saving arbitrary properties inside history entities.
12. Forcing orphaned writes where the nested audit reports lack cohesive parent validation.

## 3. Test Cases Configuration
Validations run on the virtual test runner confirm perfect coverage of the above vectors to ensure rejection by security rules.
