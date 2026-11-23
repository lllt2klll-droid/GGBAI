import { AppShell } from "@/components/layout/AppShell";
import { SettingsClient } from "@/components/settings/SettingsClient";

export const metadata = { title: "Cài đặt — GeoGebra AI Studio" };

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl p-4 lg:p-8">
        <SettingsClient />
      </div>
    </AppShell>
  );
}
