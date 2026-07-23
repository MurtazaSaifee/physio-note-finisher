# Case study: offline draft resilience

The mobile application stores draft SOAP sections and queued mutations through Expo SecureStore. Connectivity monitoring triggers queued synchronization when the API becomes reachable again.

The design makes several bounded guarantees:

- Draft payloads are indexed before being written so cleanup can discover partial saves.
- Queued changes are bounded to prevent unlimited local growth.
- Failed mutations retained for inspection or retry are capped at 100 records and age out after 30 days.
- Logout clears in-memory access first, revokes the server session when reachable, and performs best-effort cleanup of refresh tokens, drafts and queues.
- SecureStore chunks are overwritten before asynchronous deletion so failed deletion does not leave the clinical payload behind.

The repository does not claim zero data loss, a fixed reconnection latency or measured storage sizes; those require device-specific validation beyond the committed regression suite.
