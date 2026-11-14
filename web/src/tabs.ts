import type { ComponentType } from 'react';
import { IconCalendar, IconOverview } from './components/Icons';
import type { StrKey } from './i18n';

export interface TabDef {
  id: string;
  label: StrKey;
  Icon: ComponentType;
}

/** The sections of the app. To add one, add an entry here and render its panel in App. */
export const TABS: TabDef[] = [
  { id: 'overview', label: 'tabOverview', Icon: IconOverview },
  { id: 'calendar', label: 'tabCalendar', Icon: IconCalendar },
];

export const DEFAULT_TAB = 'overview';
export const isTab = (id: string | null | undefined): id is string => !!id && TABS.some((t) => t.id === id);
