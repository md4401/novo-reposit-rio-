// Mapa do app: as mesmas seções no menu lateral (computador) e no "Mais" (celular).
import {
  Activity,
  ArrowLeftRight,
  Bot,
  CalendarClock,
  FileText,
  Gift,
  House,
  Landmark,
  PiggyBank,
  Receipt,
  Repeat,
  Scale,
  Settings,
  ShoppingBasket,
  Tags,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

export type NavItem = { key: string; label: string; hint: string; icon: (size: number) => ReactNode };
export type NavGroup = { label: string | null; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { key: "inicio", label: "Início", hint: "Resumo do mês", icon: (s) => <House size={s} /> },
      { key: "transacoes", label: "Transações", hint: "Tudo o que entrou e saiu", icon: (s) => <ArrowLeftRight size={s} /> },
      { key: "meu", label: "Meu financeiro", hint: "Só seu, privado", icon: (s) => <Wallet size={s} /> },
      { key: "familia", label: "Família", hint: "Totais da casa", icon: (s) => <Users size={s} /> },
    ],
  },
  {
    label: "Planejar",
    items: [
      { key: "orcamento", label: "Orçamento", hint: "Limites por categoria", icon: (s) => <PiggyBank size={s} /> },
      { key: "pagar", label: "Contas a pagar", hint: "Vencimentos e faturas", icon: (s) => <CalendarClock size={s} /> },
      { key: "previsao", label: "Saldo previsto", hint: "Como o mês deve fechar", icon: (s) => <TrendingUp size={s} /> },
      { key: "metas", label: "Metas", hint: "Objetivos e reservas", icon: (s) => <Target size={s} /> },
      { key: "desejos", label: "Lista de desejos", hint: "O que a casa quer comprar", icon: (s) => <Gift size={s} /> },
      { key: "casa", label: "Contas da casa", hint: "Luz, aluguel, internet", icon: (s) => <Receipt size={s} /> },
    ],
  },
  {
    label: "Patrimônio",
    items: [
      { key: "patrimonio", label: "Patrimônio e dívidas", hint: "Bens, dívidas e plano", icon: (s) => <Scale size={s} /> },
      { key: "ir", label: "Imposto de Renda", hint: "Despesas dedutíveis", icon: (s) => <FileText size={s} /> },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { key: "nia", label: "Assistente Nia", hint: "Pergunte ou fale um gasto", icon: (s) => <Bot size={s} /> },
      { key: "alertas", label: "Assinaturas e alertas", hint: "Recorrências e avisos", icon: (s) => <Repeat size={s} /> },
      { key: "desafios", label: "Desafios", hint: "Metas curtas para gastar menos", icon: (s) => <Trophy size={s} /> },
      { key: "cesta", label: "Cesta da família", hint: "Preço dos produtos no tempo", icon: (s) => <ShoppingBasket size={s} /> },
    ],
  },
  {
    label: "Conta",
    items: [
      { key: "contas", label: "Contas e extratos", hint: "Bancos, cartões e importação", icon: (s) => <Landmark size={s} /> },
      { key: "etiquetas", label: "Etiquetas", hint: "Agrupe gastos do seu jeito", icon: (s) => <Tags size={s} /> },
      { key: "saude", label: "Saúde dos dados", hint: "O que está atualizado", icon: (s) => <Activity size={s} /> },
      { key: "ajustes", label: "Configurações", hint: "Perfil, família e privacidade", icon: (s) => <Settings size={s} /> },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = Object.fromEntries(NAV.flatMap((g) => g.items).map((n) => [n.key, n.label]));

/** Barra inferior do celular; o resto fica em "Mais". */
export const BOTTOM_KEYS = ["inicio", "transacoes", "nia"] as const;
