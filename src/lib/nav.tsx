// Mapa do app: 11 seções no menu, cada uma responde a uma pergunta; as telas viram abas no topo.
// Regras: título da página = nome da aba; até 5 abas por seção; "conta" só para banco.
// Endereços antigos (#/cesta, #/acertos…) são redirecionados em lib/router.ts.
import { ArrowLeftRight, Bot, CalendarClock, Eye, House, Landmark, PiggyBank, Settings, ShieldAlert, ShieldCheck, Target, Trophy, Users, Wallet } from "lucide-react";
import type { ReactNode } from "react";

export type NavTab = { key: string; label: string };
export type NavItem = { key: string; label: string; hint: string; icon: (size: number) => ReactNode; tabs: NavTab[] };

export const NAV: NavItem[] = [
  { key: "inicio", label: "Início", hint: "Como está o seu mês", icon: (s) => <House size={s} />, tabs: [{ key: "inicio", label: "Início" }] },
  {
    key: "transacoes",
    label: "Transações",
    hint: "O que entrou e saiu",
    icon: (s) => <ArrowLeftRight size={s} />,
    tabs: [
      { key: "transacoes", label: "Transações" },
      { key: "compartilhar", label: "Recebidos" },
      { key: "etiquetas", label: "Etiquetas" },
    ],
  },
  {
    key: "meu",
    label: "Meu dinheiro",
    hint: "Quanto você tem: só seu",
    icon: (s) => <Wallet size={s} />,
    tabs: [
      { key: "meu", label: "Visão geral" },
      { key: "patrimonio", label: "Patrimônio e dívidas" },
      { key: "reserva", label: "Reserva de emergência" },
      { key: "renda", label: "Renda variável" },
      { key: "ir", label: "Imposto de Renda" },
    ],
  },
  {
    key: "pagar",
    label: "Pagar e receber",
    hint: "O que vence e o que vai entrar",
    icon: (s) => <CalendarClock size={s} />,
    tabs: [
      { key: "pagar", label: "Contas a pagar" },
      { key: "receber", label: "Valores a receber" },
      { key: "previsao", label: "Saldo previsto" },
    ],
  },
  {
    key: "orcamento",
    label: "Planejar",
    hint: "Orçamento, metas e simulações",
    icon: (s) => <Target size={s} />,
    tabs: [
      { key: "orcamento", label: "Orçamento" },
      { key: "metas", label: "Metas" },
      { key: "simuladores", label: "Simuladores" },
      { key: "desafios", label: "Desafios" },
    ],
  },
  {
    key: "familia",
    label: "Casa",
    hint: "O que é da família",
    icon: (s) => <Users size={s} />,
    tabs: [
      { key: "familia", label: "Resumo da casa" },
      { key: "casa", label: "Contas divididas" },
      { key: "compras", label: "Compras" },
      { key: "desejos", label: "Desejos" },
      { key: "reuniao", label: "Reunião do mês" },
    ],
  },
  {
    key: "alertas",
    label: "De olho",
    hint: "Onde o dinheiro pode estar escapando",
    icon: (s) => <Eye size={s} />,
    tabs: [
      { key: "alertas", label: "Assinaturas e alertas" },
      { key: "seguranca", label: "Golpes e segurança" },
      { key: "bancos", label: "Custo dos bancos" },
      { key: "pontos", label: "Benefícios e pontos" },
    ],
  },
  {
    key: "documentos",
    label: "Proteção",
    hint: "Documentos, “e se eu faltar?” e acompanhamento",
    icon: (s) => <ShieldCheck size={s} />,
    tabs: [
      { key: "documentos", label: "Documentos e garantias" },
      { key: "legado", label: "E se eu faltar?" },
      { key: "acompanhar", label: "Acompanhamento" },
    ],
  },
  { key: "nia", label: "Assistente Nia", hint: "Pergunte ou conte um gasto", icon: (s) => <Bot size={s} />, tabs: [{ key: "nia", label: "Nia" }] },
  {
    key: "contas",
    label: "Bancos e cartões",
    hint: "De onde vêm os dados",
    icon: (s) => <Landmark size={s} />,
    tabs: [
      { key: "contas", label: "Bancos e cartões" },
      { key: "saude", label: "Saúde dos dados" },
    ],
  },
  { key: "ajustes", label: "Configurações", hint: "Perfil, família e privacidade", icon: (s) => <Settings size={s} />, tabs: [{ key: "ajustes", label: "Configurações" }] },
];

/** Telas que não são abas, mas pertencem a uma seção (abertas por um link). */
const OTHER_PAGES: Record<string, { section: string; label: string }> = {};

/** Seção de uma tela (a aba "pagar" pertence a "Planejar"). */
export function sectionOf(page: string) {
  const other = OTHER_PAGES[page]?.section;
  return NAV.find((n) => n.key === other || n.tabs.some((t) => t.key === page)) ?? NAV[0];
}

export const PAGE_TITLES: Record<string, string> = {
  ...Object.fromEntries(NAV.flatMap((n) => n.tabs.map((t) => [t.key, n.tabs.length > 1 && t.label !== n.label ? `${n.label} · ${t.label}` : n.label]))),
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
