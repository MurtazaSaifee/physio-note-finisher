const waitMs = 10_000;
console.log(`Waiting ${waitMs}ms so the voice upload meets the backend minimum duration.`);

try {
  Java.type("java.lang.Thread").sleep(waitMs);
} catch {
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    // Busy wait fallback for JS runtimes without Java interop.
  }
}
