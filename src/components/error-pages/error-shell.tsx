import { CoachlyLockup } from "@/components/brand/coachly-lockup";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Link } from "@/i18n/navigation";

/** Full-page frame shared by the 404 and error pages: minimal header
 * (wordmark → home, language switch) and a centered 560px column. No app
 * shell, so it reads the same for signed-in and signed-out visitors. */
export function ErrorShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-5 sm:px-8">
        <Link href="/" className="flex items-center">
          <CoachlyLockup height={28} />
        </Link>
        <LocaleSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pt-6 pb-16">
        <div className="flex w-full max-w-[560px] flex-col items-center gap-5 text-center">{children}</div>
      </main>
    </div>
  );
}

/** Heading + subtitle block, identical on both pages. */
export function ErrorHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-3xl leading-[38px] font-bold">{title}</h1>
      <p className="text-base text-muted-foreground">{description}</p>
    </div>
  );
}
