import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface AppPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
  accentClassName?: string;
}

export default function AppPageHeader({ title, subtitle, actions, icon: Icon, accentClassName = 'bg-sky-600' }: AppPageHeaderProps) {
  return (
    <section className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 lg:sticky lg:top-0 lg:z-40 lg:px-4">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white shadow-sm ${accentClassName}`}><Icon className="h-3.5 w-3.5" /></div>}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight text-slate-900">{title}</h1>
            {subtitle && <p className="mt-0.5 truncate text-[11px] leading-tight text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </div>
    </section>
  );
}
