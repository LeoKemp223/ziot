import { ConsoleHeader } from "@/components/console/header";
import { ConsoleSidebar } from "@/components/console/sidebar";
import { navItems } from "@/components/console/dashboard-data";
import { ProductDetailPanel } from "@/components/products/product-detail-panel";

export const dynamic = "force-dynamic";

type ProductDetailPageProps = {
  params: Promise<{
    productId: string;
  }>;
};

export default async function ProductDetailPage({
  params
}: ProductDetailPageProps) {
  const { productId } = await params;
  const items = navItems.map((item) => ({
    ...item,
    active: item.href === "/products"
  }));

  return (
    <main className="flex min-h-screen bg-slate-100 text-slate-950">
      <ConsoleSidebar items={items} />
      <section className="flex min-w-0 flex-1 flex-col">
        <ConsoleHeader />
        <div className="flex-1 overflow-auto px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div>
              <a className="text-sm font-medium text-blue-700" href="/products">
                返回产品列表
              </a>
              <h1 className="mt-3 text-2xl font-semibold text-slate-950">
                产品详情
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                查看接入参数，维护产品物模型。
              </p>
            </div>
            <div className="mt-6">
              <ProductDetailPanel productId={productId} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
