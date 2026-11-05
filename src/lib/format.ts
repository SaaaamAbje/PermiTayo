/** Date helpers. Times are shown in Philippine time. */
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
