// Palavras que sugerem uma categoria. Usado na classificação de extratos (quando não há
// regra nem histórico) e para entender frases faladas ou digitadas para a Nia.
import { stripAccents } from "./merchant.js";

export const EXPENSE_KEYWORDS: [RegExp, string][] = [
  [/\b(netflix|spotify|deezer|disney|hbo|max|prime video|amazon prime|globoplay|youtube premium|paramount|apple com bill|icloud|google one|musica premium|assinatura|streaming)\b/, "assinaturas"],
  [/\b(supermercado|mercado|atacad\w*|hortifruti|sacolao|acougue|padaria|panificadora|confeitaria|ifood|rappi|lanchonete|restaurante|pizzaria|hamburgueria|burger|lanche|cafe|cafeteria|comida|almoco|jantar|feira|mercearia|emporio|doceria|sorveteria|bar)\b/, "alimentacao"],
  [/\b(limpeza|detergente|sabao|desinfetante|amaciante|agua sanitaria|vassoura|lava roupas)\b/, "limpeza"],
  [/\b(higiene|sabonete|shampoo|xampu|pasta de dente|creme dental|desodorante|papel higienico|absorvente|perfumaria|cosmetic\w*)\b/, "higiene"],
  [/\b(posto|combustivel|gasolina|etanol|alcool|diesel|shell|ipiranga|petrobras|br mania|uber|99 ?app|99pop|cabify|taxi|onibus|metro|estacionamento|pedagio|sem parar|veloe|conectcar|oficina|mecanic\w*)\b/, "transporte"],
  [/\b(farmacia|drogaria|droga\w*|raia|pacheco|pague menos|panvel|remedio|medic\w*|hospital|clinica|laboratorio|exame|consulta|dentista|odonto\w*|plano de saude|unimed|amil|hapvida|psicolog\w*)\b/, "saude"],
  [/\b(aluguel|condominio|iptu|luz|energia|enel|cemig|light|copel|celesc|coelba|sabesp|agua|saneamento|gas|comgas|internet|vivo|claro|tim|oi fibra|net virtua|telefone|reforma|material de construcao|leroy|telhanorte)\b/, "moradia"],
  [/\b(academia|smart ?fit|bluefit|selfit|bodytech|crossfit|pilates|yoga|personal trainer|gympass|wellhub|totalpass|natacao|musculacao)\b/, "bem-estar"],
  [/\b(cinema|ingresso|show|teatro|parque|viagem|hotel|airbnb|booking|passagem|steam|playstation|xbox|nintendo|jogo|lazer)\b/, "lazer"],
  [/\b(escola|faculdade|curso|udemy|alura|livro|livraria|material escolar|mensalidade escolar|educacao)\b/, "educacao"],
  [/\b(pet ?shop|petz|cobasi|veterinari\w*|racao)\b/, "pets"],
  [/\b(loja|magazine|magalu|americanas|shopee|shein|mercado livre|amazon|renner|riachuelo|c ?& ?a|zara|centauro|netshoes|eletronic\w*|roupa|sapato|tenis|presente|compras)\b/, "compras"],
];

export const INCOME_KEYWORDS: [RegExp, string][] = [
  [/\b(salario|pagamento de salario|folha|proventos|vencimentos|holerite|estagio|bolsa)\b/, "salario"],
  [/\b(estorno|reembolso|devolucao|cashback|chargeback)\b/, "reembolso"],
  [/\b(freela|freelance|venda|comissao|bonus|renda extra|aluguel recebido|dividendo\w*|rendimento\w*)\b/, "renda-extra"],
];

export function guessCategory(text: string, direction: "expense" | "income" = "expense"): string | null {
  const normalized = stripAccents(text.toLowerCase());
  for (const [pattern, category] of direction === "income" ? INCOME_KEYWORDS : EXPENSE_KEYWORDS) {
    if (pattern.test(normalized)) return category;
  }
  return null;
}
