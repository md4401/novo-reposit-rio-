# Assinatura do app Android

## O que aconteceu

Até a versão 0.3.0 (build 5), o APK era assinado com `android/app/ninho-debug.keystore`, que estava
**versionado neste repositório público** junto com as senhas no `build.gradle`.
Essa chave deve ser tratada como **comprometida**: qualquer pessoa pode assinar um APK com o mesmo
pacote (`app.ninho.familia`) e o Android o aceitaria como atualização do ninho.

- Certificado comprometido (SHA-256, informação pública):
  `36:59:59:9B:4B:88:E1:83:EC:C5:D0:32:DC:B5:69:4B:8F:C0:6E:B4:F9:B8:77:70:39:98:E7:93:DC:1B:8A:EF`
- O arquivo saiu do código atual, mas **continua no histórico do Git**, nas releases `apk-1`…`apk-5`
  e no `public/download/ninho.apk` publicado. Remover o arquivo não desfaz a exposição.
- O build agora **recusa** esse certificado (Gradle e workflow).

## Por que não dá para “só trocar a chave”

O Android só instala uma atualização assinada com a **mesma** chave do app instalado. Com uma chave
nova, quem tem a 0.3.0 ou anterior verá “App não instalado” ao tentar atualizar por cima.

Avaliamos a rotação de chave (APK Signature Scheme v3, `apksigner rotate`): ela permite atualizar por
cima, mas exige continuar assinando com a chave antiga para aparelhos com Android 8.1 ou anterior e
mantém a chave comprometida na cadeia de confiança. Por isso a escolha é **trocar de chave e pedir
uma reinstalação**. Como todos os dados ficam no servidor (Neon), reinstalar só exige entrar de novo
com e-mail e senha.

O app instalado carrega o site publicado, então o aviso chega até quem tem a versão antiga:
`public/download/version.json` com `reinstallBelow` faz o app mostrar “desinstale e instale de novo”
em vez de “atualize por cima”.

## Gerar a chave de produção (uma vez, num computador confiável)

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore ninho-release.keystore \
  -alias ninho -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=ninho., O=Familia, C=BR"
# o keytool pede a senha: use uma senha longa e única, guardada num gerenciador de senhas
keytool -list -v -keystore ninho-release.keystore -alias ninho | grep SHA256   # impressão digital
base64 -w0 ninho-release.keystore > ninho-release.keystore.b64                # para o secret
```

Guarde o `ninho-release.keystore` e a senha **fora do repositório** (gerenciador de senhas + cópia
de segurança). Se a chave for perdida, os apps instalados não poderão mais ser atualizados por cima.

## Configurar no GitHub

Em **Settings → Secrets and variables → Actions**:

| Tipo | Nome | Valor |
|---|---|---|
| Secret | `ANDROID_KEYSTORE_BASE64` | conteúdo de `ninho-release.keystore.b64` |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | senha do keystore |
| Secret | `ANDROID_KEY_ALIAS` | `ninho` (ou o alias escolhido) |
| Secret | `ANDROID_KEY_PASSWORD` | senha da chave (no PKCS12, a mesma do keystore) |
| Variable | `ANDROID_CERT_SHA256` | impressão digital SHA-256 do certificado (não é segredo) |

Recomendado: em **Settings → Environments**, criar `android-release` com aprovação obrigatória.

Depois apague `ninho-release.keystore.b64` do computador.

## Gerar e distribuir a versão nova

1. **Actions → APK Android → Run workflow**. O job valida os secrets, assina, confere que o
   certificado é o de `ANDROID_CERT_SHA256` (e não o comprometido), apaga o keystore temporário
   mesmo se algo falhar e cria um **rascunho** de release.
2. Baixe o `ninho.apk` do rascunho, teste num celular e publique a release.
3. Copie o APK para `public/download/ninho.apk` e atualize `public/download/version.json`:
   `{ "name": "0.4.0", "build": 6, "reinstallBelow": 6 }`. Faça o commit.
4. Avise a família: desinstalar o ninho antigo, instalar o novo e entrar de novo.

## Local

- `./gradlew assembleDebug`: usa a chave de depuração padrão da sua máquina (nunca versionada).
- `./gradlew assembleRelease`: exige `NINHO_KEYSTORE_FILE`, `NINHO_KEYSTORE_PASSWORD`,
  `NINHO_KEY_ALIAS` e `NINHO_KEY_PASSWORD`; sem elas o build falha.

## Limpeza do histórico (opcional, só com autorização do dono)

Não é necessária para a segurança: a chave já foi publicada e está sendo substituída. Se quiser tirar
o arquivo do histórico mesmo assim:

```bash
git clone --mirror https://github.com/md4401/novo-reposit-rio-.git
cd novo-reposit-rio-.git
git filter-repo --invert-paths --path android/app/ninho-debug.keystore   # requer git-filter-repo
git push --force --mirror
```

Impactos: reescreve todos os commits (hashes mudam), as tags `apk-*` e qualquer clone precisa ser
refeito; forks e caches do GitHub podem continuar com a cópia antiga; peça ao suporte do GitHub para
limpar referências em cache se necessário.
