import OrdersView from "@/components/OrdersView";

// /stores/<id>/dispatched: orders that have already been shipped.
export default function DispatchedOrdersPage() {
  return <OrdersView status="dispatched" />;
}
