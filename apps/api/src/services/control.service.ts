import { ControlRepository } from "../repositories/control.repository.js";

const controlRepository = new ControlRepository();

export class ControlService {
  async getStockSummary(options?: {
    search?: string;
    product_type_id?: string;
    brand_id?: string;
    page?: number;
    per_page?: number;
    sort_by?: "name" | "type" | "brand" | "stock" | "average_cost" | "stock_value";
    sort_order?: "asc" | "desc";
  }) {
    return controlRepository.getStockSummary(options);
  }

  async getCashSummary(startDate?: string, endDate?: string) {
    return controlRepository.getCashSummary(startDate, endDate);
  }

  async getDiscountSummary(startDate?: string, endDate?: string) {
    return controlRepository.getDiscountSummary(startDate, endDate);
  }

  async getCancellations(startDate?: string, endDate?: string) {
    return controlRepository.getCancellations(startDate, endDate, 50);
  }
}
