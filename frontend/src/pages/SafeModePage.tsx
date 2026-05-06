import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Package,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Upload,
  Users,
  CheckSquare,
  Zap,
} from "lucide-react";
import { api, type SafeModePreview } from "../services/api";

type AnalyzeResult = {
  status: string;
  preview?: SafeModePreview;
  snapshot?: object;
  message?: string;
};

type RestoreResult = {
  status: string;
  restored: Record<string, number>;
};

const INCLUDED_ITEMS = [
  { icon: <FileText size={16} className="text-stone-500" />, label: "Profil Entreprise" },
  { icon: <Users size={16} className="text-blue-500" />, label: "Personnel & RH" },
  { icon: <Receipt size={16} className="text-amber-500" />, label: "Finance & Facturation" },
  { icon: <Package size={16} className="text-violet-500" />, label: "Inventaire & Produits" },
  { icon: <CheckSquare size={16} className="text-emerald-500" />, label: "Tâches opérationnelles" },
  { icon: <ShieldCheck size={16} className="text-rose-500" />, label: "Score TERAS & Alertes" },
  { icon: <Zap size={16} className="text-indigo-500" />, label: "Analyse & Appréciation Limule" },
];

const RESTORE_SECTIONS = [
  { key: "employees", label: "Employés", icon: <Users size={15} /> },
  { key: "products", label: "Produits", icon: <Package size={15} /> },
  { key: "tasks", label: "Tâches", icon: <CheckSquare size={15} /> },
];

function formatDate(iso: string): string {
  if (!iso || iso === "—") return "—";
  try {
    const d = new Date(iso.replace(" ", "T"));
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function SafeModePage() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [analyzeFile, setAnalyzeFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);

  const [selectedSections, setSelectedSections] = useState<string[]>(["employees", "products", "tasks"]);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await api.safeMode.export();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Une erreur est survenue");
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzeFile(file);
    setAnalyzeResult(null);
    setRestoreResult(null);
    setRestoreError(null);
    setAnalyzing(true);
    try {
      const result = await api.safeMode.analyze(file);
      setAnalyzeResult(result);
    } catch (e) {
      setAnalyzeResult({
        status: "error",
        message: e instanceof Error ? e.message : "Erreur lors de l'analyse",
      });
    } finally {
      setAnalyzing(false);
    }
  }

  function handleDropZoneClick() {
    fileInputRef.current?.click();
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    // Trigger the same logic as file input
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileInputRef.current) {
      fileInputRef.current.files = dt.files;
      const event = new Event("change", { bubbles: true });
      fileInputRef.current.dispatchEvent(event);
    }
    setAnalyzeFile(file);
    setAnalyzeResult(null);
    setRestoreResult(null);
    setRestoreError(null);
    setAnalyzing(true);
    api.safeMode
      .analyze(file)
      .then((result) => setAnalyzeResult(result))
      .catch((err) =>
        setAnalyzeResult({
          status: "error",
          message: err instanceof Error ? err.message : "Erreur lors de l'analyse",
        })
      )
      .finally(() => setAnalyzing(false));
  }

  function toggleSection(key: string) {
    setSelectedSections((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  }

  async function handleRestore() {
    if (!analyzeResult?.snapshot || selectedSections.length === 0) return;
    setRestoring(true);
    setRestoreResult(null);
    setRestoreError(null);
    try {
      const result = await api.safeMode.restore(analyzeResult.snapshot, selectedSections);
      setRestoreResult(result);
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : "Erreur lors de la restauration");
    } finally {
      setRestoring(false);
    }
  }

  const canRestore =
    analyzeResult?.status === "ok" &&
    analyzeResult.snapshot &&
    selectedSections.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-600/10">
          <ShieldCheck size={26} className="text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#17211f] dark:text-white">Safe Mode</h1>
          <p className="mt-0.5 text-sm text-[#6b7280] dark:text-white/50">
            Sauvegardez toutes vos données dans un PDF sécurisé et restaurez-les en cas de besoin.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Export card ───────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-black/[0.08] bg-white shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <div className="border-b border-black/[0.06] px-6 py-4 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Download size={18} className="text-emerald-600" />
              <h2 className="font-semibold text-[#17211f] dark:text-white">
                Générer le pack de sauvegarde
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#6b7280] dark:text-white/40">
              Télécharge un PDF complet avec toutes vos données et une analyse Limule.
            </p>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280] dark:text-white/40">
                Contenu du pack
              </p>
              <ul className="space-y-2">
                {INCLUDED_ITEMS.map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5 text-sm text-[#374151] dark:text-white/70">
                    {item.icon}
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 dark:bg-amber-900/20">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                La génération peut prendre 15–30 secondes (analyse IA incluse).
              </p>
            </div>

            {exportError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 dark:bg-red-900/20">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-500" />
                <p className="text-xs text-red-600 dark:text-red-400">{exportError}</p>
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {exporting ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Génération en cours…
                </>
              ) : (
                <>
                  <Download size={16} />
                  Générer et télécharger
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Restore card ──────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-black/[0.08] bg-white shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
          <div className="border-b border-black/[0.06] px-6 py-4 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Upload size={18} className="text-blue-600" />
              <h2 className="font-semibold text-[#17211f] dark:text-white">
                Restaurer depuis un pack
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#6b7280] dark:text-white/40">
              Importez un PDF Safe Mode pour restaurer vos données.
            </p>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              onClick={handleDropZoneClick}
              onKeyDown={(e) => e.key === "Enter" && handleDropZoneClick()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50/40 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-blue-500/50"
            >
              <Upload size={22} className="text-stone-400 dark:text-white/30" />
              <div>
                <p className="text-sm font-medium text-[#374151] dark:text-white/70">
                  {analyzeFile ? analyzeFile.name : "Déposez ou cliquez pour choisir un PDF"}
                </p>
                <p className="mt-0.5 text-xs text-[#9ca3af] dark:text-white/30">
                  Fichier PDF Safe Mode KOMPTA uniquement
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Analyzing spinner */}
            {analyzing && (
              <div className="flex items-center gap-2 text-sm text-[#6b7280] dark:text-white/50">
                <RefreshCw size={15} className="animate-spin" />
                Analyse du fichier en cours…
              </div>
            )}

            {/* Error/no-snapshot from analysis */}
            {analyzeResult && analyzeResult.status !== "ok" && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 dark:bg-red-900/20">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-500" />
                <p className="text-xs text-red-600 dark:text-red-400">
                  {analyzeResult.message ?? "Fichier invalide ou non reconnu."}
                </p>
              </div>
            )}

            {/* Preview */}
            {analyzeResult?.status === "ok" && analyzeResult.preview && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 space-y-2 dark:border-emerald-700/30 dark:bg-emerald-900/10">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 size={15} />
                  Pack reconnu
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#374151] dark:text-white/70">
                  <span className="font-medium text-[#6b7280] dark:text-white/40">Entreprise</span>
                  <span>{analyzeResult.preview.company_name}</span>
                  <span className="font-medium text-[#6b7280] dark:text-white/40">Exporté le</span>
                  <span>{formatDate(analyzeResult.preview.exported_at)}</span>
                  <span className="font-medium text-[#6b7280] dark:text-white/40">Version</span>
                  <span>{analyzeResult.preview.version}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Object.entries(analyzeResult.preview.counts).map(([key, val]) => (
                    <span
                      key={key}
                      className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#374151] shadow-sm dark:bg-white/10 dark:text-white/70"
                    >
                      {val} {key}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Section checkboxes */}
            {analyzeResult?.status === "ok" && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280] dark:text-white/40">
                  Sections à restaurer
                </p>
                <div className="flex flex-wrap gap-2">
                  {RESTORE_SECTIONS.map(({ key, label, icon }) => {
                    const checked = selectedSections.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleSection(key)}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                          checked
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-600/60 dark:bg-emerald-900/20 dark:text-emerald-400"
                            : "border-stone-200 bg-white text-[#6b7280] hover:border-stone-300 dark:border-white/10 dark:bg-white/5 dark:text-white/50"
                        }`}
                      >
                        {icon}
                        {label}
                        {checked && <CheckCircle2 size={12} className="text-emerald-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Restore result */}
            {restoreResult && (
              <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 dark:bg-emerald-900/20">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                <div className="text-xs text-emerald-700 dark:text-emerald-400">
                  <p className="font-semibold">Restauration réussie</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {Object.entries(restoreResult.restored).map(([key, val]) => (
                      <li key={key}>
                        {val} {key} restauré(s)
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {restoreError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 dark:bg-red-900/20">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-500" />
                <p className="text-xs text-red-600 dark:text-red-400">{restoreError}</p>
              </div>
            )}

            <button
              onClick={handleRestore}
              disabled={!canRestore || restoring}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              {restoring ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Restauration en cours…
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Restaurer les données sélectionnées
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
