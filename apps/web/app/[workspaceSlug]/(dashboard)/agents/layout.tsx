import { redirect } from "next/navigation";

export default async function AgentsArchivedLayout({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
  children: React.ReactNode;
}) {
  void children;
  const { workspaceSlug } = await params;
  redirect(`/${encodeURIComponent(workspaceSlug)}/chat`);
}
