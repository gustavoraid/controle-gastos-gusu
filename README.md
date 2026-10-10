# Gastos do Casal

App de celular (PWA) para controlar e dividir gastos a dois, no estilo Splitwise.

- **Projetos** separados (Casa, Viagem…), cada um com a **proporção de divisão** própria (ex.: 60/40),
  aplicada a todas as despesas do projeto.
- **Categorias por projeto**, já semeadas por modelo (Casa / Viagem / Em branco) e editáveis, com
  **descrições sugeridas** por categoria (no modelo Casa: Luz, Água, Feira, Aluguel…).
- **Lançamento rápido**: valor → categoria → toque numa sugestão → salvar. "Quem pagou" já vem como
  você e a data como hoje. Descrição é obrigatória.
- **Saldo** ("Fulana te deve R$ X") e **acerto de contas** (registro do Pix).
- **Resumo do mês**: total, quanto cada um pagou e assumiu, gasto por categoria.
- **Tempo real**: o que um lança aparece no celular do outro.
- **Instalável** com ícone na tela inicial e atalho "Nova despesa" (pressionar o ícone no Android).

Stack: Vite + React 19 + TypeScript + Supabase (Postgres, Auth, Realtime). Sem servidor próprio.

## 1. Criar o banco (Supabase, grátis)

1. Crie um projeto em <https://supabase.com> (região São Paulo).
2. **SQL Editor** → rode, em ordem, cada arquivo de `supabase/migrations/` (`0001_…`, `0002_…`).
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

- A proporção é **do projeto**: não há divisão diferente por despesa.
- Ao lançar, o app grava quanto coube a cada pessoa (`expense_splits`), uma "foto" da proporção
  daquele momento. Mudar a proporção do projeto vale para as próximas despesas e **não reescreve o
  histórico** (nem o saldo já acumulado). Editar uma despesa antiga mantém a proporção com que ela
  foi lançada.
- Centavos ímpares vão para quem tem o maior resto (nada some, nada sobra) — `src/lib/split.ts`.
- Saldo = pagou − parte que lhe cabe + acertos enviados − acertos recebidos, calculado no banco
  (`project_balances`).

## Banco de dados

```
profiles ─┐
          ├─ project_members (peso na divisão) ── projects (nome, emoji, tipo, convite)
          │                                           │
          │                                           ├─ categories ── category_suggestions
          │                                           │
          ├─ expenses (valor, quem pagou, categoria, data, descrição)
          │     └─ expense_splits (parte de cada pessoa)
          └─ settlements (acertos: quem pagou a quem)

project_balances (view) = saldo de cada pessoa por projeto
```

## Limitações conhecidas

- Sem lançamento offline: o app abre sem internet, mas salvar precisa de conexão.
- Uma moeda só (R$).
- Ícones: `npm run icons` regenera os PNGs a partir do desenho em `scripts/gen-icons.py` (precisa de Pillow).
