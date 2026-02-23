import React, { type ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  tabs?: ReactNode;
};

export function PageHeader({ title, subtitle, actions, tabs }: PageHeaderProps) {
  return (
    <header className="section-stack border-b border-border pb-5 md:pb-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="section-stack max-w-3xl">
          <h1 className="type-h1">{title}</h1>
          {subtitle ? <p className="type-caption">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
      </div>
      {tabs ? <div>{tabs}</div> : null}
    </header>
  );
}
