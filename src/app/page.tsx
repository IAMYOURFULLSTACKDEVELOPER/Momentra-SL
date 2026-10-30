import Link from "next/link";
import { Camera, QrCode, ShieldCheck, Images } from "lucide-react";

const features = [
  { icon: QrCode, title: "One QR code", text: "Print it on a table card or sign. Guests scan and they are in." },
  { icon: Camera, title: "No app to install", text: "Take photos in the browser or choose from the camera roll." },
  { icon: ShieldCheck, title: "You stay in control", text: "Optional moderation, upload deadlines and private galleries." },
  { icon: Images, title: "Download everything", text: "Browse the gallery and download originals whenever you like." },
];
export default function Home() {
  return (
    <main>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="font-serif text-xl">WeddingSnap</span>
        <nav className="flex gap-3"><Link className="btn-ghost" href="/auth/login">Sign in</Link><Link className="btn-primary" href="/auth/register">Get started</Link></nav>
      </header>
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-serif text-4xl leading-tight sm:text-6xl">Every guest’s photos, in one beautiful gallery</h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-stone-600">Create your wedding, print the QR code, and let guests share the moments they captured, straight from their phones.</p>
        <Link href="/auth/register" className="btn-primary mt-8">Create your wedding gallery</Link>
        <p className="mt-4 text-xs text-stone-500">Guests capture photos through the browser camera or pick from their library. Phone camera apps cannot upload automatically.</p>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card"><Icon className="h-6 w-6 text-blush-600" aria-hidden /><h2 className="mt-3 font-serif text-lg">{title}</h2><p className="mt-1 text-sm text-stone-600">{text}</p></div>
        ))}
      </section>
    </main>
  );
}
