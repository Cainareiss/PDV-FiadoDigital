import { ProductTypeRepository } from "../repositories/product-type.repository.js";
import type { CreateProductTypePayload, UpdateProductTypePayload } from "@pdv/shared";
import { badRequest, conflict, notFound } from "../errors/domain-error.js";

const productTypeRepository = new ProductTypeRepository();

export class ProductTypeService {
  async list() {
    return productTypeRepository.findAll();
  }

  async create(payload: CreateProductTypePayload) {
    const normalizedName = payload.name.trim();

    if (!normalizedName) {
      throw badRequest("Nome do tipo de produto é obrigatório");
    }

    const existing = await productTypeRepository.findByName(normalizedName);

    if (existing) {
      throw conflict("Tipo de produto já cadastrado", "PRODUCT_TYPE_ALREADY_REGISTERED");
    }

    return productTypeRepository.create({
      name: normalizedName,
      profit_margin: this.normalizeProfitMargin(payload.profit_margin),
    });
  }

  async update(id: string, payload: UpdateProductTypePayload) {
    const productType = await productTypeRepository.findById(id);

    if (!productType) {
      throw notFound("Tipo de produto não encontrado", "PRODUCT_TYPE_NOT_FOUND");
    }

    if (typeof payload.name === "string") {
      const normalizedName = payload.name.trim();

      if (!normalizedName) {
        throw badRequest("Nome do tipo de produto é obrigatório");
      }

      const existing = await productTypeRepository.findByName(normalizedName);

      if (existing && existing.id !== id) {
        throw conflict("Tipo de produto já cadastrado", "PRODUCT_TYPE_ALREADY_REGISTERED");
      }

      return productTypeRepository.update(id, {
        name: normalizedName,
        ...(payload.profit_margin !== undefined
          ? { profit_margin: this.normalizeProfitMargin(payload.profit_margin) }
          : {}),
      });
    }

    if (payload.profit_margin !== undefined) {
      return productTypeRepository.update(id, {
        profit_margin: this.normalizeProfitMargin(payload.profit_margin),
      });
    }

    return productType;
  }

  async deactivate(id: string) {
    const productType = await productTypeRepository.findById(id);

    if (!productType) {
      throw notFound("Tipo de produto não encontrado", "PRODUCT_TYPE_NOT_FOUND");
    }

    return productTypeRepository.softDelete(id);
  }

  private normalizeProfitMargin(margin?: number | null): number | null {
    if (margin === null || margin === undefined) {
      return null;
    }

    return margin / 100;
  }
}
