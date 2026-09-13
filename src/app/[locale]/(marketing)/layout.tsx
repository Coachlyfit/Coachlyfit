import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { getPlatformSettings } from "@/lib/platform-settings";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPlatformSettings();

  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer supportEmail={settings.branding.support_email} />
    </div>
  );
}
