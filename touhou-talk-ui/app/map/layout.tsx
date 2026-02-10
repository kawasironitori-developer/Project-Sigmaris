// app/map/layout.tsx


export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">

      {/* マップ本体：残り全て */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
