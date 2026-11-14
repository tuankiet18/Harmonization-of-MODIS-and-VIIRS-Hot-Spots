import type { ReactNode } from 'react';

interface Props {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}

/** A titled block for one chart, with a one-line note on how to read it. */
export default function ChartCard({ id, title, hint, children }: Props) {
  return (
    <section className="border-t border-line py-5" aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {hint && <p className="mb-2 mt-0.5 text-sm text-muted">{hint}</p>}
      {children}
    </section>
  );
}
