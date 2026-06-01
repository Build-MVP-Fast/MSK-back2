// CMS seed data — VERBATIM mirror of strings currently hardcoded in msk-web.
//
// Rules of engagement: every value is copied exactly — including ellipses,
// em-dashes, smart apostrophes, "&" vs "and", spacing inside spans. If a
// string here ever differs from the website, the seed is wrong and must
// be corrected to match the website (never the other way around).
//
// When the user-facing UI changes the rendered text (e.g. <span> insertions
// for the accent words "Wherever", "Apart", etc.), we store the SEMANTIC
// version — the unbroken sentence the visitor reads — without the JSX
// formatting tags. That keeps the CMS values usable from both the rendered
// HTML and any plain-text downstream surface.

import { SiteContentType } from '@prisma/client';

export interface SiteContentSeed {
  key: string;
  group: string;
  label: string;
  type: SiteContentType;
  value: string;
  description?: string;
}

// ── SiteContent (key-value, upsert by `key`) ─────────────────────────────

export const SITE_CONTENT_SEED: SiteContentSeed[] = [
  // ── Site-wide ──────────────────────────────────────────────────────────
  {
    key: 'site.name',
    group: 'site',
    label: 'Site Name',
    type: SiteContentType.PLAIN,
    value: 'MSK Residence',
  },
  {
    key: 'site.description',
    group: 'site',
    label: 'Site Description (meta)',
    type: SiteContentType.PLAIN,
    value: 'Premium properties for your perfect stay',
  },

  // ── Topbar ─────────────────────────────────────────────────────────────
  {
    key: 'topbar.promo',
    group: 'topbar',
    label: 'Topbar Promo',
    type: SiteContentType.RICH,
    value: 'First-time booking with us? Get 80% off your first stay',
    description: 'Bold portion ("80%") is highlighted in the UI automatically.',
  },

  // ── Home / Hero ────────────────────────────────────────────────────────
  {
    key: 'hero.title',
    group: 'hero',
    label: 'Hero — Title',
    type: SiteContentType.PLAIN,
    value: 'Feel at Home, Wherever You Stay',
    description: 'The word "Wherever" is rendered in the script accent font.',
  },
  {
    key: 'hero.body',
    group: 'hero',
    label: 'Hero — Body',
    type: SiteContentType.RICH,
    value:
      'Discover thoughtfully designed residences that combine comfort, style, and convenience — giving you a place to truly belong, no matter where you are.',
  },
  {
    key: 'hero.cta.primary',
    group: 'hero',
    label: 'Hero — Primary CTA',
    type: SiteContentType.PLAIN,
    value: 'Book Your Stay',
  },
  {
    key: 'hero.cta.secondary',
    group: 'hero',
    label: 'Hero — Secondary CTA',
    type: SiteContentType.PLAIN,
    value: 'Explore Properties',
  },
  {
    key: 'hero.image1',
    group: 'hero',
    label: 'Hero — Image 1 (top of stack)',
    type: SiteContentType.IMAGE_URL,
    value: '/assets/images/hero-stack1.webp',
    description: 'Front-most photo in the stacked carousel on the home page.',
  },
  {
    key: 'hero.image2',
    group: 'hero',
    label: 'Hero — Image 2 (middle of stack)',
    type: SiteContentType.IMAGE_URL,
    value: '/assets/images/hero-stack2.webp',
  },
  {
    key: 'hero.image3',
    group: 'hero',
    label: 'Hero — Image 3 (back of stack)',
    type: SiteContentType.IMAGE_URL,
    value: '/assets/images/hero-stack3.webp',
  },

  // ── Home / Discover Residences ─────────────────────────────────────────
  {
    key: 'discover.badge',
    group: 'discover',
    label: 'Discover — Badge',
    type: SiteContentType.PLAIN,
    value: 'Featured Properties',
  },
  {
    key: 'discover.title',
    group: 'discover',
    label: 'Discover — Title',
    type: SiteContentType.PLAIN,
    value: 'Discover Our Residences',
  },
  {
    key: 'discover.body',
    group: 'discover',
    label: 'Discover — Body',
    type: SiteContentType.RICH,
    value:
      'Choose from a range of modern, fully serviced apartments designed to suit your lifestyle.',
  },
  {
    key: 'discover.cta',
    group: 'discover',
    label: 'Discover — Explore All CTA',
    type: SiteContentType.PLAIN,
    value: 'Explore All',
  },

  // ── Home / Why Choose Us ───────────────────────────────────────────────
  {
    key: 'why-choose-us.badge',
    group: 'why-choose-us',
    label: 'Why Choose Us — Badge',
    type: SiteContentType.PLAIN,
    value: 'Why Choose Us',
  },
  {
    key: 'why-choose-us.title',
    group: 'why-choose-us',
    label: 'Why Choose Us — Title',
    type: SiteContentType.PLAIN,
    value: 'What Sets Us Apart',
  },
  {
    key: 'why-choose-us.body',
    group: 'why-choose-us',
    label: 'Why Choose Us — Body',
    type: SiteContentType.RICH,
    value:
      'We combine modern living, convenience, and hospitality to deliver a stay you can rely on.',
  },
  {
    key: 'why-choose-us.feature1.title',
    group: 'why-choose-us',
    label: 'Feature 1 — Title',
    type: SiteContentType.PLAIN,
    value: 'Feels Like Home',
  },
  {
    key: 'why-choose-us.feature1.description',
    group: 'why-choose-us',
    label: 'Feature 1 — Description',
    type: SiteContentType.RICH,
    value:
      'Enjoy warm, welcoming spaces designed to make every stay comfortable and personal.',
  },
  {
    key: 'why-choose-us.feature1.image',
    group: 'why-choose-us',
    label: 'Feature 1 — Image',
    type: SiteContentType.IMAGE_URL,
    value: '/assets/images/choose-us-image1.webp',
  },
  {
    key: 'why-choose-us.feature2.title',
    group: 'why-choose-us',
    label: 'Feature 2 — Title',
    type: SiteContentType.PLAIN,
    value: 'Prime Locations',
  },
  {
    key: 'why-choose-us.feature2.description',
    group: 'why-choose-us',
    label: 'Feature 2 — Description',
    type: SiteContentType.RICH,
    value: 'Stay close to key destinations, business hubs, and vibrant city life.',
  },
  {
    key: 'why-choose-us.feature2.image',
    group: 'why-choose-us',
    label: 'Feature 2 — Image',
    type: SiteContentType.IMAGE_URL,
    value: '/assets/images/choose-us-image2.webp',
  },
  {
    key: 'why-choose-us.feature3.title',
    group: 'why-choose-us',
    label: 'Feature 3 — Title',
    type: SiteContentType.PLAIN,
    value: 'Modern Comfort',
  },
  {
    key: 'why-choose-us.feature3.description',
    group: 'why-choose-us',
    label: 'Feature 3 — Description',
    type: SiteContentType.RICH,
    value:
      'Experience fully equipped apartments with contemporary design and amenities.',
  },
  {
    key: 'why-choose-us.feature3.image',
    group: 'why-choose-us',
    label: 'Feature 3 — Image',
    type: SiteContentType.IMAGE_URL,
    value: '/assets/images/choose-us-image3.webp',
  },

  // ── Home / Expansion ───────────────────────────────────────────────────
  {
    key: 'expansion.badge',
    group: 'expansion',
    label: 'Expansion — Badge',
    type: SiteContentType.PLAIN,
    value: 'Expansion',
  },
  {
    key: 'expansion.title',
    group: 'expansion',
    label: 'Expansion — Title',
    type: SiteContentType.PLAIN,
    value: 'Expanding Our Reach',
  },
  {
    key: 'expansion.body',
    group: 'expansion',
    label: 'Expansion — Body',
    type: SiteContentType.RICH,
    value:
      "We're preparing to bring the MSK experience to new destinations around the world — stay tuned for what's next.",
  },
  {
    key: 'expansion.coming-soon-badge',
    group: 'expansion',
    label: 'Expansion — "Coming Soon" badge',
    type: SiteContentType.PLAIN,
    value: 'Coming Soon',
  },
  {
    key: 'expansion.check-properties-cta',
    group: 'expansion',
    label: 'Expansion — Check Properties CTA',
    type: SiteContentType.PLAIN,
    value: 'Check Properties',
  },

  // ── Home / Book Now Section ────────────────────────────────────────────
  {
    key: 'book-now.title',
    group: 'book-now',
    label: 'Book Now — Title',
    type: SiteContentType.PLAIN,
    value: 'Ready to Find Your Next Stay?',
  },
  {
    key: 'book-now.cta',
    group: 'book-now',
    label: 'Book Now — CTA',
    type: SiteContentType.PLAIN,
    value: 'Book Now',
  },
  {
    key: 'book-now.image',
    group: 'book-now',
    label: 'Book Now — Background Image',
    type: SiteContentType.IMAGE_URL,
    value: '/assets/images/book-now.webp',
  },

  // ── About / Hero ───────────────────────────────────────────────────────
  {
    key: 'about.hero.badge',
    group: 'about',
    label: 'About Hero — Badge',
    type: SiteContentType.PLAIN,
    value: 'About Us',
  },
  {
    key: 'about.hero.title',
    group: 'about',
    label: 'About Hero — Title',
    type: SiteContentType.PLAIN,
    value: 'Where Comfort Meets Purpose',
  },
  {
    key: 'about.hero.body',
    group: 'about',
    label: 'About Hero — Body',
    type: SiteContentType.RICH,
    value:
      'We create spaces that bring people together, combining thoughtful design and a seamless experience for every guest.',
  },
  {
    key: 'about.hero.cta',
    group: 'about',
    label: 'About Hero — CTA',
    type: SiteContentType.PLAIN,
    value: 'Explore Properties',
  },

  // ── About / Who We Are ─────────────────────────────────────────────────
  {
    key: 'about.who-we-are.badge',
    group: 'about',
    label: 'Who We Are — Badge',
    type: SiteContentType.PLAIN,
    value: 'Who we are',
  },
  {
    key: 'about.who-we-are.title.before-accent',
    group: 'about',
    label: 'Who We Are — Title (foreground)',
    type: SiteContentType.RICH,
    value:
      'At MSK Residence, we believe every stay should feel personal. Our residences offer more than accommodation, ',
    description: 'Trailing space is intentional — the accent clause continues directly after.',
  },
  {
    key: 'about.who-we-are.title.accent',
    group: 'about',
    label: 'Who We Are — Title (accent clause)',
    type: SiteContentType.RICH,
    value: 'delivering comfort, privacy, and a true sense of belonging.',
  },
  {
    key: 'about.who-we-are.stat1.count',
    group: 'about',
    label: 'Stat 1 — Count',
    type: SiteContentType.PLAIN,
    value: '1M+',
  },
  {
    key: 'about.who-we-are.stat1.label',
    group: 'about',
    label: 'Stat 1 — Label',
    type: SiteContentType.PLAIN,
    value: 'Active Users',
  },
  {
    key: 'about.who-we-are.stat2.count',
    group: 'about',
    label: 'Stat 2 — Count',
    type: SiteContentType.PLAIN,
    value: '200+',
  },
  {
    key: 'about.who-we-are.stat2.label',
    group: 'about',
    label: 'Stat 2 — Label',
    type: SiteContentType.PLAIN,
    value: 'Team Members',
  },
  {
    key: 'about.who-we-are.stat3.count',
    group: 'about',
    label: 'Stat 3 — Count',
    type: SiteContentType.PLAIN,
    value: '2',
  },
  {
    key: 'about.who-we-are.stat3.label',
    group: 'about',
    label: 'Stat 3 — Label',
    type: SiteContentType.PLAIN,
    value: 'Countries',
  },
  {
    key: 'about.who-we-are.stat4.count',
    group: 'about',
    label: 'Stat 4 — Count',
    type: SiteContentType.PLAIN,
    value: '7',
  },
  {
    key: 'about.who-we-are.stat4.label',
    group: 'about',
    label: 'Stat 4 — Label',
    type: SiteContentType.PLAIN,
    value: 'Years Strong',
  },

  // ── About / Journey ────────────────────────────────────────────────────
  {
    key: 'about.journey.badge',
    group: 'about',
    label: 'Journey — Badge',
    type: SiteContentType.PLAIN,
    value: 'Our Journey',
  },
  {
    key: 'about.journey.title',
    group: 'about',
    label: 'Journey — Title',
    type: SiteContentType.PLAIN,
    value: 'A Journey Defined by Growth and Progress',
  },
  {
    key: 'about.journey.body',
    group: 'about',
    label: 'Journey — Body',
    type: SiteContentType.RICH,
    value:
      'From a single residence in London to a growing global portfolio — every milestone has been shaped by our commitment to exceptional living.',
  },
  {
    key: 'about.journey.milestone1.title',
    group: 'about',
    label: 'Journey — Milestone 1 Title',
    type: SiteContentType.PLAIN,
    value: 'The Beginning',
  },
  {
    key: 'about.journey.milestone1.date',
    group: 'about',
    label: 'Journey — Milestone 1 Date',
    type: SiteContentType.PLAIN,
    value: '2003',
  },
  {
    key: 'about.journey.milestone1.description',
    group: 'about',
    label: 'Journey — Milestone 1 Description',
    type: SiteContentType.RICH,
    value: '',
  },
  {
    key: 'about.journey.milestone2.title',
    group: 'about',
    label: 'Journey — Milestone 2 Title',
    type: SiteContentType.PLAIN,
    value: 'Laying the Foundation',
  },
  {
    key: 'about.journey.milestone2.date',
    group: 'about',
    label: 'Journey — Milestone 2 Date',
    type: SiteContentType.PLAIN,
    value: '2010',
  },
  {
    key: 'about.journey.milestone2.description',
    group: 'about',
    label: 'Journey — Milestone 2 Description',
    type: SiteContentType.RICH,
    value:
      'A defining phase of growth, where operations became more structured, standards were established, and the foundation for a scalable hospitality brand was set.',
  },
  {
    key: 'about.journey.milestone3.title',
    group: 'about',
    label: 'Journey — Milestone 3 Title',
    type: SiteContentType.PLAIN,
    value: 'Early Growth',
  },
  {
    key: 'about.journey.milestone3.date',
    group: 'about',
    label: 'Journey — Milestone 3 Date',
    type: SiteContentType.PLAIN,
    value: '2017',
  },
  {
    key: 'about.journey.milestone3.description',
    group: 'about',
    label: 'Journey — Milestone 3 Description',
    type: SiteContentType.RICH,
    value:
      'The portfolio expanded, with improved services and a stronger focus on delivering consistent, high-quality experiences across all properties.',
  },
  {
    key: 'about.journey.milestone4.title',
    group: 'about',
    label: 'Journey — Milestone 4 Title',
    type: SiteContentType.PLAIN,
    value: 'New System Applied',
  },
  {
    key: 'about.journey.milestone4.date',
    group: 'about',
    label: 'Journey — Milestone 4 Date',
    type: SiteContentType.PLAIN,
    value: '2025',
  },
  {
    key: 'about.journey.milestone4.description',
    group: 'about',
    label: 'Journey — Milestone 4 Description',
    type: SiteContentType.RICH,
    value:
      'A modern system was introduced to streamline operations, enhance guest experience, and support a more efficient and connected platform.',
  },
  {
    key: 'about.journey.milestone5.title',
    group: 'about',
    label: 'Journey — Milestone 5 Title',
    type: SiteContentType.PLAIN,
    value: 'Vision for the Future',
  },
  {
    key: 'about.journey.milestone5.date',
    group: 'about',
    label: 'Journey — Milestone 5 Date',
    type: SiteContentType.PLAIN,
    value: '2027',
  },
  {
    key: 'about.journey.milestone5.description',
    group: 'about',
    label: 'Journey — Milestone 5 Description',
    type: SiteContentType.RICH,
    value:
      'Looking ahead, MSK Residence continues to evolve, focused on innovation, expansion, and creating even better experiences for guests worldwide.',
  },

  // ── About / Join Journey ───────────────────────────────────────────────
  {
    key: 'about.join.title',
    group: 'about',
    label: 'Join Our Journey — Title',
    type: SiteContentType.PLAIN,
    value: 'Join Our Journey',
  },
  {
    key: 'about.join.body',
    group: 'about',
    label: 'Join Our Journey — Body',
    type: SiteContentType.RICH,
    value: 'Be part of our story and help shape the future',
  },
  {
    key: 'about.join.cta.partner',
    group: 'about',
    label: 'Join Our Journey — Partner CTA',
    type: SiteContentType.PLAIN,
    value: 'Become Partner',
  },
  {
    key: 'about.join.cta.newsletter',
    group: 'about',
    label: 'Join Our Journey — Newsletter CTA',
    type: SiteContentType.PLAIN,
    value: 'Subscribe to Newsletter',
  },

  // ── Modals ─────────────────────────────────────────────────────────────
  {
    key: 'newsletter-modal.title',
    group: 'newsletter-modal',
    label: 'Newsletter Modal — Title',
    type: SiteContentType.PLAIN,
    value: 'Subscribe to our Newsletter',
  },
  {
    key: 'newsletter-modal.cta',
    group: 'newsletter-modal',
    label: 'Newsletter Modal — CTA',
    type: SiteContentType.PLAIN,
    value: 'Subscribe Now',
  },
  {
    key: 'partner-modal.eyebrow',
    group: 'partner-modal',
    label: 'Partner Modal — Eyebrow',
    type: SiteContentType.PLAIN,
    value: 'Partnership',
  },
  {
    key: 'partner-modal.title',
    group: 'partner-modal',
    label: 'Partner Modal — Title',
    type: SiteContentType.PLAIN,
    value: 'Ways to Partner',
  },
  {
    key: 'partner-modal.cta',
    group: 'partner-modal',
    label: 'Partner Modal — CTA',
    type: SiteContentType.PLAIN,
    value: 'Submit',
  },

  // ── Careers / Hero ─────────────────────────────────────────────────────
  {
    key: 'careers.hero.badge',
    group: 'careers',
    label: 'Careers Hero — Badge',
    type: SiteContentType.PLAIN,
    value: 'Careers',
  },
  {
    key: 'careers.hero.title',
    group: 'careers',
    label: 'Careers Hero — Title',
    type: SiteContentType.PLAIN,
    value: 'Build Your Future With Us',
  },
  {
    key: 'careers.hero.body',
    group: 'careers',
    label: 'Careers Hero — Body',
    type: SiteContentType.RICH,
    value: 'Discover exciting career opportunities and grow with us',
  },
  {
    key: 'careers.hero.cta',
    group: 'careers',
    label: 'Careers Hero — CTA',
    type: SiteContentType.PLAIN,
    value: 'View Open Positions',
  },

  // ── Careers / Why Join ─────────────────────────────────────────────────
  {
    key: 'careers.why-join.badge',
    group: 'careers',
    label: 'Why Join — Badge',
    type: SiteContentType.PLAIN,
    value: 'Why Join Us',
  },
  {
    key: 'careers.why-join.title',
    group: 'careers',
    label: 'Why Join — Title',
    type: SiteContentType.PLAIN,
    value: 'Build Your Career With Purpose',
  },
  {
    key: 'careers.why-join.body',
    group: 'careers',
    label: 'Why Join — Body',
    type: SiteContentType.RICH,
    value:
      'Join a team that values growth, collaboration, and creating meaningful experiences through quality spaces and thoughtful innovation.',
  },
  {
    key: 'careers.why-join.item1.title',
    group: 'careers',
    label: 'Why Join Item 1 — Title',
    type: SiteContentType.PLAIN,
    value: 'Growth & Opportunities',
  },
  {
    key: 'careers.why-join.item1.description',
    group: 'careers',
    label: 'Why Join Item 1 — Description',
    type: SiteContentType.RICH,
    value:
      'We provide an environment where individuals can grow, learn, and take on meaningful challenges.',
  },
  {
    key: 'careers.why-join.item2.title',
    group: 'careers',
    label: 'Why Join Item 2 — Title',
    type: SiteContentType.PLAIN,
    value: 'Collaborative Culture',
  },
  {
    key: 'careers.why-join.item2.description',
    group: 'careers',
    label: 'Why Join Item 2 — Description',
    type: SiteContentType.RICH,
    value: 'Work alongside a team that values openness, teamwork, and shared success.',
  },
  {
    key: 'careers.why-join.item3.title',
    group: 'careers',
    label: 'Why Join Item 3 — Title',
    type: SiteContentType.PLAIN,
    value: 'Meaningful Impact',
  },
  {
    key: 'careers.why-join.item3.description',
    group: 'careers',
    label: 'Why Join Item 3 — Description',
    type: SiteContentType.RICH,
    value: 'Be part of creating spaces and experiences that truly matter to people.',
  },
  {
    key: 'careers.why-join.item4.title',
    group: 'careers',
    label: 'Why Join Item 4 — Title',
    type: SiteContentType.PLAIN,
    value: 'Stability & Vision',
  },
  {
    key: 'careers.why-join.item4.description',
    group: 'careers',
    label: 'Why Join Item 4 — Description',
    type: SiteContentType.RICH,
    value:
      'Join a company focused on long-term growth, continuous improvement, and a clear future vision.',
  },

  // ── Rules page ─────────────────────────────────────────────────────────
  {
    key: 'rules.badge',
    group: 'rules',
    label: 'Rules — Badge',
    type: SiteContentType.PLAIN,
    value: 'Rules and Maybes',
  },
  {
    key: 'rules.title',
    group: 'rules',
    label: 'Rules — Title',
    type: SiteContentType.PLAIN,
    value: 'Rules and *Maybes*',
    description: 'Wrap a word in *asterisks* to render it in the script accent font.',
  },
  {
    key: 'rules.body',
    group: 'rules',
    label: 'Rules — Body',
    type: SiteContentType.RICH,
    value:
      "Common questions, house rules, and the things our guests ask most. Can't find what you're looking for? Reach out and we'll help.",
  },

  // ── Footer ─────────────────────────────────────────────────────────────
  {
    key: 'footer.copyright',
    group: 'footer',
    label: 'Footer — Copyright',
    type: SiteContentType.PLAIN,
    value: '© 2026 Journey. All rights reserved.',
  },
  {
    key: 'footer.legal.privacy',
    group: 'footer',
    label: 'Footer — Privacy link',
    type: SiteContentType.PLAIN,
    value: 'Privacy Policy',
  },
  {
    key: 'footer.legal.legal',
    group: 'footer',
    label: 'Footer — Terms & Conditions link',
    type: SiteContentType.PLAIN,
    value: 'Terms & Conditions',
  },
  {
    key: 'footer.social.linkedin.url',
    group: 'footer',
    label: 'Footer — LinkedIn URL',
    type: SiteContentType.PLAIN,
    value: '#',
    description: 'Paste the full LinkedIn profile URL. Default "#" is a no-op so it never 404s.',
  },
  {
    key: 'footer.social.instagram.url',
    group: 'footer',
    label: 'Footer — Instagram URL',
    type: SiteContentType.PLAIN,
    value: '#',
    description: 'Paste the full Instagram profile URL. Default "#" is a no-op so it never 404s.',
  },
  {
    key: 'footer.heading.quick-links',
    group: 'footer',
    label: 'Footer — Quick Links heading',
    type: SiteContentType.PLAIN,
    value: 'Quick Links',
  },
  {
    key: 'footer.heading.locations',
    group: 'footer',
    label: 'Footer — Locations heading',
    type: SiteContentType.PLAIN,
    value: 'Locations',
  },
  {
    key: 'footer.heading.socials',
    group: 'footer',
    label: 'Footer — Socials heading',
    type: SiteContentType.PLAIN,
    value: 'Socials',
  },
  {
    key: 'footer.locations.london',
    group: 'footer',
    label: 'Footer — Location: London',
    type: SiteContentType.PLAIN,
    value: 'MSK London',
  },
  {
    key: 'footer.locations.dubai',
    group: 'footer',
    label: 'Footer — Location: Dubai',
    type: SiteContentType.PLAIN,
    value: 'MSK Dubai',
  },
  {
    key: 'footer.locations.morocco',
    group: 'footer',
    label: 'Footer — Location: Morocco',
    type: SiteContentType.PLAIN,
    value: 'MSK Morocco',
  },
  {
    key: 'footer.locations.egypt',
    group: 'footer',
    label: 'Footer — Location: Egypt',
    type: SiteContentType.PLAIN,
    value: 'MSK Egypt',
  },
  {
    key: 'footer.locations.iraq',
    group: 'footer',
    label: 'Footer — Location: Iraq',
    type: SiteContentType.PLAIN,
    value: 'MSK Iraq',
  },
  {
    key: 'footer.quick.about',
    group: 'footer',
    label: 'Footer — Quick Link: About',
    type: SiteContentType.PLAIN,
    value: 'About Us',
  },
  {
    key: 'footer.quick.properties',
    group: 'footer',
    label: 'Footer — Quick Link: Properties',
    type: SiteContentType.PLAIN,
    value: 'Properties',
  },
  {
    key: 'footer.quick.careers',
    group: 'footer',
    label: 'Footer — Quick Link: Careers',
    type: SiteContentType.PLAIN,
    value: 'Careers',
  },
  {
    key: 'footer.quick.rules',
    group: 'footer',
    label: 'Footer — Quick Link: Rules',
    type: SiteContentType.PLAIN,
    value: 'Rules and Maybes',
  },
  {
    key: 'footer.quick.support',
    group: 'footer',
    label: 'Footer — Quick Link: Support',
    type: SiteContentType.PLAIN,
    value: 'Support/Help',
  },

  // ── Auth panel left-side captions ──────────────────────────────────────
  {
    key: 'auth.side.title',
    group: 'auth',
    label: 'Auth panel — Side Title',
    type: SiteContentType.PLAIN,
    value: 'Your Stay,\nPerfected',
    description: 'Rendered with a line break between "Your Stay," and "Perfected".',
  },
  {
    key: 'auth.side.body.login',
    group: 'auth',
    label: 'Auth panel — Side Body (Login)',
    type: SiteContentType.RICH,
    value:
      'Access your personalized guest portal to explore amenities, view your itinerary, and customize your experience.',
  },
  {
    key: 'auth.side.body.register',
    group: 'auth',
    label: 'Auth panel — Side Body (Register)',
    type: SiteContentType.RICH,
    value: 'Your gateway to curated luxury stays and seamless experiences.',
  },
  {
    key: 'auth.side.body.forgot',
    group: 'auth',
    label: 'Auth panel — Side Body (Forgot)',
    type: SiteContentType.RICH,
    value: 'Reset your password securely and regain access to your account.',
  },
  {
    key: 'auth.side.body.reset',
    group: 'auth',
    label: 'Auth panel — Side Body (Reset)',
    type: SiteContentType.RICH,
    value: 'Create a strong new password to keep your account secure.',
  },
  {
    key: 'auth.side.body.success',
    group: 'auth',
    label: 'Auth panel — Side Body (Success)',
    type: SiteContentType.RICH,
    value: 'Your account is secure. Welcome back to MSK Residence.',
  },
];

// ── HouseRule (mirrors data/rules.ts) ─────────────────────────────────────

export interface HouseRuleSeed {
  category: string;
  title: string;
  description: string;
  icon?: string;
  ordering: number;
}

export const HOUSE_RULES_SEED: HouseRuleSeed[] = [
  {
    category: 'Direct Booking',
    title: 'Why book directly instead of through a booking site?',
    description:
      'Booking directly with us ensures you get the best available rate, personalised service, and direct communication with our team for any special arrangements.',
    ordering: 0,
  },
  {
    category: 'Different Prices',
    title: 'Is the price different when booking directly?',
    description:
      'Yes — direct bookings often come with exclusive rates and perks not available on third-party platforms. We pass on the commission savings directly to you.',
    ordering: 1,
  },
  {
    category: 'Special Request',
    title: 'Can I make special requests when booking directly?',
    description:
      'Absolutely. Direct bookings allow us to accommodate special requests such as room preferences, dietary requirements, and personalised arrangements.',
    ordering: 2,
  },
  {
    category: 'Direct Booking',
    title: 'What if I need to ask questions about my booking?',
    description:
      'Our team is available around the clock to assist. You can reach us via email, phone, or live chat directly through our website.',
    ordering: 3,
  },
  {
    category: 'Flexible Booking',
    title: 'What is your refund policy?',
    description:
      'Refunds are processed within 5–10 business days depending on your payment method. Cancellations made 48 hours or more before check-in are fully refundable.',
    ordering: 4,
  },
  {
    category: 'Special Request',
    title: 'How long does delivery take?',
    description:
      "In-room delivery requests are typically fulfilled within 30 minutes. External deliveries depend on the provider's schedule.",
    ordering: 5,
  },
  {
    category: 'Flexible Booking',
    title: 'What is your Flexible Booking?',
    description:
      'Our Flexible Booking option lets you change or cancel your reservation up to 48 hours before arrival at no charge, giving you full peace of mind.',
    ordering: 6,
  },
];

// ── ExpansionCity (mirrors home/expansion-section.tsx CARDS) ──────────────

export interface ExpansionCitySeed {
  city: string;
  country: string;
  description: string;
  ordering: number;
}

export const EXPANSION_CITIES_SEED: ExpansionCitySeed[] = [
  {
    city: 'London',
    country: 'United Kingdom',
    description:
      'Experience the finest properties in London, designed for those who crave luxury living without the luxury price tag. Enjoy exclusive access through membership only – premium homes, premium lifestyle, no extra cost.',
    ordering: 0,
  },
  {
    city: 'Iraq',
    country: 'Iraq',
    description:
      "MSK is set to expand into Iraq, bringing premium serviced residences to one of the region's most vibrant and rapidly growing markets. Stay tuned for our upcoming launch.",
    ordering: 1,
  },
  {
    city: 'Cairo',
    country: 'Egypt',
    description:
      "Our Egyptian expansion will offer access to Cairo's finest residential experiences — luxury living in the heart of one of Africa's most iconic and culturally rich cities.",
    ordering: 2,
  },
  {
    city: 'Dubai',
    country: 'United Arab Emirates',
    description:
      'Dubai is the jewel of the Middle East and MSK is coming. Experience world-class residences in one of the most dynamic and sought-after property markets on the planet.',
    ordering: 3,
  },
];

// ── JobPosting (mirrors data/careers.ts JOBS) ────────────────────────────

export interface JobPostingSeed {
  title: string;
  slug: string;
  description: string;
  location: string;
  employmentType: string;
}

export const JOB_POSTINGS_SEED: JobPostingSeed[] = [
  {
    title: 'Front Desk',
    slug: 'front-desk',
    description:
      'Welcome guests, handle inquiries, and manage reservations. Excellent communication skills needed.',
    location: 'On-site',
    employmentType: 'Full-time',
  },
  {
    title: 'Accounts',
    slug: 'accounts',
    description:
      'Manage financial records, invoicing, and reporting. Accounting degree or certification required.',
    location: 'On-site',
    employmentType: 'Full-time',
  },
  {
    title: 'Maintenance',
    slug: 'maintenance',
    description:
      'Handle repairs, preventive maintenance, and facility upkeep. Technical skills required.',
    location: 'On-site',
    employmentType: 'Full-time',
  },
  {
    title: 'Guest Relations',
    slug: 'guest-relations',
    description:
      'Build lasting relationships with guests and ensure an exceptional stay experience.',
    location: 'On-site',
    employmentType: 'Full-time',
  },
];

// ── Testimonials & FAQs: empty by design ─────────────────────────────────

// msk-web doesn't currently render testimonials with hardcoded data and
// has no separate FAQ page distinct from the rules section, so we seed
// zero rows. The admin can add them via the CMS endpoints once ready.
