// src/app/(app)/accounts/expense/page.jsx
import { todayDhaka } from "@/lib/accounts";
import { getAccountSettings } from "@/server/queries/accounts";
import { ExpenseForm } from "@/components/accounts/expense-form";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "New expense" };

export default async function NewExpensePage() {
  const { expenseTypes } = await getAccountSettings();
  return (
    <>
      <PageHeader
        title="New expense"
        bangla="নতুন খরচ"
        description="Money spent for the shop — paper, ink, rent, bills, salary."
      />
      <ExpenseForm expenseTypes={expenseTypes} today={todayDhaka()} />
    </>
  );
}
