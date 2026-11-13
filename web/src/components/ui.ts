/** Shared Tailwind class strings so every button and field looks and behaves the same. */
const base = 'inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 font-medium transition-colors pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-40';

export const btn = `${base} border-line bg-surface hover:border-ink`;
export const btnSolid = `${base} border-ink bg-ink text-white hover:bg-ink-soft`;
export const tool = `${base} px-2.5 gap-1.5 border-line bg-surface hover:border-ink`;
export const toolOn = `${base} px-2.5 gap-1.5 border-ink bg-ink text-white`;
export const toolIcon = 'inline-flex size-10 items-center justify-center rounded-lg border border-line bg-surface transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:size-11';
export const field = 'min-h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 hover:border-muted pointer-coarse:min-h-11';
export const fieldLabel = 'flex flex-col gap-0.5 text-sm text-muted';
export const select = field.replace('w-full', 'w-auto');
