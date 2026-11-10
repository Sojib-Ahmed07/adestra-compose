// src/app/print/rates/page.jsx
import { taka } from "@/lib/accounts";
import { listPriceItems } from "@/server/queries/accounts";
import { getShop } from "@/server/queries/settings";
import { Paper, ShopHeading } from "@/components/print/paper";
import { PrintBar } from "@/components/print/print-bar";

export const metadata = { title: "Rate chart" };

export default async function RatesPage() {
  const [items, shop] = await Promise.all([listPriceItems({ activeOnly: true }), getShop()]);
  return (
    <>
      <PrintBar />
      <Paper size="a4">
        <ShopHeading shop={shop} />
        <h1 className="mb-1 text-center text-[1.8em] font-bold">Service rates</h1>
        <p className="mb-6 text-center font-bangla text-[1.2em]">সার্ভিস রেট তালিকা</p>
        {items.length ? (
          <table className="w-full text-[1.15em]">
            <tbody>
              {items.map((it, i) => (
                <tr
                  key={it.id}
                  className={i % 2 ? "bg-ink-50 print:bg-ink-50" : ""}
                  style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
                >
                  <td className="w-10 px-3 py-2.5 text-ink-500">{i + 1}.</td>
                  <td className="px-3 py-2.5 font-medium">{it.name}</td>
                  <td className="tabular px-3 py-2.5 text-right font-bold whitespace-nowrap">
                    {taka(it.price)}
                    {it.unit ? <span className="font-normal text-ink-600"> / {it.unit}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="py-10 text-center">Add services in Accounts › Price list first.</p>
        )}
      </Paper>
    </>
  );
}
