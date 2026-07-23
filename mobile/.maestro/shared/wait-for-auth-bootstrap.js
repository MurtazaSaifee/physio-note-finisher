const waitMs = 5_000;
console.log(`Waiting ${waitMs}ms for auth bootstrap to settle.`);

try {
  Java.type("java.lang.Thread").sleep(waitMs);
} catch {
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    // Busy wait fallback for JS runtimes without Java interop.
  }
}
