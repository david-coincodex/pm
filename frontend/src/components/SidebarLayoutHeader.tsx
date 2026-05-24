interface SidebarLayoutHeaderProps {
  title: string;
  description?: string | null;
}

export default function SidebarLayoutHeader({ title, description }: SidebarLayoutHeaderProps) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
        {title}
      </h1>
      {description && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      )}
    </div>
  );
}
