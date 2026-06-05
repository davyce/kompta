import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

interface QrScannerModalProps {
  title?: string;
  onScan: (value: string) => void;
  onClose: () => void;
}

/* BarcodeDetector is a Web API — declare types for TypeScript */
interface BarcodeDetectorOptions { formats?: string[] }
interface DetectedBarcode { rawValue: string }
interface IBarcodeDetector {
  detect(image: HTMLVideoElement | ImageBitmap): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorConstructor {
  new (opts?: BarcodeDetectorOptions): IBarcodeDetector;
}
declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

export function QrScannerModal({ title = "Scanner un QR / code-barres", onScan, onClose }: QrScannerModalProps) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number>(0);

  const [error,     setError]     = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [scanning,  setScanning]  = useState(false);

  useEffect(() => {
    if (!window.BarcodeDetector) { setSupported(false); return; }

    let detector: IBarcodeDetector | null = null;
    try {
      detector = new window.BarcodeDetector({
        formats: ["qr_code", "code_128", "ean_13", "ean_8", "code_39", "upc_a", "upc_e"],
      });
    } catch {
      setSupported(false);
      return;
    }

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScanning(true);

        const scan = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(scan);
            return;
          }
          try {
            const results = await detector!.detect(videoRef.current);
            if (results.length > 0) {
              stopStream();
              onScan(results[0].rawValue);
              return;
            }
          } catch { /* continue scanning */ }
          rafRef.current = requestAnimationFrame(scan);
        };
        rafRef.current = requestAnimationFrame(scan);
      } catch {
        setError("Accès caméra refusé. Autorisez la caméra dans votre navigateur et réessayez.");
      }
    })();

    return () => stopStream();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !window.BarcodeDetector) return;
    try {
      const bitmap = await createImageBitmap(file);
      const det = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13", "ean_8", "code_39"] });
      const results = await det.detect(bitmap);
      if (results.length > 0) {
        onScan(results[0].rawValue);
      } else {
        setError("Aucun code détecté dans cette image. Réessayez avec une photo nette.");
      }
    } catch {
      setError("Impossible de lire l'image.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="relative w-full max-w-sm rounded-2xl overflow-hidden bg-black shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/80">
          <p className="text-white font-semibold text-sm">{title}</p>
          <button onClick={onClose} className="text-white/70 hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        {/* Camera view or fallback */}
        {supported && !error ? (
          <div className="relative bg-black">
            <video
              ref={videoRef}
              className="w-full aspect-[4/3] object-cover"
              playsInline
              muted
            />
            {/* Scan frame overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-52 h-52">
                <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
                <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
                <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
                <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />
                {scanning && (
                  <span className="absolute top-1/2 -translate-y-1/2 left-2 right-2 h-0.5 bg-emerald-400/70 animate-pulse" />
                )}
              </div>
            </div>
            <p className="absolute bottom-3 inset-x-0 text-center text-white/60 text-xs px-4">
              Pointez la caméra vers le QR code ou code-barres
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-10 px-6 text-center bg-[#1e2229]">
            <Camera size={40} className="text-[#717182]" />
            <p className="text-sm text-white/80">
              {error ?? "Scanner caméra non disponible sur ce navigateur."}
            </p>
            <label className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white cursor-pointer transition">
              <Camera size={15} /> Prendre une photo
              <input
                type="file"
                accept="image/*"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                capture={"environment" as any}
                className="hidden"
                onChange={handleFileInput}
              />
            </label>
            <p className="text-xs text-white/40">ou importez une image du code à scanner</p>
            <label className="text-xs text-emerald-400 underline cursor-pointer">
              Importer une image
              <input type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
