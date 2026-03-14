import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import AdminPageHeader from "../_components/AdminPageHeader";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground",
  CONFIRMED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
  REFUNDED: "bg-amber-100 text-amber-700",
};

export default async function AdminArtworkOrdersPage() {
  await requireAdmin({ redirectOnFail: true });

  const orders = await db.artworkOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      artwork: { select: { title: true, slug: true, id: true } },
      buyer: { select: { email: true } },
    },
  });

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Artwork Orders" description="Latest direct-purchase checkout orders." />

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No artwork orders yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Artwork</th>
                <th className="px-4 py-2 font-medium">Buyer email</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t">
                  <td className="px-4 py-2">{order.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="px-4 py-2">
                    <Link className="underline" href={`/artwork/${order.artwork.slug ?? order.artwork.id}`}>
                      {order.artwork.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{order.buyer?.email ?? order.buyerEmail}</td>
                  <td className="px-4 py-2">{formatPrice(order.amountPaid, order.currency)}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[order.status] ?? STATUS_STYLES.PENDING}`}>
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
