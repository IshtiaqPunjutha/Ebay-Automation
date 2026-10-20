import FinanceView from "@/components/FinanceView";

export default function StoreFinancePage({ params }) {
  return <FinanceView storeId={params.storeId} />;
}
