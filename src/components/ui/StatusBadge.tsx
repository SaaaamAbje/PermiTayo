import { statusTone, type ApplicationStatus } from "@/lib/application-status";
import { Badge } from "./Badge";

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge tone={statusTone[status]}>{status}</Badge>;
}
