import { AlertTriangle, CheckCircle2, Clock, Inbox } from "lucide-react";
import { EmptyOverview } from "./EmptyOverview";

export function BploOverview() {
  return (
    <EmptyOverview
      title="BPLO workspace"
      description="Intake, verify and route applications."
      stats={[
        { label: "New today", icon: Inbox },
        { label: "Awaiting verification", icon: Clock, accent: "gold" },
        { label: "Missing documents", icon: AlertTriangle, accent: "red" },
        { label: "Routed this week", icon: CheckCircle2, accent: "green" },
      ]}
      emptyTitle="The intake queue is empty"
      emptyText="Applications will appear here once applicants can submit them."
    />
  );
}
