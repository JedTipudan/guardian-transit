import { useEffect, useState } from 'react';
import { Icon } from './Icon';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'gt_pwa_dismissed';

export function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!visible || !prompt) return null;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setVisible(false);
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4 md:bottom-6">
      <div className="flex w-full max-w-[480px] items-center gap-3 rounded-[16px] border border-primary/20 bg-white px-4 py-3 shadow-[0_4px_24px_rgba(36,99,235,0.15)] md:max-w-sm">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
          <Icon name="shield-check" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-heading">Install Guardian Transit</p>
          <p className="text-[11px] text-muted">Add to home screen for the best experience.</p>
        </div>
        <button
          type="button"
          onClick={() => void install()}
          className="shrink-0 rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-bold text-white transition hover:opacity-90"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 text-muted transition hover:text-heading"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  );
}
