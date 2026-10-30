import Link from "next/link";
export default function NotFound() {
  return (<main className="mx-auto max-w-md p-10 text-center"><h1 className="font-serif text-3xl">Page not found</h1><p className="mt-2 text-stone-600">This link may have expired or been replaced.</p><Link href="/" className="btn-primary mt-6">Home</Link></main>);
}
