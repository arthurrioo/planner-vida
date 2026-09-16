export type AppNavigationItem = {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  symbol: string;
};

export const appNavigationItems = [
  {
    href: "/app",
    label: "Hoje",
    shortLabel: "Hoje",
    description: "Visao operacional do dia",
    symbol: "H",
  },
  {
    href: "/app/calendario",
    label: "Calendario",
    shortLabel: "Agenda",
    description: "Eventos, vencimentos e compromissos",
    symbol: "C",
  },
  {
    href: "/app/planner",
    label: "Planner",
    shortLabel: "Plano",
    description: "Tarefas e planejamento",
    symbol: "P",
  },
  {
    href: "/app/financeiro",
    label: "Financeiro",
    shortLabel: "Fin",
    description: "Controle financeiro pessoal",
    symbol: "$",
  },
  {
    href: "/app/compras",
    label: "Compras",
    shortLabel: "Compras",
    description: "Listas e desejos",
    symbol: "L",
  },
  {
    href: "/app/patrimonio",
    label: "Patrimonio",
    shortLabel: "Patrim.",
    description: "Bens, ativos e posicao",
    symbol: "A",
  },
  {
    href: "/app/recorrentes",
    label: "Recorrentes",
    shortLabel: "Recorr.",
    description: "Assinaturas e rotinas",
    symbol: "R",
  },
  {
    href: "/app/configuracoes",
    label: "Configuracoes",
    shortLabel: "Config.",
    description: "Preferencias da conta",
    symbol: "S",
  },
] as const satisfies readonly AppNavigationItem[];

export function getAppNavigationItem(href: string) {
  return appNavigationItems.find((item) => item.href === href);
}
