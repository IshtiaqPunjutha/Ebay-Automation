import OrdersView from "@/components/OrdersView";

// /stores/<id>/cancellations: orders where the buyer has asked to cancel and no answer has been given yet.
export default function CancellationRequestsPage() {
  return <OrdersView status="cancellations" />;
}
