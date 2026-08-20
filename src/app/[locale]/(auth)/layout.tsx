import { Link } from "@/i18n/navigation";
import { CoachlyLockup } from "@/components/brand/coachly-lockup";
import { LaunchMark } from "@/components/brand/launch-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-12">
      <Link href="/" className="flex flex-col items-center gap-4">
        <LaunchMark size={88} className="text-foreground" />
        <CoachlyLockup height={34} />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
