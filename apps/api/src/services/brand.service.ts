import { BrandRepository } from "../repositories/brand.repository.js";
import type { CreateBrandPayload, UpdateBrandPayload } from "@pdv/shared";
import { badRequest, conflict, notFound } from "../errors/domain-error.js";

const brandRepository = new BrandRepository();

export class BrandService {
  async list(productTypeId?: string) {
    return brandRepository.findAll(productTypeId);
  }

  async create(payload: CreateBrandPayload) {
    const normalizedName = payload.name.trim();

    if (!normalizedName) {
      throw badRequest("Nome da marca é obrigatório");
    }

    const existing = await brandRepository.findByName(normalizedName);

    if (existing) {
      throw conflict("Marca já cadastrada", "BRAND_ALREADY_REGISTERED");
    }

    return brandRepository.create({ name: normalizedName });
  }

  async update(id: string, payload: UpdateBrandPayload) {
    const brand = await brandRepository.findById(id);

    if (!brand) {
      throw notFound("Marca não encontrada", "BRAND_NOT_FOUND");
    }

    if (typeof payload.name === "string") {
      const normalizedName = payload.name.trim();

      if (!normalizedName) {
        throw badRequest("Nome da marca é obrigatório");
      }

      const existing = await brandRepository.findByName(normalizedName);

      if (existing && existing.id !== id) {
        throw conflict("Marca já cadastrada", "BRAND_ALREADY_REGISTERED");
      }

      return brandRepository.update(id, { name: normalizedName });
    }

    return brand;
  }

  async deactivate(id: string) {
    const brand = await brandRepository.findById(id);

    if (!brand) {
      throw notFound("Marca não encontrada", "BRAND_NOT_FOUND");
    }

    return brandRepository.softDelete(id);
  }
}
