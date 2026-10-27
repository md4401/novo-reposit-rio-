// Mapa do app: 8 seções no menu; as telas de cada seção viram abas no topo da página.
// Os endereços das telas não mudam (#/pagar, #/cesta…): links antigos continuam funcionando.
import { ArrowLeftRight, Bot, House, Landmark, PiggyBank, Settings, Users, Wallet } from "lucide-react";
import type { ReactNode } from "react";

export type NavTab = { key: string; label: string };
export type NavItem = { key: string; label: string; hint: string; icon: (size: number) => ReactNode; tabs: NavTab[] };

export const NAV: NavItem[] = [
  { key: "inicio", label: "Início", hint: "Resumo do mês", icon: (s) => <House size={s} />, tabs: [{ key: "inicio", label: "Início" }] },
  {
    key: "transacoes",
    label: "Transações",
    hint: "Tudo o que entrou e saiu",
    icon: (s) => <ArrowLeftRight size={s} />,
    tabs: [
      { key: "transacoes", label: "Transações" },
      { key: "etiquetas", label: "Etiquetas" },
    ],
  },
  {
    key: "meu",
    label: "Meu dinheiro",
    hint: "Só seu: resumo, assinaturas, patrimônio, IR",
    icon: (s) => <Wallet size={s} />,
    tabs: [
      { key: "meu", label: "Resumo" },
      { key: "alertas", label: "Assinaturas e alertas" },
      { key: "patrimonio", label: "Patrimônio e dívidas" },
      { key: "ir", label: "Imposto de Renda" },
    ],
  },
  {
    key: "orcamento",
    label: "Planejar",
    hint: "Orçamento, contas, metas e desafios",
    icon: (s) => <PiggyBank size={s} />,
    tabs: [
      { key: "orcamento", label: "Orçamento" },
      { key: "pagar", label: "Contas a pagar" },
      { key: "previsao", label: "Saldo previsto" },
      { key: "metas", label: "Metas" },
      { key: "desejos", label: "Desejos" },
      { key: "desafios", label: "Desafios" },
    ],
  },
  {
    key: "familia",
    label: "Casa",
    hint: "Totais da família, contas divididas e cesta",
    icon: (s) => <Users size={s} />,
    tabs: [
      { key: "familia", label: "Resumo da casa" },
      { key: "casa", label: "Contas da casa" },
      { key: "cesta", label: "Cesta" },
    ],
  },
  { key: "nia", label: "Assistente Nia", hint: "Pergunte ou fale um gasto", icon: (s) => <Bot size={s} />, tabs: [{ key: "nia", label: "Nia" }] },
  {
    key: "contas",
    label: "Bancos e cartões",
    hint: "Contas, importação e saúde dos dados",
    icon: (s) => <Landmark size={s} />,
    tabs: [
      { key: "contas", label: "Contas e cartões" },
      { key: "saude", label: "Saúde dos dados" },
    ],
  },
  { key: "ajustes", label: "Configurações", hint: "Perfil, família e privacidade", icon: (s) => <Settings size={s} />, tabs: [{ key: "ajustes", label: "Configurações" }] },
];

/** Seção de uma tela (a aba "pagar" pertence a "Planejar"). */
export function sectionOf(page: string) {
  return NAV.find((n) => n.tabs.some((t) => t.key === page)) ?? NAV[0];
}

export const PAGE_TITLES: Record<string, string> = Object.fromEntries(
  NAV.flatMap((n) => n.tabs.map((t) => [t.key, n.tabs.length > 1 ? `${n.label} · ${t.label}` : n.label])),
);

/** Barra inferior do celular (com o "+" no meio); o resto fica no menu do perfil. */
export const BOTTOM_KEYS = ["inicio", "transacoes", "orcamento", "familia"] as const;
