import { beforeEach, describe, expect, it } from "vitest";

import type { QueuedChange } from "../../../../shared/contracts/offline";
import {
  getDeadLetterChanges,
  saveDeadLetterChange,
  saveDraft,
  setMmkvImplementation,
} from "./queueStore";

function createMemoryStore() {
  const values = new Map<string, string>();
  return {
    values,
    adapter: {
      set(key: string, value: string) {
        values.set(key, value);
      },
      getString(key: string) {
        return values.get(key);
      },
      delete(key: string) {
        values.delete(key);
      },
    },
  };
}

function queuedChange(id: string): QueuedChange {
  return {
    id,
    type: "noteEdit",
    sessionId: "session-1",
    patientId: "patient-1",
    timestamp: Date.now(),
    sections: {
      subjective: "Subjective",
      objective: "Objective",
      assessment: "Assessment",
      plan: "Plan",
    },
  };
}

describe("offline clinical-data retention", () => {
  beforeEach(() => {
    setMmkvImplementation(null);
  });

  it("indexes a draft before committing its clinical payload", () => {
    const writes: string[] = [];
    const store = createMemoryStore();
    setMmkvImplementation({
      ...store.adapter,
      set(key, value) {
        writes.push(key);
        store.adapter.set(key, value);
      },
    });

    saveDraft("session-1", {
      subjective: "Subjective",
      objective: "Objective",
      assessment: "Assessment",
      plan: "Plan",
    });

    expect(writes[0]).toBe("physio.offline.draftIndex");
    expect(writes[1]).toBe("physio.offline.draft.session-1");
  });

  it("caps retained dead-letter records", () => {
    const store = createMemoryStore();
    setMmkvImplementation(store.adapter);

    for (let index = 0; index < 101; index += 1) {
      saveDeadLetterChange(queuedChange(`change-${index}`), "sync failed");
    }

    expect(getDeadLetterChanges()).toHaveLength(100);
    expect(getDeadLetterChanges()[0]?.item.id).toBe("change-1");
  });
});
