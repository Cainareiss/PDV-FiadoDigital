import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { badRequest, notFound } from "../errors/domain-error.js";

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

function getDb(tx?: Prisma.TransactionClient): PrismaClientLike {
  return tx ?? prisma;
}

export class StockMovementRepository {
  async findByProductId(productId: string, limit = 20) {
    return prisma.stockMovement.findMany({
      where: { product_id: productId },
      orderBy: { created_at: "desc" },
      take: limit,
    });
  }

  async create(
    data: {
      product_id: string;
      type: "entry" | "sale" | "adjustment";
      quantity: number;
      unit_cost_cents: number;
      description?: string;
      operator_id: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return getDb(tx).stockMovement.create({
      data: {
        product_id: data.product_id,
        type: data.type,
        quantity: data.quantity,
        unit_cost_cents: data.unit_cost_cents,
        description: data.description ?? null,
        operator_id: data.operator_id,
      },
    });
  }

  async createAdjustment(data: {
    product_id: string;
    quantity: number;
    unit_cost_cents: number;
    description: string;
    operator_id: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: {
          id: data.product_id,
          deleted_at: null,
        },
        select: {
          id: true,
          stock_quantity: true,
          average_cost_cents: true,
          is_bulk: true,
          name: true,
        },
      });

      if (!product) {
        throw notFound("Produto não encontrado", "PRODUCT_NOT_FOUND");
      }

      if (!product.is_bulk && !Number.isInteger(data.quantity)) {
        throw badRequest("Quantidade inválida para produto unitário");
      }

      const nextStock = product.stock_quantity + data.quantity;

      if (nextStock < 0) {
        throw badRequest("Estoque resultante não pode ser negativo");
      }

      const nextAverageCost = this.resolveAverageCostAfterAdjustment({
        currentStock: product.stock_quantity,
        currentAverageCostCents: product.average_cost_cents,
        quantity: data.quantity,
        unitCostCents: data.unit_cost_cents,
      });

      const updatedProduct = await tx.product.update({
        where: { id: product.id },
        data: {
          stock_quantity: nextStock,
          average_cost_cents: nextAverageCost,
        },
      });

      const movement = await this.create(
        {
          product_id: product.id,
          type: "adjustment",
          quantity: data.quantity,
          unit_cost_cents: data.unit_cost_cents,
          description: data.description,
          operator_id: data.operator_id,
        },
        tx,
      );

      return {
        product: updatedProduct,
        movement,
      };
    });
  }

  private resolveAverageCostAfterAdjustment(input: {
    currentStock: number;
    currentAverageCostCents: number;
    quantity: number;
    unitCostCents: number;
  }): number {
    if (input.quantity <= 0) {
      return input.currentAverageCostCents;
    }

    const denominator = input.currentStock + input.quantity;

    if (denominator <= 0) {
      return 0;
    }

    const weightedTotal =
      input.currentStock * input.currentAverageCostCents +
      input.quantity * input.unitCostCents;

    return Math.round(weightedTotal / denominator);
  }
}
