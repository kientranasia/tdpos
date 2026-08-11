import { ReactNode } from 'react';

interface AppPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function AppPageHeader({ title, subtitle, actions }: AppPageHeaderProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 md:p-3 lg:sticky lg:top-0 lg:z-20 lg:shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}
