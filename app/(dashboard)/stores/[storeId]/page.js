import OrdersView from "@/components/OrdersView";

// /stores/<id>: every order that still needs shipping.
export default function NewOrdersPage() {
  return <OrdersView status="new" />;
}
