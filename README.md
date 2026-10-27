# ninho. — finanças inteligentes da família

Assistente financeiro privado para a família: cada pessoa vê **só os próprios detalhes**
(extrato, lojas, comprovantes, conversas) e a casa vê **apenas totais** do que cada um
marcar como *familiar*. Feito a partir do *Caderno de produto v0.3* (PDF do projeto).

- **App web instalável (PWA)** — abre no navegador do celular e instala como app.
- **APK Android** — o mesmo app empacotado com Capacitor.
- **Banco Neon (Postgres, São Paulo)** — dados reais, com regras de privacidade e de dinheiro no próprio banco.

## O que já funciona

| Área | O que faz |
|---|---|
| **Contas e login** | Cadastro com e-mail e senha, família com **código de convite**, até 6 integrantes. Opção de começar com 7 meses de **dados de exemplo** (você + Mãe, Pai e Irmão fictícios). |
| **Visão geral** | Receitas, despesas e saldo da família, pendências, gráfico de 7 meses, “para onde foi o dinheiro”, transações recentes e o que a Nia percebeu. |
| **Meu financeiro** | Gastos do mês, categorias, entradas × saídas, regras automáticas. Tudo privado. |
| **Nossa família** | Só agregados: nenhum extrato, loja ou nome de quem comprou. Metas da família e aviso genérico de dados incompletos. |
| **Transações** | Busca, filtros (pendentes, familiares, pessoais, ignoradas), meses, exportação CSV. Toque para **dividir a compra em várias categorias**, cada parte pessoal ou familiar — a soma fecha centavo por centavo. |
| **Importar extrato** | CSV e OFX, com prévia. Reconhece sozinho Nubank (conta e cartão), Inter, C6 e Mercado Pago (fatura de cartão entra com o sinal certo). **Reimportar não duplica** (chave de idempotência). Pagamento de fatura vira transferência, não gasto. |
| **Classificação automática** | Regra da pessoa → histórico → palavras-chave → IA (opcional) → pendência. Depois de 2 confirmações iguais, o ninho **aprende uma regra** (que você pode desligar). |
| **Resumo diário** | Todas as pendências num lote, com classificação em um toque. |
| **Assistente Nia** | Responde com números calculados pelo banco (gastos, categorias, pendências, assinaturas, metas, família). Entende “comprei R$ 80 de comida e R$ 30 de limpeza no mercado” — digitado ou em **mensagem de voz** (transcrita pelo Whisper, você confere o texto antes de enviar) — e monta uma proposta para você **confirmar**. |
| **Nota fiscal** | Foto do cupom → itens e categorias (com chave de IA). Vincula à compra já lançada sem duplicar a despesa. |
| **Assinaturas e alertas** | Detecta assinaturas e contas recorrentes, **aumento de preço**, **possível cobrança duplicada** e **gasto fora do padrão** — só avisos, nada é apagado. |
| **Saúde dos dados** | Atualização de cada conta, cobertura, classificação, divergências e histórico de importações. |
| **Metas** | Pessoais e da família; na família todos veem o total, cada contribuição é privada. |
| **Orçamento** | Limite mensal por categoria, pessoal ou da casa (definido por quem administra). Aviso a partir de 80% na visão geral e pela Nia. |
| **Contas da casa** | Luz, internet, aluguel… divididos entre quem mora junto, centavo por centavo. Cada pessoa marca “Paguei minha parte” e a parte entra no financeiro dela como familiar. Dá para repetir no mês seguinte. |
| **Saldos e compromissos** | Saldo informado da conta + lançamentos seguintes = saldo de hoje, com a evolução de 6 meses. “Já comprometido no mês que vem”: assinaturas, contas fixas e a próxima parcela. |
| **Metas ligadas** | Um lançamento (ex.: Pix para a poupança) pode contar para uma meta — e, se quiser, sempre que for o mesmo estabelecimento. |
| **Fechamento do mês** | “Seu mês em 5 números” e relatório em PDF (link de uso único que também funciona no APK). |
| **Resumo diário** | Notificação no horário escolhido (Web Push no navegador; lembrete local no APK), só com a quantidade de pendências — nunca lojas ou valores. Disparo de hora em hora pelo GitHub Actions (`.github/workflows/digest.yml`). |
| **Senha e conta** | Trocar senha; “Esqueci minha senha” com código (por e-mail, se o Resend estiver configurado, ou gerado por quem administra a família); papéis, remover integrante, sair da família e **apagar a conta** (LGPD). |
| **Sem internet** | Lançamentos feitos offline ficam no aparelho e são enviados quando a conexão volta, sem duplicar. |
| **Notas guardadas** | A foto da nota fiscal (comprimida no celular) fica guardada com a compra, visível só para o dono. |
| **Privacidade** | Botão para ocultar valores, todas as consultas filtradas pelo dono, testes de isolamento. |

## Regras de dinheiro (garantidas no banco)

- Dinheiro em **centavos inteiros** (`bigint`), nunca `float`.
- A transação importada é preservada; categorias ficam em `transaction_allocations`.
- **Soma das divisões = valor da transação**: um *trigger* adiado no Postgres recusa qualquer gravação que não feche.
- `UNIQUE (pessoa, conta, id externo)` impede importar a mesma linha duas vezes.
- A visão da família só lê divisões `scope = 'family'` e nunca devolve linhas individuais.

## Tecnologia

| Camada | Escolha | Por quê |
|---|---|---|
| App | React 19 + Vite + TypeScript, PWA | Roda no navegador do celular e instala como app, sem loja. |
| Android | Capacitor 8 | Gera o APK a partir do mesmo código. |
| API | Uma função serverless na Vercel (`api/router.ts`) | Plano grátis, deploy automático a cada `git push`. A função usa `Request`/`Response` padrão: dá para mover para Neon Functions sem reescrever. |
| Banco | Neon Postgres (São Paulo) + migrations SQL | Plano grátis, `@neondatabase/serverless` (HTTP). |
| Login | Próprio (scrypt + token Bearer) | Funciona igual no navegador, PWA e APK. O Neon Auth usa cookies de outro domínio, que o WebView do Android pode bloquear; a troca fica isolada em `server/auth.ts`. |
| IA | Groq (grátis) ou qualquer API compatível com a da OpenAI | Texto, imagem e voz (Whisper). Sem chave a Nia funciona por regras. O AI Gateway do Neon exige plano pago e não está na região de São Paulo. |
| Testes | Vitest | Centavos, importadores, regras, alertas e frases faladas. |

Diferenças em relação ao caderno de produto (de propósito, para um protótipo grátis e testável no celular):
Expo → React + Capacitor; Neon Auth → login próprio; Drizzle → SQL direto; Neon Functions → função na Vercel;
Object Storage → fotos de nota guardadas comprimidas no próprio Postgres (só o dono acessa; limite de 300 por pessoa). Detalhes em “Próximos passos”.

## Estrutura

```
api/router.ts            função única da Vercel (todas as rotas /api/*)
server/                  rotas, login, motor financeiro, importação, Nia, alertas, dados de exemplo
shared/                  tipos, categorias, dinheiro, datas e regras usadas no app e na API
src/                     telas (pages/), janelas (modals/), componentes e estilos
db/migrations/           SQL numerado: fonte da verdade do banco
public/                  manifesto do app, service worker e ícones
android/                 projeto Android (Capacitor) — gerado com `npx cap add android`
android-web/             o que vai dentro do APK (só a página "sem conexão"; o app abre o site publicado)
tests/                   testes (Vitest)
```

## Rodando no computador

```bash
npm install
cp .env.example .env        # cole a DATABASE_URL do Neon
npm run db:migrate          # cria as tabelas
npm run dev:api             # API em http://localhost:8787
npm run dev                 # app em http://localhost:5173
npm test                    # testes
```

## Publicação

- **Vercel** (projeto `novo-reposit-rio` → https://ninho-financas-familia.vercel.app): importado deste repositório; cada `git push` na `main` publica. Variáveis: `DATABASE_URL` (obrigatória) e, se quiser IA, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` (ver `.env.example`).
- **Banco**: projeto `ninho` no Neon (região São Paulo). `npm run db:migrate` aplica as migrations.
- **APK**: `public/download/ninho.apk` (baixável em `/download/ninho.apk` e em Configurações → App Android). O GitHub Actions (`.github/workflows/android.yml`) compila o app a cada mudança; o APK de produção é gerado manualmente (*Run workflow*), assinado com a chave guardada nos secrets, e vira um rascunho de *Release*. O APK abre o site publicado, então atualizações do site chegam sem reinstalar; só é preciso gerar outro APK se mudar algo do Android (ícone, permissões, endereço).

### Gerar o APK no computador

```bash
npx cap sync android                       # copia android-web/ (página "sem conexão") para o APK
cd android && ./gradlew assembleDebug      # teste local (chave de depuração da sua máquina)
# produção: ./gradlew assembleRelease com NINHO_KEYSTORE_FILE, NINHO_KEYSTORE_PASSWORD,
# NINHO_KEY_ALIAS e NINHO_KEY_PASSWORD (sem elas o build falha)
```

Ao mudar a versão em `android/app/build.gradle`, atualize `public/download/version.json`: o app instalado compara com ele e avisa “Nova versão do app”.
**Assinatura:** a chave antiga (`ninho-debug.keystore`, até a v0.3.0) foi publicada no repositório e está comprometida. Como gerar e configurar a chave de produção, e como avisar quem precisa reinstalar: [docs/assinatura-android.md](docs/assinatura-android.md).

### IA da Nia (Groq, plano grátis)

Com `AI_API_KEY` configurada na Vercel, a Nia responde livremente (sempre com os números do banco), classifica
estabelecimentos desconhecidos (lançamentos e importações), lê fotos de nota fiscal e transcreve **mensagens de voz**.
O provedor é reconhecido pela chave:

| Chave | Provedor | Modelos usados |
|---|---|---|
| `gsk_…` | Groq (grátis em console.groq.com) | `qwen/qwen3.8-27b` (texto e imagem) + `whisper-large-v3-turbo` (voz) |
| `AIza…` | Google Gemini | `gemini-2.5-flash` (sem voz) |
| `sk-…` | OpenAI | `gpt-5-mini` + `whisper-1` |

Para trocar a chave: Vercel → projeto → Settings → Environment Variables → `AI_API_KEY` → Save → Deployments → Redeploy.
O áudio das mensagens de voz é transcrito e descartado na hora; a foto da nota também não é guardada.

## Próximos passos (roadmap do caderno)

- **F5**: Open Finance (Pluggy/Belvo) com adaptadores — só depois de validar o app com extratos importados.
- **F6**: domínio próprio para o e-mail de recuperação, backups e revisão LGPD completa.
