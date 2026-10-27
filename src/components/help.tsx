// Explicações curtas dos termos do app, abertas pelo "?" ao lado de cada um.
import { Help } from "./ui";

export function ScopeHelp() {
  return (
    <Help title="Pessoal ou Família">
      <p>
        <b>Pessoal:</b> só você vê a compra, a loja e o valor.
      </p>
      <p>
        <b>Família:</b> o valor entra no total da casa, somado por categoria. Ninguém vê a loja, a descrição nem quem comprou.
      </p>
      <p>Uma compra pode ter as duas partes (ex.: mercado da casa + um item seu).</p>
    </Help>
  );
}

export function ReviewHelp() {
  return (
    <Help title="A revisar">
      <p>Compras que chegaram sem categoria — do extrato importado ou lançadas sem escolher.</p>
      <p>Escolha a categoria e se é Pessoal ou Família. Depois de 2 confirmações iguais da mesma loja, o ninho passa a classificar sozinho.</p>
    </Help>
  );
}

export function LeftoverHelp() {
  return (
    <Help title="Sobrou">
      <p>O que entrou no mês menos o que saiu, pelos lançamentos do app. Não é o dinheiro na conta: para isso, veja o saldo.</p>
    </Help>
  );
}

export function BalanceHelp() {
  return (
    <Help title="Saldo">
      <p>Quanto tem na conta. Você informa o saldo uma vez (olhando o app do banco) e o ninho atualiza com cada lançamento depois dessa data.</p>
      <p>O saldo previsto soma o que já está combinado: contas a pagar, faturas, assinaturas e salário.</p>
    </Help>
  );
}
