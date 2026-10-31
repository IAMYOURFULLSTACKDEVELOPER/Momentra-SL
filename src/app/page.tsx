import Link from "next/link";
import { Camera, QrCode, ShieldCheck, Images, PartyPopper, Heart, Baby, Waves } from "lucide-react";

const features = [
  { icon: QrCode, title: "One QR code", text: "Print it on a table card or sign. Guests scan and they are in." },
  { icon: Camera, title: "No app to install", text: "Take photos in the browser or choose from the camera roll." },
  { icon: ShieldCheck, title: "You stay in control", text: "Optional moderation, upload deadlines and private galleries." },
  { icon: Images, title: "Download everything", text: "Browse the gallery and download originals whenever you like." },
];

const eventTypes = [
  {
    icon: PartyPopper,
    title: "Birthday Celebration",
    description: "Capture every candle blow and wish come true",
    image: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&h=400&fit=crop",
  },
  {
    icon: Heart,
    title: "Wedding Ceremony",
    description: "Preserve your special day from every angle",
    image: "https://images.unsplash.com/photo-1519741497674-611481863552?w=600&h=400&fit=crop",
  },
  {
    icon: Baby,
    title: "Baby Shower",
    description: "Cherish the anticipation of new life",
    image: "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=600&h=400&fit=crop",
  },
  {
    icon: Heart,
    title: "Funeral Service",
    description: "Honor memories together with dignity",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=400&fit=crop",
  },
  {
    icon: Waves,
    title: "Beach Festival",
    description: "Sun, sand, and endless celebrations",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=400&fit=crop",
  },
];

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-3">
          <img src="/momentra-logo.jpg" alt="Momentra Logo" className="h-10 w-10" />
          <span className="font-serif text-xl">MOMENTRA</span>
        </Link>
        <nav className="flex gap-3"><Link className="btn-ghost" href="/auth/login">Sign in</Link><Link className="btn-primary" href="/auth/register">Get started</Link></nav>
      </header>
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-serif text-4xl leading-tight sm:text-6xl">Every Moment, Together</h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-stone-600">Create your event. Share your QR code. Collect every memory. One celebration. Hundreds of perspectives. All your memories in one place.</p>
        <Link href="/auth/register" className="btn-primary mt-8">Create your event</Link>
        <p className="mt-4 text-xs text-stone-500">Guests capture photos through the browser camera or pick from their library. Phone camera apps cannot upload automatically.</p>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card"><Icon className="h-6 w-6 text-blush-600" aria-hidden /><h2 className="mt-3 font-serif text-lg">{title}</h2><p className="mt-1 text-sm text-stone-600">{text}</p></div>
        ))}
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="mb-8 text-center font-serif text-3xl">Perfect for any celebration</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {eventTypes.map(({ icon: Icon, title, description, image }) => (
            <div key={title} className="card overflow-hidden">
              <div className="relative aspect-video overflow-hidden">
                <img src={image} alt={title} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4 text-white">
                  <Icon className="mb-2 h-6 w-6" />
                  <h3 className="font-serif text-xl">{title}</h3>
                </div>
              </div>
              <p className="p-4 text-sm text-stone-600">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
