// Mapa do app: 9 seções no menu; as telas de cada seção viram abas no topo da página.
// Os endereços das telas não mudam (#/pagar, #/cesta…): links antigos continuam funcionando.
import { ArrowLeftRight, Bot, CalendarClock, House, Landmark, PiggyBank, Settings, ShieldAlert, ShieldCheck, Trophy, Users, Wallet } from "lucide-react";
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
    hint: "Só seu: assinaturas, renda, bancos, patrimônio, IR",
    icon: (s) => <Wallet size={s} />,
    tabs: [
      { key: "meu", label: "Resumo" },
      { key: "alertas", label: "Assinaturas e alertas" },
      { key: "renda", label: "Renda variável" },
      { key: "receber", label: "Valores a receber" },
      { key: "bancos", label: "Custo dos bancos" },
      { key: "pontos", label: "Benefícios e pontos" },
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
      { key: "parcelar", label: "Parcelar ou à vista?" },
      { key: "momentos", label: "Grandes momentos" },
      { key: "desafios", label: "Desafios" },
    ],
  },
  {
    key: "familia",
    label: "Casa",
    hint: "Totais da família, contas divididas, acertos e compras",
    icon: (s) => <Users size={s} />,
    tabs: [
      { key: "familia", label: "Resumo da casa" },
      { key: "casa", label: "Contas da casa" },
      { key: "acertos", label: "Quem deve a quem" },
      { key: "reuniao", label: "Reunião do mês" },
      { key: "compras", label: "Lista de compras" },
      { key: "cesta", label: "Cesta" },
    ],
  },
  {
    key: "reserva",
    label: "Proteção",
    hint: "Reserva, golpes, documentos e “e se eu faltar?”",
    icon: (s) => <ShieldCheck size={s} />,
    tabs: [
      { key: "reserva", label: "Reserva de emergência" },
      { key: "seguranca", label: "Golpes e segurança" },
      { key: "documentos", label: "Documentos e garantias" },
      { key: "legado", label: "E se eu faltar?" },
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

/** Telas que não são abas, mas pertencem a uma seção (abertas por um link). */
const OTHER_PAGES: Record<string, { section: string; label: string }> = {
  acompanhar: { section: "familia", label: "Acompanhar" },
  compartilhar: { section: "inicio", label: "Compartilhar" },
};

/** Seção de uma tela (a aba "pagar" pertence a "Planejar"). */
export function sectionOf(page: string) {
  const other = OTHER_PAGES[page]?.section;
  return NAV.find((n) => n.key === other || n.tabs.some((t) => t.key === page)) ?? NAV[0];
}

export const PAGE_TITLES: Record<string, string> = {
  ...Object.fromEntries(NAV.flatMap((n) => n.tabs.map((t) => [t.key, n.tabs.length > 1 ? `${n.label} · ${t.label}` : n.label]))),
  ...Object.fromEntries(Object.entries(OTHER_PAGES).map(([key, p]) => [key, p.label])),
};

/** Modo simples (letras maiores, poucas telas) e modo criança: só as telas principais, sem abas. */
export type NavLink = { key: string; label: string; icon: (size: number) => ReactNode };
export const SIMPLE_NAV: NavLink[] = [
  { key: "inicio", label: "Início", icon: (s) => <House size={s} /> },
  { key: "transacoes", label: "Meus lançamentos", icon: (s) => <ArrowLeftRight size={s} /> },
  { key: "pagar", label: "Contas a pagar", icon: (s) => <CalendarClock size={s} /> },
  { key: "seguranca", label: "Golpes e segurança", icon: (s) => <ShieldAlert size={s} /> },
  { key: "nia", label: "Falar com a Nia", icon: (s) => <Bot size={s} /> },
  { key: "ajustes", label: "Configurações", icon: (s) => <Settings size={s} /> },
];
export const KID_NAV: NavLink[] = [
  { key: "inicio", label: "Meu dinheiro", icon: (s) => <House size={s} /> },
  { key: "metas", label: "Cofrinhos", icon: (s) => <PiggyBank size={s} /> },
  { key: "desafios", label: "Desafios", icon: (s) => <Trophy size={s} /> },
  { key: "transacoes", label: "O que gastei", icon: (s) => <ArrowLeftRight size={s} /> },
  { key: "nia", label: "Nia", icon: (s) => <Bot size={s} /> },
  { key: "ajustes", label: "Configurações", icon: (s) => <Settings size={s} /> },
];

/** Barra inferior do celular (com o "+" no meio); o resto fica no menu do perfil. */
export const BOTTOM_KEYS = ["inicio", "transacoes", "orcamento", "familia"] as const;
/** No modo simples e no da criança, a barra leva direto às telas do menu curto */
export const BOTTOM_REDUCED: Record<"simple" | "kid", [string, string][]> = {
  simple: [
    ["inicio", "Início"],
    ["transacoes", "Lançamentos"],
    ["pagar", "Contas"],
    ["nia", "Nia"],
  ],
  kid: [
    ["inicio", "Início"],
    ["transacoes", "Gastos"],
    ["metas", "Cofrinhos"],
    ["nia", "Nia"],
  ],
};
