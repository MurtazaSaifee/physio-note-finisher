import { Prisma } from "@prisma/client";

import { prisma } from "../../data/prismaClient.js";
import type {
  SoapSections,
  TemplateApplyMode,
  TemplateCategory,
} from "../../../../shared/contracts/notes.js";
import { CONDITION_TEMPLATES } from "./builtInTemplates.js";

export type TemplateSource = "built_in" | "custom";

export type TemplateProvenanceSnapshot = {
  templateLabel: string | null;
  categoryLabels: TemplateCategory[];
  source: TemplateSource | null;
  applyMode: TemplateApplyMode | null;
};

export type CustomTemplateRecord = {
  id: string;
  name: string;
  source: "custom";
  categories: TemplateCategory[];
  sections: SoapSections;
  createdAt: string;
  updatedAt: string;
};

export type CustomTemplateCategoryRecord = {
  id: string;
  label: TemplateCategory;
  createdAt: string;
  updatedAt: string;
};

export class TemplateNotFoundError extends Error {
  constructor() {
    super("Template not found");
    this.name = "TemplateNotFoundError";
  }
}

export class TemplateCategoryNotFoundError extends Error {
  constructor() {
    super("Template category not found");
    this.name = "TemplateCategoryNotFoundError";
  }
}

type CategoryRow = Prisma.CustomTemplateCategoryGetPayload<{
  select: {
    id: true;
    label: true;
    createdAt: true;
    updatedAt: true;
  };
}>;

type TemplateRow = Prisma.CustomTemplateGetPayload<{
  include: {
    categories: {
      include: {
        category: {
          select: {
            label: true;
          };
        };
      };
    };
  };
}>;

function normalizeSections(input: SoapSections): SoapSections {
  const normalize = (value: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

  return {
    subjective: normalize(input.subjective),
    objective: normalize(input.objective),
    assessment: normalize(input.assessment),
    plan: normalize(input.plan),
  };
}

function toCategoryRecord(row: CategoryRow): CustomTemplateCategoryRecord {
  return {
    id: row.id,
    label: row.label as TemplateCategory,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTemplateRecord(row: TemplateRow): CustomTemplateRecord {
  return {
    id: row.id,
    name: row.name,
    source: "custom",
    categories: row.categories.map((item) => item.category.label as TemplateCategory),
    sections: {
      subjective: row.subjective,
      objective: row.objective,
      assessment: row.assessment,
      plan: row.plan,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireOwnedTemplate(input: {
  tx: Prisma.TransactionClient;
  clinicId: string;
  userId: string;
  templateId: string;
}): Promise<void> {
  const exists = await input.tx.customTemplate.findFirst({
    where: {
      id: input.templateId,
      clinicId: input.clinicId,
      ownerUserId: input.userId,
    },
    select: { id: true },
  });

  if (!exists) {
    throw new TemplateNotFoundError();
  }
}

export async function listTemplateCategories(input: {
  clinicId: string;
  userId: string;
}): Promise<CustomTemplateCategoryRecord[]> {
  const rows = await prisma.customTemplateCategory.findMany({
    where: {
      clinicId: input.clinicId,
      ownerUserId: input.userId,
    },
    orderBy: [{ updatedAt: "desc" }, { label: "asc" }],
    select: {
      id: true,
      label: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map(toCategoryRecord);
}

export async function createTemplateCategory(input: {
  clinicId: string;
  userId: string;
  label: TemplateCategory;
}): Promise<CustomTemplateCategoryRecord> {
  const row = await prisma.customTemplateCategory.upsert({
    where: {
      clinicId_ownerUserId_label: {
        clinicId: input.clinicId,
        ownerUserId: input.userId,
        label: input.label,
      },
    },
    update: {},
    create: {
      clinicId: input.clinicId,
      ownerUserId: input.userId,
      label: input.label,
    },
    select: {
      id: true,
      label: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return toCategoryRecord(row);
}

export async function renameTemplateCategory(input: {
  clinicId: string;
  userId: string;
  categoryId: string;
  label: TemplateCategory;
}): Promise<CustomTemplateCategoryRecord> {
  const updated = await prisma.customTemplateCategory.updateMany({
    where: {
      id: input.categoryId,
      clinicId: input.clinicId,
      ownerUserId: input.userId,
    },
    data: {
      label: input.label,
    },
  });

  if (updated.count === 0) {
    throw new TemplateCategoryNotFoundError();
  }

  const row = await prisma.customTemplateCategory.findFirstOrThrow({
    where: {
      id: input.categoryId,
      clinicId: input.clinicId,
      ownerUserId: input.userId,
    },
    select: {
      id: true,
      label: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return toCategoryRecord(row);
}

export async function deleteTemplateCategory(input: {
  clinicId: string;
  userId: string;
  categoryId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const category = await tx.customTemplateCategory.findFirst({
      where: {
        id: input.categoryId,
        clinicId: input.clinicId,
        ownerUserId: input.userId,
      },
      select: { id: true, label: true },
    });

    if (!category) {
      throw new TemplateCategoryNotFoundError();
    }

    const affectedLinks = await tx.customTemplateCategoryLink.findMany({
      where: { categoryId: input.categoryId },
      select: {
        templateId: true,
        template: {
          select: {
            categories: {
              select: { categoryId: true },
            },
          },
        },
      },
    });

    const singleCategoryTemplateIds = affectedLinks
      .filter((link) => link.template.categories.length <= 1)
      .map((link) => link.templateId);

    if (singleCategoryTemplateIds.length > 0) {
      const fallbackLabel = category.label === "General" ? "Uncategorized" : "General";
      const [fallbackCategoryId] = await ensureCategoriesInTransaction({
        tx,
        clinicId: input.clinicId,
        userId: input.userId,
        labels: [fallbackLabel],
      });
      if (!fallbackCategoryId) {
        throw new TemplateCategoryNotFoundError();
      }

      await tx.customTemplateCategoryLink.createMany({
        data: singleCategoryTemplateIds.map((templateId) => ({
          templateId,
          categoryId: fallbackCategoryId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.customTemplateCategory.delete({
      where: {
        id_clinicId: {
          id: input.categoryId,
          clinicId: input.clinicId,
        },
      },
    });
  });
}

async function ensureCategories(input: {
  clinicId: string;
  userId: string;
  labels: TemplateCategory[];
}): Promise<string[]> {
  const ids: string[] = [];
  for (const label of input.labels) {
    const category = await createTemplateCategory({
      clinicId: input.clinicId,
      userId: input.userId,
      label,
    });
    ids.push(category.id);
  }
  return ids;
}

async function ensureCategoriesInTransaction(input: {
  tx: Prisma.TransactionClient;
  clinicId: string;
  userId: string;
  labels: TemplateCategory[];
}): Promise<string[]> {
  const ids: string[] = [];
  for (const label of input.labels) {
    const category = await input.tx.customTemplateCategory.upsert({
      where: {
        clinicId_ownerUserId_label: {
          clinicId: input.clinicId,
          ownerUserId: input.userId,
          label,
        },
      },
      update: {},
      create: {
        clinicId: input.clinicId,
        ownerUserId: input.userId,
        label,
      },
      select: { id: true },
    });
    ids.push(category.id);
  }
  return ids;
}

export async function listCustomTemplates(input: {
  clinicId: string;
  userId: string;
  query?: string;
  category?: TemplateCategory;
  limit?: number;
}): Promise<CustomTemplateRecord[]> {
  const query = input.query?.trim();

  const rows = await prisma.customTemplate.findMany({
    where: {
      clinicId: input.clinicId,
      ownerUserId: input.userId,
      ...(input.category
        ? {
            categories: {
              some: {
                category: {
                  label: input.category,
                },
              },
            },
          }
        : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { subjective: { contains: query, mode: "insensitive" } },
              { objective: { contains: query, mode: "insensitive" } },
              { assessment: { contains: query, mode: "insensitive" } },
              { plan: { contains: query, mode: "insensitive" } },
              {
                categories: {
                  some: {
                    category: {
                      label: { contains: query, mode: "insensitive" },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      categories: {
        include: {
          category: {
            select: {
              label: true,
            },
          },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    ...(input.limit && input.limit > 0 ? { take: input.limit } : {}),
  });

  return rows.map(toTemplateRecord);
}

export async function createCustomTemplate(input: {
  clinicId: string;
  userId: string;
  name: string;
  categories: TemplateCategory[];
  sections: SoapSections;
}): Promise<CustomTemplateRecord> {
  const categoryIds = await ensureCategories({
    clinicId: input.clinicId,
    userId: input.userId,
    labels: input.categories,
  });

  const row = await prisma.customTemplate.create({
    data: {
      clinicId: input.clinicId,
      ownerUserId: input.userId,
      name: input.name.trim(),
      source: "custom",
      ...normalizeSections(input.sections),
      categories: {
        create: categoryIds.map((categoryId) => ({
          category: {
            connect: {
              id_clinicId: {
                id: categoryId,
                clinicId: input.clinicId,
              },
            },
          },
        })),
      },
    },
    include: {
      categories: {
        include: {
          category: {
            select: {
              label: true,
            },
          },
        },
      },
    },
  });

  return toTemplateRecord(row);
}

export async function updateCustomTemplate(input: {
  clinicId: string;
  userId: string;
  templateId: string;
  name?: string;
  categories?: TemplateCategory[];
  sections?: SoapSections;
}): Promise<CustomTemplateRecord> {
  const row = await prisma.$transaction(async (tx) => {
    await requireOwnedTemplate({
      tx,
      clinicId: input.clinicId,
      userId: input.userId,
      templateId: input.templateId,
    });

    const categoryIds = input.categories
      ? await ensureCategoriesInTransaction({
          tx,
          clinicId: input.clinicId,
          userId: input.userId,
          labels: input.categories,
        })
      : null;

    if (categoryIds) {
      await tx.customTemplateCategoryLink.deleteMany({
        where: {
          templateId: input.templateId,
        },
      });
    }

    await tx.customTemplate.updateMany({
      where: {
        id: input.templateId,
        clinicId: input.clinicId,
        ownerUserId: input.userId,
      },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.sections !== undefined ? normalizeSections(input.sections) : {}),
      },
    });

    if (categoryIds) {
      await tx.customTemplateCategoryLink.createMany({
        data: categoryIds.map((categoryId) => ({
          templateId: input.templateId,
          categoryId,
        })),
      });
    }

    return tx.customTemplate.findFirstOrThrow({
      where: {
        id: input.templateId,
        clinicId: input.clinicId,
        ownerUserId: input.userId,
      },
      include: {
        categories: {
          include: {
            category: {
              select: {
                label: true,
              },
            },
          },
        },
      },
    });
  });

  return toTemplateRecord(row);
}

export async function deleteCustomTemplate(input: {
  clinicId: string;
  userId: string;
  templateId: string;
}): Promise<void> {
  const deleted = await prisma.customTemplate.deleteMany({
    where: {
      id: input.templateId,
      clinicId: input.clinicId,
      ownerUserId: input.userId,
    },
  });

  if (deleted.count === 0) {
    throw new TemplateNotFoundError();
  }
}

export async function resolveTemplateSnapshot(input: {
  clinicId: string;
  userId: string;
  templateKey: string | null | undefined;
  applyMode?: TemplateApplyMode | null;
}): Promise<TemplateProvenanceSnapshot> {
  if (!input.templateKey) {
    return {
      templateLabel: null,
      categoryLabels: [],
      source: null,
      applyMode: input.applyMode ?? null,
    };
  }

  const custom = await prisma.customTemplate.findFirst({
    where: {
      id: input.templateKey,
      clinicId: input.clinicId,
      ownerUserId: input.userId,
    },
    include: {
      categories: {
        include: {
          category: {
            select: {
              label: true,
            },
          },
        },
      },
    },
  });

  if (custom) {
    return {
      templateLabel: custom.name,
      categoryLabels: custom.categories.map(
        (item) => item.category.label as TemplateCategory,
      ),
      source: "custom",
      applyMode: input.applyMode ?? null,
    };
  }

  const builtIn = CONDITION_TEMPLATES.find((t) => t.key === input.templateKey);

  return {
    templateLabel: builtIn ? builtIn.label : null,
    categoryLabels: builtIn ? (builtIn.categories ?? [builtIn.category]) : [],
    source: "built_in",
    applyMode: input.applyMode ?? null,
  };
}
