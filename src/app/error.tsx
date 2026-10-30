"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (<main className="mx-auto max-w-md p-10 text-center"><h1 className="font-serif text-2xl">Something went wrong</h1><p className="mt-2 text-sm text-stone-600">{error.message}</p><button className="btn-primary mt-6" onClick={reset}>Try again</button></main>);
}
