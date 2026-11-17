// Conectar banco pelo Open Finance: o servidor gera um token de 30 minutos e o widget da Pluggy
// (carregado só quando precisa) cuida do login e da autorização no banco. Depois, o servidor
// confere que a conexão é desta pessoa e busca contas, transações e investimentos.
import type { OpenFinanceInfo, OpenFinanceSync } from "../../shared/types";
import { api } from "./api";
import { currentTheme } from "./theme";

export type ConnectResult = OpenFinanceSync & OpenFinanceInfo;

export async function connectBank(options: {
  /** Reconectar uma conexão que pediu login de novo */
  connectionId?: string;
  onSaved: (result: ConnectResult) => void;
  onError: (message: string) => void;
  onClose?: () => void;
}) {
  const { accessToken, itemId } = await api<{ accessToken: string; itemId: string | null }>("openfinance/connect-token", {
    body: { connectionId: options.connectionId },
    silent: true,
  });
  const { PluggyConnect } = await import("pluggy-connect-sdk");
  let finished = false;
  const widget = new PluggyConnect({
    connectToken: accessToken,
    ...(itemId ? { updateItem: itemId } : {}),
    language: "pt",
    theme: currentTheme(),
    onSuccess: async ({ item }) => {
      finished = true;
      try {
        options.onSaved(await api<ConnectResult>("openfinance/connections", { body: { itemId: item.id } }));
      } catch (error) {
        options.onError((error as Error).message);
      }
    },
    onError: ({ message }) => {
      finished = true;
      options.onError(message ? `O banco não completou a conexão: ${message}` : "O banco não completou a conexão. Tente de novo.");
    },
    onClose: () => {
      if (!finished) options.onClose?.();
    },
  });
  await widget.init();
}
