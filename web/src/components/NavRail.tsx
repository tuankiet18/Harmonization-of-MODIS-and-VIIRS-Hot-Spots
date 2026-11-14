import { useRef } from 'react';
import { useI18n } from '../i18n';
import type { TabDef } from '../tabs';

interface Props {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}

/** Section switcher: a slim rail on the left of wide screens, a bar along the bottom of narrow ones. */
export default function NavRail({ tabs, active, onChange }: Props) {
  const { t } = useI18n();
  const list = useRef<HTMLDivElement>(null);

  const move = (to: number) => {
    const next = tabs[(to + tabs.length) % tabs.length];
    onChange(next.id);
    list.current?.querySelector<HTMLButtonElement>(`#tab-${next.id}`)?.focus();
  };

  return (
    <nav aria-label={t('navLabel')} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:static lg:w-[76px] lg:shrink-0 lg:border-r lg:border-t-0">
      <div
        ref={list}
        role="tablist"
        aria-orientation="vertical"
        className="flex justify-around lg:flex-col lg:justify-start lg:gap-1 lg:p-2"
        onKeyDown={(e) => {
          const i = tabs.findIndex((x) => x.id === active);
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') move(i + 1);
          else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') move(i - 1);
          else if (e.key === 'Home') move(0);
          else if (e.key === 'End') move(tabs.length - 1);
          else return;
          e.preventDefault();
        }}
      >
        {tabs.map(({ id, label, Icon }) => {
          const on = id === active;
          return (
            <button
              key={id}
              id={`tab-${id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(id)}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 px-2 py-1.5 text-xs font-semibold transition-colors lg:flex-none lg:rounded-xl lg:border-l-2 lg:border-t-0 ${
                on ? 'border-ember bg-ember-wash text-ember-dark' : 'border-transparent text-muted hover:bg-page hover:text-ink'
              }`}
            >
              <Icon />
              {t(label)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
