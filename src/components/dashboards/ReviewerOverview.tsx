import { CalendarClock, ClipboardCheck, Hourglass, ThumbsUp } from "lucide-react";
import { EmptyOverview } from "./EmptyOverview";

export function ReviewerOverview() {
  return (
    <EmptyOverview
      title="Department review workspace"
      description="Applications routed to your office."
      stats={[
        { label: "Waiting for review", icon: Hourglass },
        { label: "Reviewed this week", icon: ThumbsUp, accent: "green" },
        { label: "Inspections scheduled", icon: CalendarClock, accent: "gold" },
        { label: "Completed reviews", icon: ClipboardCheck, accent: "slate" },
      ]}
      emptyTitle="Nothing to review yet"
      emptyText="Applications routed to your department will appear here."
    />
  );
}
