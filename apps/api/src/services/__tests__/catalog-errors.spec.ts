import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  product: { findByBarcode: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn() },
  brand: { findByName: vi.fn(), findById: vi.fn(), create: vi.fn() },
  type: { findByName: vi.fn(), findById: vi.fn(), create: vi.fn() },
  logError: vi.fn(),
}));
vi.mock("../../repositories/product.repository.js", () => ({ ProductRepository: class { constructor() { return mocks.product; } } }));
vi.mock("../../repositories/brand.repository.js", () => ({ BrandRepository: class { constructor() { return mocks.brand; } } }));
vi.mock("../../repositories/product-type.repository.js", () => ({ ProductTypeRepository: class { constructor() { return mocks.type; } } }));
vi.mock("../../repositories/stock-movement.repository.js", () => ({ StockMovementRepository: class {} }));
vi.mock("../../repositories/audit-log.repository.js", () => ({ AuditLogRepository: class {} }));
vi.mock("../../utils/logger.js", () => ({ logError: mocks.logError }));

import { ProductService } from "../product.service.js";
import { BrandService } from "../brand.service.js";
import { ProductTypeService } from "../product-type.service.js";
import { errorHandler } from "../../middlewares/error-handler.middleware.js";

const payload = { name: "Arroz", barcode: "7891234567890", price_cents: 1800, cost_price_cents: 1200, stock_quantity: 30, min_stock_alert: 5 };

function responseFor(error: unknown) {
  const res = { locals: {}, status: vi.fn().mockReturnThis(), json: vi.fn() };
  errorHandler(error as Error, { method: "POST", path: "/api/products" } as Request, res as unknown as Response, vi.fn() as NextFunction);
  return res;
}

async function rejectedResponse(action: Promise<unknown>) {
  try { await action; } catch (err) { return responseFor(err); }
  throw new Error("Esperava recusa do cadastro");
}

describe("mensagens do catalogo em producao", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "production"); });
  afterEach(() => vi.unstubAllEnvs());

  it.each([null, new Date()])("explica codigo duplicado mesmo se o produto foi excluido: %s", async (deleted_at) => {
    mocks.product.findByBarcode.mockResolvedValue({ id: "existing", name: "Arroz", deleted_at });
    const res = await rejectedResponse(new ProductService().create(payload));
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: deleted_at ? 'Código de barras já cadastrado no produto excluído "Arroz".' : 'Código de barras já cadastrado no produto "Arroz".',
      errors: { barcode: [expect.stringContaining("já cadastrado")] },
    }));
    expect(mocks.product.findByBarcode).toHaveBeenCalledWith(payload.barcode, true);
    expect(mocks.product.create).not.toHaveBeenCalled();
    expect(mocks.product.update).not.toHaveBeenCalled();
  });

  it("permite cadastrar um produto novo com seu estoque informado", async () => {
    mocks.product.findByBarcode.mockResolvedValue(null);
    mocks.product.create.mockResolvedValue({ id: "new", ...payload });
    await expect(new ProductService().create(payload)).resolves.toMatchObject({ stock_quantity: 30 });
    expect(mocks.product.create).toHaveBeenCalledWith(expect.objectContaining({ stock_quantity: 30, barcode: payload.barcode }));
  });

  it("informa marca ja cadastrada sem tentar criar outra", async () => {
    mocks.brand.findByName.mockResolvedValue({ id: "brand" });
    const res = await rejectedResponse(new BrandService().create({ name: "Marca" }));
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Marca já cadastrada" }));
    expect(mocks.brand.create).not.toHaveBeenCalled();
  });

  it("informa tipo de produto ja cadastrado", async () => {
    mocks.type.findByName.mockResolvedValue({ id: "type" });
    const res = await rejectedResponse(new ProductTypeService().create({ name: "Bebidas" }));
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Tipo de produto já cadastrado" }));
  });

  it("produto inexistente retorna 404 com mensagem objetiva", async () => {
    mocks.product.findById.mockResolvedValue(null);
    const res = await rejectedResponse(new ProductService().getById("missing"));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Produto não encontrado" }));
  });

  it("duplicidade detectada pelo SQLite continua sendo um conflito de cadastro", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7", meta: { target: ["barcode"] } });
    const res = responseFor(error);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Código de barras já cadastrado" }));
  });

  it("falhas inesperadas nao expoem detalhes internos", () => {
    const res = responseFor(new Error("detalhe interno do banco"));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: "Erro interno" });
  });
});
