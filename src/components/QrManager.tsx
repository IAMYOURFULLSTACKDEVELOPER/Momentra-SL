"use client";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Printer, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

export function QrManager({ eventId, initialToken, title, couple }: { eventId: string; initialToken: string; title: string; couple: string }) {
  const [token, setToken] = useState(initialToken);
  const [svg, setSvg] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => { setUrl(`${window.location.origin}/event/${token}`); }, [token]);
  const render = useCallback(async (u: string) => { setSvg(await QRCode.toString(u, { type: "svg", margin: 1, errorCorrectionLevel: "M", width: 320 })); }, []);
  useEffect(() => { if (url) void render(url); }, [url, render]);

  const save = (href: string, name: string) => { const a = document.createElement("a"); a.href = href; a.download = name; a.click(); };
  async function png() { save(await QRCode.toDataURL(url, { margin: 2, width: 1200, errorCorrectionLevel: "M" }), "momentra-qr.png"); }
  function svgFile() { const u = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })); save(u, "momentra-qr.svg"); URL.revokeObjectURL(u); }
  async function copy() { await navigator.clipboard.writeText(url); setMsg("Link copied."); }
  async function rotate() {
    if (!window.confirm("Generate a new QR code? The old code and link will stop working immediately, so printed signs must be replaced.")) return;
    const { data, error } = await createClient().rpc("rotate_event_token", { eid: eventId });
    if (error) return setMsg(error.message);
    setToken(data as string); setMsg("New QR code generated. Old links no longer work.");
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="card">
        <h2 className="font-serif text-xl">Preview</h2>
        <div className="mx-auto mt-4 w-64" dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR code preview" role="img" />
        <p className="mt-3 break-all text-xs text-stone-500">{url}</p>
        <div className="mt-4 flex flex-wrap gap-2"><button className="btn-primary" onClick={png}><Download className="h-4 w-4" />PNG</button><button className="btn-ghost" onClick={svgFile}><Download className="h-4 w-4" />SVG</button><button className="btn-ghost" onClick={copy}><Copy className="h-4 w-4" />Copy link</button><button className="btn-ghost" onClick={() => window.print()}><Printer className="h-4 w-4" />Print sign</button></div>
        <button className="btn-ghost mt-3" onClick={rotate}><RefreshCw className="h-4 w-4" />Regenerate / revoke</button>
        {msg && <p role="status" className="mt-3 text-sm">{msg}</p>}
      </div>
      <div>
        <div id="print-sign" className="card text-center">
          <p className="text-xs uppercase tracking-widest text-stone-500">{title}</p>
          <h2 className="mt-2 font-serif text-3xl">{couple}</h2>
          <div className="mx-auto mt-6 w-56" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-6 font-serif text-xl">Share your photos with us!</p>
          <p className="mt-1 text-sm text-stone-600">Scan with your phone camera, then tap “Take a Photo” or “Choose Photos”.</p>
        </div>
      </div>
    </div>
  );
}
