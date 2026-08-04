# If the database leaks

A note to myself, written calmly so it can be followed in a hurry. The GDPR clock
starts the moment I **become aware** of a breach, not when it happened, and it runs
for **72 hours**. That is not enough time to also be working out who to contact.

A "breach" is not only a hacker. It counts if data is exposed, destroyed, altered or
lost — a leaked `DATABASE_URL`, a public backup, a bad query that wipes rows, an
account taken over, a laptop lost while logged in.

## Hour 0 — stop it getting worse

1. Rotate whatever leaked. In Vercel → Project → Settings → Environment Variables:
   `DATABASE_URL`, `JWT_ACCESS_SECRET`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`,
   the Upstash tokens. Redeploy so the new values take effect.
2. Sign everyone out if login may be affected: bump `tokenVersion` for all users.
   Every refresh token stops working at once (see the auth session design note).
3. Do NOT delete logs. They are the evidence for what follows, and destroying them
   looks far worse than the breach.

## Hour 1 — write down what I know

Keep it in one file, timestamped, updated as I learn more. Regulators care about this
existing more than about it being complete on day one.

- When did it start, when did I notice, how did I notice?
- Which tables? Which fields?
- How many people, roughly?
- Is it still happening?

**What Cinephilers actually holds**, so I do not overstate or understate it:
email address, username, bcrypt password hash, avatar URL, bio, country, and viewing
activity (watchlist, ratings, reviews, watch history). Email verification and password
reset tokens are stored as SHA-256 digests, never raw. **No payment data — we take no
payments.** Passwords are hashed, so a leak is not the same as passwords being usable,
but it must still be treated as credentials at risk.

## Within 72 hours — notify the regulator

Because I am established in Albania rather than the EU, but offer the service to
people in the EU, the reporting route is not the one-stop-shop a EU company uses.
**Confirm this at the time — do not assume it from this note.** Practically:

- Albania: the Information and Data Protection Commissioner (IDP), idp.al.
- EU users: report to the supervisory authority of a member state where affected users
  are. Ireland's DPC and the Dutch AP both publish breach forms that accept
  non-EU controllers.

Report even if unsure. A report that turns out to be unnecessary costs nothing. A
missed one is a separate violation from the breach itself.

## Also within 72 hours — tell the users, if the risk is high

Required when the breach is likely to result in a **high risk** to people. Password
hashes or email addresses leaking generally clears that bar for an account-based app.

Send it via Resend, from support@cinephilers.app, in plain language:

- What happened, and when.
- Exactly what data — no hedging, no "may have included" if I know.
- What I have already done.
- What they should do: change their password, and change it anywhere they reused it.
- A real address for questions: support@cinephilers.app.

No PR voice. No "we take your privacy seriously". Say what happened.

## Afterwards

- Write down the cause and the fix, in the repo, in a commit.
- Ask what would have caught it sooner.
- Consider whether the data needed to exist at all. The cheapest breach is of data
  never collected.

## Standing reminders

- Never commit `.env.local`. Secrets live in Vercel.
- Neon holds the data in the EU (Frankfurt), which is a good answer to have ready.
- If Cinephilers ever takes money, revisit incorporating — today the controller is me,
  personally, with no company between us.
