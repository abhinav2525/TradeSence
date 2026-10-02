type Props = {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
};

export default function PageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-eyebrow uppercase text-muted-foreground">{eyebrow}</p>}
        <h1 className="mt-1 text-title text-foreground">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-[64ch] text-[13px] leading-5 text-foreground-2">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
