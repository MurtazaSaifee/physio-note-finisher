# Case study: offline drafts on a phone

**Problem.** Clinic Wi-Fi drops. A note written during a dead spot must not vanish,
and clinical text left on a shared phone must not outlive the session.

**Design** ([`queueStore.ts`](../../mobile/features/offline/storage/queueStore.ts),
[`syncService.ts`](../../mobile/features/offline/services/syncService.ts)):

- Drafts and queued mutations are stored in Expo SecureStore (Android Keystore
  backed), chunked to fit its value limit.
- A draft's id is indexed *before* its payload is written, so cleanup can always
  find partial writes.
- Connectivity changes trigger replay of the queue. The UI shows pending and
  failed changes instead of pretending they synced.
- Failed mutations move to a dead-letter list capped at 100 records that ages out
  after 30 days.
- Logout clears in-memory auth first, revokes the server session when reachable,
  then removes tokens, drafts and queues. Chunks are overwritten before the
  asynchronous delete, so a failed delete doesn't leave clinical text behind.

**Limits.** No claim of zero data loss or a fixed reconnect time; those need
device-level testing beyond the committed suite. Voice and AI stay online-only.
