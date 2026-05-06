import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Check, Calendar, StickyNote, Sparkles, Shield, Zap, Star, Repeat, ArrowRight, ChevronDown, X, Pencil, FileText, AlignLeft, Code2, Brain, LayoutGrid, Flag, Layers, Image as ImageIcon, BellRing, Filter as FilterIcon, BarChart3, Lock, Moon, Clock } from 'lucide-react';
import { AppLogo } from '@/components/AppLogo';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { setSetting } from '@/utils/settingsStorage';
import socialX from '@/assets/social-x.png';
import socialReddit from '@/assets/social-reddit.png';
import socialYoutube from '@/assets/social-youtube.png';
import socialInstagram from '@/assets/social-instagram.png';

const BLUE = '#3c78f0';
const BLUE_DARK = '#2b5dbf';

export default function Landing() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>('Made For');
  const [activeSection, setActiveSection] = useState<string>('');
  const [activeFeature, setActiveFeature] = useState<string>('Sketch Editor');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Aggressively preload onboarding + today chunks immediately so tapping
  // "Get Flowist Free" opens the language selection instantly (no 7s white page).
  useEffect(() => {
    import('@/components/OnboardingFlow').catch(() => {});
    import('@/pages/todo/Today').catch(() => {});
  }, []);

  // Track which section is currently in view (for footer link highlight)
  useEffect(() => {
    const ids = ['about', 'features', 'whats-new', 'faq'];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const smoothScrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMenuOpen(false);
  };

  const handleGetStarted = async () => {
    const preload = import('@/components/OnboardingFlow').catch(() => {});
    await setSetting('onboarding_completed', false);
    try {
      sessionStorage.setItem('flowist_landing_acknowledged', 'true');
      localStorage.setItem('flowist_landing_acknowledged', 'true');
    } catch {}
    await preload;
    window.dispatchEvent(new Event('flowistLandingDismissed'));
    navigate('/');
  };

  const menuGroups: { label: string; items: { label: string; href?: string }[] }[] = [
    {
      label: 'Made For',
      items: [
        { label: 'Task Management', href: '#cards' },
        { label: 'Note Taking', href: '#cards' },
        { label: 'Sketching', href: '#cards' },
        { label: 'Habit Forming', href: '#cards' },
        { label: 'Daily Planning', href: '#cards' },
      ],
    },
    {
      label: 'Resources',
      items: [
        { label: 'FAQ', href: '#faq' },
        { label: 'Privacy', href: '/privacy-policy' },
        { label: 'Terms', href: '/terms-and-conditions' },
      ],
    },
  ];

  const productCards = [
    {
      label: 'To-Do List',
      title: 'Organize everything in your life',
      desc: "Whether it's work projects, personal tasks, or study plans, Flowist helps you organize and confidently tackle everything in your life.",
      icon: Check,
      gradient: 'from-[#eaf1ff] to-[#f5f9ff]',
    },
    {
      label: 'Sketch Editor',
      title: 'Sketch your ideas freely',
      desc: 'A powerful infinite canvas with shapes, layers and templates — capture thoughts visually, the way your mind actually works.',
      icon: Sparkles,
      gradient: 'from-[#fff4ea] to-[#fffaf3]',
    },
    {
      label: 'Regular Notes',
      title: 'Capture thoughts in a clean editor',
      desc: 'A distraction-free notes editor with rich formatting, tags and folders — perfect for journaling, ideas and quick captures.',
      icon: StickyNote,
      gradient: 'from-[#eafff1] to-[#f4fff8]',
    },
    {
      label: 'Lined Notes',
      title: 'Write neatly on ruled paper',
      desc: 'Classic ruled paper with a modern feel — handwrite or type with perfect alignment for a calm, focused writing experience.',
      icon: Calendar,
      gradient: 'from-[#fdeaff] to-[#fbf3ff]',
    },
  ];

  const features = [
    { label: 'Sketch Editor', icon: Pencil, gradient: 'from-[#fff4ea] to-[#fffaf3]' },
    { label: 'Regular Note', icon: StickyNote, gradient: 'from-[#eafff1] to-[#f4fff8]' },
    { label: 'Lined Note', icon: AlignLeft, gradient: 'from-[#fdeaff] to-[#fbf3ff]' },
    { label: 'Code Editor', icon: Code2, gradient: 'from-[#eaf1ff] to-[#f5f9ff]' },
    { label: 'NLP', icon: Brain, gradient: 'from-[#fff0f0] to-[#fff7f7]' },
    { label: 'Calendar', icon: Calendar, gradient: 'from-[#eaf6ff] to-[#f4fbff]' },
    { label: 'Kanban', icon: LayoutGrid, gradient: 'from-[#fff8ea] to-[#fffcf3]' },
    { label: 'Priority', icon: Flag, gradient: 'from-[#ffeaea] to-[#fff5f5]' },
    { label: 'Flat Layout', icon: Layers, gradient: 'from-[#eafff7] to-[#f4fffb]' },
  ];

  const suiteFeatures = [
    { title: 'Reminder', desc: 'Notifications keep ringing until you complete the task — nothing slips by.', icon: BellRing },
    { title: 'Repeat', desc: 'Flexible recurring rules — daily, weekly, monthly or fully custom schedules.', icon: Repeat },
    { title: 'NLP', desc: 'Type naturally and Flowist auto-detects dates, times and reminder cues.', icon: Brain },
    { title: 'Filter', desc: 'Build smart filters like “high-priority this week” to focus on what matters.', icon: FilterIcon },
    { title: 'Progress', desc: 'Track focus time, streaks and habit logs to see your real momentum daily.', icon: BarChart3 },
    { title: 'Lock', desc: 'Protect private notes and tasks behind a passcode or biometric lock.', icon: Lock },
    { title: 'Dark Mode', desc: 'A calm, eye-friendly dark theme that follows your system preference.', icon: Moon },
    { title: 'Time Track', desc: 'Log time on tasks and habits to see exactly where your day really goes.', icon: Clock },
  ];

  const faqs = [
    { q: 'Is Flowist free?', a: 'Yes — start free. Upgrade anytime for unlimited everything from $1.49/week.' },
    { q: 'Does it work offline?', a: 'Fully. Your tasks and notes are saved on your device and sync when you’re back online.' },
    { q: 'Can I switch devices?', a: 'Yes. Sign in and your tasks, notes and habits follow you across web, Android and iOS.' },
    { q: 'Is my data private?', a: 'Always. You own your data. Export or back it up to Google Drive anytime.' },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased selection:bg-[#3c78f0]/20">
      {/* Header */}
      <header
        className={`sticky top-0 z-40 w-full border-b border-slate-200 transition-all ${
          scrolled ? 'bg-white/90 backdrop-blur-xl' : 'bg-white'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 sm:px-6 sm:py-2.5">
          <a href="#top" className="flex items-center gap-2">
            <AppLogo size="md" />
            <span className="text-xl font-extrabold tracking-tight" style={{ color: BLUE }}>Flowist</span>
          </a>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGetStarted}
              className="rounded-lg px-4 py-2 text-sm font-bold text-white transition-transform active:scale-[0.98] sm:px-5 sm:py-2.5 sm:text-[15px]"
              style={{ backgroundColor: BLUE }}
            >
              Get Flowist Free
            </button>

            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Open menu"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 transition-colors active:bg-slate-100"
                >
                  <Menu className="h-6 w-6" strokeWidth={2.25} />
                </button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="flex w-full max-w-full flex-col border-l border-slate-200 bg-white p-0 sm:max-w-sm [&>button]:hidden"
              >
                {/* Top bar inside menu (Todoist-style) */}
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <AppLogo size="md" />
                    <span className="text-lg font-extrabold" style={{ color: BLUE }}>Flowist</span>
                    <button
                      onClick={() => { setMenuOpen(false); handleGetStarted(); }}
                      className="ml-2 rounded-lg px-4 py-2 text-sm font-bold text-white"
                      style={{ backgroundColor: BLUE }}
                    >
                      Start for free
                    </button>
                  </div>
                  <button
                    onClick={() => setMenuOpen(false)}
                    aria-label="Close menu"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 active:bg-slate-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Collapsible groups */}
                <div className="flex-1 overflow-y-auto px-2 py-4">
                  {menuGroups.map((group) => {
                    const isOpen = openGroup === group.label;
                    return (
                      <div key={group.label} className="mb-2">
                        <button
                          onClick={() => setOpenGroup(isOpen ? null : group.label)}
                          className={`flex w-full items-center justify-between rounded-xl px-5 py-4 text-left text-lg font-semibold text-slate-900 transition-colors ${
                            isOpen ? 'bg-slate-100' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span>{group.label}</span>
                          <ChevronDown
                            className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          />
                        </button>
                        {isOpen && (
                          <div className="mt-1 flex flex-col">
                            {group.items.map((item) => (
                              <a
                                key={item.label}
                                href={item.href || '#'}
                                onClick={() => setMenuOpen(false)}
                                className="px-9 py-3 text-base text-slate-700 transition-colors active:bg-slate-50"
                              >
                                {item.label}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <a
                    href="#faq"
                    onClick={() => setMenuOpen(false)}
                    className="mt-1 block rounded-xl px-5 py-4 text-lg font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    Pricing
                  </a>
                </div>

                {/* Bottom buttons */}
                <div className="border-t border-slate-200 px-4 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => { setMenuOpen(false); handleGetStarted(); }}
                      className="rounded-lg bg-slate-100 py-3 text-base font-bold text-slate-900 active:bg-slate-200"
                    >
                      Log in
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); handleGetStarted(); }}
                      className="rounded-lg py-3 text-base font-bold text-white"
                      style={{ backgroundColor: BLUE }}
                    >
                      Start for free
                    </button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section id="about" className="relative overflow-hidden scroll-mt-20">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-[#eaf1ff] via-white to-white" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pt-10 pb-8 sm:px-6 sm:pt-20 sm:pb-16 md:grid-cols-2">
            <div className="text-center md:text-left">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BLUE }} />
                Now on Web, Android & iOS
              </div>
              <h1 className="mb-5 text-[36px] font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-[54px]">
                Organize your day,<br />
                <span style={{ color: BLUE }}>achieve more.</span>
              </h1>
              <p className="mx-auto mb-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg md:mx-0">
                One calm app to plan, capture and follow through, without the noise.
              </p>
              <div className="mx-auto flex max-w-md flex-col gap-4 md:mx-0">
                <button
                  onClick={handleGetStarted}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-8 py-3 text-base font-bold text-white transition-transform active:translate-y-1"
                  style={{ backgroundColor: BLUE, boxShadow: `0 5px 0 0 ${BLUE_DARK}` }}
                >
                  Get Flowist Free <ArrowRight className="h-5 w-5" />
                </button>
                <div className="grid w-full grid-cols-2 gap-2">
                  <a
                    href="https://apps.apple.com/app/flowist"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-md bg-black px-3 text-white transition-transform active:translate-y-0.5"
                    aria-label="Download on the App Store"
                  >
                    <svg viewBox="0 0 384 512" className="h-7 w-7 fill-current shrink-0" aria-hidden="true">
                      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM256.5 105.7c30.1-35.7 27.4-68.2 26.5-79.9-26.6 1.5-57.4 18.1-74.9 38.5-19.3 21.9-30.6 49-28.2 78.8 28.7 2.2 54.9-12.5 76.6-37.4z"/>
                    </svg>
                    <div className="flex flex-col items-start leading-tight">
                      <span className="text-[10px] font-medium opacity-90">Download on the</span>
                      <span className="text-[17px] font-semibold tracking-tight">App Store</span>
                    </div>
                  </a>
                  <a
                    href="https://play.google.com/store/apps/details?id=nota.npd.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-md bg-black px-3 text-white transition-transform active:translate-y-0.5"
                    aria-label="Get it on Google Play"
                  >
                    <svg viewBox="0 0 512 512" className="h-7 w-7 shrink-0" aria-hidden="true">
                      <path fill="#00d7fe" d="M99.6 14.4C77.7 21.5 64 41.6 64 67.7v376.6c0 26.1 13.7 46.2 35.6 53.3l217.4-251.8L99.6 14.4z"/>
                      <path fill="#ffce00" d="M396.7 314.2l-79.7-58.4 70.9-82.1 105.4 60.7c19.7 11.4 19.7 39.8 0 51.2l-96.6 28.6z"/>
                      <path fill="#ff3a44" d="M396.7 314.2l-79.7-58.4-217.4 242.6c8.7 2.8 18.8 1.9 28.6-3.7l268.5-180.5z"/>
                      <path fill="#48ff48" d="M99.6 14.4c-9.8-5.6-19.9-6.5-28.6-3.7l245.9 244.7 79.7-82.1L99.6 14.4z"/>
                    </svg>
                    <div className="flex flex-col items-start leading-tight">
                      <span className="text-[10px] font-medium opacity-90">GET IT ON</span>
                      <span className="text-[17px] font-semibold tracking-tight">Google Play</span>
                    </div>
                  </a>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500">Try it free · Works offline · Cancel anytime</p>
            </div>

            {/* Hero side decoration (replaces inline cards) */}
            <div className="relative mx-auto hidden w-full max-w-md md:block">
              <div className="absolute -inset-6 rounded-[40px] bg-[#3c78f0]/10 blur-3xl" />
              <div className="relative aspect-[4/5] w-full rounded-[32px] border border-slate-200 bg-gradient-to-br from-[#eaf1ff] to-white shadow-[0_30px_80px_-30px_rgba(60,120,240,0.45)]" />
            </div>
          </div>
        </section>

        {/* Trust bar removed per request */}

        {/* Product feature cards (TickTick-style) */}
        <section id="features" className="scroll-mt-20 bg-gradient-to-b from-white via-[#f5f9ff] to-white py-16 sm:py-24">
          <div className="mx-auto max-w-3xl space-y-6 px-4 sm:space-y-8 sm:px-6">
            {productCards.map(({ label, title, desc, icon: Icon, gradient }) => (
              <article
                key={label}
                className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.18)] sm:p-9"
              >
                <p className="mb-3 text-sm font-bold tracking-tight sm:text-base" style={{ color: BLUE }}>
                  {label}
                </p>
                <h3 className="mb-4 text-[26px] font-extrabold leading-[1.15] tracking-tight text-slate-900 sm:text-[34px]">
                  {title}
                </h3>
                <p className="mb-7 text-[15px] leading-relaxed text-slate-600 sm:text-base">
                  {desc}
                </p>
                <div
                  className={`relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${gradient}`}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 shadow-sm backdrop-blur-sm">
                    <Icon className="h-8 w-8" style={{ color: BLUE }} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Horizontally scrollable feature pills + active preview */}
        <section className="bg-white py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-6 text-center sm:mb-8">
              <p className="mb-2 text-base font-bold tracking-tight sm:text-lg" style={{ color: BLUE }}>
                Everything you need
              </p>
              <h2 className="text-[26px] font-extrabold tracking-tight text-slate-900 sm:text-[34px]">
                Powerful features, one calm app
              </h2>
            </div>

            {/* Scrollable pills */}
            <div className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max gap-2">
                {features.map(({ label, icon: Icon }) => {
                  const active = activeFeature === label;
                  return (
                    <button
                      key={label}
                      onClick={() => setActiveFeature(label)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all active:scale-[0.97] sm:px-4 sm:py-2 sm:text-sm ${
                        active
                          ? 'border-transparent text-white shadow-md'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                      style={active ? { backgroundColor: BLUE } : undefined}
                    >
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preview placeholder */}
            <div className="mt-6 sm:mt-8">
              {(() => {
                const f = features.find((x) => x.label === activeFeature) || features[0];
                const Icon = f.icon;
                return (
                  <div
                    className={`relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-[24px] border border-slate-200/70 bg-gradient-to-br ${f.gradient} shadow-[0_20px_60px_-30px_rgba(15,23,42,0.18)]`}
                  >
                    <div className="flex flex-col items-center gap-3 text-slate-500">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 shadow-sm backdrop-blur-sm">
                        <Icon className="h-8 w-8" style={{ color: BLUE }} />
                      </div>
                      <p className="text-sm font-semibold text-slate-600">{f.label}</p>
                      <p className="flex items-center gap-1.5 text-xs text-slate-400">
                        <ImageIcon className="h-3.5 w-3.5" /> Image placeholder
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>

        {/* Comprehensive suite of features (TickTick-style 8-card grid) */}
        <section className="bg-white py-14 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="mb-10 text-center sm:mb-14">
              <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[40px]" style={{ color: BLUE }}>
                A comprehensive suite of features
              </h2>
              <p className="mt-2 text-[24px] font-extrabold tracking-tight text-slate-900 sm:text-[32px]">
                Meet your unique needs
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-5">
              {suiteFeatures.map(({ title, desc, icon: Icon }) => (
                <div
                  key={title}
                  className="flex h-full flex-col rounded-[20px] bg-[#fafafa] p-5 shadow-[0_2px_8px_-4px_rgba(15,23,42,0.08)] sm:p-6"
                >
                  <Icon className="mb-3 h-5 w-5 text-slate-900 sm:h-6 sm:w-6" strokeWidth={1.75} />
                  <h3 className="mb-2 truncate whitespace-nowrap text-[15px] font-extrabold tracking-tight text-slate-900 sm:text-[17px]">
                    {title}
                  </h3>
                  <p className="line-clamp-4 text-[13px] leading-relaxed text-slate-600 sm:text-[14px]">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>



        {/* FAQ */}
        <section id="faq" className="bg-slate-50 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-5 sm:px-6">
            <div className="mb-10 text-center">
              <p className="mb-3 text-sm font-bold uppercase tracking-wider" style={{ color: BLUE }}>FAQ</p>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                Quick answers
              </h2>
            </div>
            <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {faqs.map((f) => (
                <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-4">
                    <span className="text-base font-semibold text-slate-900">{f.q}</span>
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg font-bold transition-transform group-open:rotate-45"
                      style={{ backgroundColor: `${BLUE}15`, color: BLUE }}
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-16">
          {/* Top: logo + social icons */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <AppLogo size="sm" />
              <span className="text-base font-extrabold" style={{ color: BLUE }}>Flowist</span>
            </div>
            <div className="flex items-center gap-2.5">
              <a href="https://x.com" target="_blank" rel="noopener noreferrer" aria-label="X" className="transition-transform hover:scale-105">
                <img src={socialX} alt="X" className="h-7 w-7 rounded-md object-contain" loading="lazy" />
              </a>
              <a href="https://reddit.com" target="_blank" rel="noopener noreferrer" aria-label="Reddit" className="transition-transform hover:scale-105">
                <img src={socialReddit} alt="Reddit" className="h-7 w-7 object-contain" loading="lazy" />
              </a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="transition-transform hover:scale-105">
                <img src={socialYoutube} alt="YouTube" className="h-7 w-7 object-contain" loading="lazy" />
              </a>
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="transition-transform hover:scale-105">
                <img src={socialInstagram} alt="Instagram" className="h-7 w-7 object-contain" loading="lazy" />
              </a>
            </div>
          </div>
          <p className="mb-10 text-sm text-slate-500">© {new Date().getFullYear()} Flowist Inc.</p>

          {/* Link grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <h4 className="mb-4 text-base font-bold text-slate-900">Company</h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li><a href="/privacy-policy" className="hover:text-slate-900">Privacy</a></li>
                <li><a href="/terms-and-conditions" className="hover:text-slate-900">Terms</a></li>
                <li>
                  <a
                    href="#about"
                    onClick={smoothScrollTo('about')}
                    className="hover:text-slate-900"
                  >
                    About
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-base font-bold text-slate-900">Download</h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li><a href="https://apps.apple.com/app/flowist" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900">iOS</a></li>
                <li><a href="https://play.google.com/store/apps/details?id=nota.npd.com" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900">Android</a></li>
                <li><button onClick={handleGetStarted} className="hover:text-slate-900">Web App</button></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-base font-bold text-slate-900">Resources</h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li>
                  <a
                    href="#faq"
                    onClick={smoothScrollTo('faq')}
                    className="hover:text-slate-900"
                  >
                    FAQ
                  </a>
                </li>
                <li>
                  <a
                    href="#features"
                    onClick={smoothScrollTo('features')}
                    className="hover:text-slate-900"
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#about"
                    onClick={smoothScrollTo('about')}
                    className="hover:text-slate-900"
                  >
                    About
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-base font-bold text-slate-900">Flowist for</h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li><span>Students</span></li>
                <li><span>Professionals</span></li>
                <li><span>Creators</span></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
