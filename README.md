# Gastos do Casal

App de celular (PWA) para controlar e dividir gastos a dois, no estilo Splitwise.

- **Projetos** separados (Casa, Viagem…), cada um com a **proporção de divisão** própria (ex.: 60/40).
- **Categorias por projeto**, já semeadas por modelo (Casa / Viagem / Em branco) e editáveis.
- **Lançamento rápido**: valor → categoria → salvar. "Quem pagou" já vem como você, data como hoje,
  divisão como a do projeto. Dá para mudar por despesa: meio a meio, só de quem pagou,
  "paguei tudo pelo outro" ou valores exatos.
- **Saldo** ("Fulana te deve R$ X") e **acerto de contas** (registro do Pix).
- **Resumo do mês**: total, quanto cada um pagou e assumiu, gasto por categoria.
- **Tempo real**: o que um lança aparece no celular do outro.
- **Instalável** com ícone na tela inicial e atalho "Nova despesa" (pressionar o ícone no Android).

Stack: Vite + React 19 + TypeScript + Supabase (Postgres, Auth, Realtime). Sem servidor próprio.

## 1. Criar o banco (Supabase, grátis)

1. Crie um projeto em <https://supabase.com> (região São Paulo).
2. **SQL Editor** → cole e rode `supabase/migrations/0001_init.sql`.
3. **Authentication → Sign In / Providers → Email**: desligue **Confirm email** (são só duas contas
   conhecidas, e o link de confirmação abre no navegador, não no app instalado).
4. **Project Settings → API**: copie a `Project URL` e a chave `anon public`.

## 2. Rodar localmente

```bash
cp .env.example .env   # preencha URL e anon key
npm install
npm run dev
npm test               # lógica de divisão, saldos, valores e datas
```

## 3. Publicar (grátis)

Qualquer hospedagem estática serve; o app usa caminhos relativos e rotas com `#`.
Recomendado: **Cloudflare Pages**, **Vercel** ou **Netlify** ligados a este repositório:

- Build command: `npm run build`
- Output directory: `dist`
- Variáveis de ambiente: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

> A chave `anon` é pública por design. Quem protege os dados é o RLS do Postgres (cada pessoa só
> enxerga projetos de que é membro). Nunca coloque a chave `service_role` no app.

## 4. Instalar no celular

- **iPhone (Safari)**: abra o link → Compartilhar → **Adicionar à Tela de Início**.
- **Android (Chrome)**: abra o link → menu ⋮ → **Instalar app**.

Depois: crie sua conta, crie o projeto, toque em **Enviar convite** e mande o link pelo WhatsApp.
A outra pessoa cria a conta dela e entra pelo link. Ajuste a proporção em **Ajustes do projeto**.

## Como a divisão funciona

- Cada despesa grava quanto cabe a cada pessoa (`expense_splits`). Mudar a proporção do projeto
  vale para as próximas despesas e **não reescreve o histórico**.
- Centavos ímpares vão para quem tem o maior resto (nada some, nada sobra) — `src/lib/split.ts`.
- Saldo = pagou − parte que lhe cabe + acertos enviados − acertos recebidos, calculado no banco
  (`project_balances`).

## Limitações conhecidas

- Sem lançamento offline: o app abre sem internet, mas salvar precisa de conexão.
- Uma moeda só (R$).
- Ícones: `npm run icons` regenera os PNGs a partir do desenho em `scripts/gen-icons.py` (precisa de Pillow).
