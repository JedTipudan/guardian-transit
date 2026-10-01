import { useTheme } from '../state/ThemeContext';
import { Icon } from './Icon';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`flex h-9 w-9 items-center justify-center rounded-[10px] text-muted transition hover:bg-canvas-alt hover:text-heading ${className}`}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
    </button>
  );
}
