import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UserDetailView } from "@/components/admin/AdminViews";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Account details" };

async function Detail({ params }: { params: PageProps<"/dashboard/[role]/users/[id]">["params"] }) {
  const { role, id } = await params;
  if (role !== "admin") notFound();
  return <UserDetailView id={id} />;
}

export default function UserDetailPage({ params }: PageProps<"/dashboard/[role]/users/[id]">) {
  return (
    <>
      <PageHeader title="Account details" description="Review this account and manage its role, status and department." />
      <Suspense fallback={<PageSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </>
  );
}
