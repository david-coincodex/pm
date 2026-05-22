export default function BareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      {children}
    </div>
  );
}
