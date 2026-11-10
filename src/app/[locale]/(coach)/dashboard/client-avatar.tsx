import { UserAvatar } from "@/components/shared/user-avatar";

/** Client (or coach/user) avatar: the photo when `src` is given, else the
 * tinted initial. Decorative — the name is always rendered beside it. */
export function ClientAvatar({
  id,
  name,
  src,
  size = "lg",
}: {
  id: string;
  name: string;
  src?: string | null;
  size?: "default" | "lg";
}) {
  return <UserAvatar src={src} name={name} userId={id} size={size} />;
}
