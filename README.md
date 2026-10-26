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
| **Importar extrato** | CSV (vários formatos de banco) e OFX, com prévia. **Reimportar não duplica** (chave de idempotência). Pagamento de fatura vira transferência, não gasto. |
| **Classificação automática** | Regra da pessoa → histórico → palavras-chave → IA (opcional) → pendência. Depois de 2 confirmações iguais, o ninho **aprende uma regra** (que você pode desligar). |
| **Resumo diário** | Todas as pendências num lote, com classificação em um toque. |
| **Assistente Nia** | Responde com números calculados pelo banco (gastos, categorias, pendências, assinaturas, metas, família). Entende “comprei R$ 80 de comida e R$ 30 de limpeza no mercado” (digitado ou **falado**) e monta uma proposta para você **confirmar**. |
| **Nota fiscal** | Foto do cupom → itens e categorias (com chave de IA). Vincula à compra já lançada sem duplicar a despesa. |
| **Assinaturas e alertas** | Detecta assinaturas e contas recorrentes, **aumento de preço**, **possível cobrança duplicada** e **gasto fora do padrão** — só avisos, nada é apagado. |
| **Saúde dos dados** | Atualização de cada conta, cobertura, classificação, divergências e histórico de importações. |
| **Metas** | Pessoais e da família; na família todos veem o total, cada contribuição é privada. |
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
| IA | Opcional, qualquer API compatível com OpenAI (OpenAI ou Gemini) | Sem chave a Nia funciona por regras. O AI Gateway do Neon exige plano pago e não está na região de São Paulo. |
| Testes | Vitest | Centavos, importadores, regras, alertas e frases faladas. |

Diferenças em relação ao caderno de produto (de propósito, para um protótipo grátis e testável no celular):
Expo → React + Capacitor; Neon Auth → login próprio; Drizzle → SQL direto; Neon Functions → função na Vercel;
Object Storage → fotos de nota não são guardadas (só lidas e descartadas). Detalhes em “Próximos passos”.

## Estrutura

```
api/router.ts            função única da Vercel (todas as rotas /api/*)
server/                  rotas, login, motor financeiro, importação, Nia, alertas, dados de exemplo
shared/                  tipos, categorias, dinheiro, datas e regras usadas no app e na API
src/                     telas (pages/), janelas (modals/), componentes e estilos
db/migrations/           SQL numerado: fonte da verdade do banco
public/                  manifesto do app, service worker e ícones
android/                 projeto Android (Capacitor) — gerado com `npx cap add android`
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

- **Vercel** (projeto `ninho-financas-familia` → https://ninho-financas-familia.vercel.app): importado deste repositório; cada `git push` na `main` publica. Variáveis: `DATABASE_URL` (obrigatória) e, se quiser IA, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` (ver `.env.example`).
- **Banco**: projeto `ninho` no Neon (região São Paulo). `npm run db:migrate` aplica as migrations.
- **APK**: `public/download/ninho.apk` (baixável em `/download/ninho.apk` e em Configurações → App Android). O GitHub Actions (`.github/workflows/android.yml`) gera um APK novo a cada mudança e publica em *Releases*. O APK abre o site publicado, então atualizações do site chegam sem reinstalar; só é preciso gerar outro APK se mudar algo do Android (ícone, permissões, endereço).

### Gerar o APK no computador

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug      # precisa de Java 21 e Android SDK
# resultado: android/app/build/outputs/apk/debug/app-debug.apk
```

A assinatura usa a chave de teste `android/app/ninho-debug.keystore` (a mesma no computador e no GitHub, para atualizar por cima).
Para publicar na Play Store, gere uma chave própria e um `bundleRelease` (AAB).

### Ligar a IA de graça (opcional)

1. Crie uma chave em https://aistudio.google.com (Gemini tem plano gratuito).
2. Na Vercel → projeto → Settings → Environment Variables, adicione:
   `AI_API_KEY` = sua chave, `AI_BASE_URL` = `https://generativelanguage.googleapis.com/v1beta/openai`, `AI_MODEL` = `gemini-2.5-flash`.
3. Faça um novo deploy (Deployments → Redeploy). A Nia passa a responder livremente e a ler notas fiscais.

## Próximos passos (roadmap do caderno)

- **F3**: notificação push do resumo diário (Web Push / FCM) no horário escolhido.
- **F4**: guardar fotos de notas no Neon Object Storage com URLs temporárias.
- **F5**: Open Finance (Pluggy/Belvo) com adaptadores — só depois de validar o app com extratos importados.
- **F6**: recuperação de senha por e-mail, backups, auditoria de segurança e revisão LGPD.
