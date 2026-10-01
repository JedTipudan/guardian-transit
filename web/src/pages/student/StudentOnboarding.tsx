import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Badge, Button } from '../../components/ui';
import { MapCanvas } from '../../components/MapCanvas';
import { useDocumentTitle } from '../../lib/hooks';

/** Set once the student finishes (or skips) the tour so later visits are not re-gated. */
const DISMISS_KEY = 'gt.onboarding.dismissed';

interface Slide {
  key: string;
  eyebrow: string;
  showSkip: boolean;
  artwork: 'rides' | 'map' | 'protection';
  artworkLabel: string;
  badgeTone: 'primary' | 'success';
  badgeLabel: string;
  title: string;
  lede: string;
  support: string;
  notice?: { title: string; body: string };
  caption?: string;
  showLoginLink: boolean;
}

const slides: Slide[] = [
  {
    key: 'safe-rides',
    eyebrow: 'WELCOME TO GUARDIAN TRANSIT',
    showSkip: true,
    artwork: 'rides',
    artworkLabel: 'Your BaoBao driver, checked before every ride.',
    badgeTone: 'success',
    badgeLabel: 'Verified student transport',
    title: 'Safe Rides',
    lede: 'Get home safely with a verified BaoBao driver.',
    support: 'Know your driver and vehicle before you leave school.',
    showLoginLink: true,
  },
  {
    key: 'stay-connected',
    eyebrow: 'YOUR FAMILY, IN THE LOOP',
    showSkip: true,
    artwork: 'map',
    artworkLabel: 'School → Home, watched the whole way.',
    badgeTone: 'success',
    badgeLabel: 'Connected to your guardian',
    title: 'Stay Connected',
    lede: 'Your guardian can monitor your active trip and live location.',
    support: 'Sharing starts with your trip and stops when you arrive.',
    caption: 'A little reassurance, every step home.',
    showLoginLink: false,
  },
  {
    key: 'always-protected',
    eyebrow: 'SUPPORT WHEN IT MATTERS',
    showSkip: false,
    artwork: 'protection',
    artworkLabel: 'Connected. Monitored. Supported.',
    badgeTone: 'primary',
    badgeLabel: 'Safety comes first',
    title: 'Always Protected',
    lede: 'Access safety and emergency assistance when you need it.',
    support: '',
    notice: {
      title: 'Help is easy to find',
      body: 'Reach your guardian or open SOS from your active ride.',
    },
    showLoginLink: false,
  },
];

/** Three-slide student tour — always renders, even on a direct visit. */
export default function StudentOnboarding() {
  useDocumentTitle('Welcome · Guardian Transit');
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);

  const slide = slides[index];
  const isLast = index === slides.length - 1;

  function finish() {
    try {
      window.localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      /* private mode: the tour still exits normally */
    }
    navigate('/student/login', { replace: true });
  }

  function onPrimary() {
    if (isLast) finish();
    else setIndex((value) => value + 1);
  }

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-[22px] px-6 py-9">
      <div className="flex items-center gap-2.5">
        <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[12px] bg-primary-soft text-primary">
          <Icon name="shield-check" size={28} />
        </span>
        <span className="text-[17px] font-bold text-navy">Guardian Transit</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{slide.eyebrow}</p>
        {slide.showSkip ? (
          <button
            type="button"
            onClick={finish}
            className="text-[14px] text-primary transition hover:underline"
          >
            Skip
          </button>
        ) : null}
      </div>

      {slide.artwork === 'map' ? (
        <MapCanvas
          height={240}
          className="overflow-hidden rounded-[20px]"
          pickup={{ lat: 14.5995, lng: 120.9842, label: 'School' }}
          destination={{ lat: 14.6071, lng: 120.9912, label: 'Home' }}
          student={{ lat: 14.6018, lng: 120.9871, label: 'You' }}
          interactive={false}
          hint="Your trip appears here once a ride starts."
        />
      ) : (
        <div className="flex h-[240px] flex-col items-center justify-center gap-[18px] rounded-[28px] bg-primary-soft px-6">
          <span className="flex h-[108px] w-[108px] items-center justify-center rounded-[32px] bg-white text-primary shadow-card">
            <Icon name={slide.artwork === 'rides' ? 'car-front' : 'shield-check'} size={64} />
          </span>
          <p className="text-center text-[14px] font-semibold text-primary">{slide.artworkLabel}</p>
        </div>
      )}

      <Badge tone={slide.badgeTone} icon="shield-check">
        {slide.badgeLabel}
      </Badge>

      <div className="flex flex-col gap-2.5">
        <h1 className="text-[32px] font-bold leading-[1.2] text-heading">{slide.title}</h1>
        <p className="text-[17px] leading-[1.45] text-muted">{slide.lede}</p>
        {slide.support ? <p className="text-[13px] text-muted">{slide.support}</p> : null}
      </div>

      {slide.notice ? (
        <div className="gt-notice gt-notice-primary">
          <Icon name="shield-check" size={20} className="mt-0.5 shrink-0 text-primary" />
          <p>
            <span className="font-bold text-heading">{slide.notice.title}</span>
            <br />
            {slide.notice.body}
          </p>
        </div>
      ) : null}

      <div
        className="flex gap-2"
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={slides.length}
      >
        {slides.map((item, position) => (
          <span
            key={item.key}
            className={`h-2 rounded-full transition-all duration-300 ${
              position === index ? 'w-7 bg-primary' : 'w-2 bg-border'
            }`}
          />
        ))}
      </div>

      <Button block trailingIcon="arrow-right" onClick={onPrimary}>
        Get Started
      </Button>

      {slide.caption ? <p className="text-center text-[12px] text-muted">{slide.caption}</p> : null}

      {slide.showLoginLink ? (
        <p className="text-center text-[12px] text-muted">
          Already have an account?{' '}
          <Link to="/student/login" className="font-semibold text-primary hover:underline">
            Log in
          </Link>
        </p>
      ) : null}
    </div>
  );
}
