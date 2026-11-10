// src/app/(app)/accounts/sale/page.jsx
import { todayDhaka } from "@/lib/accounts";
import { listPriceItems } from "@/server/queries/accounts";
import { SaleForm } from "@/components/accounts/sale-form";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "New sale" };

export default async function NewSalePage() {
  const priceList = await listPriceItems({ activeOnly: true });
  return (
    <>
      <PageHeader
        title="New sale"
        bangla="নতুন বিক্রি"
        description="Add what the customer took. Anything not paid now is saved as their baki."
      />
      <SaleForm priceList={priceList} today={todayDhaka()} />
    </>
  );
}
