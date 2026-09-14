# Piece 4: tenant admin profile (`/settings/profile`) + password change

Piece id `mt2-piece-4`. Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-2-profile`
(branch `feat/mt-panel-2-profile`). Ports: backend 9027, panel 5182, seam PORT 9041. Read
`artifacts/prompts/2026-09-12-tenant-panel-common.md` first, then the contract section "Piece 4".

Build:
1. Backend: `POST /tenants/me` (first_name, last_name, metadata) and `POST /tenants/me/password`
   (current_password, new_password) as the contract says. Validators in `api/tenants/validators.ts`
   (zod, like `PostTenantCreateSchema`), matchers under the `// ---- piece 4` anchor in
   `src/api/middlewares.ts`. Measure the auth module API you use (cite the `.d.ts` line in the report);
   wrong current password → 401, never 404.
2. Panel: copy `routes/profile/profile-detail` and `routes/profile/profile-edit` verbatim; wire
   `/settings/profile` (+ `edit` child) in `app.tsx` at the piece-4 anchor (replace the not-built
   stub). `hooks/api/users.tsx`: add `useUpdateUser` → `POST /tenants/me` (invalidate `me`). Add a
   "Change password" section below the profile details (own component under
   `routes/profile/profile-detail/components/change-password-section`, using the Admin's Form/Input/
   Button primitives) that posts to `/tenants/me/password` and shows the Admin's toast pattern.
   Language select stays (it writes `metadata.language`); "usage insights" block: keep verbatim if it
   compiles, else remove with a comment.
3. Seam tests: update name → GET /tenants/me reflects it; password change with wrong current → 401;
   with right current → next `POST /auth/tenant/emailpass` with the new password → 200 and the old →
   401; tenant B's token cannot change tenant A (there is no id in the route, so prove that B's change
   leaves A's login intact).
4. e2e: from the user menu open Profile, edit first name, see it in the shell; change password, log
   out, log in with the new one; restore the original password at the end.
5. Screenshot pair `profile` (Admin `/app/settings/profile` vs panel `/settings/profile`) and
   `profile-edit`.
