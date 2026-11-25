import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_ROOT = join(process.cwd(), "src");
const PRISMA_CLIENT_PATH = join(SOURCE_ROOT, "data", "prismaClient.ts");

function listTypeScriptFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const absolutePath = join(root, entry);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      return listTypeScriptFiles(absolutePath);
    }

    return absolutePath.endsWith(".ts") ? [absolutePath] : [];
  });
}

function extractConstStringArray(source: string, constName: string): string[] {
  const pattern = new RegExp(
    `const ${constName} = \\[((?:.|\\n)*?)\\] as const`,
    "m",
  );
  const match = source.match(pattern);

  if (!match) {
    throw new Error(`Could not find ${constName} in prismaClient.ts`);
  }

  return Array.from(match[1].matchAll(/"([^"]+)"/g), ([, value]) => value);
}

function collectPrismaPropertyUsage(fileContents: string): Set<string> {
  return new Set(
    Array.from(
      fileContents.matchAll(/\b(?:prisma|tx)\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/g),
      ([, modelName, methodName]) => `${modelName}.${methodName}`,
    ),
  );
}

describe("prisma fallback contract", () => {
  it("covers every Prisma model and method used by backend source in no-DATABASE_URL mode", () => {
    const prismaClientSource = readFileSync(PRISMA_CLIENT_PATH, "utf8");
    const fallbackModelNames = new Set(
      extractConstStringArray(prismaClientSource, "FALLBACK_MODEL_NAMES"),
    );
    const fallbackModelMethods = new Set(
      extractConstStringArray(prismaClientSource, "FALLBACK_MODEL_METHODS"),
    );

    const missingEntries: string[] = [];

    for (const filePath of listTypeScriptFiles(SOURCE_ROOT)) {
      const source = readFileSync(filePath, "utf8");

      for (const propertyUsage of collectPrismaPropertyUsage(source)) {
        const [modelName, methodName] = propertyUsage.split(".");

        if (!fallbackModelNames.has(modelName)) {
          missingEntries.push(`${modelName} (used in ${filePath})`);
        }

        if (!fallbackModelMethods.has(methodName)) {
          missingEntries.push(`${modelName}.${methodName} (used in ${filePath})`);
        }
      }
    }

    if (prismaClientSource.includes("$transaction")) {
      expect(prismaClientSource).toContain("$transaction: async");
    }

    expect(missingEntries).toEqual([]);
  });
});
