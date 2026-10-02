import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { MapCanvas } from '../components/MapCanvas';
import { LinkButton } from '../components/ui';
import { useDocumentTitle } from '../lib/hooks';

/* -------------------------------------------------------------------------- */
/* Decorative hero artwork (no external image assets are shipped)             */
/* -------------------------------------------------------------------------- */

function HeroArtwork() {
  return (
    <svg viewBox="0 0 560 360" className="h-full w-full" role="img" aria-label="Student and guardian connected during a trip">
      <defs>
        <linearGradient id="heroSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#EAF1FF" />
          <stop offset="100%" stopColor="#F4F7FB" />
        </linearGradient>
        <linearGradient id="heroRoad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#D0E5D5" />
          <stop offset="100%" stopColor="#E9F0EB" />
        </linearGradient>
      </defs>

      <rect width="560" height="360" fill="url(#heroSky)" />
      <rect x="0" y="250" width="560" height="110" fill="url(#heroRoad)" />
      <rect x="0" y="292" width="560" height="10" fill="#FFFFFF" />
      <rect x="40" y="196" width="96" height="60" rx="10" fill="#D0E5D5" />
      <rect x="430" y="182" width="104" height="74" rx="10" fill="#D0E5D5" />

      {/* buildings */}
      <rect x="150" y="170" width="70" height="86" rx="8" fill="#FFFFFF" stroke="#E0E7F0" />
      <rect x="164" y="186" width="16" height="16" rx="3" fill="#EAF1FF" />
      <rect x="190" y="186" width="16" height="16" rx="3" fill="#EAF1FF" />
      <rect x="164" y="212" width="16" height="16" rx="3" fill="#EAF1FF" />
      <rect x="190" y="212" width="16" height="16" rx="3" fill="#EAF1FF" />

      <rect x="330" y="158" width="84" height="98" rx="8" fill="#FFFFFF" stroke="#E0E7F0" />
      <rect x="346" y="176" width="18" height="18" rx="3" fill="#EAF1FF" />
      <rect x="376" y="176" width="18" height="18" rx="3" fill="#EAF1FF" />
      <rect x="346" y="206" width="18" height="18" rx="3" fill="#EAF1FF" />
      <rect x="376" y="206" width="18" height="18" rx="3" fill="#EAF1FF" />

      {/* route */}
      <path
        d="M60 300 C 150 300, 170 250, 250 250 S 380 220, 470 236"
        fill="none"
        stroke="#2463EB"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.9"
      />

      {/* BaoBao tricycle */}
      <g transform="translate(238 214)">
        <rect x="0" y="0" width="74" height="40" rx="10" fill="#2463EB" />
        <rect x="8" y="8" width="34" height="20" rx="5" fill="#EAF1FF" />
        <rect x="48" y="6" width="22" height="26" rx="5" fill="#1D54D0" />
        <circle cx="16" cy="44" r="8" fill="#102846" />
        <circle cx="60" cy="44" r="8" fill="#102846" />
        <text x="12" y="-6" fontSize="11" fontWeight="700" fill="#102846">BaoBao</text>
      </g>

      {/* student marker */}
      <g transform="translate(120 236)">
        <circle cx="0" cy="0" r="16" fill="#102846" />
        <circle cx="0" cy="-5" r="5.5" fill="#FFFFFF" />
        <path d="M-8 8a8 8 0 0 1 16 0" fill="#FFFFFF" />
        <rect x="-26" y="24" width="52" height="22" rx="8" fill="#102846" />
        <text x="-18" y="39" fontSize="11" fontWeight="600" fill="#FFFFFF">Maya</text>
      </g>

      {/* guardian phone card */}
      <g transform="translate(408 44)">
        <rect x="0" y="0" width="126" height="96" rx="16" fill="#FFFFFF" stroke="#E0E7F0" />
        <circle cx="20" cy="22" r="12" fill="#EAF7F0" />
        <path d="m15 22 4 4 7-8" stroke="#167650" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="40" y="20" fontSize="11" fontWeight="700" fill="#172B45">Live trip</text>
        <text x="40" y="34" fontSize="10" fill="#68788E">Location sharing</text>
        <rect x="14" y="50" width="98" height="8" rx="4" fill="#E0E7F0" />
        <rect x="14" y="50" width="64" height="8" rx="4" fill="#2463EB" />
        <text x="14" y="78" fontSize="10" fill="#68788E">Arriving in 8 min</text>
      </g>

      {/* shield */}
      <g transform="translate(52 60)">
        <rect x="0" y="0" width="66" height="66" rx="16" fill="#EAF1FF" />
        <path
          d="M33 50s14-7 14-17V19l-14-5-14 5v14c0 10 14 17 14 17z"
          fill="none"
          stroke="#2463EB"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="m27 33 4.5 4.5L40 29" stroke="#2463EB" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Content                                                                     */
/* -------------------------------------------------------------------------- */

const safetyCards = [
  {
    icon: 'shield-check',
    title: 'Verified Drivers',
    body: 'Drivers are verified before providing student rides.',
  },
  {
    icon: 'badge-check',
    title: 'Verified Vehicles',
    body: 'BaoBao vehicles are registered and verified.',
  },
  {
    icon: 'map-pin',
    title: 'Live Location',
    body: 'Parents can monitor their child’s active trip.',
  },
  {
    icon: 'siren',
    title: 'Emergency Support',
    body: 'Quick access to emergency assistance.',
  },
];

const steps = [
  { title: '1. Book', body: 'Student books a BaoBao ride.' },
  { title: '2. Verify', body: 'A verified driver accepts the ride.' },
  { title: '3. Monitor', body: 'Parent can see the child’s active trip.' },
  { title: '4. Arrive Safely', body: 'Parent receives an arrival notification.' },
];

const promises = [
  'Verified before every journey',
  'Connected during the active trip',
  'Private by design',
];

const supportCards = [
  {
    icon: 'phone-call',
    title: 'Emergency hotline',
    body: 'Access your configured emergency contact.',
  },
  {
    icon: 'user-round',
    title: 'Contact guardian',
    body: 'Keep your connected guardian informed.',
  },
  {
    icon: 'share',
    title: 'Live location sharing',
    body: 'Share your current trip location for assistance.',
  },
];

const faqs = [
  {
    q: 'Do parents need to install an app?',
    a: 'No. Sign in to Guardian Transit from a web browser on your computer, tablet or phone.',
  },
  {
    q: 'When can I see my child’s location?',
    a: 'Location is shared with the connected guardian during an active trip and automatically stops on arrival.',
  },
  {
    q: 'What information can I monitor?',
    a: 'Follow the child and BaoBao locations, route, verified driver, vehicle, destination, ETA and trip status.',
  },
];

export default function Landing() {
  useDocumentTitle('Guardian Transit — Safe rides for students');

  return (
    <div className="overflow-x-hidden">
      {/* ---------------------------- Hero ---------------------------- */}
      <section className="bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-10 px-6 py-14 md:px-10 lg:flex-row lg:gap-12 lg:py-[72px] xl:px-16">
          <div className="flex flex-1 flex-col items-start gap-6">
            <span className="gt-badge gt-badge-primary">STUDENT SAFETY. FAMILY CONNECTION.</span>
            <h1 className="gt-heading-xl text-[38px] sm:text-[46px] lg:text-[56px]">
              Safe Rides. Connected Families.
            </h1>
            <p className="max-w-[560px] text-[15px] leading-[1.6] text-muted lg:text-[16px]">
              Guardian Transit helps students travel home safely while giving parents peace of mind wherever they are.
            </p>
            <div className="flex flex-wrap gap-3">
              <LinkButton to="/login" trailingIcon="arrow-right">
                Book a Safe Ride
              </LinkButton>
              <LinkButton to="/login" variant="secondary">
                Monitor My Child
              </LinkButton>
            </div>
            <p className="flex items-center gap-2 text-[12px] text-muted">
              <Icon name="check-circle" size={18} className="text-success" />
              Parents stay connected in a browser. No installation needed.
            </p>
          </div>

          <div className="w-full max-w-[560px] shrink-0 overflow-hidden rounded-[20px] border border-border bg-white shadow-card">
            <div className="h-[300px] sm:h-[360px]">
              <HeroArtwork />
            </div>
            <div className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] font-bold text-heading">Maya’s ride home</p>
                <span className="gt-badge gt-badge-success">Live Location</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[12px] text-muted">
                <span>School</span>
                <span className="text-primary">● ─ ─ ─ ─ ●</span>
                <span>Home · 8 min</span>
              </div>
            </div>
          </div>
        </div>

        {/* Connected care strip */}
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-[1440px] flex-wrap justify-between gap-4 px-6 py-6 md:px-10 xl:px-16">
            {promises.map((promise) => (
              <span key={promise} className="flex items-center gap-2.5 text-[13px] font-semibold text-heading">
                <Icon name="check-circle" size={18} className="text-success" />
                {promise}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------- Safety --------------------------- */}
      <section id="safety" className="scroll-mt-24">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-6 py-14 md:px-10 lg:py-16 xl:px-16">
          <div className="flex flex-col gap-2.5">
            <p className="gt-eyebrow">Built around student safety</p>
            <h2 className="gt-heading-lg">Your Child’s Safety Comes First</h2>
            <p className="text-[14px] text-muted">A safer way home, with the people and information that matter.</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {safetyCards.map((card) => (
              <article key={card.title} className="flex flex-col gap-4 rounded-[20px] border border-border bg-white p-6">
                <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[12px] bg-primary-soft text-primary">
                  <Icon name={card.icon} size={20} />
                </span>
                <div>
                  <h3 className="text-[18px] font-bold text-heading">{card.title}</h3>
                  <p className="mt-2 text-[14px] text-muted">{card.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------ How it works ------------------------ */}
      <section id="how-it-works" className="scroll-mt-24 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-6 py-14 md:px-10 lg:py-16 xl:px-16">
          <h2 className="gt-heading-lg">How It Works</h2>
          <div className="grid gap-7 sm:grid-cols-2 xl:grid-cols-4">
            {steps.map((step, index) => (
              <div key={step.title} className="flex flex-col gap-4">
                <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[12px] bg-primary-soft text-[18px] font-bold text-primary">
                  {index + 1}
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="text-[18px] font-bold text-heading">{step.title}</h3>
                  <p className="text-[14px] text-muted">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------- Parent monitoring -------------------- */}
      <section className="bg-canvas-alt">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-7 px-6 py-14 md:px-10 lg:py-16 xl:px-16">
          <div className="flex flex-col gap-3">
            <p className="gt-eyebrow">Parent web monitoring</p>
            <h2 className="gt-heading-lg">Stay Connected Wherever You Are</h2>
            <p className="max-w-2xl text-[16px] text-muted">
              Parents can monitor their child’s active trip directly from a web browser.
            </p>
          </div>

          <div className="flex flex-col gap-6 rounded-[20px] border border-border bg-white p-6 shadow-card">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-[18px] font-bold text-heading">Maya is on her way home.</h3>
              <span className="gt-badge gt-badge-success">Location Sharing: Active</span>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
              <div className="flex flex-col gap-3.5">
                <MapCanvas
                  height={380}
                  pickup={{ lat: 14.5995, lng: 120.9842, label: 'San Isidro · Gate A' }}
                  destination={{ lat: 14.6071, lng: 120.9912, label: 'Home' }}
                  student={{ lat: 14.6018, lng: 120.9871, label: 'Maya' }}
                  driver={{ lat: 14.6036, lng: 120.9892, label: 'BaoBao' }}
                  freshness="Updated 3:42 PM · 5 sec ago"
                  live
                />
                <p className="text-[12px] text-muted">
                  <span className="text-navy">●</span> Child location&nbsp;&nbsp;
                  <span className="text-primary">●</span> BaoBao location&nbsp;&nbsp;
                  <span className="text-heading">◇</span> Destination&nbsp;&nbsp;
                  <span className="text-primary">──</span> Route
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <p className="text-[26px] font-bold leading-[1.2] text-heading">8 min to home</p>
                <dl className="flex flex-col gap-3 text-[13px] leading-[1.6] text-heading">
                  <div>
                    <dt className="text-muted">Driver</dt>
                    <dd className="font-semibold">Ramon Cruz · Verified ✓</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Vehicle</dt>
                    <dd className="font-semibold">Blue BaoBao · GT-014</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Destination</dt>
                    <dd className="font-semibold">18 Mabini St, San Roque</dd>
                  </div>
                  <div>
                    <dt className="text-muted">ETA</dt>
                    <dd className="font-semibold">Arriving 3:50 PM</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Trip status</dt>
                    <dd className="font-semibold">On the Way</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <LinkButton to="/login" trailingIcon="arrow-right">
                Monitor My Child
              </LinkButton>
            </div>

            <p className="text-[12px] text-muted">
              Illustrative active trip · Access is limited to your connected child. Location sharing stops on arrival.
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------- Rewards ------------------------- */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 py-14 md:px-10 lg:grid-cols-2 lg:py-16 xl:px-16">
          <div className="flex flex-col gap-4.5">
            <p className="gt-eyebrow">Guardian Points</p>
            <h2 className="gt-heading-lg">Every Ride Earns Rewards</h2>
            <p className="text-[14px] text-muted">
              Small journeys add up. Every completed ride brings your child one step closer to a free ride.
            </p>
            <div className="flex flex-col gap-3 py-1">
              <p className="text-[18px] font-bold text-primary">1 Ride = 1 Point</p>
              <p className="text-[18px] font-bold text-navy">50 Points = FREE RIDE</p>
            </div>
            <p className="text-[12px] text-muted">Points are added after arrival. The active ride is not counted yet.</p>
          </div>

          <div className="flex flex-col gap-4 rounded-[20px] border border-border bg-white p-6 shadow-card">
            <div className="flex flex-col gap-3.5">
              <p className="text-[13px] font-bold text-heading">Guardian Points</p>
              <p className="text-[26px] font-bold leading-[1.2] text-heading">32 / 50 Points</p>
              <div className="gt-progress">
                <span style={{ width: '64%' }} />
              </div>
              <p className="text-[12px] text-muted">18 more rides until your FREE RIDE!</p>
            </div>
            <div className="flex items-center gap-3.5 border-t border-border pt-4">
              <span className="flex h-8 w-8 items-center justify-center text-primary">
                <Icon name="gift" size={28} />
              </span>
              <div className="flex flex-col gap-2">
                <p className="text-[18px] font-bold text-heading">Your next ride, on us.</p>
                <span className="gt-badge gt-badge-neutral">Locked · Unlock at 50 points</span>
              </div>
            </div>
            <LinkButton to="/register" variant="secondary" block>
              Create a student account
            </LinkButton>
          </div>
        </div>
      </section>

      {/* ------------------------- Emergency ------------------------ */}
      <section className="bg-canvas-alt">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-7 px-6 py-14 md:px-10 lg:py-16 xl:px-16">
          <div className="flex flex-col gap-3">
            <p className="gt-eyebrow text-danger">Emergency &amp; SOS</p>
            <h2 className="gt-heading-lg">Help Is Always Within Reach</h2>
            <p className="max-w-2xl text-[14px] text-muted">
              When something isn’t right, safety support is easy to find — not hidden in a menu.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {supportCards.map((card) => (
              <article key={card.title} className="flex flex-col gap-3 rounded-[20px] border border-border bg-white p-5">
                <Icon name={card.icon} size={20} className="text-danger" />
                <div>
                  <h3 className="text-[16px] font-bold text-heading">{card.title}</h3>
                  <p className="mt-1.5 text-[13px] text-muted">{card.body}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="flex flex-col items-start gap-4 rounded-[12px] bg-danger-soft p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-heading">
              For urgent assistance during a ride, use SOS. Emergency contacts are configured in your account; no
              hotline number is shown here.
            </p>
            <LinkButton to="/login" variant="danger" icon="siren" className="shrink-0">
              SOS · Emergency Help
            </LinkButton>
          </div>
        </div>
      </section>

      {/* --------------------- About + privacy ---------------------- */}
      <section id="about" className="scroll-mt-24 bg-white">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-6 py-14 md:px-10 lg:grid-cols-2 lg:py-16 xl:px-16">
          <div className="flex flex-col gap-4">
            <p className="gt-eyebrow">About Guardian Transit</p>
            <h2 className="gt-heading-lg">More than a ride. A connected way home.</h2>
            <p className="text-[14px] leading-[1.6] text-muted">
              Guardian Transit brings students, verified BaoBao drivers and parents together around one shared
              priority: a safe journey home. Students ride with care. Families stay in the loop.
            </p>
          </div>

          <div id="privacy" className="scroll-mt-24 flex flex-col gap-4 rounded-[20px] bg-primary-soft p-7">
            <Icon name="shield-check" size={28} className="text-primary" />
            <p className="text-[17px] font-semibold text-heading">Connected, not constantly tracked.</p>
            <p className="text-[14px] leading-[1.6] text-muted">
              Your child’s live location is visible to their connected guardian only during an active ride. Sharing
              ends on arrival. Manage your monitoring preferences in your parent profile.
            </p>
            <Link to="/parent/profile" className="text-[14px] font-semibold text-primary">
              Read our Privacy Policy →
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------- FAQ --------------------------- */}
      <section id="faq" className="scroll-mt-24 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 pb-14 md:px-10 lg:pb-16 xl:px-16">
          <h2 className="gt-heading-lg">A few things parents ask</h2>
          <div className="flex flex-col gap-4">
            {faqs.map((item) => (
              <details key={item.q} className="group rounded-[12px] border border-border bg-white px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-bold text-heading">
                  {item.q}
                  <Icon name="chevron-down" size={18} className="shrink-0 text-muted transition group-open:rotate-180" />
                </summary>
                <p className="mt-2.5 text-[14px] text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------- CTA ---------------------------- */}
      <section className="bg-navy">
        <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-8 px-6 py-12 md:px-10 lg:flex-row lg:items-center xl:px-16">
          <div className="flex flex-col gap-3">
            <h2 className="text-[28px] font-bold leading-[1.2] text-white lg:text-[34px]">
              Be there for the journey, wherever you are.
            </h2>
            <p className="text-[14px] text-navy-text">Open your browser. Connect with your child. Follow their safe ride home.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <LinkButton to="/login" trailingIcon="arrow-right">
              Monitor My Child
            </LinkButton>
            <LinkButton to="/register" variant="secondary">
              Create Account
            </LinkButton>
          </div>
        </div>
      </section>
    </div>
  );
}
