// Palavras que sugerem uma categoria. Usado na classificação de extratos (quando não há
// regra nem histórico) e para entender frases faladas ou digitadas para a Nia.
import { stripAccents } from "./merchant.js";

export const EXPENSE_KEYWORDS: [RegExp, string][] = [
  [/\b(netflix|spotify|deezer|disney|hbo|max|prime video|amazon prime|globoplay|youtube premium|paramount|apple com bill|icloud|google one|musica premium|assinatura|streaming)\b/, "assinaturas"],
  [/\b(ifood|rappi|ze delivery|aiqfome|delivery|lanchonete|restaurante|pizzaria|hamburgueria|burger|mc ?donalds|bk|outback|churrascaria|sushi|lanche|cafeteria|starbucks|almoco|jantar|sorveteria|bar|boteco|choperia)\b/, "restaurantes"],
  [/\b(supermercado|mercado|atacad\w*|assai|carrefour|hortifruti|sacolao|acougue|padaria|panificadora|confeitaria|cafe|comida|feira|mercearia|emporio|doceria)\b/, "alimentacao"],
  [/\b(limpeza|detergente|sabao|desinfetante|amaciante|agua sanitaria|vassoura|lava roupas)\b/, "limpeza"],
  [/\b(higiene|sabonete|shampoo|xampu|pasta de dente|creme dental|desodorante|papel higienico|absorvente|perfumaria|cosmetic\w*)\b/, "higiene"],
  [/\b(ipva|licenciamento|multa|detran|darf|das mei|imposto\w*|tarifa bancaria|anuidade|cartorio|taxa)\b/, "impostos"],
  [/\b(seguro|seguradora|porto seguro|azul seguros|tokio marine|mapfre|sulamerica|bradesco seguros)\b/, "seguros"],
  [/\b(emprestimo|financiamento|consignado|juros|iof|parcela do emprestimo|credito pessoal|cheque especial)\b/, "dividas"],
  [/\b(posto|combustivel|gasolina|etanol|alcool|diesel|shell|ipiranga|petrobras|br mania|uber|99 ?app|99pop|cabify|taxi|onibus|metro|estacionamento|pedagio|sem parar|veloe|conectcar|oficina|mecanic\w*)\b/, "transporte"],
  [/\b(farmacia|drogaria|droga\w*|raia|pacheco|pague menos|panvel|remedio|medic\w*|hospital|clinica|laboratorio|exame|consulta|dentista|odonto\w*|plano de saude|unimed|amil|hapvida|psicolog\w*)\b/, "saude"],
  [/\b(aluguel|condominio|iptu|luz|energia|enel|cemig|light|copel|celesc|coelba|sabesp|agua|saneamento|gas|comgas|internet|vivo|claro|tim|oi fibra|net virtua|telefone|reforma|material de construcao|leroy|telhanorte)\b/, "moradia"],
  [/\b(academia|smart ?fit|bluefit|selfit|bodytech|crossfit|pilates|yoga|personal trainer|gympass|wellhub|totalpass|natacao|musculacao)\b/, "bem-estar"],
  [/\b(viagem|hotel|pousada|airbnb|booking|decolar|passagem|latam|gol linhas|azul linhas|cvc|hostel)\b/, "viagens"],
  [/\b(cinema|ingresso|show|teatro|parque|steam|playstation|xbox|nintendo|jogo|lazer)\b/, "lazer"],
  [/\b(salao|cabeleireir\w*|barbearia|barbeiro|manicure|pedicure|estetica|depilacao|maquiagem|boticario|natura|sephora)\b/, "beleza"],
  [/\b(fralda\w*|brinquedo\w*|ri happy|pbkids|baba|creche|berçario|bercario|enxoval)\b/, "filhos"],
  [/\b(doacao|dizimo|oferta|vaquinha|presente\w*)\b/, "presentes"],
  [/\b(escola|faculdade|curso|udemy|alura|livro|livraria|material escolar|mensalidade escolar|educacao)\b/, "educacao"],
  [/\b(pet ?shop|petz|cobasi|veterinari\w*|racao)\b/, "pets"],
  [/\b(renner|riachuelo|c ?& ?a|zara|hering|centauro|netshoes|roupa\w*|sapato\w*|tenis|calcado\w*|vestuario)\b/, "vestuario"],
  [/\b(loja|magazine|magalu|americanas|shopee|shein|mercado livre|amazon|eletronic\w*|compras)\b/, "compras"],
];

export const INCOME_KEYWORDS: [RegExp, string][] = [
  [/\b(aposentadoria|inss|pensao|beneficio previdenciario)\b/, "aposentadoria"],
  [/\b(bolsa familia|auxilio\w*|vale alimentacao|vale refeicao|seguro desemprego|fgts|abono|pis)\b/, "beneficios"],
  [/\b(salario|pagamento de salario|folha|proventos|vencimentos|holerite|estagio|bolsa)\b/, "salario"],
  [/\b(aluguel recebido|aluguel do imovel|inquilino)\b/, "aluguel-recebido"],
  [/\b(dividendo\w*|rendimento\w*|juros sobre capital|resgate|tesouro direto|cdb)\b/, "rendimentos"],
  [/\b(estorno|reembolso|devolucao|cashback|chargeback)\b/, "reembolso"],
  [/\b(freela|freelance|venda|comissao|bonus|renda extra)\b/, "renda-extra"],
];

export function guessCategory(text: string, direction: "expense" | "income" = "expense"): string | null {
  const normalized = stripAccents(text.toLowerCase());
  for (const [pattern, category] of direction === "income" ? INCOME_KEYWORDS : EXPENSE_KEYWORDS) {
    if (pattern.test(normalized)) return category;
  }
  return null;
}
