import { Link } from "react-router-dom";
import { ShieldCheck, FileText, ArrowLeft } from "lucide-react";

// ── Coordonnées légales — À COMPLÉTER avant publication sur les stores ────────
// Remplacez ces valeurs par les informations réelles de l'éditeur.
const LEGAL = {
  appName: "KOMPTA",
  publisher: "Adansonia",            // À COMPLÉTER : raison sociale exacte de l'éditeur
  legalForm: "[forme juridique à compléter]", // SARL | SAS | EI | GIE…
  contactEmail: "privacy@kompta.app", // email de contact RGPD / confidentialité
  dpoEmail: "dpo@kompta.app",         // délégué à la protection des données
  jurisdiction: "République Démocratique du Congo",
  hostingRegion: "l'Union européenne (AWS, région eu-west-3, Paris)",
  lastUpdated: "20 juin 2026",
};

function LegalShell({ icon: Icon, title, children }: { icon: typeof ShieldCheck; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f7f7f9] dark:bg-[#0c0c10] text-[#1a1a22] dark:text-white/90">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <Link to="/login" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400">
          <ArrowLeft size={16} /> Retour
        </Link>
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
            <Icon size={26} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-[#717182] dark:text-white/50">
              {LEGAL.appName} — dernière mise à jour : {LEGAL.lastUpdated}
            </p>
          </div>
        </div>
        <div className="prose-legal space-y-6 text-[15px] leading-relaxed text-[#3a3a44] dark:text-white/70">
          {children}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-[#1a1a22] dark:text-white/90">{title}</h2>
      {children}
    </section>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalShell icon={ShieldCheck} title="Politique de confidentialité">
      <p>
        La présente politique décrit comment {LEGAL.publisher} (« nous ») collecte, utilise et
        protège vos données lorsque vous utilisez l'application {LEGAL.appName} (web, iOS et macOS).
      </p>

      <Section title="1. Données que nous collectons">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Compte</strong> : nom, adresse e-mail, numéro de téléphone, rôle, entreprise de rattachement.</li>
          <li><strong>Données métier</strong> : informations comptables, factures, paie, stocks, transactions, documents que vous saisissez ou importez.</li>
          <li><strong>Données techniques</strong> : adresse IP et ville estimée à la connexion (sécurité), journal d'audit des actions sensibles.</li>
          <li><strong>Préférences</strong> : thème, langue, devise — stockées localement sur votre appareil.</li>
        </ul>
        <p>Nous ne suivons pas votre activité à des fins publicitaires et n'utilisons aucun identifiant publicitaire.</p>
      </Section>

      <Section title="2. Finalités">
        <ul className="list-disc space-y-1 pl-5">
          <li>Fournir les fonctionnalités de gestion d'entreprise et de groupes.</li>
          <li>Sécuriser votre compte (authentification, détection d'accès anormaux, journalisation).</li>
          <li>Traiter les paiements d'abonnement via nos prestataires (Stripe, MTN MoMo).</li>
          <li>Fournir l'assistance et les analyses générées par l'assistant Limule.</li>
        </ul>
      </Section>

      <Section title="3. Partage, hébergement et transferts internationaux">
        <p>
          Vos données ne sont jamais vendues. Elles sont accessibles aux membres autorisés de votre
          organisation selon leurs rôles, et partagées uniquement avec les sous-traitants
          strictement nécessaires : hébergeur (AWS), prestataires de paiement (Stripe, MTN MoMo) et
          le fournisseur du modèle d'IA. Chaque sous-traitant est tenu par contrat à la confidentialité.
        </p>
        <p className="mt-2">
          <strong>Hébergement hors zone.</strong> Vous reconnaissez et acceptez expressément que vos
          données soient <strong>hébergées et traitées en dehors de votre pays de résidence</strong>,
          notamment dans {LEGAL.hostingRegion}, ainsi que dans tout autre pays où sont établis nos
          sous-traitants techniques et d'IA. En utilisant {LEGAL.appName}, vous consentez à ce
          <strong> transfert international</strong> de vos données, y compris vers des pays dont la
          législation sur la protection des données peut différer de la vôtre. {LEGAL.publisher} met en
          œuvre des mesures contractuelles et techniques raisonnables, mais ne saurait garantir un
          niveau de protection identique à celui de votre juridiction d'origine.
        </p>
      </Section>

      <Section title="4. Conservation">
        <p>
          Les données sont conservées pendant la durée de votre abonnement et selon les obligations
          légales (comptables, fiscales). Vous pouvez demander la suppression de votre compte à tout
          moment ; certaines données peuvent être conservées le temps requis par la loi.
        </p>
      </Section>

      <Section title="5. Sécurité">
        <p>
          Les communications sont chiffrées (HTTPS/TLS). Les mots de passe sont hachés (PBKDF2). Les
          jetons d'accès sont stockés dans le trousseau sécurisé (Keychain) sur iOS/macOS. Les
          montants financiers sont gérés en entiers (centimes) pour éviter toute erreur d'arrondi.
        </p>
      </Section>

      <Section title="6. Vos droits">
        <p>
          Conformément aux lois applicables (dont le RGPD lorsque pertinent), vous disposez d'un
          droit d'accès, de rectification, d'effacement, de limitation et de portabilité de vos
          données. Pour les exercer, écrivez à <a className="text-emerald-600 dark:text-emerald-400" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
          {" "}(DPO : <a className="text-emerald-600 dark:text-emerald-400" href={`mailto:${LEGAL.dpoEmail}`}>{LEGAL.dpoEmail}</a>).
        </p>
      </Section>

      <Section title="7. Enfants">
        <p>{LEGAL.appName} n'est pas destinée aux personnes de moins de 18 ans.</p>
      </Section>

      <Section title="8. Modifications">
        <p>
          Nous pouvons mettre à jour cette politique. Toute modification importante sera signalée
          dans l'application. Droit applicable : {LEGAL.jurisdiction}.
        </p>
      </Section>

      <p className="pt-4 text-sm text-[#717182] dark:text-white/50">
        Contact : <a className="text-emerald-600 dark:text-emerald-400" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
        {" · "}
        <Link to="/terms" className="text-emerald-600 dark:text-emerald-400">Conditions d'utilisation</Link>
      </p>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell icon={FileText} title="Conditions d'utilisation">
      <p>
        En utilisant {LEGAL.appName}, édité par {LEGAL.publisher}, vous acceptez les présentes
        conditions.
      </p>

      <Section title="1. Service">
        <p>
          {LEGAL.appName} est une plateforme de gestion d'entreprise (comptabilité, facturation,
          paie, stocks, point de vente), de groupes/tontines et d'assistance par IA, fournie sous
          forme d'abonnement.
        </p>
      </Section>

      <Section title="2. Compte et responsabilité">
        <ul className="list-disc space-y-1 pl-5">
          <li>Vous êtes responsable de la confidentialité de vos identifiants.</li>
          <li>Vous garantissez l'exactitude des informations saisies.</li>
          <li>Vous vous engagez à un usage licite et conforme aux lois fiscales et comptables applicables.</li>
        </ul>
      </Section>

      <Section title="3. Abonnement et paiement">
        <p>
          L'accès aux fonctionnalités payantes est conditionné au paiement de l'abonnement via nos
          prestataires (Stripe, MTN MoMo). Le défaut de paiement peut suspendre l'accès aux
          fonctionnalités métier.
        </p>
      </Section>

      <Section title="4. Assistant IA (Limule) — caractère non contractuel">
        <p>
          Les analyses, résumés, scores, prévisions et suggestions générés par l'intelligence
          artificielle sont fournis <strong>à titre purement informatif et non contractuel</strong>.
          Ils peuvent contenir des erreurs, des approximations ou des informations obsolètes, ne
          constituent <strong>en aucun cas un conseil comptable, fiscal, juridique, financier ou
          d'investissement</strong>, et ne sauraient engager la responsabilité de {LEGAL.publisher}.
          Toute décision prise sur la base de l'IA relève de votre <strong>seule responsabilité</strong>
          et requiert une validation humaine et, le cas échéant, l'avis d'un professionnel qualifié.
        </p>
      </Section>

      <Section title="5. Absence de garantie">
        <p>
          {LEGAL.appName} est fourni <strong>« en l'état » et « selon disponibilité »</strong>, sans
          garantie d'aucune sorte, expresse ou implicite, notamment de qualité marchande, d'adéquation
          à un usage particulier, d'absence d'erreurs, de continuité, d'exactitude des calculs ou de
          conformité réglementaire. {LEGAL.publisher} ne garantit pas que le service sera ininterrompu,
          sécurisé ou exempt d'anomalies, ni que les résultats obtenus seront exacts ou fiables.
        </p>
      </Section>

      <Section title="6. Limitation de responsabilité">
        <p>
          Dans toute la mesure permise par la loi applicable, {LEGAL.publisher} <strong>ne pourra être
          tenu responsable</strong> d'aucun dommage indirect, accessoire, spécial ou consécutif, ni
          d'aucune perte de données, de chiffre d'affaires, de bénéfices, de clientèle, d'exploitation,
          d'image ou d'opportunité, résultant de l'utilisation ou de l'impossibilité d'utiliser le
          service, des décisions prises à partir de l'IA, d'un retard, d'une indisponibilité, d'une
          perte ou corruption de données, ou de l'action d'un prestataire tiers (hébergeur, paiement, IA).
        </p>
        <p className="mt-2">
          En tout état de cause, la <strong>responsabilité totale et cumulée</strong> de {LEGAL.publisher},
          toutes causes confondues, est expressément <strong>limitée au montant des abonnements
          effectivement payés par vous au cours des trois (3) mois</strong> précédant le fait générateur.
        </p>
      </Section>

      <Section title="7. Vos responsabilités & indemnisation">
        <p>
          Vous êtes seul responsable de l'exactitude de vos données, de vos <strong>sauvegardes</strong>,
          de vos déclarations comptables, fiscales et sociales, et du respect des lois applicables à votre
          activité. Vous vous engagez à <strong>garantir et indemniser</strong> {LEGAL.publisher} contre
          toute réclamation, dommage ou frais (y compris frais de défense) résultant de votre utilisation
          du service, de la violation des présentes conditions ou d'une atteinte aux droits de tiers.
        </p>
      </Section>

      <Section title="8. Disponibilité & force majeure">
        <p>
          Le service peut être suspendu pour maintenance, mise à jour, raison de sécurité ou cas de
          force majeure (panne réseau/électrique, défaillance d'un hébergeur ou d'un prestataire,
          catastrophe, acte d'autorité, etc.), sans que la responsabilité de {LEGAL.publisher} puisse
          être engagée. Nous nous efforçons d'assurer une disponibilité raisonnable sans y être tenus
          par une obligation de résultat.
        </p>
      </Section>

      <Section title="9. Résiliation">
        <p>
          Vous pouvez résilier à tout moment. Nous pouvons suspendre ou résilier un compte, sans
          préavis, en cas de violation des présentes conditions, de défaut de paiement ou d'usage
          frauduleux, sans droit à remboursement des sommes déjà versées.
        </p>
      </Section>

      <Section title="10. Droit applicable & juridiction">
        <p>
          Les présentes conditions sont régies par le droit applicable dans {LEGAL.jurisdiction} et,
          le cas échéant, par le droit OHADA. Tout litige sera, après tentative de règlement amiable,
          soumis aux <strong>tribunaux compétents du siège de {LEGAL.publisher}</strong>.
        </p>
      </Section>

      <p className="pt-4 text-sm text-[#717182] dark:text-white/50">
        Contact : <a className="text-emerald-600 dark:text-emerald-400" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
        {" · "}
        <Link to="/privacy" className="text-emerald-600 dark:text-emerald-400">Politique de confidentialité</Link>
      </p>
    </LegalShell>
  );
}
