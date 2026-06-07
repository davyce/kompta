import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="text-sm font-semibold text-emerald-600">404</p>
        <h1 className="mt-2 text-3xl font-black text-ink">{t("notFound.title")}</h1>
        <Link className="mt-5 inline-flex rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white" to="/">
          {t("notFound.back")}
        </Link>
      </div>
    </div>
  );
}
