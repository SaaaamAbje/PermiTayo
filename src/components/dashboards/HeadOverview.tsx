import { Gauge, Stamp, Timer, Users } from "lucide-react";
import { EmptyOverview } from "./EmptyOverview";

export function HeadOverview() {
  return (
    <EmptyOverview
      title="Department head dashboard"
      description="Approvals and performance for your department."
      stats={[
        { label: "Awaiting approval", icon: Stamp, accent: "gold" },
        { label: "Decided this month", icon: Timer },
        { label: "Returned for correction", icon: Gauge, accent: "red" },
        { label: "Active reviewers", icon: Users, accent: "slate" },
      ]}
      emptyTitle="No approvals pending"
      emptyText="Applications that reach your final decision will appear here."
    />
  );
}
