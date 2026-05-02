/**
 * Exhaustive SVG product icon bank for KOMPTA Inventory
 * Uses Lucide React icons — real SVGs, no emoji
 */
import type { LucideIcon } from "lucide-react";
import {
  Shirt, Scissors, Layers, Footprints, Briefcase,
  Gem, GlassWater, Wheat, Droplets, Smartphone,
  Laptop, Wrench, FileText, BookOpen, Package,
  Microscope, Tag, Cpu, Tv, Camera,
  Headphones, Battery, Plug, Radio, Watch,
  Coffee, UtensilsCrossed, Apple, ShoppingBasket, Milk,
  Beef, Fish, Cookie, Wine, Beer,
  Pill, Syringe, Heart, Thermometer, Stethoscope,
  Dumbbell, Bike, ShoppingBag, Palette, Paintbrush,
  Hammer, Wrench as Spanner, Shovel, Ruler, Zap,
  Car, Truck, Bus, Plane, Anchor,
  Home, Sofa, Lamp, Bath, Bed,
  TreePine, Flower, Leaf, Sun, Droplet,
  Box, Archive, Layers as Stack, Grid, MoreHorizontal,
  Building2, Factory, Tractor, HardHat, Clipboard,
  Calculator, Monitor, Printer, Phone, Mail,
  Music, Film, Gamepad2, Book, Globe,
  Baby, Dog, Cat, Bird, Bone,
  Snowflake, Flame, Wind, Thermometer as Temp, Shield,
} from "lucide-react";

export interface ProductIconEntry {
  key: string;
  label: string;
  Icon: LucideIcon;
  bg: string;
  color: string;
  keywords: string[];
}

export const PRODUCT_ICONS: ProductIconEntry[] = [
  /* ── Textile & Mode ── */
  { key: "shirt", label: "Chemise / T-shirt", Icon: Shirt, bg: "bg-blue-100", color: "text-blue-600", keywords: ["chemise", "t-shirt", "polo", "tshirt", "shirt", "haut", "top", "maillot", "uniforme"] },
  { key: "scissors", label: "Couture / Tissus", Icon: Scissors, bg: "bg-pink-100", color: "text-pink-600", keywords: ["couture", "tissu", "pagne", "wax", "fil", "bobine", "robe", "tailleur", "jupe", "tenue", "habit", "vetement", "vêtement"] },
  { key: "layers", label: "Textile en gros", Icon: Layers, bg: "bg-purple-100", color: "text-purple-600", keywords: ["textile", "coton", "voile", "soie", "laine", "tissu en gros"] },
  { key: "footprints", label: "Chaussures", Icon: Footprints, bg: "bg-amber-100", color: "text-amber-700", keywords: ["chaussure", "basket", "sandale", "soulier", "boot", "talon", "mocassin"] },
  { key: "bag", label: "Sac / Maroquinerie", Icon: ShoppingBag, bg: "bg-rose-100", color: "text-rose-600", keywords: ["sac", "pochette", "cuir", "cartable", "maroquinerie", "portefeuille", "valise"] },
  { key: "gem", label: "Bijoux / Montres", Icon: Gem, bg: "bg-yellow-100", color: "text-yellow-600", keywords: ["bijou", "collier", "bracelet", "bague", "montre", "pendentif", "anneau"] },
  { key: "watch", label: "Montre", Icon: Watch, bg: "bg-slate-100", color: "text-slate-600", keywords: ["montre", "horloge", "accessoire temps"] },

  /* ── Alimentation & Boissons ── */
  { key: "water", label: "Eau / Boisson", Icon: GlassWater, bg: "bg-cyan-100", color: "text-cyan-600", keywords: ["eau", "boisson", "jus", "soda", "canette", "bouteille", "jus"] },
  { key: "wheat", label: "Céréales / Farine", Icon: Wheat, bg: "bg-yellow-100", color: "text-yellow-700", keywords: ["riz", "farine", "mil", "mais", "céréale", "graine", "semoule", "arachide", "noix"] },
  { key: "coffee", label: "Café / Thé", Icon: Coffee, bg: "bg-amber-100", color: "text-amber-800", keywords: ["café", "thé", "cacao", "nescafe", "expresso"] },
  { key: "food", label: "Plats / Cuisine", Icon: UtensilsCrossed, bg: "bg-orange-100", color: "text-orange-600", keywords: ["plat", "cuisine", "repas", "nourriture", "aliment", "food", "manger"] },
  { key: "fruit", label: "Fruits / Légumes", Icon: Apple, bg: "bg-green-100", color: "text-green-600", keywords: ["fruit", "legume", "légume", "banana", "banane", "mangue", "tomate", "oignon"] },
  { key: "basket", label: "Épicerie", Icon: ShoppingBasket, bg: "bg-lime-100", color: "text-lime-700", keywords: ["epicerie", "épicerie", "courses", "provisions", "stock alimentaire"] },
  { key: "milk", label: "Produits laitiers", Icon: Milk, bg: "bg-sky-100", color: "text-sky-600", keywords: ["lait", "yaourt", "fromage", "beurre", "crème", "laitier"] },
  { key: "meat", label: "Viande / Poisson", Icon: Beef, bg: "bg-red-100", color: "text-red-600", keywords: ["viande", "poulet", "boeuf", "agneau", "mouton", "chèvre"] },
  { key: "fish", label: "Poisson", Icon: Fish, bg: "bg-blue-100", color: "text-blue-700", keywords: ["poisson", "crevette", "fruit de mer", "sardine", "thon", "tilapia"] },
  { key: "cookie", label: "Biscuits / Snacks", Icon: Cookie, bg: "bg-amber-100", color: "text-amber-600", keywords: ["biscuit", "gâteau", "snack", "chips", "confiserie", "bonbon", "sucre"] },
  { key: "wine", label: "Alcool / Vin", Icon: Wine, bg: "bg-purple-100", color: "text-purple-700", keywords: ["vin", "alcool", "bière", "apéritif", "champagne", "whisky"] },
  { key: "beer", label: "Bière", Icon: Beer, bg: "bg-yellow-100", color: "text-yellow-800", keywords: ["biere", "bière", "malta", "castel", "flag"] },
  { key: "oil", label: "Huile / Condiments", Icon: Droplets, bg: "bg-orange-100", color: "text-orange-700", keywords: ["huile", "sauce", "condiment", "vinaigre", "moutarde", "sel", "sucre"] },

  /* ── Cosmétique & Hygiène ── */
  { key: "drops", label: "Crème / Lotion", Icon: Droplet, bg: "bg-pink-100", color: "text-pink-500", keywords: ["crème", "creme", "lotion", "beurre de karité", "karite", "soin visage", "hydratant"] },
  { key: "soap", label: "Savon / Hygiène", Icon: Droplets, bg: "bg-teal-100", color: "text-teal-600", keywords: ["savon", "gel douche", "shampoo", "shampooing", "déodorant", "hygiene", "hygiène"] },
  { key: "palette", label: "Maquillage", Icon: Palette, bg: "bg-rose-100", color: "text-rose-500", keywords: ["maquillage", "rouge", "fond de teint", "poudre", "mascara", "eyeliner", "parfum"] },

  /* ── Électronique & Informatique ── */
  { key: "smartphone", label: "Téléphone / Mobile", Icon: Smartphone, bg: "bg-blue-100", color: "text-blue-700", keywords: ["telephone", "téléphone", "mobile", "smartphone", "iphone", "samsung", "android"] },
  { key: "laptop", label: "Ordinateur", Icon: Laptop, bg: "bg-slate-100", color: "text-slate-700", keywords: ["ordinateur", "laptop", "pc", "macbook", "lenovo", "tablette", "ipad"] },
  { key: "monitor", label: "Écran / TV", Icon: Monitor, bg: "bg-indigo-100", color: "text-indigo-600", keywords: ["ecran", "écran", "tv", "télévision", "moniteur", "display"] },
  { key: "tv", label: "Télévision", Icon: Tv, bg: "bg-violet-100", color: "text-violet-600", keywords: ["television", "télévision", "smart tv", "decoder", "décodeur", "antenne"] },
  { key: "headphones", label: "Audio / Casque", Icon: Headphones, bg: "bg-purple-100", color: "text-purple-600", keywords: ["casque", "ecouteur", "écouteur", "enceinte", "speaker", "audio", "son"] },
  { key: "camera", label: "Photo / Caméra", Icon: Camera, bg: "bg-gray-100", color: "text-gray-700", keywords: ["camera", "caméra", "photo", "appareil photo", "objectif", "gopro"] },
  { key: "battery", label: "Batterie / Énergie", Icon: Battery, bg: "bg-yellow-100", color: "text-yellow-700", keywords: ["batterie", "chargeur", "powerbank", "pile", "adaptateur", "cable"] },
  { key: "plug", label: "Accessoires élec.", Icon: Plug, bg: "bg-orange-100", color: "text-orange-600", keywords: ["cable", "câble", "prise", "connecteur", "usb", "hdmi", "chargeur"] },
  { key: "cpu", label: "Composants", Icon: Cpu, bg: "bg-green-100", color: "text-green-700", keywords: ["processeur", "ram", "disque dur", "carte mère", "composant", "piece informatique"] },
  { key: "printer", label: "Imprimante", Icon: Printer, bg: "bg-stone-100", color: "text-stone-600", keywords: ["imprimante", "cartouche", "scanner", "photocopieur", "toner"] },
  { key: "radio", label: "Radio", Icon: Radio, bg: "bg-emerald-100", color: "text-emerald-600", keywords: ["radio", "poste radio", "hifi", "stereo"] },
  { key: "gamepad", label: "Jeux vidéo", Icon: Gamepad2, bg: "bg-violet-100", color: "text-violet-700", keywords: ["jeu", "playstation", "xbox", "nintendo", "manette", "console", "gaming"] },

  /* ── Santé & Pharmacie ── */
  { key: "pill", label: "Médicaments", Icon: Pill, bg: "bg-red-100", color: "text-red-600", keywords: ["medicament", "médicament", "comprime", "comprimé", "sirop", "capsule", "pilule", "amoxicilline"] },
  { key: "syringe", label: "Injections / Vaccins", Icon: Syringe, bg: "bg-rose-100", color: "text-rose-700", keywords: ["seringue", "injection", "vaccin", "perfusion", "laboratoire"] },
  { key: "stethoscope", label: "Équipement médical", Icon: Stethoscope, bg: "bg-blue-100", color: "text-blue-800", keywords: ["stethoscope", "tensiometre", "équipement médical", "glucometre"] },
  { key: "thermometer", label: "Thermomètre / Mesure", Icon: Thermometer, bg: "bg-orange-100", color: "text-orange-700", keywords: ["thermometre", "thermomètre", "mesure", "test rapide", "bandelette"] },
  { key: "heart", label: "Bien-être / Santé", Icon: Heart, bg: "bg-red-100", color: "text-red-500", keywords: ["sante", "santé", "bien-être", "soin", "complément", "vitamine", "supplement"] },

  /* ── Papeterie & Bureau ── */
  { key: "book", label: "Livres / Éducation", Icon: BookOpen, bg: "bg-blue-100", color: "text-blue-600", keywords: ["livre", "cahier", "manuel", "scolaire", "education", "cours", "roman"] },
  { key: "file", label: "Papeterie", Icon: FileText, bg: "bg-stone-100", color: "text-stone-600", keywords: ["stylo", "papier", "ramette", "cahier", "agenda", "fourniture", "crayon", "feuille"] },
  { key: "calculator", label: "Calculatrice", Icon: Calculator, bg: "bg-slate-100", color: "text-slate-600", keywords: ["calculatrice", "calculette", "comptabilite", "comptabilité"] },
  { key: "clipboard", label: "Documents admin", Icon: Clipboard, bg: "bg-amber-100", color: "text-amber-700", keywords: ["formulaire", "contrat", "document", "dossier", "facture", "recu", "reçu", "carnet"] },
  { key: "phone", label: "Téléphone fixe", Icon: Phone, bg: "bg-green-100", color: "text-green-700", keywords: ["telephone fixe", "fax", "interphone"] },
  { key: "mail", label: "Enveloppes / Courrier", Icon: Mail, bg: "bg-indigo-100", color: "text-indigo-600", keywords: ["enveloppe", "courrier", "timbre", "lettre"] },

  /* ── Bricolage & Outillage ── */
  { key: "wrench", label: "Outils / Bricolage", Icon: Wrench, bg: "bg-gray-100", color: "text-gray-700", keywords: ["outil", "clef", "tournevis", "marteau", "pince", "atelier", "kit reparation"] },
  { key: "hammer", label: "Marteau / Construction", Icon: Hammer, bg: "bg-orange-100", color: "text-orange-700", keywords: ["marteau", "construction", "maçonnerie", "béton", "brique", "ciment"] },
  { key: "paintbrush", label: "Peinture", Icon: Paintbrush, bg: "bg-pink-100", color: "text-pink-600", keywords: ["peinture", "pineau", "vernis", "laque", "badigeon", "enduit"] },
  { key: "ruler", label: "Mesure / Précision", Icon: Ruler, bg: "bg-slate-100", color: "text-slate-700", keywords: ["regle", "règle", "mesure", "mètre", "equerre", "compas"] },
  { key: "shovel", label: "Agriculture / Jardinage", Icon: Shovel, bg: "bg-green-100", color: "text-green-700", keywords: ["pelle", "pioche", "bêche", "jardinage", "agriculture", "sarcler", "houe"] },
  { key: "hardhat", label: "BTP / Sécurité", Icon: HardHat, bg: "bg-yellow-100", color: "text-yellow-700", keywords: ["casque", "btp", "chantier", "securite", "travaux", "gants"] },
  { key: "zap", label: "Électricité", Icon: Zap, bg: "bg-yellow-100", color: "text-yellow-600", keywords: ["electrique", "électrique", "fil electrique", "interrupteur", "disjoncteur", "câble electrique"] },

  /* ── Mobilier & Maison ── */
  { key: "home", label: "Maison / Immobilier", Icon: Home, bg: "bg-emerald-100", color: "text-emerald-700", keywords: ["maison", "logement", "appartement", "villa", "terrain", "immeuble"] },
  { key: "sofa", label: "Mobilier", Icon: Sofa, bg: "bg-teal-100", color: "text-teal-600", keywords: ["canapé", "fauteuil", "chaise", "meuble", "mobilier", "bureau", "commode"] },
  { key: "lamp", label: "Éclairage", Icon: Lamp, bg: "bg-yellow-100", color: "text-yellow-600", keywords: ["lampe", "ampoule", "torche", "eclairage", "éclairage", "lumiere", "led"] },
  { key: "bed", label: "Literie", Icon: Bed, bg: "bg-blue-100", color: "text-blue-500", keywords: ["lit", "matelas", "oreiller", "drap", "couverture", "moustiquaire"] },
  { key: "bath", label: "Salle de bain", Icon: Bath, bg: "bg-cyan-100", color: "text-cyan-600", keywords: ["baignoire", "douche", "robinet", "sanitaire", "plomberie", "tuyau"] },

  /* ── Transport & Auto ── */
  { key: "car", label: "Automobile", Icon: Car, bg: "bg-red-100", color: "text-red-600", keywords: ["voiture", "auto", "pièce auto", "huile moteur", "filtre", "pneu", "véhicule"] },
  { key: "truck", label: "Transport / Fret", Icon: Truck, bg: "bg-orange-100", color: "text-orange-700", keywords: ["camion", "fret", "transport", "livraison", "logistique"] },
  { key: "bike", label: "Vélo / Moto", Icon: Bike, bg: "bg-green-100", color: "text-green-600", keywords: ["velo", "vélo", "moto", "scooter", "trottinette", "deux-roues"] },
  { key: "plane", label: "Voyage / Transport aérien", Icon: Plane, bg: "bg-sky-100", color: "text-sky-600", keywords: ["billet", "voyage", "avion", "transport", "ticket"] },

  /* ── Agriculture & Nature ── */
  { key: "tractor", label: "Engins agricoles", Icon: Tractor, bg: "bg-lime-100", color: "text-lime-700", keywords: ["tracteur", "engin", "machine agricole", "labour"] },
  { key: "leaf", label: "Produits naturels", Icon: Leaf, bg: "bg-green-100", color: "text-green-700", keywords: ["naturel", "plante", "herbe", "feuille", "bio", "organic", "herboristerie"] },
  { key: "flower", label: "Fleurs / Plantes", Icon: Flower, bg: "bg-pink-100", color: "text-pink-500", keywords: ["fleur", "plante", "pot", "jardin", "décoration végétale"] },
  { key: "tree", label: "Bois / Forêt", Icon: TreePine, bg: "bg-green-100", color: "text-green-800", keywords: ["bois", "planche", "menuiserie", "charpente", "parquet", "bûche"] },

  /* ── Sports & Loisirs ── */
  { key: "dumbbell", label: "Sport / Fitness", Icon: Dumbbell, bg: "bg-red-100", color: "text-red-600", keywords: ["sport", "fitness", "gym", "haltere", "musculation", "équipement sportif"] },
  { key: "music", label: "Musique", Icon: Music, bg: "bg-violet-100", color: "text-violet-600", keywords: ["guitare", "clavier", "instrument", "musique", "sono"] },
  { key: "film", label: "Cinéma / Médias", Icon: Film, bg: "bg-gray-100", color: "text-gray-600", keywords: ["dvd", "film", "cinéma", "série", "media"] },
  { key: "book2", label: "Magazine / Presse", Icon: Book, bg: "bg-amber-100", color: "text-amber-700", keywords: ["magazine", "journal", "presse", "revue"] },

  /* ── Animaux ── */
  { key: "dog", label: "Chien", Icon: Dog, bg: "bg-amber-100", color: "text-amber-700", keywords: ["chien", "animal de compagnie", "collier", "laisse"] },
  { key: "cat", label: "Chat / Animaux", Icon: Cat, bg: "bg-orange-100", color: "text-orange-600", keywords: ["chat", "animal", "veterinaire", "nourriture animal"] },
  { key: "bird", label: "Volaille / Élevage", Icon: Bird, bg: "bg-yellow-100", color: "text-yellow-700", keywords: ["volaille", "poulet", "dinde", "oiseau", "elevage", "élevage"] },
  { key: "bone", label: "Vétérinaire", Icon: Bone, bg: "bg-stone-100", color: "text-stone-600", keywords: ["veterinaire", "vétérinaire", "médicament animal", "elevage"] },

  /* ── Enfants ── */
  { key: "baby", label: "Bébé / Enfant", Icon: Baby, bg: "bg-pink-100", color: "text-pink-500", keywords: ["bebe", "bébé", "enfant", "couche", "couche", "lait infantile", "jouet", "poussette"] },

  /* ── Industrie ── */
  { key: "factory", label: "Industrie / Usine", Icon: Factory, bg: "bg-slate-100", color: "text-slate-700", keywords: ["industrie", "usine", "production", "manufacture", "pièce industrielle"] },
  { key: "building", label: "Immeuble / Bureau", Icon: Building2, bg: "bg-blue-100", color: "text-blue-600", keywords: ["bureau", "immeuble", "salle", "local", "commerce"] },
  { key: "microscope", label: "Laboratoire", Icon: Microscope, bg: "bg-teal-100", color: "text-teal-600", keywords: ["laboratoire", "analyse", "reactif", "chimie", "test", "controle qualité"] },
  { key: "shield", label: "Sécurité / Protection", Icon: Shield, bg: "bg-blue-100", color: "text-blue-700", keywords: ["securite", "sécurité", "protection", "antivol", "cadenas", "alarme"] },
  { key: "globe", label: "Import / Export", Icon: Globe, bg: "bg-cyan-100", color: "text-cyan-700", keywords: ["import", "export", "international", "douane", "shipping"] },
  { key: "anchor", label: "Maritime / Pêche", Icon: Anchor, bg: "bg-blue-100", color: "text-blue-800", keywords: ["bateau", "maritime", "peche", "pêche", "mer", "filet"] },
  { key: "flame", label: "Énergie / Gaz", Icon: Flame, bg: "bg-orange-100", color: "text-orange-600", keywords: ["gaz", "butane", "propane", "charbon", "combustible", "energie"] },
  { key: "snowflake", label: "Froid / Climatisation", Icon: Snowflake, bg: "bg-blue-100", color: "text-blue-400", keywords: ["refrigerateur", "congélateur", "climatiseur", "frigo", "froid"] },
  { key: "sun", label: "Solaire / Énergie renouv.", Icon: Sun, bg: "bg-yellow-100", color: "text-yellow-500", keywords: ["solaire", "panneau solaire", "energie renouvelable", "photovoltaïque"] },
  { key: "wind", label: "Ventilation", Icon: Wind, bg: "bg-sky-100", color: "text-sky-500", keywords: ["ventilateur", "ventilation", "aération", "extracteur"] },

  /* ── Général ── */
  { key: "pack", label: "Kit / Pack", Icon: Package, bg: "bg-stone-100", color: "text-stone-600", keywords: ["kit", "pack", "lot", "ensemble", "bundle"] },
  { key: "archive", label: "Stock / Archives", Icon: Archive, bg: "bg-stone-100", color: "text-stone-500", keywords: ["archive", "stock", "entrepot", "entrepôt", "reserve", "réserve"] },
  { key: "grid", label: "Assortiment / Divers", Icon: Grid, bg: "bg-gray-100", color: "text-gray-500", keywords: ["divers", "general", "général", "assortiment", "mixte"] },
  { key: "tag", label: "Étiquette / Général", Icon: Tag, bg: "bg-gray-100", color: "text-gray-600", keywords: [] }, // fallback
];

/** Look up an icon entry by key */
export function getProductIconByKey(key: string): ProductIconEntry {
  return PRODUCT_ICONS.find((e) => e.key === key) ?? PRODUCT_ICONS[PRODUCT_ICONS.length - 1];
}

/** Infer the best icon from product name + category */
export function inferProductIcon(input: { name?: string; category?: string; icon_key?: string }): ProductIconEntry {
  if (input.icon_key) {
    const found = PRODUCT_ICONS.find((e) => e.key === input.icon_key);
    if (found) return found;
  }
  const text = `${input.name ?? ""} ${input.category ?? ""}`.toLowerCase();
  let best: ProductIconEntry | null = null;
  let bestScore = 0;
  for (const entry of PRODUCT_ICONS) {
    const score = entry.keywords.reduce((s, kw) => s + (text.includes(kw) ? kw.length : 0), 0);
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return best ?? PRODUCT_ICONS[PRODUCT_ICONS.length - 1];
}

/** Suggest icons relevant to a query string, for the picker */
export function productIconSuggestions(query: string, limit = 24): ProductIconEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return PRODUCT_ICONS.slice(0, limit);
  const scored = PRODUCT_ICONS.map((entry) => {
    let score = entry.keywords.reduce((s, kw) => {
      if (q.includes(kw) || kw.includes(q)) return s + kw.length;
      return s;
    }, 0);
    if (entry.label.toLowerCase().includes(q)) score += 10;
    return { entry, score };
  });
  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.entry)
    .concat(PRODUCT_ICONS.filter((e) => !scored.some((s) => s.entry.key === e.key && s.score > 0)))
    .slice(0, limit);
}
