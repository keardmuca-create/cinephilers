
import { BottomNav } from '@/components/navigation';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-32 pt-[env(safe-area-inset-top)]">
      {children}
      <BottomNav />
    </div>
  );
}
