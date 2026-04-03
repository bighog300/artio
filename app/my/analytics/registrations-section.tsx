"use client";

import { useEffect, useMemo, useState } from "react";

type Payload = {
  dailyCounts: Array<{ date: string; count: number }>;
  conversionRate: number;
  topEvents: Array<{ eventTitle: string; count: number }>;
};

type FinanceRow = {
  eventTitle: string;
  confirmedCount: number;
  grossRevenue: number;
  platformFees: number;
  netRevenue: number;
  refundedAmount: number;
};

function formatPence(value: number) {
  return `£${(value / 100).toFixed(2)}`;
}

export function RegistrationsAnalyticsSection() {
  const [data, setData] = useState<Payload>({ dailyCounts: [], conversionRate: 0, topEvents: [] });
  const [financeRows, setFinanceRows] = useState<FinanceRow[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [registrationsRes, financeRes] = await Promise.all([
        fetch("/api/my/analytics/registrations", { cache: "no-store" }),
        fetch("/api/my/analytics/finance", { cache: "no-store" }),
      ]);
      const body = await registrationsRes.json().catch(() => ({}));
      const financeBody = await financeRes.json().catch(() => ({}));
      if (!mounted) return;
      if (registrationsRes.ok) {
        setData({
          dailyCounts: Array.isArray(body.dailyCounts) ? body.dailyCounts : [],
          conversionRate: Number(body.conversionRate ?? 0),
          topEvents: Array.isArray(body.topEvents) ? body.topEvents : [],
        });
      }
      if (financeRes.ok) setFinanceRows(Array.isArray(financeBody.rows) ? financeBody.rows : []);
    })();
    return () => { mounted = false; };
  }, []);

  const max = Math.max(1, ...data.dailyCounts.map((item) => item.count));
  const showFinance = financeRows.some((row) => row.grossRevenue > 0);
  const totals = useMemo(() => financeRows.reduce((acc, row) => ({
    confirmedCount: acc.confirmedCount + row.confirmedCount,
    grossRevenue: acc.grossRevenue + row.grossRevenue,
    platformFees: acc.platformFees + row.platformFees,
    netRevenue: acc.netRevenue + row.netRevenue,
    refundedAmount: acc.refundedAmount + row.refundedAmount,
  }), { confirmedCount: 0, grossRevenue: 0, platformFees: 0, netRevenue: 0, refundedAmount: 0 }), [financeRows]);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Registrations</h2>
      <div className="rounded border p-3">
        <p className="mb-2 text-xs text-muted-foreground">Confirmed RSVPs (last 30 days)</p>
        <div className="flex h-44 items-end gap-1">
          {data.dailyCounts.map((item) => (
            <div key={item.date} className="min-w-0 flex-1 rounded-sm bg-primary/20" style={{ height: `${Math.max(4, (item.count / max) * 100)}%` }} title={`${item.date}: ${item.count}`} />
          ))}
        </div>
      </div>

      <div className="rounded border p-3">
        <p className="text-xs text-muted-foreground">Conversion rate</p>
        <p className="text-2xl font-semibold">{(data.conversionRate * 100).toFixed(1)}%</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Top events</h3>
        {data.topEvents.length === 0 ? <p className="text-sm text-muted-foreground">No confirmed RSVPs in the last 30 days.</p> : (
          <ul className="space-y-2">
            {data.topEvents.map((item) => <li key={item.eventTitle} className="rounded border p-3 text-sm"><span className="font-medium">{item.eventTitle}</span> · {item.count}</li>)}
          </ul>
        )}
      </div>

      {showFinance ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Finance summary (paid tickets only)</h3>
          <div className="overflow-x-auto rounded border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Confirmed</th>
                  <th className="px-3 py-2">Gross</th>
                  <th className="px-3 py-2">Fees</th>
                  <th className="px-3 py-2">Net</th>
                  <th className="px-3 py-2">Refunded</th>
                </tr>
              </thead>
              <tbody>
                {financeRows.map((row) => (
                  <tr key={row.eventTitle} className="border-t">
                    <td className="px-3 py-2">{row.eventTitle}</td>
                    <td className="px-3 py-2">{row.confirmedCount}</td>
                    <td className="px-3 py-2">{formatPence(row.grossRevenue)}</td>
                    <td className="px-3 py-2">{formatPence(row.platformFees)}</td>
                    <td className="px-3 py-2">{formatPence(row.netRevenue)}</td>
                    <td className="px-3 py-2">{formatPence(row.refundedAmount)}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/20 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2">{totals.confirmedCount}</td>
                  <td className="px-3 py-2">{formatPence(totals.grossRevenue)}</td>
                  <td className="px-3 py-2">{formatPence(totals.platformFees)}</td>
                  <td className="px-3 py-2">{formatPence(totals.netRevenue)}</td>
                  <td className="px-3 py-2">{formatPence(totals.refundedAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
