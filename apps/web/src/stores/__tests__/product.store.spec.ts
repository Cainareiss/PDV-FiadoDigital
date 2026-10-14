import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useProductStore } from "../product.store.js";

describe("catalogo completo e estoque atualizado", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it.each([57, 137, 501])("carrega %i produtos mesmo quando o servidor entrega apenas 20 por pagina", async (total) => {
    const fetcher = vi.fn(async (url: string) => {
      const page = Number(new URL(url, "http://localhost").searchParams.get("page"));
      return new Response(JSON.stringify({ data: Array.from({ length: Math.min(20, total - (page - 1) * 20) }, (_, i) => ({ id: String((page - 1) * 20 + i), stock_quantity: 12 })), pagination: { total_pages: Math.ceil(total / 20) } }));
    });
    const store = useProductStore();
    await Promise.all([store.fetchIfStale(fetcher), store.fetchIfStale(fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(Math.ceil(total / 20));
    expect(store.products).toHaveLength(total);
    expect(new Set(store.products.map(p => p.id)).size).toBe(total);
    expect(store.products.every(p => p.stock_quantity === 12)).toBe(true);
  });
  it("preserva o catalogo anterior quando uma pagina falha e permite tentar novamente", async () => {
    const store = useProductStore();
    const initial = async () => new Response(JSON.stringify({ data: [{ id: "original", stock_quantity: 25 }], pagination: { total_pages: 1 } }));
    await store.fetchIfStale(initial);
    const broken = vi.fn(async (url: string) => {
      const page = Number(new URL(url, "http://localhost").searchParams.get("page"));
      return page === 1
        ? new Response(JSON.stringify({ data: [{ id: "partial", stock_quantity: 0 }], pagination: { total_pages: 2 } }))
        : new Response(JSON.stringify({ message: "Falha temporaria" }), { status: 500 });
    });
    await store.fetchIfStale(broken, true);
    expect(store.products.map(p => p.id)).toEqual(["original"]);
    expect(store.error).toBe("Falha temporaria");
    expect(store.loading).toBe(false);
    await store.fetchIfStale(initial, true);
    expect(store.error).toBeNull();
    expect(store.products[0]?.stock_quantity).toBe(25);
  });
  it("apos reposicao substitui o estoque zero antigo, sem aguardar o cache expirar", async () => {
    let quantity = 0;
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "p1", stock_quantity: quantity }], pagination: { total_pages: 1 } })));
    const store = useProductStore();
    await store.fetchIfStale(fetcher);
    quantity = 25;
    store.invalidate();
    await store.fetchIfStale(fetcher, true);
    expect(store.products[0]?.stock_quantity).toBe(25);
  });
});
