import { AppShell } from "@/components/layout/AppShell";
import { LoginClient } from "@/components/auth/LoginClient";

export const metadata = { title: "Đăng nhập — GeoGebra AI Studio" };

export default function LoginPage() {
  return (
    <AppShell>
      <div className="flex h-full items-center justify-center p-6">
        <LoginClient />
      </div>
    </AppShell>
  );
}
