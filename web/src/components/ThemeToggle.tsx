import { useTheme } from '../state/ThemeContext';
import { Icon } from './Icon';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`flex items-center gap-1.5 rounded-[10px] border border-border bg-canvas-alt px-3 py-1.5 text-[12px] font-semibold text-muted transition hover:text-heading ${className}`}
    >
      <Icon name={isDark ? 'sun' : 'moon'} size={14} />
      {isDark ? 'Light' : 'Dark'}
    </button>
  );
}
