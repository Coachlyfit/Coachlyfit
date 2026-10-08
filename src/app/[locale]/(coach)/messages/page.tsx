import { getTranslations } from "next-intl/server";
import { MessageCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

// Nothing selected yet. Only ever visible from lg up: below that the shell
// shows the conversation list on this route and hides this pane.
export default async function MessagesIndexPage() {
  const t = await getTranslations("inbox.selectConversation");

  return (
    <EmptyState
      icon={MessageCircle}
      title={t("title")}
      description={t("description")}
      className="h-full justify-center bg-background"
    />
  );
}
