// src/app/(app)/accounts/prices/page.jsx
import { getAccountSettings, listPriceItems } from "@/server/queries/accounts";
import { requireUser } from "@/server/session";
import { AccountSettingsForm, PriceEditor } from "@/components/accounts/price-editor";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Price list" };

export default async function PricesPage() {
  const user = await requireUser();
  const isOwner = user.role === "owner";
  const [items, acc] = await Promise.all([listPriceItems(), getAccountSettings()]);
  return (
    <>
      <PageHeader
        title="Price list"
        bangla="সার্ভিস রেট"
        description={
          isOwner
            ? "Your services and rates, expense types and the receipt footer."
            : "The shop's rates. Only the owner can change them."
        }
      />
      <div className="grid max-w-5xl gap-6">
        <PriceEditor items={isOwner ? items : items.filter((i) => i.active)} canEdit={isOwner} />
        {isOwner ? <AccountSettingsForm expenseTypes={acc.expenseTypes} receiptNote={acc.receiptNote} /> : null}
      </div>
    </>
  );
}
