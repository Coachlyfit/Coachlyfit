import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { tintFor } from "@/lib/tint";

export function ClientAvatar({ id, name, size = "lg" }: { id: string; name: string; size?: "default" | "lg" }) {
  return (
    <Avatar size={size} aria-hidden="true">
      <AvatarFallback className={cn("font-semibold text-white", tintFor(id))}>{name[0] ?? "?"}</AvatarFallback>
    </Avatar>
  );
}
