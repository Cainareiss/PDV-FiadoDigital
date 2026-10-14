import { PAYMENT_METHODS } from "@pdv/shared";
import { prisma } from "../config/database.js";

type SortDirection = "asc" | "desc";

type StockSortKey = "name" | "type" | "brand" | "stock" | "average_cost" | "stock_value";

type StockSummaryRow = {
  is_bulk: boolean;
  stock_quantity: number;
  min_stock_alert: number;
  average_cost_cents: number;
  stock_value_cents: number;
  product_type: {
    name: string;
  } | null;
};

function resolveEffectiveAverageCostCents(averageCostCents: number, costPriceCents: number): number {
  return averageCostCents > 0 ? averageCostCents : costPriceCents;
}

function calculateWeightedAverageCostCents(rows: StockSummaryRow[]): number {
  const weightedBase = rows.reduce((acc, item) => acc + item.stock_quantity * item.average_cost_cents, 0);
  const weightedStock = rows.reduce((acc, item) => acc + item.stock_quantity, 0);

  return weightedStock > 0 ? Math.round(weightedBase / weightedStock) : 0;
}

function toRange(startDate?: string, endDate?: string): { gte?: Date; lte?: Date } | undefined {
  if (!startDate && !endDate) {
    return undefined;
  }

  const range: { gte?: Date; lte?: Date } = {};

  if (startDate) {
    range.gte = new Date(startDate);
  }

  if (endDate) {
    range.lte = new Date(endDate);
  }

  return range;
}

export class ControlRepository {
  async getStockSummary(options?: {
    search?: string;
    product_type_id?: string;
    brand_id?: string;
    page?: number;
    per_page?: number;
    sort_by?: StockSortKey;
    sort_order?: SortDirection;
  }) {
    const page = Math.max(options?.page ?? 1, 1);
    const perPage = Math.min(Math.max(options?.per_page ?? 10, 1), 100);
    const sortBy = options?.sort_by ?? "name";
    const sortOrder: SortDirection = options?.sort_order ?? "asc";

    const where = {
      deleted_at: null,
      ...(options?.search ? { OR: [{ name: { contains: options.search } }, { barcode: { contains: options.search } }] } : {}),
      ...(options?.product_type_id ? { product_type_id: options.product_type_id } : {}),
      ...(options?.brand_id ? { brand_id: options.brand_id } : {}),
    };

    const DB_SORT_MAP: Partial<Record<StockSortKey, string>> = {
      name: "name",
      stock: "stock_quantity",
      average_cost: "average_cost_cents",
    };
    const dbSortField = DB_SORT_MAP[sortBy];

    const mapProductRow = (product: {
      id: string;
      name: string;
      barcode: string | null;
      brand_id: string | null;
      description: string | null;
      weight_value: number | null;
      weight_unit: string | null;
      product_type_id: string | null;
      profit_margin: number | null;
      price_cents: number;
      cost_price_cents: number;
      average_cost_cents: number;
      stock_quantity: number;
      min_stock_alert: number;
      is_bulk: boolean;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
      deleted_at: Date | null;
      product_type: { id: string; name: string } | null;
      brand: { id: string; name: string } | null;
    }) => {
      const effectiveAverageCostCents = resolveEffectiveAverageCostCents(
        product.average_cost_cents,
        product.cost_price_cents,
      );
      const stockValueCents = Math.round(product.stock_quantity * effectiveAverageCostCents);

      return {
        ...product,
        average_cost_cents: effectiveAverageCostCents,
        stock_value_cents: stockValueCents,
        low_stock: product.stock_quantity <= product.min_stock_alert,
      };
    };

    let data: ReturnType<typeof mapProductRow>[] = [];
    let total = 0;
    let rowsForSummary: StockSummaryRow[] = [];

    if (dbSortField) {
      const [count, products, summaryProducts] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          include: {
            product_type: {
              select: {
                id: true,
                name: true,
              },
            },
            brand: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [{ [dbSortField]: sortOrder }, { id: "asc" }],
          take: perPage,
          skip: (page - 1) * perPage,
        }),
        prisma.product.findMany({
          where,
          select: {
            is_bulk: true,
            stock_quantity: true,
            min_stock_alert: true,
            average_cost_cents: true,
            cost_price_cents: true,
            product_type: {
              select: {
                name: true,
              },
            },
          },
        }),
      ]);

      total = count;
      data = products.map(mapProductRow);
      rowsForSummary = summaryProducts.map((item) => {
        const effectiveAverageCostCents = resolveEffectiveAverageCostCents(
          item.average_cost_cents,
          item.cost_price_cents,
        );

        return {
          ...item,
          average_cost_cents: effectiveAverageCostCents,
          stock_value_cents: Math.round(item.stock_quantity * effectiveAverageCostCents),
        };
      });
    }

    if (!dbSortField) {
      const products = await prisma.product.findMany({
        where,
        include: {
          product_type: {
            select: {
              id: true,
              name: true,
            },
          },
          brand: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const rows = products.map(mapProductRow);
      const sorted = [...rows].sort((left, right) => {
        const direction = sortOrder === "asc" ? 1 : -1;

        if (sortBy === "type") {
          return direction * (left.product_type?.name ?? "").localeCompare(right.product_type?.name ?? "", "pt-BR");
        }

        if (sortBy === "brand") {
          return direction * (left.brand?.name ?? "").localeCompare(right.brand?.name ?? "", "pt-BR");
        }

        return direction * (left.stock_value_cents - right.stock_value_cents);
      });

      total = sorted.length;
      const start = (page - 1) * perPage;
      data = sorted.slice(start, start + perPage);
      rowsForSummary = rows.map((item) => ({
        is_bulk: item.is_bulk,
        stock_quantity: item.stock_quantity,
        min_stock_alert: item.min_stock_alert,
        average_cost_cents: item.average_cost_cents,
        stock_value_cents: item.stock_value_cents,
        product_type: item.product_type ? { name: item.product_type.name } : null,
      }));
    }

    const totalPages = Math.ceil(total / perPage);

    const totalItemsQuantity = rowsForSummary
      .filter((item) => !item.is_bulk)
      .reduce((acc, item) => acc + Math.trunc(item.stock_quantity), 0);

    const totalBulkQuantity = rowsForSummary
      .filter((item) => item.is_bulk)
      .reduce((acc, item) => acc + item.stock_quantity, 0);

    const bulkByTypeMap = new Map<string, number>();

    for (const row of rowsForSummary) {
      if (!row.is_bulk) {
        continue;
      }

      const typeName = row.product_type?.name ?? "Sem tipo";
      const current = bulkByTypeMap.get(typeName) ?? 0;
      bulkByTypeMap.set(typeName, current + row.stock_quantity);
    }

    const bulkByType = [...bulkByTypeMap.entries()]
      .map(([typeName, totalKg]) => ({ type_name: typeName, total_kg: totalKg }))
      .sort((left, right) => left.type_name.localeCompare(right.type_name, "pt-BR"));

    const totalStockValueCents = rowsForSummary.reduce((acc, item) => acc + item.stock_value_cents, 0);
    const unitRows = rowsForSummary.filter((item) => !item.is_bulk);
    const bulkRows = rowsForSummary.filter((item) => item.is_bulk);
    const weightedAverageUnitCostCents = calculateWeightedAverageCostCents(unitRows);
    const weightedAverageBulkCostCents = calculateWeightedAverageCostCents(bulkRows);
    const weightedAverageCostCents = unitRows.length === 0
      ? weightedAverageBulkCostCents
      : bulkRows.length === 0
        ? weightedAverageUnitCostCents
        : 0;

    return {
      data,
      pagination: {
        page,
        per_page: perPage,
        total,
        total_pages: totalPages,
      },
      summary: {
        total_items_quantity: totalItemsQuantity,
        total_bulk_quantity: totalBulkQuantity,
        bulk_by_type: bulkByType,
        total_stock_value_cents: totalStockValueCents,
        weighted_avg_cost_cents: weightedAverageCostCents,
        weighted_average_cost_cents: weightedAverageCostCents,
        weighted_avg_cost_unit_cents: weightedAverageUnitCostCents,
        weighted_average_cost_unit_cents: weightedAverageUnitCostCents,
        weighted_avg_cost_bulk_cents: weightedAverageBulkCostCents,
        weighted_average_cost_bulk_cents: weightedAverageBulkCostCents,
      },
    };
  }

  async getCashSummary(startDate?: string, endDate?: string) {
    const createdAt = toRange(startDate, endDate);

    const [paymentGroups, legacySaleGroups, cashDiscountAggregate] = await Promise.all([
      prisma.salePayment.groupBy({
        by: ["method"],
        where: {
          sale: {
            deleted_at: null,
            status: "completed",
            ...(createdAt ? { created_at: createdAt } : {}),
          },
        },
        _sum: {
          amount_cents: true,
        },
      }),
      prisma.sale.groupBy({
        by: ["payment_method"],
        where: {
          deleted_at: null,
          status: "completed",
          payments: {
            none: {},
          },
          ...(createdAt ? { created_at: createdAt } : {}),
        },
        _sum: {
          total_cents: true,
        },
      }),
      prisma.sale.aggregate({
        where: {
          deleted_at: null,
          status: "completed",
          discount_cents: { gt: 0 },
          ...(createdAt ? { created_at: createdAt } : {}),
          OR: [
            { payment_method: PAYMENT_METHODS.CASH },
            { payments: { some: { method: PAYMENT_METHODS.CASH } } },
          ],
        },
        _sum: {
          discount_cents: true,
        },
      }),
    ]);

    const totals = {
      cash_cents: 0,
      credit_card_cents: 0,
      debit_card_cents: 0,
      pix_cents: 0,
      fiado_cents: 0,
      total_cents: 0,
    };

    for (const group of paymentGroups) {
      const amount = group._sum.amount_cents ?? 0;

      if (group.method === PAYMENT_METHODS.CASH) {
        totals.cash_cents += amount;
      }

      if (group.method === PAYMENT_METHODS.CREDIT_CARD) {
        totals.credit_card_cents += amount;
      }

      if (group.method === PAYMENT_METHODS.DEBIT_CARD) {
        totals.debit_card_cents += amount;
      }

      if (group.method === PAYMENT_METHODS.PIX) {
        totals.pix_cents += amount;
      }

      if (group.method === PAYMENT_METHODS.FIADO) {
        totals.fiado_cents += amount;
      }
    }

    for (const group of legacySaleGroups) {
      const amount = group._sum.total_cents ?? 0;

      if (group.payment_method === PAYMENT_METHODS.CASH) {
        totals.cash_cents += amount;
      }

      if (group.payment_method === PAYMENT_METHODS.CREDIT_CARD) {
        totals.credit_card_cents += amount;
      }

      if (group.payment_method === PAYMENT_METHODS.DEBIT_CARD) {
        totals.debit_card_cents += amount;
      }

      if (group.payment_method === PAYMENT_METHODS.PIX) {
        totals.pix_cents += amount;
      }

      if (group.payment_method === PAYMENT_METHODS.FIADO) {
        totals.fiado_cents += amount;
      }
    }

    totals.cash_cents -= cashDiscountAggregate._sum.discount_cents ?? 0;

    if (totals.cash_cents < 0) {
      totals.cash_cents = 0;
    }

    totals.total_cents =
      totals.cash_cents +
      totals.credit_card_cents +
      totals.debit_card_cents +
      totals.pix_cents +
      totals.fiado_cents;

    return totals;
  }

  async getDiscountSummary(startDate?: string, endDate?: string) {
    const createdAt = toRange(startDate, endDate);

    const result = await prisma.sale.aggregate({
      where: {
        deleted_at: null,
        status: "completed",
        discount_cents: { gt: 0 },
        ...(createdAt ? { created_at: createdAt } : {}),
        OR: [
          { payment_method: PAYMENT_METHODS.CASH },
          { payments: { some: { method: PAYMENT_METHODS.CASH } } },
        ],
      },
      _sum: {
        discount_cents: true,
      },
      _count: {
        id: true,
      },
    });

    return {
      total_discount_cents: result._sum.discount_cents ?? 0,
      occurrences: result._count.id,
    };
  }

  async getCancellations(startDate?: string, endDate?: string, limit = 50) {
    const createdAt = toRange(startDate, endDate);

    const [rows, groupedToday] = await Promise.all([
      prisma.sale.findMany({
        where: {
          deleted_at: null,
          status: { in: ["cancelled", "refunded"] },
          ...(createdAt ? { created_at: createdAt } : {}),
        },
        orderBy: { created_at: "desc" },
        take: limit,
        select: {
          id: true,
          created_at: true,
          total_cents: true,
          status: true,
          terminal_id: true,
          operator_id: true,
          operator: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.sale.groupBy({
        by: ["operator_id"],
        where: {
          deleted_at: null,
          status: { in: ["cancelled", "refunded"] },
          created_at: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const operatorIds = groupedToday.map((item) => item.operator_id);
    const users = operatorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, name: true },
        })
      : [];

    const userMap = new Map(users.map((user) => [user.id, user.name]));

    return {
      data: rows,
      operator_alerts_today: groupedToday
        .filter((item) => item._count._all > 3)
        .map((item) => ({
          operator_id: item.operator_id,
          operator_name: userMap.get(item.operator_id) ?? "Operador",
          count: item._count._all,
        })),
    };
  }
}
