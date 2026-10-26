# Janet engagement security

Applied to project `yydyiugejilizqyowrgn` on 2026-10-26.

Local guests retain the existing sign-in flow. `scripts/supabase-config.js` creates a
256-bit random browser credential, persists it as `janet_guest_token_v1`, and uses
`guest_` plus its SHA-256 hash as the public guest ID. Only Janet REST requests
receive the `x-janet-guest-token` header. Never render or log the credential.

Database RLS independently derives the ID from that header. Inserts must match the
verified browser or authenticated user. Comment updates can change only
`is_deleted`; reactions can be removed only by their owner. Deleted comments are
visible only to their verified author. No SECURITY DEFINER function is added.

Historical guest IDs had no secret. Existing rows and names are preserved, but
those old rows cannot be securely claimed by a browser. They remain readable and
can be moderated administratively. Losing browser storage also loses the ability
to remove that browser's prior guest interactions. This is a browser credential,
not proof of a real-world identity or a replacement for spam controls.

Checks:

```sh
node scripts/test-guest-identity.mjs
```

Run `tests/secure_guest_engagement.sql` through an administrative SQL session to
test real RLS with two guests, two existing user IDs, forged identities, soft
deletion, and column privileges. Every fixture is in one rolled-back transaction;
no existing user or interaction is changed.

`rollback/secure_guest_engagement.sql` records the exact prior policies for
emergency recovery. It restores insecure permissions and must not be applied as a
routine rollback. Prefer a forward fix. The migration was generated with
`supabase@2.122.0 migration new secure_guest_engagement` and applied through the
Supabase connector.
