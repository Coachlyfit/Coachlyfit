"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { tintFor } from "@/lib/tint";

/** Reusable avatar: shows the public avatar URL when set, otherwise an
 * initials fallback. The initial is the first character of `name`, so Arabic
 * names render their first Arabic letter (e.g. "س" for "سارة أحمد") instead
 * of breaking. `userId` keys the fallback tint so one person keeps the same
 * color across every surface. */
export function UserAvatar({
  src,
  name,
  size = "default",
  userId,
  className,
}: {
  src?: string | null;
  name: string;
  size?: "default" | "sm" | "lg";
  /** Used only to pick a stable fallback color. */
  userId?: string;
  className?: string;
}) {
  const initial = name.trim().charAt(0) || "?";
  return (
    <Avatar size={size} aria-label={name} data-slot="user-avatar" className={className}>
      {src ? (
        <AvatarImage src={src} alt="" />
      ) : (
        <AvatarFallback className={cn("font-semibold text-white", userId ? tintFor(userId) : "")}>
          {initial}
        </AvatarFallback>
      )}
    </Avatar>
  );
}
