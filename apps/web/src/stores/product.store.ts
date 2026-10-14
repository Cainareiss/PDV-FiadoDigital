import { defineStore } from "pinia";
import { ref } from "vue";
import type { Product } from "@pdv/shared";

type AuthenticatedFetch = (url: string, options?: RequestInit) => Promise<Response>;

export const useProductStore = defineStore("product", () => {
  const products = ref<Product[]>([]);
  const lastFetchedAt = ref<Date | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const CACHE_TTL_MS = 60_000;
  let pending: Promise<void> | null = null;

  async function fetchIfStale(authenticatedFetch: AuthenticatedFetch, force = false): Promise<void> {
    if (pending) {
      await pending;
      if (!force) return;
    }
    const now = Date.now();
    const isStale =
      force ||
      !lastFetchedAt.value ||
      now - lastFetchedAt.value.getTime() > CACHE_TTL_MS;

    if (!isStale || loading.value) {
      return;
    }

    loading.value = true;
    error.value = null;

    pending = (async () => { try {
      // Carrega todos os produtos usando paginação para não perder registros
      // O backend limita em 500 por página; fazemos loop até buscar tudo
      const allProducts: Product[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const response = await authenticatedFetch(`/api/products?per_page=100&page=${page}`, { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          error.value = data.message || "Não foi possível carregar produtos.";
          return;
        }

        const pageItems = (data.data ?? []) as Product[];
        allProducts.push(...pageItems);
        if (!data.pagination || !Number.isInteger(data.pagination.total_pages)) {
          throw new Error("Resposta sem paginacao do catalogo");
        }
        totalPages = data.pagination.total_pages;
        page++;
      } while (page <= totalPages);

      products.value = allProducts;
      lastFetchedAt.value = new Date();
    } catch {
      error.value = "Erro de conexão ao carregar produtos.";
    } finally {
      loading.value = false;
    } })();
    try { await pending; } finally { pending = null; }
  }

  function invalidate(): void {
    lastFetchedAt.value = null;
  }

  return {
    products,
    loading,
    error,
    fetchIfStale,
    invalidate,
  };
});
