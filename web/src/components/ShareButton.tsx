import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { IconLink } from './Icons';
import { btn } from './ui';

/** Copies the current address; the address already holds the whole view (see lib/urlState). */
export default function ShareButton() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); fall back to a prompt the user can copy from.
      window.prompt(t('shareFallback'), window.location.href);
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button type="button" className={btn} onClick={copy}>
      <IconLink />
      <span role="status">{copied ? t('shareCopied') : t('share')}</span>
    </button>
  );
}
