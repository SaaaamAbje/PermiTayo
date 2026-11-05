import { FilePlus2, FileText, FolderOpen, MessageSquare } from "lucide-react";
import { EmptyOverview } from "./EmptyOverview";

export function ApplicantOverview({ firstName }: { firstName: string }) {
  return (
    <EmptyOverview
      title={`Good day, ${firstName}`}
      description="Here is where your business permit applications stand."
      stats={[
        { label: "Active applications", icon: FileText },
        { label: "Documents verified", icon: FolderOpen, accent: "green" },
        { label: "Needs your attention", icon: FilePlus2, accent: "gold" },
        { label: "Unread replies", icon: MessageSquare, accent: "slate" },
      ]}
      emptyTitle="You have no applications yet"
      emptyText="Online application and document upload are being prepared. Your account is ready, and you will be able to apply here once they open."
    />
  );
}
