import type { Product } from "../types/domain";

export const PRODUCT_EMOJI_OPTIONS = [
  { emoji: "👕", label: "Textile", keywords: ["t-shirt", "shirt", "polo", "chemise", "habit", "vetement", "vêtement", "textile"] },
  { emoji: "👗", label: "Couture", keywords: ["robe", "wax", "couture", "tailleur", "jupe", "tenue"] },
  { emoji: "🧵", label: "Tissus", keywords: ["tissu", "fil", "bobine", "coton", "pagnes", "pagne"] },
  { emoji: "👟", label: "Chaussures", keywords: ["chaussure", "basket", "sandale", "soulier"] },
  { emoji: "👜", label: "Maroquinerie", keywords: ["sac", "pochette", "cuir", "cartable"] },
  { emoji: "💎", label: "Bijoux", keywords: ["bijou", "collier", "bracelet", "bague", "montre"] },
  { emoji: "🥤", label: "Boissons", keywords: ["jus", "eau", "boisson", "canette", "bouteille", "soda"] },
  { emoji: "🍚", label: "Alimentaire", keywords: ["riz", "farine", "sucre", "huile", "aliment", "food"] },
  { emoji: "🧴", label: "Cosmétique", keywords: ["savon", "creme", "crème", "lotion", "parfum", "huile corps"] },
  { emoji: "📱", label: "Téléphone", keywords: ["telephone", "téléphone", "mobile", "smartphone", "chargeur", "cable", "câble"] },
  { emoji: "💻", label: "Informatique", keywords: ["ordinateur", "pc", "laptop", "clavier", "souris", "imprimante"] },
  { emoji: "🧰", label: "Outils", keywords: ["outil", "marteau", "tournevis", "atelier", "kit"] },
  { emoji: "🧾", label: "Factures", keywords: ["facture", "carnet", "recu", "reçu", "papier", "document"] },
  { emoji: "📚", label: "Papeterie", keywords: ["cahier", "stylo", "livre", "agenda", "fourniture"] },
  { emoji: "📦", label: "Kit", keywords: ["kit", "pack", "carton", "colis", "programme", "terrain"] },
  { emoji: "🔬", label: "Test", keywords: ["test", "qa", "controle", "contrôle", "laboratoire"] },
  { emoji: "🏷️", label: "Général", keywords: ["general", "général", "divers"] },
];

export function inferProductEmoji(input: Pick<Product, "name" | "category"> | { name?: string; category?: string }) {
  const text = `${input.name ?? ""} ${input.category ?? ""}`.toLowerCase();
  const match = PRODUCT_EMOJI_OPTIONS.find((option) => option.keywords.some((keyword) => text.includes(keyword)));
  return match?.emoji ?? "📦";
}

export function emojiSuggestions(input: string, limit = 12) {
  const q = input.trim().toLowerCase();
  if (!q) return PRODUCT_EMOJI_OPTIONS.slice(0, limit);
  const scored = PRODUCT_EMOJI_OPTIONS.map((option) => {
    const score = option.keywords.reduce((sum, keyword) => {
      if (q.includes(keyword)) return sum + 3;
      if (keyword.includes(q) || q.includes(option.label.toLowerCase())) return sum + 2;
      return sum;
    }, 0);
    return { option, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .map((item) => item.option)
    .slice(0, limit);
}
