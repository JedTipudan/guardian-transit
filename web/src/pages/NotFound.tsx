import { LinkButton } from '../components/ui';
import { useDocumentTitle } from '../lib/hooks';

export default function NotFound() {
  useDocumentTitle('Page not found · Guardian Transit');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas-alt px-6 text-center">
      <p className="gt-eyebrow">404</p>
      <h1 className="gt-heading-md">This page took a wrong turn.</h1>
      <p className="max-w-md text-[14px] text-muted">
        The link may be outdated, or the trip you were following has already finished.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <LinkButton to="/" trailingIcon="arrow-right">
          Back to home
        </LinkButton>
        <LinkButton to="/login" variant="secondary">
          Sign in
        </LinkButton>
      </div>
    </div>
  );
}
