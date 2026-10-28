// Ícones no mesmo traço do resto do app (lucide) no lugar dos emojis das categorias e avisos.
// Os emojis continuam no catálogo (texto da Nia, relatório em PDF); aqui só muda o desenho na tela.
import {
  ArrowLeftRight,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  CalendarClock,
  Camera,
  CirclePlay,
  CircleHelp,
  Clapperboard,
  Coins,
  Compass,
  Dumbbell,
  Fuel,
  House,
  Lock,
  Mic,
  PawPrint,
  Pill,
  Pin,
  Puzzle,
  ReceiptText,
  RefreshCw,
  Repeat,
  Search,
  ShoppingBag,
  ShoppingCart,
  Siren,
  Sparkles,
  SprayCan,
  Sprout,
  Tag,
  TrendingUp,
  TriangleAlert,
  Undo2,
  Wallet,
  Droplets,
  PartyPopper,
  Target,
  Bike,
  CalendarDays,
  CircleCheck,
  CreditCard,
  Flag,
  Gift,
  Leaf,
  TrendingDown,
  Baby,
  HandCoins,
  Heart,
  KeyRound,
  Landmark,
  Percent,
  Plane,
  Scissors,
  ShieldCheck,
  Shirt,
  Ticket,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { Transaction } from "../../shared/types";
import { category } from "../lib/format";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  alimentacao: ShoppingCart,
  restaurantes: UtensilsCrossed,
  moradia: House,
  transporte: Fuel,
  saude: Pill,
  limpeza: SprayCan,
  higiene: Droplets,
  assinaturas: CirclePlay,
  compras: ShoppingBag,
  vestuario: Shirt,
  beleza: Scissors,
  "bem-estar": Dumbbell,
  lazer: Clapperboard,
  educacao: BookOpen,
  pets: PawPrint,
  viagens: Plane,
  filhos: Baby,
  presentes: Heart,
  impostos: Landmark,
  seguros: ShieldCheck,
  dividas: Percent,
  outros: ReceiptText,
  salario: BriefcaseBusiness,
  "renda-extra": Sparkles,
  aposentadoria: HandCoins,
  beneficios: Ticket,
  "aluguel-recebido": KeyRound,
  rendimentos: TrendingUp,
  reembolso: Undo2,
  "outras-receitas": Coins,
  transferencia: ArrowLeftRight,
  _pendente: CircleHelp,
};

/** Emojis que o servidor ainda manda nos avisos (insights) e alguns fixos das telas. */
const EMOJI_ICONS: Record<string, LucideIcon> = {
  "🚨": Siren,
  "⚠️": TriangleAlert,
  "📌": Pin,
  "📈": TrendingUp,
  "🔁": Repeat,
  "🗓️": CalendarClock,
  "🔄": RefreshCw,
  "🌱": Sprout,
  "🧭": Compass,
  "🔒": Lock,
  "🎙️": Mic,
  "📸": Camera,
  "🧠": Brain,
  "🧩": Puzzle,
  "🏷️": Tag,
  "🔍": Search,
  "🧾": ReceiptText,
  "💰": Wallet,
  "🎯": Target,
  "🎉": PartyPopper,
  "📅": CalendarDays,
  "💳": CreditCard,
  "🎁": Gift,
  "✅": CircleCheck,
  "🏁": Flag,
  "🛵": Bike,
  "📉": TrendingDown,
  "🧘": Leaf,
};

export function CategoryIcon({ id, size = 18 }: { id: string | null | undefined; size?: number }) {
  const Icon = CATEGORY_ICONS[id ?? "_pendente"] ?? ReceiptText;
  return <Icon size={size} strokeWidth={1.9} aria-hidden="true" />;
}

/** Quadradinho colorido com o ícone da categoria (linhas de transação, contas, assinaturas). */
export function CategoryBadge({ id, size = 40 }: { id: string | null | undefined; size?: number }) {
  const c = category(id);
  return (
    <span className="cat-badge" style={{ width: size, height: size, "--cat": c.color } as React.CSSProperties} aria-hidden="true">
      <CategoryIcon id={c.id} size={Math.round(size * 0.45)} />
    </span>
  );
}

export function txCategoryId(t: Transaction) {
  if (t.direction === "transfer") return "transferencia";
  if (t.allocations.length === 0) return "_pendente";
  return [...t.allocations].sort((a, b) => b.amountCents - a.amountCents)[0].categoryId;
}

/** Desenha o emoji como ícone quando conhecemos um equivalente; senão, o próprio emoji. */
export function Glyph({ emoji, size = 17 }: { emoji: string; size?: number }) {
  const Icon = EMOJI_ICONS[emoji];
  return Icon ? <Icon size={size} strokeWidth={1.9} aria-hidden="true" /> : <>{emoji}</>;
}
